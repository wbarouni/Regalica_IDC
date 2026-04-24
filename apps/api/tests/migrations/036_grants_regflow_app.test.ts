import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

/**
 * Roles are cluster-global; once created by any earlier test run they
 * persist until the PostgreSQL cluster is rebuilt. All assertions below
 * are therefore tolerant of the role already existing — the migration
 * is guarded by IF NOT EXISTS.
 */
describeIfDb('migration 036 — regflow_app / regflow_engine / regflow_readonly grants', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(36);
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('creates the three cluster-global login roles', async () => {
    const { rows } = await ctx.testPool.query<{ rolname: string; rolcanlogin: boolean }>(
      `SELECT rolname, rolcanlogin FROM pg_roles
         WHERE rolname IN ('regflow_app', 'regflow_engine', 'regflow_readonly')
         ORDER BY rolname`,
    );
    expect(rows.map((r) => r.rolname)).toEqual([
      'regflow_app',
      'regflow_engine',
      'regflow_readonly',
    ]);
    expect(rows.every((r) => r.rolcanlogin)).toBe(true);
  });

  it('regflow_app keeps INSERT on validation_runs but loses UPDATE and DELETE (§23.1)', async () => {
    const { rows: ins } = await ctx.testPool.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('regflow_app', format('%I.validation_runs', current_schema()), 'INSERT') AS allowed`,
    );
    expect(ins[0]!.allowed).toBe(true);

    const { rows: upd } = await ctx.testPool.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('regflow_app', format('%I.validation_runs', current_schema()), 'UPDATE') AS allowed`,
    );
    expect(upd[0]!.allowed).toBe(false);

    const { rows: del } = await ctx.testPool.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('regflow_app', format('%I.validation_runs', current_schema()), 'DELETE') AS allowed`,
    );
    expect(del[0]!.allowed).toBe(false);
  });

  it('regflow_engine has UPDATE on each §23.1 column, and not on others', async () => {
    const granted = [
      'is_signed',
      'signed_at',
      'signed_by_user_id',
      'signed_xml_hash',
      'completed_at',
      'total_rules_evaluated',
      'total_pass',
      'total_fail_severe',
      'total_fail_rounding',
      'conformity_rate',
      'execution_time_ms',
      'status',
      'step1_xsd_status',
      'step1_xsd_duration_ms',
      'step2_embedded_status',
      'step2_embedded_duration_ms',
      'step3_rdg_status',
      'step3_rdg_duration_ms',
      'synthesis_artifact',
      'deliverable_c_artifact',
      'conversation_id',
    ];
    for (const col of granted) {
      const { rows } = await ctx.testPool.query<{ allowed: boolean }>(
        `SELECT has_column_privilege('regflow_engine', format('%I.validation_runs', current_schema()), $1, 'UPDATE') AS allowed`,
        [col],
      );
      expect({ column: col, allowed: rows[0]!.allowed }).toEqual({ column: col, allowed: true });
    }

    // Immutable columns that must NOT be in the grant list.
    for (const col of ['primary_annexe_code', 'arrete_date', 'primary_upload_id']) {
      const { rows } = await ctx.testPool.query<{ allowed: boolean }>(
        `SELECT has_column_privilege('regflow_engine', format('%I.validation_runs', current_schema()), $1, 'UPDATE') AS allowed`,
        [col],
      );
      expect({ column: col, allowed: rows[0]!.allowed }).toEqual({ column: col, allowed: false });
    }
  });

  it('regflow_app loses UPDATE and DELETE on audit_log (§23.2)', async () => {
    const { rows: upd } = await ctx.testPool.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('regflow_app', format('%I.audit_log', current_schema()), 'UPDATE') AS allowed`,
    );
    expect(upd[0]!.allowed).toBe(false);

    const { rows: del } = await ctx.testPool.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('regflow_app', format('%I.audit_log', current_schema()), 'DELETE') AS allowed`,
    );
    expect(del[0]!.allowed).toBe(false);
  });

  it('regflow_app loses UPDATE and DELETE on messages (§23.3)', async () => {
    const { rows: upd } = await ctx.testPool.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('regflow_app', format('%I.messages', current_schema()), 'UPDATE') AS allowed`,
    );
    expect(upd[0]!.allowed).toBe(false);

    const { rows: del } = await ctx.testPool.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('regflow_app', format('%I.messages', current_schema()), 'DELETE') AS allowed`,
    );
    expect(del[0]!.allowed).toBe(false);
  });

  it('regflow_readonly has SELECT but not INSERT on rules', async () => {
    const { rows: sel } = await ctx.testPool.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('regflow_readonly', format('%I.rules', current_schema()), 'SELECT') AS allowed`,
    );
    expect(sel[0]!.allowed).toBe(true);

    const { rows: ins } = await ctx.testPool.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('regflow_readonly', format('%I.rules', current_schema()), 'INSERT') AS allowed`,
    );
    expect(ins[0]!.allowed).toBe(false);
  });
});
