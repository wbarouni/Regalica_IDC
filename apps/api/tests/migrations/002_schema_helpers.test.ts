import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 002 — schema helpers', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(2);
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('creates the four helper functions in the schema', async () => {
    const { rows } = await ctx.testPool.query<{ proname: string }>(
      `SELECT proname FROM pg_proc
         WHERE pronamespace = to_regnamespace($1)::oid
         ORDER BY proname`,
      [ctx.schemaName],
    );
    const names = rows.map((r) => r.proname);
    expect(names).toEqual(
      expect.arrayContaining([
        'current_app_tenant_id',
        'current_app_user_id',
        'current_user_has_role',
        'uuidv7',
        'validate_prompt_schema',
      ]),
    );
  });

  it('current_app_user_id returns NULL when the session variable is unset', async () => {
    const { rows } = await ctx.testPool.query<{ v: string | null }>(
      'SELECT current_app_user_id() AS v',
    );
    expect(rows[0]!.v).toBeNull();
  });

  it('current_app_user_id reflects the value set via SET LOCAL', async () => {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_user_id = '00000000-0000-7000-8000-000000000001'`);
      const { rows } = await client.query<{ v: string }>('SELECT current_app_user_id() AS v');
      await client.query('COMMIT');
      expect(rows[0]!.v).toBe('00000000-0000-7000-8000-000000000001');
    } finally {
      client.release();
    }
  });

  it('validate_prompt_schema rejects non-object schema documents', async () => {
    const cases: Array<[string, boolean]> = [
      [`'{"type":"object"}'::jsonb`, true],
      [`'[1,2,3]'::jsonb`, false],
      [`'"a string"'::jsonb`, false],
      [`NULL::jsonb`, false],
    ];
    for (const [expr, expected] of cases) {
      const { rows } = await ctx.testPool.query<{ v: boolean }>(
        `SELECT validate_prompt_schema(${expr}, 'tmpl') AS v`,
      );
      expect(rows[0]!.v).toBe(expected);
    }
  });
});
