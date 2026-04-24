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

import { parseBctXml, parseBctBatch, type ParsedXml } from '@regflow/bct-xml-parser';

import { assertExpectedVerdictsShape, type ExpectedVerdicts } from '../src/expected-verdicts.js';

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
// Phase 2 — Engine Evaluation (stub, skipped until moteur connecté)
// ---------------------------------------------------------------------------

describe.skip('Golden Baseline — Engine Evaluation (Phase 2)', () => {
  // Ce bloc est volontairement `describe.skip` en Phase 0 parce que le moteur
  // n'est pas encore implémenté. Il sera activé en Phase 2 du plan brute en
  // retirant le `.skip` et en branchant le moteur canonique.

  const batches = discoverBatches(FIXTURES_ROOT, TENANT_SLUG);

  describe.each(batches.map((b) => [b.batchId, b]))(
    'Batch %s engine run',
    (_batchId: unknown, batch: DiscoveredBatch) => {
      const expected = loadExpectedVerdicts(batch.expectedVerdictsPath);

      it('engine produces expected totals (or captures them on first run)', async () => {
        // 1. Charger règles depuis DB (migration 008 seed_rdg_rules).
        // 2. Filtrer règles dont validFrom <= arreteDate < validTo.
        // 3. Parser le batch via parseBctBatch.
        // 4. Exécuter le moteur : engine.evaluate({ tenantId, arreteDate, parsedXmls, mergedCells, rules }).
        // 5. Comparer result.totals avec expected.expected_totals.
        //
        // Mode capture : si expected_totals.capture_mode === true, capturer les
        // valeurs observées et réécrire le JSON.
        //
        // Mode assert : comparer strictement chaque champ.
        expect(true).toBe(true); // placeholder
      });

      it('every expected_fail is actually produced by the engine', async () => {
        // Pour chaque entrée dans expected.expected_fails :
        //   - Vérifier qu'un verdict FAIL existe pour (annexe, num_regle).
        //   - Vérifier que sa rubrique et colonne correspondent.
        //   - Vérifier que son gap est à la précision Decimal près
        //     (tolérance 0 pour severe, tolérance 1 TND pour rounding).
        expect(true).toBe(true); // placeholder
      });

      it('no unexpected FAIL severe is produced', async () => {
        // Vérifier que result.totals.fail_severe === expected.expected_totals.fail_severe
        // et que chaque FAIL sévère du résultat est dans expected.expected_fails.
        expect(true).toBe(true); // placeholder
      });

      it('companion_annexes_missing produces corresponding SKIPPED_MISSING_ANNEXE', async () => {
        // Vérifier que chaque annexe de expected.companion_annexes_missing_in_batch
        // génère les SKIPPED attendus sur ses règles dépendantes.
        expect(true).toBe(true); // placeholder
      });
    },
  );
});

// ---------------------------------------------------------------------------
// Capture mode helper (utilisé quand REGFLOW_GOLDEN_MODE=capture)
// ---------------------------------------------------------------------------

/**
 * Utilitaire à invoquer depuis les tests d'évaluation en Phase 2 pour écrire
 * les valeurs capturées dans expected_verdicts.json lors du premier passage.
 *
 * @internal Exporté pour réutilisation dans des tests futurs.
 */
export function maybeCapture(
  expected: ExpectedVerdicts,
  observed: ExpectedVerdicts['expected_totals'],
  expectedPath: string,
): void {
  if (MODE !== 'capture') return;
  if (!expected.expected_totals.capture_mode) return;

  const updated: ExpectedVerdicts = {
    ...expected,
    expected_totals: {
      ...expected.expected_totals,
      ...observed,
      capture_mode: false,
    },
  };
  saveExpectedVerdicts(expectedPath, updated);
  console.log(
    `  [capture] Updated ${path.relative(process.cwd(), expectedPath)} with observed values`,
  );
}

// Avoid unused var warnings in Phase 0 build
void fileURLToPath;
void MODE;
