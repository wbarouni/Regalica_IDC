import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

const TENANT_ID = 'd3a7c6e6-2d18-4ff6-8183-94507eded6d7';
const AUTHOR_ID = '2cb0ce35-4b43-499f-b23a-722ef86902ce';
const VALIDATOR_ID = 'ef810369-1e96-485d-bf1d-dc8937e32bb9';

describeIfDb('migration 037a — seed_dev_tenant (S1 reproducibility)', () => {
  describe('without app.seed_dev_tenant GUC', () => {
    let ctx: MigrationsTestContext;

    beforeAll(async () => {
      ctx = await setupMigrationsSchema(75);
    });

    afterAll(async () => {
      await teardownMigrationsSchema(ctx);
    });

    it('does not seed the dev tenant when the GUC is absent', async () => {
      const { rows } = await ctx.testPool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM tenants WHERE id = $1`,
        [TENANT_ID],
      );
      expect(rows[0]?.count).toBe('0');
    });

    it('does not seed the author or validator users when the GUC is absent', async () => {
      const { rows } = await ctx.testPool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM users WHERE id IN ($1, $2)`,
        [AUTHOR_ID, VALIDATOR_ID],
      );
      expect(rows[0]?.count).toBe('0');
    });
  });

  describe('with app.seed_dev_tenant=true', () => {
    let ctx: MigrationsTestContext;

    beforeAll(async () => {
      ctx = await setupMigrationsSchema(75, {
        sessionVars: { 'app.seed_dev_tenant': 'true' },
      });
    });

    afterAll(async () => {
      await teardownMigrationsSchema(ctx);
    });

    it('seeds the canonical dev tenant with deterministic UUID + slug', async () => {
      const { rows } = await ctx.testPool.query<{
        slug: string;
        legal_name: string;
        bct_bank_code: string;
        default_language: string;
        is_active: boolean;
      }>(
        `SELECT slug, legal_name, bct_bank_code, default_language, is_active
           FROM tenants WHERE id = $1`,
        [TENANT_ID],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.slug).toBe('demo-bank-01');
      expect(rows[0]?.bct_bank_code).toBe('BANK-01');
      expect(rows[0]?.default_language).toBe('fr');
      expect(rows[0]?.is_active).toBe(true);
    });

    it('seeds the author user (compliance@) with deterministic UUID', async () => {
      const { rows } = await ctx.testPool.query<{
        email: string;
        full_name: string;
        tenant_id: string;
      }>(
        `SELECT email, full_name, tenant_id::text AS tenant_id
           FROM users WHERE id = $1`,
        [AUTHOR_ID],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.email).toBe('compliance@demo-bank-01.example');
      expect(rows[0]?.tenant_id).toBe(TENANT_ID);
    });

    it('seeds the validator user (validator@) with deterministic UUID', async () => {
      const { rows } = await ctx.testPool.query<{
        email: string;
        tenant_id: string;
      }>(`SELECT email, tenant_id::text AS tenant_id FROM users WHERE id = $1`, [VALIDATOR_ID]);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.email).toBe('validator@demo-bank-01.example');
      expect(rows[0]?.tenant_id).toBe(TENANT_ID);
    });

    it('grants compliance_officer role to the author user', async () => {
      const { rows } = await ctx.testPool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = $1 AND r.code = 'compliance_officer'
            AND r.tenant_id = $2`,
        [AUTHOR_ID, TENANT_ID],
      );
      expect(rows[0]?.count).toBe('1');
    });

    it('grants signatory role to the validator user', async () => {
      const { rows } = await ctx.testPool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = $1 AND r.code = 'signatory'
            AND r.tenant_id = $2`,
        [VALIDATOR_ID, TENANT_ID],
      );
      expect(rows[0]?.count).toBe('1');
    });

    it('does NOT cross-grant signatory to the author user', async () => {
      const { rows } = await ctx.testPool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = $1 AND r.code = 'signatory'`,
        [AUTHOR_ID],
      );
      expect(rows[0]?.count).toBe('0');
    });

    it('is idempotent — re-running the seed inserts no duplicate rows', async () => {
      // Re-apply 037a manually via the same GUC. The migration does
      // NOT re-touch already-present rows thanks to ON CONFLICT DO
      // NOTHING on tenants/users + the deterministic assigned_at on
      // user_roles.
      const { readFile } = await import('node:fs/promises');
      const { resolve } = await import('node:path');
      const sql = await readFile(
        resolve(__dirname, '../../migrations/037a_seed_dev_tenant.sql'),
        'utf-8',
      );
      const c = await ctx.testPool.connect();
      try {
        await c.query(`SET LOCAL app.seed_dev_tenant = 'true'`);
        await c.query(sql);
      } finally {
        c.release();
      }
      const tenantCount = await ctx.testPool.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM tenants WHERE id = $1`,
        [TENANT_ID],
      );
      expect(tenantCount.rows[0]?.c).toBe('1');
      const userCount = await ctx.testPool.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM users WHERE id IN ($1, $2)`,
        [AUTHOR_ID, VALIDATOR_ID],
      );
      expect(userCount.rows[0]?.c).toBe('2');
      // user_roles: each (user_id, role_id, assigned_at) combo is unique;
      // re-run uses the same assigned_at literal so ON CONFLICT skips.
      const grantCount = await ctx.testPool.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM user_roles WHERE tenant_id = $1`,
        [TENANT_ID],
      );
      // 2 grants seeded by 037a + the auto-grant from the
      // tenants_seed_roles trigger does NOT fire on conflict so no
      // additional roles row. Expect 2 user_roles rows total.
      expect(grantCount.rows[0]?.c).toBe('2');
    });
  });
});
