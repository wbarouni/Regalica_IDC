import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

const SEEDS_FILE = resolve(__dirname, '../../seeds/system_roles.json');

interface SeedRole {
  code: string;
  label_fr: string;
  label_en: string;
  label_ar: string;
  permissions: { v: number; capabilities: unknown[] };
  is_system_role: boolean;
}

interface SeedsFile {
  version: number;
  roles: SeedRole[];
}

// 10 system roles post-amendment (Doc 6 §5 + §22.4 reconciliation):
// platform_owner, tenant_admin, compliance_director, compliance_officer,
// support_readonly, signatory, auditor, rule_editor, referential_editor,
// prompt_editor. Listed alphabetically here because the SQL fetches
// ORDER BY code.
const EXPECTED_ROLE_CODES = [
  'auditor',
  'compliance_director',
  'compliance_officer',
  'platform_owner',
  'prompt_editor',
  'referential_editor',
  'rule_editor',
  'signatory',
  'support_readonly',
  'tenant_admin',
];

describeIfDb('migration 007 — seed_system_roles', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(7);
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('creates the seed_system_roles_for_tenant function', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pg_proc
         WHERE proname = 'seed_system_roles_for_tenant'
           AND pronamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.count).toBe('1');
  });

  it('installs the tenants_seed_roles trigger on tenants', async () => {
    // Filter pg_trigger to the test schema's tenants table — without
    // this join the query would also match the trigger on
    // public.tenants if a previous `pnpm migrate:up` was run against
    // the same database (the one the dev shell uses), and the
    // .toHaveLength(1) assertion would see 2 rows.
    const { rows } = await ctx.testPool.query<{ tgname: string }>(
      `SELECT t.tgname
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE t.tgname = 'tenants_seed_roles'
          AND NOT t.tgisinternal
          AND c.relname = 'tenants'
          AND n.nspname = $1`,
      [ctx.schemaName],
    );
    expect(rows).toHaveLength(1);
  });

  it('inserts the 10 system roles when a new tenant is created', async () => {
    const { rows: tRows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-007-a', 'Legal Test 007 A') RETURNING id`,
    );
    const tenantId = tRows[0]!.id;

    const { rows } = await ctx.testPool.query<{ code: string; is_system_role: boolean }>(
      `SELECT code, is_system_role FROM roles
         WHERE tenant_id = $1
         ORDER BY code`,
      [tenantId],
    );
    expect(rows.map((r) => r.code)).toEqual(EXPECTED_ROLE_CODES);
    expect(rows.every((r) => r.is_system_role)).toBe(true);
  });

  it('seeded roles carry the Phase 1 minimal permissions marker', async () => {
    const { rows: tRows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-007-b', 'Legal Test 007 B') RETURNING id`,
    );
    const tenantId = tRows[0]!.id;

    const { rows } = await ctx.testPool.query<{
      permissions: { v: number; capabilities: unknown[] };
    }>(
      `SELECT permissions FROM roles
         WHERE tenant_id = $1 AND code = 'compliance_officer'`,
      [tenantId],
    );
    expect(rows[0]!.permissions.v).toBe(1);
    expect(Array.isArray(rows[0]!.permissions.capabilities)).toBe(true);
    expect(rows[0]!.permissions.capabilities).toHaveLength(0);
  });

  it('seed function is idempotent: a second manual call creates no duplicate', async () => {
    const { rows: tRows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-007-c', 'Legal Test 007 C') RETURNING id`,
    );
    const tenantId = tRows[0]!.id;

    await ctx.testPool.query(`SELECT seed_system_roles_for_tenant($1)`, [tenantId]);

    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM roles WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('10');
  });

  it('seeds compliance_director and support_readonly (canon gap §5/§22.4 closed)', async () => {
    const { rows: tRows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-007-d', 'Legal Test 007 D') RETURNING id`,
    );
    const tenantId = tRows[0]!.id;

    const { rows } = await ctx.testPool.query<{ code: string; is_system_role: boolean }>(
      `SELECT code, is_system_role FROM roles
         WHERE tenant_id = $1
           AND code IN ('compliance_director', 'support_readonly')
         ORDER BY code`,
      [tenantId],
    );
    expect(rows.map((r) => r.code)).toEqual(['compliance_director', 'support_readonly']);
    expect(rows.every((r) => r.is_system_role)).toBe(true);
  });

  it('seeded rows match apps/api/seeds/system_roles.json byte-for-byte on every field', async () => {
    // The JSON file is the canonical source of the role catalogue. The
    // migration embeds a verbatim copy of its `roles` array as a jsonb
    // literal inside seed_system_roles_for_tenant(). Any drift between
    // the two surfaces here: an edit to the JSON not reflected in the
    // migration (or vice versa) fails this test.
    const raw = await readFile(SEEDS_FILE, 'utf8');
    const seeds = JSON.parse(raw) as SeedsFile;
    expect(seeds.roles).toHaveLength(10);

    const { rows: tRows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-007-e', 'Legal Test 007 E') RETURNING id`,
    );
    const tenantId = tRows[0]!.id;

    const { rows: dbRows } = await ctx.testPool.query<SeedRole>(
      `SELECT code, label_fr, label_en, label_ar, permissions, is_system_role
         FROM roles
         WHERE tenant_id = $1
         ORDER BY code`,
      [tenantId],
    );

    const expected = [...seeds.roles].sort((a, b) => a.code.localeCompare(b.code));
    expect(dbRows).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
      const want = expected[i]!;
      const got = dbRows[i]!;
      expect(got.code).toBe(want.code);
      expect(got.label_fr).toBe(want.label_fr);
      expect(got.label_en).toBe(want.label_en);
      expect(got.label_ar).toBe(want.label_ar);
      expect(got.is_system_role).toBe(want.is_system_role);
      expect(got.permissions).toEqual(want.permissions);
    }
  });
});
