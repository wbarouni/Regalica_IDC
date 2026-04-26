import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 028 — four_eyes_approvals', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let requesterId: string;
  let deciderId: string;
  let entityId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(28);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-028', 'Legal Test 028') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const req = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-028-req', 'req-028@tenant-001.example', 'Requester 028')
         RETURNING id`,
      [tenantId],
    );
    requesterId = req.rows[0]!.id;

    const dec = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-028-dec', 'dec-028@tenant-001.example', 'Decider 028')
         RETURNING id`,
      [tenantId],
    );
    deciderId = dec.rows[0]!.id;

    const entity = await ctx.testPool.query<{ id: string }>(`SELECT uuidv7() AS id`);
    entityId = entity.rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  async function insertApproval(
    overrides: Partial<{
      entityType: string;
      decision: string;
      decidedBy: string | null;
      decidedAt: string | null;
    }> = {},
  ): Promise<string> {
    const entityType = overrides.entityType ?? 'rule';
    const decision = overrides.decision ?? 'pending';
    const decidedBy = overrides.decidedBy === undefined ? null : overrides.decidedBy;
    const decidedAt = overrides.decidedAt === undefined ? null : overrides.decidedAt;
    const { rows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO four_eyes_approvals (
         tenant_id, entity_type, entity_id, entity_version,
         requested_by_user_id, requested_change,
         decision, decided_by_user_id, decided_at
       ) VALUES (
         $1, $2, $3, 1,
         $4, '{"change":"test"}'::jsonb,
         $5, $6, $7
       ) RETURNING id`,
      [tenantId, entityType, entityId, requesterId, decision, decidedBy, decidedAt],
    );
    return rows[0]!.id;
  }

  it('creates four_eyes_approvals with RLS enabled and forced', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname = 'four_eyes_approvals'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('has the 3 expected indexes', async () => {
    const { rows } = await ctx.testPool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
         WHERE schemaname = $1 AND tablename = 'four_eyes_approvals'`,
      [ctx.schemaName],
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining(['fea_idx_entity', 'fea_idx_pending', 'fea_idx_requester']),
    );
  });

  it('rejects entity_type outside the canonical list', async () => {
    await expect(insertApproval({ entityType: 'unknown_entity' })).rejects.toThrow(
      /fea_ck_entity_type/,
    );
  });

  it('rejects decision outside pending/approved/rejected', async () => {
    await expect(insertApproval({ decision: 'maybe' })).rejects.toThrow(/fea_ck_decision/);
  });

  it('rejects decided_by_user_id == requested_by_user_id', async () => {
    await expect(
      insertApproval({
        decision: 'approved',
        decidedBy: requesterId,
        decidedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/fea_ck_distinct_users/);
  });

  it('rejects decision=pending with decided_by set', async () => {
    await expect(
      insertApproval({
        decision: 'pending',
        decidedBy: deciderId,
        decidedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/fea_ck_decision_coherence/);
  });

  it('rejects decision=approved without decided_by / decided_at', async () => {
    await expect(
      insertApproval({ decision: 'approved', decidedBy: null, decidedAt: null }),
    ).rejects.toThrow(/fea_ck_decision_coherence/);
  });

  it('accepts pending + approved + rejected when coherent', async () => {
    await insertApproval();
    await insertApproval({
      decision: 'approved',
      decidedBy: deciderId,
      decidedAt: new Date().toISOString(),
    });
    await insertApproval({
      decision: 'rejected',
      decidedBy: deciderId,
      decidedAt: new Date().toISOString(),
    });
  });

  it('blocks SELECT from another tenant (RLS USING)', async () => {
    const otherTenant = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-028-other', 'Legal Other 028') RETURNING id`,
    );
    const otherTenantId = otherTenant.rows[0]!.id;

    await insertApproval();

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE regflow_app');
      await client.query(`SET LOCAL app.current_tenant_id = '${otherTenantId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM four_eyes_approvals`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('0');
    } finally {
      client.release();
    }
  });
});
