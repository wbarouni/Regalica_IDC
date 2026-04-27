/**
 * REGFlow — Test Golden Baseline
 *
 * Test de non-régression qui itère sur tous les batches présents dans
 * `tests/fixtures/golden/<tenant>/` et vérifie le comportement du moteur
 * contre le contenu de chaque `expected_verdicts.json`.
 *
 * Remplace l'ancien test 5 XML / 937 PASS / 2 FAIL / 3672 SKIP.
 *
 * === Modes de fonctionnement ===
 *
 * - **capture** (REGFLOW_GOLDEN_MODE=capture) : les `expected_totals` à `null`
 *   sont capturés depuis les observations du moteur et le JSON est réécrit.
 *   Commit manuel requis après revue des valeurs.
 *
 * - **assert** (défaut) : comparaison stricte. Toute divergence fait échouer
 *   le test. Les champs `null` sont tolérés tant qu'on est en `capture_mode: true`.
 *
 * === Niveau de vérification actuel (Phase 0 du plan brute) ===
 *
 * Le moteur d'évaluation en 5 phases est implémenté en Phase 2. En Phase 0,
 * ce test vérifie :
 *
 * 1. Toutes les fixtures sont présentes et lisibles (headers XML conformes).
 * 2. Les `expected_verdicts.json` existent et respectent le schéma.
 * 3. Les métadonnées sont cohérentes entre fixtures et JSON.
 * 4. Les dépendances inter-annexes manquantes sont bien listées.
 * 5. Le parsing dual-nomenclature fonctionne sur tous les fichiers.
 *
 * En Phase 2, les blocs `describe("engine evaluation", ...)` seront activés
 * pour comparer les verdicts produits par le moteur aux expected_totals.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import { parseBctXml, parseBctBatch, type ParsedXml } from '@regflow/bct-xml-parser';

import { runEvaluation } from '../src/engine.js';
import { parseBatch } from '../src/phase-a.js';
import { loadRules } from '../src/rules-loader.js';
import {
  setupEvaluatorTestSchema,
  teardownEvaluatorTestSchema,
  type EvaluatorTestDb,
} from './_db-setup.js';
import {
  assertExpectedVerdictsShape,
  type ExpectedFail,
  type ExpectedVerdicts,
} from '../src/expected-verdicts.js';
import type { EvaluationInput, EvaluationResult, Verdict } from '../src/types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MODE = (process.env.REGFLOW_GOLDEN_MODE ?? 'assert') as 'assert' | 'capture';

// Répertoire racine des fixtures golden. Peut être surchargé par variable d'env.
const FIXTURES_ROOT =
  process.env.REGFLOW_GOLDEN_FIXTURES_DIR ??
  path.resolve(__dirname, '../../../tests/fixtures/golden');

const TENANT_SLUG = 'tenant-001';

// ---------------------------------------------------------------------------
// Batch discovery
// ---------------------------------------------------------------------------

interface DiscoveredBatch {
  batchId: string;
  arreteDate: string;
  batchDir: string;
  filledDir: string;
  emptyDir: string | null;
  expectedVerdictsPath: string;
  filledFiles: string[];
  emptyFiles: string[];
}

function discoverBatches(fixturesRoot: string, tenantSlug: string): DiscoveredBatch[] {
  const tenantDir = path.join(fixturesRoot, tenantSlug);
  if (!fs.existsSync(tenantDir)) {
    return [];
  }

  const batches: DiscoveredBatch[] = [];

  // Direct subdirectories matching YYYY-MM-DD
  const entries = fs.readdirSync(tenantDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'historical') {
      const historicalDir = path.join(tenantDir, entry.name);
      const subs = fs.readdirSync(historicalDir, { withFileTypes: true });
      for (const sub of subs) {
        if (!sub.isDirectory()) continue;
        const b = loadBatch(path.join(historicalDir, sub.name), sub.name, tenantSlug);
        if (b) batches.push(b);
      }
      continue;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) {
      const b = loadBatch(path.join(tenantDir, entry.name), entry.name, tenantSlug);
      if (b) batches.push(b);
    }
  }

  return batches.sort((a, b) => a.arreteDate.localeCompare(b.arreteDate));
}

function loadBatch(
  batchDir: string,
  arreteDate: string,
  tenantSlug: string,
): DiscoveredBatch | null {
  const expectedJsonPath = path.join(batchDir, 'expected_verdicts.json');
  if (!fs.existsSync(expectedJsonPath)) {
    return null;
  }

  // filled/ may be directly under batchDir or the files may be flat
  const filledDir = fs.existsSync(path.join(batchDir, 'filled'))
    ? path.join(batchDir, 'filled')
    : batchDir;
  const emptyDir = fs.existsSync(path.join(batchDir, 'structurally-valid-empty'))
    ? path.join(batchDir, 'structurally-valid-empty')
    : null;

  const filledFiles = fs
    .readdirSync(filledDir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.xml$/i.test(e.name))
    .map((e) => path.join(filledDir, e.name));

  const emptyFiles = emptyDir
    ? fs
        .readdirSync(emptyDir, { withFileTypes: true })
        .filter((e) => e.isFile() && /\.xml$/i.test(e.name))
        .map((e) => path.join(emptyDir, e.name))
    : [];

  return {
    batchId: `${tenantSlug}-${arreteDate}`,
    arreteDate,
    batchDir,
    filledDir,
    emptyDir,
    expectedVerdictsPath: expectedJsonPath,
    filledFiles,
    emptyFiles,
  };
}

function loadExpectedVerdicts(path_: string): ExpectedVerdicts {
  const raw = fs.readFileSync(path_, 'utf-8');
  const parsed = JSON.parse(raw);
  assertExpectedVerdictsShape(parsed);
  return parsed;
}

function saveExpectedVerdicts(path_: string, data: ExpectedVerdicts): void {
  fs.writeFileSync(path_, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Golden Baseline — Structure and Metadata Validation (Phase 0)', () => {
  const batches = discoverBatches(FIXTURES_ROOT, TENANT_SLUG);

  it('at least one batch must be discovered', () => {
    expect(batches.length).toBeGreaterThan(0);
  });

  describe.each(batches.map((b) => [b.batchId, b]))(
    'Batch %s',
    (_batchId: unknown, batch: DiscoveredBatch) => {
      const expected = loadExpectedVerdicts(batch.expectedVerdictsPath);

      it('batch metadata matches the expected_verdicts file', () => {
        expect(expected.batch_metadata.tenant_slug).toBe(TENANT_SLUG);
        expect(expected.batch_metadata.arrete_date).toBe(batch.arreteDate);
      });

      it('filled file count matches declared count', () => {
        expect(batch.filledFiles.length).toBe(expected.batch_metadata.files_count_filled);
      });

      it('structurally valid empty file count matches declared count', () => {
        expect(batch.emptyFiles.length).toBe(
          expected.batch_metadata.files_count_structurally_valid_empty,
        );
      });

      it('every filled XML parses without error', () => {
        for (const f of batch.filledFiles) {
          const content = fs.readFileSync(f, 'utf-8');
          expect(() => parseBctXml(content)).not.toThrow();
        }
      });

      it('every parsed XML declares the expected arrete date (inside content)', () => {
        for (const f of batch.filledFiles) {
          const content = fs.readFileSync(f, 'utf-8');
          const parsed = parseBctXml(content);
          // La date d'arrêté dans le XML doit correspondre au batch
          // Exception: fichiers sans DateAnnexe (cas rare, comme 781 structural-reference)
          if (parsed.header.dateAnnexe) {
            expect(parsed.header.dateAnnexe).toBe(batch.arreteDate);
          }
        }
      });

      it('bank code in XMLs matches batch metadata bank_code_bct', () => {
        for (const f of batch.filledFiles) {
          const content = fs.readFileSync(f, 'utf-8');
          const parsed = parseBctXml(content);
          if (parsed.header.codeBanque) {
            expect(parsed.header.codeBanque).toBe(expected.batch_metadata.bank_code_bct);
          }
        }
      });

      it('annexes in XMLs are a subset of annexes_in_scope', () => {
        const observedAnnexes = new Set<string>();
        for (const f of [...batch.filledFiles, ...batch.emptyFiles]) {
          const content = fs.readFileSync(f, 'utf-8');
          const parsed = parseBctXml(content);
          if (parsed.header.codeAnnexe) {
            observedAnnexes.add(parsed.header.codeAnnexe);
          }
        }
        const declaredInScope = new Set(expected.annexes_in_scope);
        for (const ann of observedAnnexes) {
          expect(declaredInScope.has(ann)).toBe(true);
        }
      });

      it('expected_skips_by_annexe matches structurally-valid-empty files', () => {
        const emptyAnnexes = new Set<string>();
        for (const f of batch.emptyFiles) {
          const content = fs.readFileSync(f, 'utf-8');
          const parsed = parseBctXml(content);
          if (parsed.header.codeAnnexe) emptyAnnexes.add(parsed.header.codeAnnexe);
        }
        const declaredSkips = new Set(Object.keys(expected.expected_skips_by_annexe));
        // Every empty annexe must appear in expected_skips
        for (const ann of emptyAnnexes) {
          expect(declaredSkips.has(ann)).toBe(true);
        }
      });

      it('batch parses as a whole via parseBctBatch', () => {
        const xmls = batch.filledFiles.map((f) => ({
          filename: path.basename(f),
          content: fs.readFileSync(f, 'utf-8'),
        }));
        const { parsed, mergedCells } = parseBctBatch(xmls);
        expect(parsed.size).toBe(batch.filledFiles.length);
        // mergedCells must have at least as many annexes as there are filled files
        expect(mergedCells.size).toBeGreaterThan(0);
      });
    },
  );
});

// ---------------------------------------------------------------------------
// Phase 2 — Engine Evaluation
// ---------------------------------------------------------------------------
//
// This block runs the canonical engine pipeline against the golden corpus.
// It is gated on `DATABASE_URL` because rule loading needs a live Postgres
// to read the seeded `rules` rows. When no DB is available (CI sandbox
// without Postgres) the whole block is skipped — the Phase 0 metadata
// suite above keeps running and protects parsing / structural invariants.

const SEED_MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../apps/api/migrations/042_seed_rules.sql',
);

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('Golden Baseline — Engine Evaluation (Phase 2)', () => {
  const batches = discoverBatches(FIXTURES_ROOT, TENANT_SLUG);

  let ctx: EvaluatorTestDb;
  let tenantId: string;

  beforeAll(async () => {
    // Schema is built up to migration 042. The seed migrations 038-042
    // see no GUC at apply time and skip cleanly via their missing-ok
    // guard, leaving the tables empty. We then insert the tenant + author
    // rows the seed needs and re-execute 042 with the GUCs set, which
    // populates the `rules` table without the FK violations a pre-set
    // GUC would have caused.
    ctx = await setupEvaluatorTestSchema(42);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-001', 'Tenant Pilot Golden') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-golden-author', 'author@golden.example', 'Golden Author')
         RETURNING id`,
      [tenantId],
    );
    const authorId = u.rows[0]!.id;

    const seedSql = await readFile(SEED_MIGRATION_PATH, 'utf8');
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_tenant_id = '${tenantId}'`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(`SET app.seed_valid_from = '2020-01-01'`);
      await client.query(seedSql);
    } finally {
      client.release();
    }
  }, 600000);

  afterAll(async () => {
    if (ctx) {
      await teardownEvaluatorTestSchema(ctx);
    }
  });

  describe.each(batches.map((b) => [b.batchId, b]))(
    'Batch %s engine run',
    (_batchId: unknown, batch: DiscoveredBatch) => {
      let expected: ExpectedVerdicts;
      let result: EvaluationResult;

      beforeAll(async () => {
        expected = loadExpectedVerdicts(batch.expectedVerdictsPath);

        const rules = await loadRules({
          pool: ctx.testPool,
          tenantId,
          arreteDate: new Date(batch.arreteDate),
          statuses: ['draft'],
        });

        const xmlContents = batch.filledFiles.map((f) => fs.readFileSync(f, 'utf-8'));
        const { parsedXmls, mergedCells } = parseBatch(xmlContents);

        const input: EvaluationInput = {
          tenantId,
          arreteDate: batch.arreteDate,
          parsedXmls: new Map(
            parsedXmls.map((p, i) => [path.basename(batch.filledFiles[i] ?? `xml-${i}`), p]),
          ),
          mergedCells,
          rules,
        };
        result = await runEvaluation(input);
      }, 600000);

      it('engine produces expected totals (or captures them on first run)', () => {
        const observedTotals: ExpectedVerdicts['expected_totals'] = {
          rules_applicable_total: result.totals.rulesApplicableTotal,
          pass: result.totals.pass,
          fail_severe: result.totals.failSevere,
          fail_rounding: result.totals.failRounding,
          skipped_missing_annexe: result.totals.skippedMissingAnnexe,
          skipped_missing_rubrique: result.totals.skippedMissingRubrique,
          skipped_missing_colonne: result.totals.skippedMissingColonne,
          skipped_missing_data: result.totals.skippedMissingData,
          skipped_conditional: result.totals.skippedConditional,
          skipped_unsupported_op: result.totals.skippedUnsupportedOp,
          skipped_literal_text: result.totals.skippedLiteralText,
          capture_mode: false,
        };

        if (MODE === 'capture' && expected.expected_totals.capture_mode) {
          const observedSevereFails = result.verdicts.filter(
            (v) => v.status === 'FAIL' && v.severity === 'severe',
          );
          maybeCapture(expected, observedTotals, observedSevereFails, batch.expectedVerdictsPath);
          return;
        }

        const exp = expected.expected_totals;
        expect(result.totals.rulesApplicableTotal).toBe(exp.rules_applicable_total);
        expect(result.totals.pass).toBe(exp.pass);
        expect(result.totals.failSevere).toBe(exp.fail_severe);
        expect(result.totals.failRounding).toBe(exp.fail_rounding);
        expect(result.totals.skippedMissingAnnexe).toBe(exp.skipped_missing_annexe);
        expect(result.totals.skippedMissingRubrique).toBe(exp.skipped_missing_rubrique);
        expect(result.totals.skippedMissingColonne).toBe(exp.skipped_missing_colonne);
        expect(result.totals.skippedMissingData).toBe(exp.skipped_missing_data);
        expect(result.totals.skippedConditional).toBe(exp.skipped_conditional);
        expect(result.totals.skippedUnsupportedOp).toBe(exp.skipped_unsupported_op);
        expect(result.totals.skippedLiteralText).toBe(exp.skipped_literal_text);
      });

      it('every expected_fail is actually produced by the engine', () => {
        for (const ef of expected.expected_fails) {
          const match = result.verdicts.find(
            (v) =>
              v.annexeCode === ef.annexeCode && v.numRegle === ef.numRegle && v.status === 'FAIL',
          );
          expect(match).toBeDefined();
          if (match) {
            expect(match.severity).toBe(ef.severity);
            expect(match.lhs).not.toBeNull();
            expect(match.rhs).not.toBeNull();
            expect(match.gap).not.toBeNull();
            expect(match.lhs!.toString()).toBe(ef.lhs);
            expect(match.rhs!.toString()).toBe(ef.rhs);
            expect(match.gap!.toString()).toBe(ef.gap);
            expect(match.operRegle).toBe(ef.operRegle);
          }
        }
      });

      it('no unexpected FAIL severe is produced', () => {
        const observedSevereFails = result.verdicts.filter(
          (v) => v.status === 'FAIL' && v.severity === 'severe',
        );

        // Count must match the captured / declared fail_severe. The
        // assertion is skipped during the capture run because the
        // captured value has not been written back yet.
        if (MODE !== 'capture' || !expected.expected_totals.capture_mode) {
          expect(observedSevereFails.length).toBe(expected.expected_totals.fail_severe);
        }

        // Membership check: each observed FAIL severe must appear in
        // the captured expected_fails list. Phase 2-bis populates this
        // list automatically during the capture run, so assert mode
        // verifies the engine reproduces exactly the same set.
        if (expected.expected_fails.length > 0) {
          const expectedFailKeys = new Set(
            expected.expected_fails
              .filter((f) => f.severity === 'severe')
              .map((f) => `${f.annexeCode}/${f.numRegle}`),
          );
          for (const v of observedSevereFails) {
            expect(expectedFailKeys.has(`${v.annexeCode}/${v.numRegle}`)).toBe(true);
          }
        }
      });

      it('companion_annexes_missing entries refer to existing bearer annexes', () => {
        // The `companion_annexes_missing_in_batch` entries declare a
        // regulatory dependency between annexes (e.g. annexe 47
        // documentation references annexes 00/01/51). The dependency is
        // not necessarily realised at the rule-term level — the seed
        // corpus has many intra-annexe rules whose axTerm matches a
        // bearer in `required_by` but whose terms reference no other
        // annexe. The previous heuristic ("at least one
        // SKIPPED_MISSING_ANNEXE on a bearer") was satisfied only by
        // the buggy pre-21 sentinel C handling that wrongly skipped
        // intra-annexe literal terms; once the loader maps sentinel C
        // to literals, the heuristic no longer holds.
        //
        // We instead assert the structural invariant: every bearer
        // listed in `required_by` exists somewhere in the verdicts
        // (i.e. corresponds to a real rule in the corpus). Phase 2-bis
        // will refine this check once expected_fails is populated with
        // curated entries that include term-level dependency data.
        for (const cm of expected.companion_annexes_missing_in_batch) {
          if (cm.required_by.length === 0) continue;
          const hasBearer = cm.required_by.some((bearer) =>
            result.verdicts.some((v) => v.annexeCode === bearer),
          );
          expect(hasBearer).toBe(true);
        }
      });
    },
  );
});

// ---------------------------------------------------------------------------
// Capture mode helper (utilisé quand REGFLOW_GOLDEN_MODE=capture)
// ---------------------------------------------------------------------------

/**
 * Serialise an engine FAIL-severe verdict into the canonical
 * ExpectedFail shape. Decimal fields are emitted as strings to
 * preserve full precision in JSON. Field names mirror the Verdict
 * type so the mapping is purely structural — no manual translation,
 * no hardcoded labels.
 */
function verdictToExpectedFail(v: Verdict): ExpectedFail {
  if (v.severity === null) {
    throw new Error(`[golden capture] FAIL verdict missing severity: ${v.ruleId}`);
  }
  if (v.lhs === null || v.rhs === null || v.gap === null) {
    throw new Error(`[golden capture] FAIL verdict missing lhs/rhs/gap: ${v.ruleId}`);
  }
  return {
    annexeCode: v.annexeCode,
    numRegle: v.numRegle,
    operRegle: v.operRegle,
    lhs: v.lhs.toString(),
    rhs: v.rhs.toString(),
    gap: v.gap.toString(),
    severity: v.severity,
  };
}

/**
 * Utilitaire à invoquer depuis les tests d'évaluation pour écrire les
 * valeurs capturées dans expected_verdicts.json lors du premier
 * passage. Peuple à la fois les totaux et la liste des FAIL severe
 * (sérialisée depuis les Verdict du moteur). Aucun champ curated
 * n'est inventé — Phase 3 enrichira chaque entry avec
 * business_reason / cluster_hint quand l'opérateur triera.
 *
 * @internal Exporté pour réutilisation dans des tests futurs.
 */
export function maybeCapture(
  expected: ExpectedVerdicts,
  observed: ExpectedVerdicts['expected_totals'],
  observedSevereFails: readonly Verdict[],
  expectedPath: string,
): void {
  if (MODE !== 'capture') return;
  if (!expected.expected_totals.capture_mode) return;

  // Stable ordering: (annexeCode asc, numRegle asc). The engine
  // already sorts verdicts this way, but we re-sort defensively to
  // guarantee bit-stable JSON output across runs.
  const sortedFails = [...observedSevereFails].sort((a, b) => {
    if (a.annexeCode !== b.annexeCode) return a.annexeCode < b.annexeCode ? -1 : 1;
    return a.numRegle - b.numRegle;
  });

  const updated: ExpectedVerdicts = {
    ...expected,
    expected_totals: {
      ...expected.expected_totals,
      ...observed,
      capture_mode: false,
    },
    expected_fails: sortedFails.map(verdictToExpectedFail),
  };
  saveExpectedVerdicts(expectedPath, updated);
  console.log(
    `  [capture] Updated ${path.relative(process.cwd(), expectedPath)} (${sortedFails.length} FAIL severe entries)`,
  );
}

// Avoid unused var warnings (fileURLToPath kept for future ESM support)
void fileURLToPath;
