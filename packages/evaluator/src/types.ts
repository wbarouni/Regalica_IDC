/**
 * REGFlow — RDG Evaluator types canoniques
 *
 * Ces types sont le contrat entre le moteur en 5 phases et ses consommateurs
 * (backend API, tests golden, scripts de reporting).
 *
 * L'implémentation du moteur viendra en Phase 2 du plan brute.
 */

import type { Decimal } from 'decimal.js';
import type { CellMatrix, ParsedXml } from '@regflow/bct-xml-parser';

/**
 * Statut de verdict pour une règle évaluée.
 *
 * Conforme à la doctrine binaire PASS/FAIL + motifs de SKIPPED.
 */
export type VerdictStatus =
  | 'PASS'
  | 'FAIL'
  | 'SKIPPED_MISSING_ANNEXE'
  | 'SKIPPED_MISSING_RUBRIQUE'
  | 'SKIPPED_MISSING_COLONNE'
  | 'SKIPPED_MISSING_DATA'
  | 'SKIPPED_CONDITIONAL'
  | 'SKIPPED_UNSUPPORTED_OP'
  | 'SKIPPED_LITERAL_TEXT';

/**
 * Sévérité d'un FAIL.
 * - `severe` : écart non absorbable, règle en échec net.
 * - `rounding` : écart inférieur au seuil d'arrondi accepté (1 TND en valeur absolue
 *   selon doctrine BCT, à paramétrer via sentinelle).
 */
export type FailSeverity = 'severe' | 'rounding';

/**
 * Un terme d'une règle RDG, unité élémentaire de résolution.
 *
 * Chaque terme appartient à un rang (1 = RHS, 2+ = LHS) et produit après résolution
 * soit une valeur Decimal soit un motif de skip.
 */
export interface RuleTerm {
  readonly id: string;
  readonly rang: number;
  readonly numSeq: number;
  readonly termOp: '+' | '-' | '*' | '/' | null;
  readonly kind: 'cell_ref' | 'literal' | 'literal_text';
  readonly axOrigine: string | null;
  readonly rubriqueCode: string | null;
  readonly colonne: string | null;
  readonly literalValue: Decimal | null;
  readonly literalText: string | null;
}

/**
 * Une règle RDG complète avec ses termes et ses métadonnées.
 */
export interface RuleWithTerms {
  readonly id: string;
  readonly tenantId: string;
  readonly axTerm: string; // annexe porteuse
  readonly numRegle: number;
  readonly operRegle: '=' | '>=' | '<=' | '>' | '<' | 'SUM' | 'MAX' | 'MIN' | 'VA';
  readonly typeCtrl: 'intra_ax' | 'inter_ax';
  readonly domaine: string | null;
  readonly libAnnexe: string | null;
  readonly zoneTexte: string | null;
  readonly isFormalized: boolean;
  readonly version: number;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly terms: readonly RuleTerm[];
}

/**
 * Verdict émis par le moteur pour une règle évaluée.
 */
export interface Verdict {
  readonly ruleId: string;
  readonly annexeCode: string;
  readonly numRegle: number;
  readonly operRegle: string;
  readonly status: VerdictStatus;
  readonly severity: FailSeverity | null;
  readonly lhs: Decimal | null;
  readonly rhs: Decimal | null;
  readonly gap: Decimal | null;
  readonly skipReason: string | null;
  readonly rubriqueAt: string | null;
  readonly colonneAt: string | null;
}

/**
 * Résultat complet d'un run d'évaluation.
 */
export interface EvaluationResult {
  readonly runId: string;
  readonly tenantId: string;
  readonly arreteDate: string;
  readonly totals: VerdictTotals;
  readonly verdicts: readonly Verdict[];
  readonly durationMs: number;
  readonly enginVersion: string;
  readonly rulesVersionSnapshot: string;
  readonly referentialsVersionSnapshot: string;
}

/**
 * Totaux agrégés d'un run, correspondent aux statuts possibles.
 */
export interface VerdictTotals {
  readonly pass: number;
  readonly failSevere: number;
  readonly failRounding: number;
  readonly skippedMissingAnnexe: number;
  readonly skippedMissingRubrique: number;
  readonly skippedMissingColonne: number;
  readonly skippedMissingData: number;
  readonly skippedConditional: number;
  readonly skippedUnsupportedOp: number;
  readonly skippedLiteralText: number;
  readonly rulesApplicableTotal: number;
}

/**
 * Entrée du moteur : batch XML parsé + règles applicables à la date d'arrêté.
 */
export interface EvaluationInput {
  readonly tenantId: string;
  readonly arreteDate: string;
  readonly parsedXmls: ReadonlyMap<string, ParsedXml>;
  readonly mergedCells: CellMatrix;
  readonly rules: readonly RuleWithTerms[];
}

/**
 * Contrat du moteur.
 *
 * Placeholder: l'implémentation réelle arrivera en Phase 2.
 * Elle doit produire un résultat déterministe bit-pour-bit sur le golden baseline.
 */
export interface Evaluator {
  evaluate(input: EvaluationInput): Promise<EvaluationResult>;
  readonly engineVersion: string;
}

/**
 * Construit des totaux initialisés à zéro.
 */
export function emptyTotals(): VerdictTotals {
  return {
    pass: 0,
    failSevere: 0,
    failRounding: 0,
    skippedMissingAnnexe: 0,
    skippedMissingRubrique: 0,
    skippedMissingColonne: 0,
    skippedMissingData: 0,
    skippedConditional: 0,
    skippedUnsupportedOp: 0,
    skippedLiteralText: 0,
    rulesApplicableTotal: 0,
  };
}

/**
 * Agrège des verdicts en totaux.
 */
export function aggregateTotals(verdicts: readonly Verdict[]): VerdictTotals {
  const totals = { ...emptyTotals() } as {
    -readonly [K in keyof VerdictTotals]: VerdictTotals[K];
  };
  totals.rulesApplicableTotal = verdicts.length;
  for (const v of verdicts) {
    switch (v.status) {
      case 'PASS':
        totals.pass++;
        break;
      case 'FAIL':
        if (v.severity === 'rounding') totals.failRounding++;
        else totals.failSevere++;
        break;
      case 'SKIPPED_MISSING_ANNEXE':
        totals.skippedMissingAnnexe++;
        break;
      case 'SKIPPED_MISSING_RUBRIQUE':
        totals.skippedMissingRubrique++;
        break;
      case 'SKIPPED_MISSING_COLONNE':
        totals.skippedMissingColonne++;
        break;
      case 'SKIPPED_MISSING_DATA':
        totals.skippedMissingData++;
        break;
      case 'SKIPPED_CONDITIONAL':
        totals.skippedConditional++;
        break;
      case 'SKIPPED_UNSUPPORTED_OP':
        totals.skippedUnsupportedOp++;
        break;
      case 'SKIPPED_LITERAL_TEXT':
        totals.skippedLiteralText++;
        break;
    }
  }
  return totals;
}
