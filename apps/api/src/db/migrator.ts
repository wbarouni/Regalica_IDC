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
// S1 L3 — fingerprint of every migration that gates its DO block on
// an operator-supplied GUC. Detected by file content grep so the runner
// stays catalogue-free: any new GUC-gated migration is picked up
// automatically without a registry edit.
const GUC_GATED_FINGERPRINT = /current_setting\('app\.seed_/;

export interface MigrationFile {
  id: string;
  filename: string;
  fullPath: string;
  content: string;
  checksum: string;
  noTransaction: boolean;
  // S1 L3 — true when the migration body references one of the
  // operator-supplied GUCs (`current_setting('app.seed_*')`). The
  // operator runner uses this flag to scope `SET LOCAL` to the
  // migrations that actually need it; non-gated migrations apply
  // identically in both modes.
  gucGated: boolean;
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
  // S1 L3 — when present and non-empty, every GUC-gated migration
  // (cf. MigrationFile.gucGated) is wrapped with `set_config(key,
  // value, true)` calls inside its transaction so the migration's
  // `current_setting('app.seed_*', true)` checks see the values.
  // Non-gated migrations are unaffected. Empty / undefined keeps the
  // legacy no-GUC behaviour for backward compatibility.
  sessionVars?: Readonly<Record<string, string>>;
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
      gucGated: GUC_GATED_FINGERPRINT.test(content),
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

async function applyOne(
  client: PoolClient,
  file: MigrationFile,
  metaTable: string,
  sessionVars?: Readonly<Record<string, string>>,
): Promise<void> {
  const shouldWrap = !file.noTransaction;
  // SET LOCAL is transaction-scoped so it only matters when the
  // migration body wraps in BEGIN/COMMIT. When the migration is
  // marked `no-transaction`, `set_config(.., true)` is a no-op
  // outside a transaction and the migration owns its own scoping
  // — we skip the calls in that branch.
  const applyVars =
    shouldWrap && file.gucGated && sessionVars !== undefined && Object.keys(sessionVars).length > 0;
  try {
    if (shouldWrap) {
      await client.query('BEGIN');
    }
    if (applyVars) {
      // Parameterised set_config keeps the values out of the SQL
      // string so an operator-supplied UUID never mixes with literal
      // SQL. The third arg `true` scopes the setting to the current
      // transaction (mirrors `SET LOCAL`).
      for (const [key, value] of Object.entries(sessionVars)) {
        await client.query(`SELECT set_config($1, $2, true)`, [key, value]);
      }
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
      await applyOne(client, file, metaTable, options.sessionVars);
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
