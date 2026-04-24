import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 001 — extensions and uuidv7', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(1);
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('installs all required extensions', async () => {
    const { rows } = await ctx.testPool.query<{ extname: string }>(
      `SELECT extname FROM pg_extension
         WHERE extname = ANY($1::text[])
         ORDER BY extname`,
      [['btree_gin', 'citext', 'pg_trgm', 'pgcrypto', 'uuid-ossp', 'vector']],
    );
    const names = rows.map((r) => r.extname);
    expect(names).toEqual(['btree_gin', 'citext', 'pg_trgm', 'pgcrypto', 'uuid-ossp', 'vector']);
  });

  it('uuidv7() returns a UUID matching the version 7 / variant 10xx layout', async () => {
    const { rows } = await ctx.testPool.query<{ u: string }>('SELECT uuidv7() AS u');
    const uuid = rows[0]!.u;
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('uuidv7() values generated in sequence are monotonically non-decreasing on their time prefix', async () => {
    const { rows } = await ctx.testPool.query<{ u: string }>(
      `SELECT uuidv7() AS u FROM generate_series(1, 20) ORDER BY generate_series`,
    );
    const prefixes = rows.map((r) => r.u.replace(/-/g, '').substring(0, 12));
    for (let i = 1; i < prefixes.length; i += 1) {
      expect(prefixes[i]! >= prefixes[i - 1]!).toBe(true);
    }
  });
});
