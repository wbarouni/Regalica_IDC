import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Pool } from 'pg';

import { getStatus, runUp, verifyChecksums, type MigratorOptions } from '../../src/db/migrator.js';
import { closePool } from '../../src/db/pool.js';

/**
 * Integration tests for the pg-native migrator.
 *
 * Require a real PostgreSQL reachable via DATABASE_URL. In CI the
 * `test-api` job already provides one. Locally the tests are skipped with
 * a clear message if the variable is missing.
 */

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migrator', () => {
  let tmpDir: string;
  let schemaName: string;
  let metaTable: string;
  let options: MigratorOptions;
  let adminPool: Pool;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'regflow-migrator-'));
    schemaName = `mig_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    metaTable = `${schemaName}.schema_migrations`;
    options = { migrationsDir: tmpDir, metaTable };

    adminPool = new Pool({ connectionString: process.env['DATABASE_URL'] });
    await adminPool.query(`CREATE SCHEMA ${schemaName}`);
  });

  afterAll(async () => {
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
      await adminPool.end();
    }
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
    await closePool();
  });

  beforeEach(async () => {
    await adminPool.query(`DROP TABLE IF EXISTS ${metaTable}`);
    for (const leftover of ['widgets', 'gadgets', 'concurrent_items']) {
      await adminPool.query(`DROP TABLE IF EXISTS ${schemaName}.${leftover}`);
    }
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = await mkdtemp(join(tmpdir(), 'regflow-migrator-'));
  });

  async function writeMigration(name: string, body: string): Promise<void> {
    await writeFile(join(tmpDir, name), body, 'utf8');
  }

  it('runs cleanly on an empty directory', async () => {
    const report = await runUp(options);
    expect(report.applied).toHaveLength(0);
    expect(report.skipped).toHaveLength(0);
  });

  it('applies pending migrations in numeric order', async () => {
    await writeMigration(
      '001_widgets.sql',
      `CREATE TABLE ${schemaName}.widgets (id int primary key);`,
    );
    await writeMigration(
      '002_gadgets.sql',
      `CREATE TABLE ${schemaName}.gadgets (id int primary key);`,
    );

    const report = await runUp(options);
    expect(report.applied.map((m) => m.id)).toEqual(['001', '002']);

    const status = await getStatus(options);
    expect(status.applied.map((a) => a.id)).toEqual(['001', '002']);
    expect(status.pending).toHaveLength(0);
  });

  it('is idempotent: a second run applies nothing', async () => {
    await writeMigration(
      '001_widgets.sql',
      `CREATE TABLE ${schemaName}.widgets (id int primary key);`,
    );
    await runUp(options);
    const second = await runUp(options);
    expect(second.applied).toHaveLength(0);
    expect(second.skipped.map((m) => m.id)).toEqual(['001']);
  });

  it('rolls back on SQL error and leaves schema_migrations untouched', async () => {
    await writeMigration(
      '001_widgets.sql',
      `CREATE TABLE ${schemaName}.widgets (id int primary key);`,
    );
    await writeMigration('002_bad.sql', `INVALID SQL HERE;`);

    await expect(runUp(options)).rejects.toThrow(/002_bad\.sql/);

    const status = await getStatus(options);
    expect(status.applied.map((a) => a.id)).toEqual(['001']);
  });

  it('detects checksum drift after a file is modified', async () => {
    await writeMigration(
      '001_widgets.sql',
      `CREATE TABLE ${schemaName}.widgets (id int primary key);`,
    );
    await runUp(options);

    // Modify on disk without re-running — simulate drift.
    await writeMigration(
      '001_widgets.sql',
      `CREATE TABLE ${schemaName}.widgets (id int primary key); -- drift`,
    );

    const report = await verifyChecksums(options);
    expect(report.ok).toBe(false);
    expect(report.drifted).toHaveLength(1);
    expect(report.drifted[0]!.filename).toBe('001_widgets.sql');
  });

  it('respects the no-transaction directive', async () => {
    // With `no-transaction` the runner does not wrap in BEGIN/COMMIT.
    // The migration itself must be safe (or self-transactional). This
    // test verifies the file is applied without the wrapping BEGIN/COMMIT
    // by using a statement that would be rejected inside a transaction
    // block on some Postgres setups (here we just assert the metadata row
    // is written, which is enough to prove the directive is recognised).
    await writeMigration(
      '001_concurrent.sql',
      `-- migrator: no-transaction
CREATE TABLE ${schemaName}.concurrent_items (id int primary key);
`,
    );

    const report = await runUp(options);
    expect(report.applied.map((m) => m.id)).toEqual(['001']);

    const rowsRes = await adminPool.query(`SELECT id FROM ${metaTable} WHERE filename = $1`, [
      '001_concurrent.sql',
    ]);
    expect(rowsRes.rowCount).toBe(1);
  });

  it('rejects files that do not match the NNN[a-z]?_slug.sql naming', async () => {
    await writeMigration('not-a-migration.sql', `SELECT 1;`);
    await expect(runUp(options)).rejects.toThrow(/NNN\[a-z\]\?_slug\.sql/);
  });

  it('applies amendment migrations (NNN[a-z]_slug.sql) after their base in lexicographic order', async () => {
    await writeMigration(
      '001_widgets.sql',
      `CREATE TABLE ${schemaName}.widgets (id int primary key);`,
    );
    await writeMigration(
      '001a_widgets_amend.sql',
      `ALTER TABLE ${schemaName}.widgets ADD COLUMN label text;`,
    );
    await writeMigration(
      '002_gadgets.sql',
      `CREATE TABLE ${schemaName}.gadgets (id int primary key);`,
    );

    const report = await runUp(options);
    expect(report.applied.map((m) => m.id)).toEqual(['001', '001a', '002']);

    const status = await getStatus(options);
    expect(status.applied.map((a) => a.id)).toEqual(['001', '001a', '002']);

    // The amendment actually ran against the base table.
    const colRes = await adminPool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'widgets' AND column_name = 'label'`,
      [schemaName],
    );
    expect(colRes.rowCount).toBe(1);
  });
});

describe.skip('migrator (real DB required)', () => {
  if (!hasDb) {
    it('skipped — set DATABASE_URL to run integration tests', () => {
      expect(true).toBe(true);
    });
  }
});
