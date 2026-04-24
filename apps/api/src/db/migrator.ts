import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolClient } from 'pg';

import { withConnection } from './pool.js';

/**
 * pg-native SQL migration runner (zero external dependency).
 *
 * Applies numbered `.sql` files from a migrations directory in strictly
 * ascending order. Tracks state in a `schema_migrations` table created on
 * first run. Wraps each file in `BEGIN/COMMIT` unless the file carries a
 * `-- migrator: no-transaction` directive.
 *
 * Filenames are `NNN[a-z]?_slug.sql`. The optional lowercase suffix marks
 * an amendment migration that runs after its NNN base migration but
 * before NNN+1 (Flyway-style). The id is kept as text (`'007' < '007a'
 * < '007b' < '008'` lexicographically) so the PRIMARY KEY on
 * `schema_migrations.id` orders amendments naturally.
 *
 * Canonical reference: docs/06-SCHEMA-SQL-COMPLET.md §25-26.
 */

const META_TABLE = 'schema_migrations';
const NO_TX_DIRECTIVE = /^--\s*migrator:\s*no-transaction\s*$/m;
const FILENAME_RE = /^(\d{3}[a-z]?)_[a-z0-9][a-z0-9_]*\.sql$/;

export interface MigrationFile {
  id: string;
  filename: string;
  fullPath: string;
  content: string;
  checksum: string;
  noTransaction: boolean;
}

export interface AppliedMigration {
  id: string;
  filename: string;
  checksum: string;
  appliedAt: Date;
}

export interface MigratorOptions {
  migrationsDir: string;
  metaTable?: string;
}

export interface MigratorUpReport {
  applied: { id: string; filename: string }[];
  skipped: { id: string; filename: string }[];
}

export interface MigratorStatus {
  applied: AppliedMigration[];
  pending: MigrationFile[];
  drifted: { id: string; filename: string; expected: string; actual: string }[];
}

export interface VerifyReport {
  ok: boolean;
  drifted: { id: string; filename: string; expected: string; actual: string }[];
  missingOnDisk: AppliedMigration[];
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function ensureMetaTable(client: PoolClient, metaTable: string): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${metaTable} (
       id          text PRIMARY KEY,
       filename    text NOT NULL UNIQUE,
       checksum    text NOT NULL,
       applied_at  timestamptz NOT NULL DEFAULT now()
     )`,
  );
}

async function loadMigrationFiles(dir: string): Promise<MigrationFile[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const files: MigrationFile[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.sql')) {
      continue;
    }
    const match = FILENAME_RE.exec(entry);
    if (!match) {
      throw new Error(`[migrator] filename does not match NNN[a-z]?_slug.sql pattern: ${entry}`);
    }
    const fullPath = join(dir, entry);
    const content = await readFile(fullPath, 'utf8');
    files.push({
      id: match[1]!,
      filename: entry,
      fullPath,
      content,
      checksum: sha256(content),
      noTransaction: NO_TX_DIRECTIVE.test(content),
    });
  }

  files.sort((a, b) => a.id.localeCompare(b.id));

  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.id)) {
      throw new Error(`[migrator] duplicate migration id ${f.id}`);
    }
    seen.add(f.id);
  }

  return files;
}

async function getApplied(client: PoolClient, metaTable: string): Promise<AppliedMigration[]> {
  const { rows } = await client.query<{
    id: string;
    filename: string;
    checksum: string;
    applied_at: Date;
  }>(
    `SELECT id, filename, checksum, applied_at
       FROM ${metaTable}
       ORDER BY id ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    checksum: row.checksum,
    appliedAt: row.applied_at,
  }));
}

async function applyOne(client: PoolClient, file: MigrationFile, metaTable: string): Promise<void> {
  const shouldWrap = !file.noTransaction;
  try {
    if (shouldWrap) {
      await client.query('BEGIN');
    }
    await client.query(file.content);
    await client.query(`INSERT INTO ${metaTable} (id, filename, checksum) VALUES ($1, $2, $3)`, [
      file.id,
      file.filename,
      file.checksum,
    ]);
    if (shouldWrap) {
      await client.query('COMMIT');
    }
  } catch (err) {
    if (shouldWrap) {
      await client.query('ROLLBACK').catch(() => {
        // best-effort rollback; surface the original error
      });
    }
    throw new Error(`[migrator] failed to apply ${file.filename}: ${(err as Error).message}`);
  }
}

export async function runUp(options: MigratorOptions): Promise<MigratorUpReport> {
  const metaTable = options.metaTable ?? META_TABLE;
  const files = await loadMigrationFiles(options.migrationsDir);

  return withConnection(async (client) => {
    await ensureMetaTable(client, metaTable);
    const applied = await getApplied(client, metaTable);
    const appliedIds = new Set(applied.map((a) => a.id));

    const report: MigratorUpReport = { applied: [], skipped: [] };
    for (const file of files) {
      if (appliedIds.has(file.id)) {
        report.skipped.push({ id: file.id, filename: file.filename });
        continue;
      }
      await applyOne(client, file, metaTable);
      report.applied.push({ id: file.id, filename: file.filename });
    }
    return report;
  });
}

export async function getStatus(options: MigratorOptions): Promise<MigratorStatus> {
  const metaTable = options.metaTable ?? META_TABLE;
  const files = await loadMigrationFiles(options.migrationsDir);

  return withConnection(async (client) => {
    await ensureMetaTable(client, metaTable);
    const applied = await getApplied(client, metaTable);
    const appliedById = new Map(applied.map((a) => [a.id, a]));

    const pending: MigrationFile[] = [];
    const drifted: MigratorStatus['drifted'] = [];
    for (const file of files) {
      const existing = appliedById.get(file.id);
      if (!existing) {
        pending.push(file);
        continue;
      }
      if (existing.checksum !== file.checksum) {
        drifted.push({
          id: file.id,
          filename: file.filename,
          expected: existing.checksum,
          actual: file.checksum,
        });
      }
    }
    return { applied, pending, drifted };
  });
}

export async function verifyChecksums(options: MigratorOptions): Promise<VerifyReport> {
  const metaTable = options.metaTable ?? META_TABLE;
  const files = await loadMigrationFiles(options.migrationsDir);
  const fileById = new Map(files.map((f) => [f.id, f]));

  return withConnection(async (client) => {
    await ensureMetaTable(client, metaTable);
    const applied = await getApplied(client, metaTable);

    const drifted: VerifyReport['drifted'] = [];
    const missingOnDisk: AppliedMigration[] = [];
    for (const row of applied) {
      const file = fileById.get(row.id);
      if (!file) {
        missingOnDisk.push(row);
        continue;
      }
      if (file.checksum !== row.checksum) {
        drifted.push({
          id: row.id,
          filename: row.filename,
          expected: row.checksum,
          actual: file.checksum,
        });
      }
    }
    return {
      ok: drifted.length === 0 && missingOnDisk.length === 0,
      drifted,
      missingOnDisk,
    };
  });
}
