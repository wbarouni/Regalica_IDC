import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 025 — validation_runs', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let userId: string;
  let secondUserId: string;
  let uploadId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(25);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-025', 'Legal Test 025') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-025', 'user-025@tenant-001.example', 'User 025')
         RETURNING id`,
      [tenantId],
    );
    userId = u.rows[0]!.id;

    const u2 = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-025-signer', 'signer-025@tenant-001.example', 'Signer 025')
         RETURNING id`,
      [tenantId],
    );
    secondUserId = u2.rows[0]!.id;

    const up = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO xml_uploads (
         tenant_id, code_banque, code_annexe, date_annexe,
         file_name, file_size_bytes, file_hash_sha256, content_compressed,
         uploaded_by_user_id
       ) VALUES (
         $1, 'BANK-CODE', '00', '2026-04-24',
         'primary.xml', 2048, repeat('c', 64), '\\x00'::bytea, $2
       ) RETURNING id`,
      [tenantId, userId],
    );
    uploadId = up.rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  async function insertRun(
    overrides: Partial<{
      status: string;
      completedAt: string | null;
      isSigned: boolean;
      signedAt: string | null;
      signedBy: string | null;
      totalFailSevere: number | null;
    }> = {},
  ): Promise<string> {
    const status = overrides.status ?? 'running';
    const completedAt = overrides.completedAt === undefined ? null : overrides.completedAt;
    const isSigned = overrides.isSigned ?? false;
    const signedAt = overrides.signedAt === undefined ? null : overrides.signedAt;
    const signedBy = overrides.signedBy === undefined ? null : overrides.signedBy;
    const totalFailSevere =
      overrides.totalFailSevere === undefined ? null : overrides.totalFailSevere;
    const { rows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO validation_runs (
         tenant_id, primary_annexe_code, arrete_date, primary_upload_id,
         initiated_by_user_id,
         rules_version_snapshot, referentials_version_snapshot, engine_version,
         status, completed_at,
         total_fail_severe,
         is_signed, signed_at, signed_by_user_id
       ) VALUES (
         $1, '00', '2026-04-24', $2,
         $3,
         '{}'::jsonb, '{}'::jsonb, '1.0.0',
         $4, $5,
         $6,
         $7, $8, $9
       ) RETURNING id`,
      [
        tenantId,
        uploadId,
        userId,
        status,
        completedAt,
        totalFailSevere,
        isSigned,
        signedAt,
        signedBy,
      ],
    );
    return rows[0]!.id;
  }

  it('creates validation_runs with RLS enabled and forced', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname = 'validation_runs'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('rejects status=running with completed_at set', async () => {
    await expect(
      insertRun({ status: 'running', completedAt: new Date().toISOString() }),
    ).rejects.toThrow(/validation_runs_ck_completion/);
  });

  it('rejects status=completed with completed_at NULL', async () => {
    await expect(insertRun({ status: 'completed', completedAt: null })).rejects.toThrow(
      /validation_runs_ck_completion/,
    );
  });

  it('rejects is_signed=TRUE without signed_at / signed_by', async () => {
    await expect(
      insertRun({
        status: 'completed',
        completedAt: new Date().toISOString(),
        isSigned: true,
        signedAt: null,
        signedBy: null,
        totalFailSevere: 0,
      }),
    ).rejects.toThrow(/validation_runs_ck_signed_coherence/);
  });

  it('rejects is_signed=TRUE with total_fail_severe > 0', async () => {
    await expect(
      insertRun({
        status: 'completed',
        completedAt: new Date().toISOString(),
        isSigned: true,
        signedAt: new Date().toISOString(),
        signedBy: secondUserId,
        totalFailSevere: 1,
      }),
    ).rejects.toThrow(/validation_runs_ck_signed_coherence/);
  });

  it('accepts is_signed=TRUE with total_fail_severe=0 and coherent signing metadata', async () => {
    const id = await insertRun({
      status: 'completed',
      completedAt: new Date().toISOString(),
      isSigned: true,
      signedAt: new Date().toISOString(),
      signedBy: secondUserId,
      totalFailSevere: 0,
    });
    expect(id).toBeTruthy();
  });

  it('DELETE is forbidden by the immutability trigger', async () => {
    const id = await insertRun();
    await expect(
      ctx.testPool.query(`DELETE FROM validation_runs WHERE id = $1`, [id]),
    ).rejects.toThrow(/insert-only; DELETE is forbidden/);
  });

  it('UPDATE of immutable field is rejected', async () => {
    const id = await insertRun();
    await expect(
      ctx.testPool.query(`UPDATE validation_runs SET primary_annexe_code = '99' WHERE id = $1`, [
        id,
      ]),
    ).rejects.toThrow(/validation_runs immutable fields cannot be modified/);
  });

  it('signature revocation without session variable is rejected', async () => {
    const id = await insertRun({
      status: 'completed',
      completedAt: new Date().toISOString(),
      isSigned: true,
      signedAt: new Date().toISOString(),
      signedBy: secondUserId,
      totalFailSevere: 0,
    });
    await expect(
      ctx.testPool.query(`UPDATE validation_runs SET is_signed = FALSE WHERE id = $1`, [id]),
    ).rejects.toThrow(/revoke_signature_authorized = true/);
  });

  it('signature revocation is accepted when app.revoke_signature_authorized = true', async () => {
    const id = await insertRun({
      status: 'completed',
      completedAt: new Date().toISOString(),
      isSigned: true,
      signedAt: new Date().toISOString(),
      signedBy: secondUserId,
      totalFailSevere: 0,
    });
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.revoke_signature_authorized = 'true'`);
      const res = await client.query(
        `UPDATE validation_runs
            SET is_signed = FALSE,
                signed_at = NULL,
                signed_by_user_id = NULL,
                signed_xml_hash = NULL
          WHERE id = $1`,
        [id],
      );
      await client.query('COMMIT');
      expect(res.rowCount).toBe(1);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  it('blocks SELECT from another tenant (RLS USING)', async () => {
    const otherTenant = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-025-other', 'Legal Other 025') RETURNING id`,
    );
    const otherTenantId = otherTenant.rows[0]!.id;

    await insertRun();

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE regflow_app');
      await client.query(`SET LOCAL app.current_tenant_id = '${otherTenantId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM validation_runs`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('0');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  it('has the validation_run_uploads join table with UNIQUE and role CHECK', async () => {
    const runId = await insertRun();
    await ctx.testPool.query(
      `INSERT INTO validation_run_uploads (validation_run_id, xml_upload_id, role)
         VALUES ($1, $2, 'primary')`,
      [runId, uploadId],
    );
    await expect(
      ctx.testPool.query(
        `INSERT INTO validation_run_uploads (validation_run_id, xml_upload_id, role)
           VALUES ($1, $2, 'primary')`,
        [runId, uploadId],
      ),
    ).rejects.toThrow(/vru_uk/);
    await expect(
      ctx.testPool.query(
        `INSERT INTO validation_run_uploads (validation_run_id, xml_upload_id, role)
           VALUES ($1, $2, 'unknown')`,
        [runId, uploadId],
      ),
    ).rejects.toThrow(/vru_ck_role/);
  });
});
