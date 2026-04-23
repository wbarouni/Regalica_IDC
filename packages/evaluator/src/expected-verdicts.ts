/**
 * REGFlow — Schéma TypeScript du fichier expected_verdicts.json
 *
 * Ce contrat est aligné avec le Document 7 v2 section 7.
 * Il est utilisé par le test golden pour charger et valider la vérité terrain.
 */

export interface ExpectedVerdicts {
  readonly $schema?: string;
  readonly batch_metadata: BatchMetadata;
  readonly bct_submission: BctSubmission;
  readonly validation_author: ValidationAuthor;
  readonly expected_totals: ExpectedTotals;
  readonly expected_fails: readonly ExpectedFail[];
  readonly expected_skips_by_annexe: Readonly<Record<string, string>>;
  readonly companion_annexes_missing_in_batch: readonly CompanionMissing[];
  readonly annexes_in_scope: readonly string[];
  readonly annexes_out_of_scope: readonly string[];
}

export interface BatchMetadata {
  readonly batch_id: string;
  readonly tenant_slug: string;
  readonly bank_code_bct: string;
  readonly arrete_date: string; // YYYY-MM-DD
  readonly arrete_type:
    | "monthly"
    | "quarterly"
    | "semi_annual"
    | "annual"
    | "ad_hoc";
  readonly files_count_filled: number;
  readonly files_count_structurally_valid_empty: number;
  readonly total_annexes_covered: number;
}

export interface BctSubmission {
  readonly has_been_submitted: boolean;
  readonly submission_date: string | null;
  readonly bct_response_status:
    | "accepted"
    | "rejected"
    | "pending"
    | "not_filed";
  readonly bct_response_file_available: boolean;
  readonly bct_response_file_path: string | null;
  readonly notes: string | null;
}

export interface ValidationAuthor {
  readonly name: string;
  readonly role: string;
  readonly validation_date: string;
  readonly validation_method: string;
  readonly confidence_level: "high" | "medium" | "low";
}

export interface ExpectedTotals {
  rules_applicable_total: number | null;
  pass: number | null;
  fail_severe: number | null;
  fail_rounding: number | null;
  skipped_missing_annexe: number | null;
  skipped_missing_rubrique: number | null;
  skipped_missing_colonne: number | null;
  skipped_missing_data: number | null;
  skipped_conditional: number | null;
  skipped_unsupported_op: number | null;
  skipped_literal_text: number | null;
  capture_mode: boolean;
}

export interface ExpectedFail {
  readonly annexe: string;
  readonly num_regle: number;
  readonly severity: "severe" | "rounding";
  readonly expected_gap_absolute: string;
  readonly expected_gap_relative: string | null;
  readonly rubrique: string;
  readonly colonne: string | null;
  readonly business_reason: string;
  readonly confirmed_by_bct_return: boolean;
  readonly cluster_hint: string | null;
}

export interface CompanionMissing {
  readonly annexe_code: string;
  readonly required_by: readonly string[];
  readonly dependency_source: string;
  readonly consequence: string;
  readonly justification_for_absence: string | null;
}

/**
 * Valide la structure de base d'un expected_verdicts.json chargé.
 * Lève une erreur explicite si un champ obligatoire manque.
 */
export function assertExpectedVerdictsShape(
  data: unknown,
): asserts data is ExpectedVerdicts {
  if (!data || typeof data !== "object") {
    throw new Error("expected_verdicts.json must be a JSON object");
  }
  const obj = data as Record<string, unknown>;
  const requiredKeys: Array<keyof ExpectedVerdicts> = [
    "batch_metadata",
    "bct_submission",
    "validation_author",
    "expected_totals",
    "expected_fails",
    "expected_skips_by_annexe",
    "companion_annexes_missing_in_batch",
    "annexes_in_scope",
    "annexes_out_of_scope",
  ];
  for (const k of requiredKeys) {
    if (!(k in obj)) {
      throw new Error(`expected_verdicts.json missing required key: ${k}`);
    }
  }
}
