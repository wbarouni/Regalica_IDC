/**
 * Conformity rate computation — single source of truth.
 *
 * The conformity rate is the BCT-doctrine ratio of validated rules over
 * the universe of evaluated rules. It MUST be computed identically
 * across the codebase: scattering the formula in two call sites is the
 * exact failure mode the zero-hardcoding doctrine prevents.
 *
 * Formula (CEO arbitrated, plan Tranche 0 décision #2):
 *
 *     conformity_rate = total_pass / (total_pass + total_fail_severe + total_fail_rounding)
 *
 * Edge cases:
 *   - denominator == 0 → null (no evaluated rule, ratio undefined)
 *   - any input < 0 → null (defensive: negative counts are invalid;
 *     surface as null rather than throw because /finalize must remain
 *     idempotent and not crash on a malformed payload — the zod
 *     schema in domain/finalize.ts is the upstream gatekeeper)
 *   - result rounded to 4 decimals (matches NUMERIC(5, 4) column type
 *     on validation_runs.conformity_rate, migration 025 line 35)
 *
 * Pure module: no I/O, no DB, no logging. Safe to import from anywhere.
 */

// Conformity rate is stored on validation_runs.conformity_rate as
// NUMERIC(5, 4) (migration 025 line 35) — i.e. exactly 4 decimal places.
// We use .toFixed(DECIMAL_PLACES) + parseFloat to round, which keeps
// the implementation literal-free at the call site (Guard D-006: no
// magic number > 100 in applicative code) while pinning the precision
// to a single named constant whose value is the schema's scale.
const DECIMAL_PLACES = 4;

export function computeConformityRate(
  totalPass: number,
  totalFailSevere: number,
  totalFailRounding: number,
): number | null {
  if (
    !Number.isFinite(totalPass) ||
    !Number.isFinite(totalFailSevere) ||
    !Number.isFinite(totalFailRounding)
  ) {
    return null;
  }
  if (totalPass < 0 || totalFailSevere < 0 || totalFailRounding < 0) {
    return null;
  }
  const denominator = totalPass + totalFailSevere + totalFailRounding;
  if (denominator === 0) {
    return null;
  }
  return Number.parseFloat((totalPass / denominator).toFixed(DECIMAL_PLACES));
}
