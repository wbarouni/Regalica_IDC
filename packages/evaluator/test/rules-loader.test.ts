/**
 * Integration test for `loadRules`.
 *
 * Skipped automatically when DATABASE_URL is absent (CI sandbox without
 * Postgres). When a database is available, the test applies migrations
 * 001-042 into a throw-away schema, inserts a single draft rule with a
 * known terms shape, then asserts the loader's mapping contract.
 */

import {
  setupEvaluatorTestSchema,
  teardownEvaluatorTestSchema,
  type EvaluatorTestDb,
} from './_db-setup.js';
import { loadRules } from '../src/rules-loader.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('rules-loader — loadRules()', () => {
  let ctx: EvaluatorTestDb;
  let tenantId: string;
  let authorId: string;
  let ruleId: string;

  beforeAll(async () => {
    ctx = await setupEvaluatorTestSchema(42);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-evl-loader', 'Legal Evl Loader') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-evl-loader-author', 'author-loader@tenant-evl.example', 'Loader Author')
         RETURNING id`,
      [tenantId],
    );
    authorId = u.rows[0]!.id;

    // Single rule with terms intentionally given out of order so the
    // loader's sort by (rang, num_seq) is exercised.
    const termsJsonb = JSON.stringify([
      {
        rang: 2,
        ax_origine: '00',
        rubrique: 'CP020400000000',
        colonne: 8,
        oper_term: '+',
        num_seq: 2,
      },
      {
        rang: 1,
        ax_origine: '130',
        rubrique: '13001010300000',
        colonne: 1,
        oper_term: '+',
        num_seq: 1,
      },
      {
        rang: 2,
        ax_origine: '00',
        rubrique: 'CP020400000000',
        colonne: 9,
        oper_term: '-',
        num_seq: 1,
      },
    ]);

    const r = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO rules (
         tenant_id, ax_term, num_regle, type_ctrl_computed,
         operator, natural_language, terms, terms_count,
         is_inter_annexe, involved_annexes,
         valid_from, author_user_id, status
       ) VALUES (
         $1, '130', 12, 'inter_ax',
         '=', 'Loader test rule', $2::JSONB, 3,
         TRUE, ARRAY['00','130'],
         '2025-01-01'::TIMESTAMPTZ, $3, 'draft'
       ) RETURNING id`,
      [tenantId, termsJsonb, authorId],
    );
    ruleId = r.rows[0]!.id;
  }, 120000);

  afterAll(async () => {
    await teardownEvaluatorTestSchema(ctx);
  });

  it('returns the inserted rule when status=draft is requested', async () => {
    const rules = await loadRules({
      pool: ctx.testPool,
      tenantId,
      arreteDate: new Date('2025-06-01'),
      statuses: ['draft'],
    });
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe(ruleId);
    expect(rules[0]!.axTerm).toBe('130');
    expect(rules[0]!.numRegle).toBe(12);
    expect(rules[0]!.operRegle).toBe('=');
    expect(rules[0]!.typeCtrl).toBe('inter_ax');
    expect(rules[0]!.tenantId).toBe(tenantId);
    expect(typeof rules[0]!.validFrom).toBe('string');
  });

  it('returns no rules when statuses=[active] (seed is draft)', async () => {
    const rules = await loadRules({
      pool: ctx.testPool,
      tenantId,
      arreteDate: new Date('2025-06-01'),
      statuses: ['active'],
    });
    expect(rules).toHaveLength(0);
  });

  it('orders terms by (rang asc, num_seq asc) and rewrites colonne to string', async () => {
    const rules = await loadRules({
      pool: ctx.testPool,
      tenantId,
      arreteDate: new Date('2025-06-01'),
      statuses: ['draft'],
    });
    const terms = rules[0]!.terms;
    expect(terms.map((t) => `${t.rang}:${t.numSeq}`)).toEqual(['1:1', '2:1', '2:2']);
    for (const t of terms) {
      expect(t.kind).toBe('cell_ref');
      expect(typeof t.colonne).toBe('string');
      expect(t.id).toBe(`${ruleId}::r${t.rang}::s${t.numSeq}`);
      expect(t.literalValue).toBeNull();
      expect(t.literalText).toBeNull();
    }
  });

  it('excludes rules outside the bitemporal window', async () => {
    const rules = await loadRules({
      pool: ctx.testPool,
      tenantId,
      arreteDate: new Date('2024-01-01'),
      statuses: ['draft'],
    });
    expect(rules).toHaveLength(0);
  });
});

describe('rules-loader — operator validation (unit)', () => {
  it('rejects unsupported operator at load time', async () => {
    const fakePool = {
      query: () =>
        Promise.resolve({
          rows: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              ax_term: '00',
              num_regle: 1,
              operator: 'XOR',
              type_ctrl_computed: 'intra_ax',
              zone_texte: null,
              terms: [],
              terms_count: 0,
              version: 1,
              valid_from: new Date('2025-01-01'),
              valid_to: null,
            },
          ],
        }),
    } as unknown as Parameters<typeof loadRules>[0]['pool'];

    await expect(
      loadRules({
        pool: fakePool,
        tenantId: '00000000-0000-0000-0000-000000000000',
        arreteDate: new Date('2025-06-01'),
        statuses: ['draft'],
      }),
    ).rejects.toThrow(/unsupported operator/);
  });
});
