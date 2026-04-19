/**
 * RDG XLSX Seeder
 *
 * Loads 4,611 rules and 18,452 terms from tests/fixtures/rdg.xlsx into PostgreSQL.
 * Safe to re-run (idempotent): rules use findOrCreate on the unique index
 * (tenant_id, annexe_code, num_regle, version=1); terms use ignoreDuplicates.
 *
 * CLI script — console.log is intentional (not prod code, CLAUDE.md exemption).
 *
 * Run from project root:
 *   npx tsx apps/api/src/db/seeders/rdg-seeder.ts
 */

import path from 'node:path';
import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import 'dotenv/config';

import { Rule } from '../models/rule';
import { RuleTerm } from '../models/rule-term';
import { sequelize } from '../sequelize';

// ─── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const XLSX_PATH = path.resolve(process.cwd(), 'tests/fixtures/rdg.xlsx');
const SHEET_NAME = 'RDG';
const BATCH_SIZE = 100; // rules per transaction
const LOG_EVERY = 100;  // log progress every N rules

Decimal.set({ precision: 38 });

// ─── Row type (raw XLSX values) ───────────────────────────────────────────────

interface RdgRow {
  LIB_DOMAINE: string | undefined;
  LIB_ANNEXE: string | undefined;
  NUM_REGLE: number | undefined;
  OPER_REGLE: string | undefined;
  RANG_TERM: number | undefined;
  AX_TERM: string | undefined;
  RUBRIQUE: string | undefined;
  COLONNE: string | number | undefined;
  OPER_TERM_REGLE: string | undefined;
  NUM_SEQ: number | undefined;
  AX_ORIGINE: string | undefined;
  TYPE_CTRL: string | undefined;
  ZONE_TEXTE: string | undefined;
}

// ─── Grouped structures ───────────────────────────────────────────────────────

interface RuleGroup {
  annexeCode: string;
  numRegle: number;
  operRegle: string;
  typeCtrl: string;
  domaine: string | null;
  libAnnexe: string | null;
  zoneTexte: string | null;
  rows: RdgRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNullableString(value: string | number | undefined): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * Determine term kind per business logic §8.2.
 *
 * - COLONNE defined (non-null, non-empty) → 'cell_ref'
 * - COLONNE absent AND RUBRIQUE parseable as number → 'literal'
 * - COLONNE absent AND RUBRIQUE not parseable → 'literal_text'
 */
function determineKind(
  colonne: string | number | undefined,
  rubrique: string | undefined,
): 'cell_ref' | 'literal' | 'literal_text' {
  const colonneStr = toNullableString(colonne);
  if (colonneStr !== null) {
    return 'cell_ref';
  }
  // COLONNE is null/empty — check RUBRIQUE
  const rubrStr = toNullableString(rubrique);
  if (rubrStr !== null && !isNaN(Number(rubrStr))) {
    return 'literal';
  }
  return 'literal_text';
}

// ─── Load & parse XLSX ────────────────────────────────────────────────────────

function loadRows(): RdgRow[] {
  console.log(`[rdg-seeder] Reading XLSX: ${XLSX_PATH}`);
  const workbook = XLSX.readFile(XLSX_PATH, { cellDates: false, raw: true });
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found in ${XLSX_PATH}`);
  }
  const rows = XLSX.utils.sheet_to_json<RdgRow>(sheet, { defval: undefined });
  console.log(`[rdg-seeder] Loaded ${rows.length} rows from sheet "${SHEET_NAME}"`);
  return rows;
}

// ─── Group rows by rule key (AX_TERM, NUM_REGLE) ─────────────────────────────

function groupByRule(rows: RdgRow[]): RuleGroup[] {
  const map = new Map<string, RuleGroup>();

  for (const row of rows) {
    const axTerm = toNullableString(row.AX_TERM);
    const numRegle = row.NUM_REGLE;

    if (axTerm === null || numRegle === undefined || numRegle === null) {
      console.warn('[rdg-seeder] Skipping row with missing AX_TERM or NUM_REGLE:', row);
      continue;
    }

    const operRegle = toNullableString(row.OPER_REGLE);
    const typeCtrl = toNullableString(row.TYPE_CTRL);

    if (operRegle === null || typeCtrl === null) {
      console.warn('[rdg-seeder] Skipping row with missing OPER_REGLE or TYPE_CTRL:', row);
      continue;
    }

    const key = `${axTerm}::${numRegle}`;

    if (!map.has(key)) {
      map.set(key, {
        annexeCode: axTerm,
        numRegle,
        operRegle,
        typeCtrl,
        // Take from first term of the rule group (§9.4)
        domaine: toNullableString(row.LIB_DOMAINE),
        libAnnexe: toNullableString(row.LIB_ANNEXE),
        zoneTexte: toNullableString(row.ZONE_TEXTE),
        rows: [],
      });
    }

    map.get(key)!.rows.push(row);
  }

  return Array.from(map.values());
}

// ─── Build RuleTerm creation attributes ───────────────────────────────────────

function buildTermAttributes(
  row: RdgRow,
  ruleId: string,
): Parameters<typeof RuleTerm.bulkCreate>[0][number] {
  const kind = determineKind(row.COLONNE, row.RUBRIQUE);
  const colonneStr = toNullableString(row.COLONNE);
  const rubrStr = toNullableString(row.RUBRIQUE);

  let rubriqueCode: string | null = null;
  let colonne: string | null = null;
  let literalValue: string | null = null;
  let literalText: string | null = null;

  if (kind === 'cell_ref') {
    rubriqueCode = rubrStr;
    colonne = colonneStr;
  } else if (kind === 'literal') {
    // Use Decimal for zero-tolerance arithmetic precision
    literalValue = new Decimal(rubrStr!).toFixed(8);
  } else {
    // kind === 'literal_text'
    literalText = rubrStr;
  }

  const rang = row.RANG_TERM as 1 | 2 | 3;
  const termOp = (toNullableString(row.OPER_TERM_REGLE) ?? '+') as '+' | '-' | '*' | '/';
  const numSeq = row.NUM_SEQ ?? 1;
  const axOrigine = toNullableString(row.AX_ORIGINE);

  return {
    rule_id: ruleId,
    rang,
    num_seq: numSeq,
    term_op: termOp,
    kind,
    ax_origine: axOrigine,
    rubrique_code: rubriqueCode,
    colonne,
    literal_value: literalValue,
    literal_text: literalText,
  };
}

// ─── Seeder logic ─────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  const startTime = Date.now();

  // 1. Authenticate
  await sequelize.authenticate();
  console.log('[rdg-seeder] Database connection established.');

  // 2. Load and parse
  const rows = loadRows();
  const ruleGroups = groupByRule(rows);
  console.log(`[rdg-seeder] Identified ${ruleGroups.length} unique rules.`);

  let totalRulesInserted = 0;
  let totalTermsInserted = 0;
  let batchStart = 0;

  // 3. Process in batches of BATCH_SIZE rules per transaction
  while (batchStart < ruleGroups.length) {
    const batch = ruleGroups.slice(batchStart, batchStart + BATCH_SIZE);

    await sequelize.transaction(async (t) => {
      for (const group of batch) {
        // Insert rule (idempotent via unique index on tenant_id, annexe_code, num_regle, version)
        const [rule, created] = await Rule.findOrCreate({
          where: {
            tenant_id: DEFAULT_TENANT_ID,
            annexe_code: group.annexeCode,
            num_regle: group.numRegle,
            version: 1,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          defaults: {
            tenant_id: DEFAULT_TENANT_ID,
            annexe_code: group.annexeCode,
            num_regle: group.numRegle,
            oper_regle: group.operRegle,
            type_ctrl: group.typeCtrl,
            domaine: group.domaine,
            lib_annexe: group.libAnnexe,
            zone_texte: group.zoneTexte,
            is_formalized: true,
            version: 1,
            is_active: true,
          } as any,
          transaction: t,
        });

        if (created) {
          totalRulesInserted += 1;
        }

        // Build term payloads for this rule
        const termPayloads = group.rows.map((row) =>
          buildTermAttributes(row, rule.id),
        );

        // Bulk insert terms; skip duplicates on re-run
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insertedTerms = await RuleTerm.bulkCreate(termPayloads as any, {
          ignoreDuplicates: true,
          transaction: t,
        });

        totalTermsInserted += insertedTerms.length;
      }
    });

    batchStart += BATCH_SIZE;
    const processed = Math.min(batchStart, ruleGroups.length);

    if (processed % LOG_EVERY === 0 || processed === ruleGroups.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[rdg-seeder] Progress: ${processed}/${ruleGroups.length} rules processed — ` +
        `${totalRulesInserted} inserted, ${totalTermsInserted} terms — ${elapsed}s elapsed`,
      );
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║         RDG Seeder — Done            ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Rules inserted : ${String(totalRulesInserted).padEnd(18)}║`);
  console.log(`║  Terms inserted : ${String(totalTermsInserted).padEnd(18)}║`);
  console.log(`║  Elapsed        : ${(elapsed + 's').padEnd(18)}║`);
  console.log('╚══════════════════════════════════════╝');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

seed()
  .then(() => {
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error('[rdg-seeder] Fatal error:', err);
    process.exit(1);
  });
