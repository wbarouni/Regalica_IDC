import { computeConformityRate } from '../src/domain/conformity';

/**
 * Pure-helper tests for domain/conformity.ts. No DB, no I/O.
 * The formula MUST stay locked to the CEO arbitration in the Tranche 0
 * plan: pass / (pass + fail_severe + fail_rounding), 4-decimal rounding,
 * null on undefined denominator. Every assertion below pins one
 * doctrinal point.
 */

describe('domain/conformity — computeConformityRate', () => {
  it('returns 1.0 when there are no fails (all rules pass)', () => {
    expect(computeConformityRate(100, 0, 0)).toBe(1);
  });

  it('returns 0.0 when there are no passes (all rules fail)', () => {
    expect(computeConformityRate(0, 5, 5)).toBe(0);
  });

  it('returns null when the denominator is zero (no evaluated rule)', () => {
    expect(computeConformityRate(0, 0, 0)).toBeNull();
  });

  it('rounds to 4 decimals (matches NUMERIC(5,4) DB column)', () => {
    // 7 / 9 = 0.77777... → 0.7778
    expect(computeConformityRate(7, 1, 1)).toBe(0.7778);
  });

  it('treats fail_severe and fail_rounding symmetrically in the denominator', () => {
    expect(computeConformityRate(80, 10, 10)).toBe(0.8);
    expect(computeConformityRate(80, 20, 0)).toBe(0.8);
    expect(computeConformityRate(80, 0, 20)).toBe(0.8);
  });

  it('returns null on negative inputs (defensive — zod is upstream gatekeeper)', () => {
    expect(computeConformityRate(-1, 0, 0)).toBeNull();
    expect(computeConformityRate(0, -1, 0)).toBeNull();
    expect(computeConformityRate(0, 0, -1)).toBeNull();
  });

  it('returns null on non-finite inputs (NaN, Infinity)', () => {
    expect(computeConformityRate(Number.NaN, 0, 0)).toBeNull();
    expect(computeConformityRate(0, Number.POSITIVE_INFINITY, 0)).toBeNull();
    expect(computeConformityRate(0, 0, Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it('handles very large counts without precision loss within 4 decimals', () => {
    // Realistic upper bound: 4611 rules × 1000 batches = 4.6M evaluations.
    // 1_000_000 / (1_000_000 + 1) = 0.999999... → 1.0 after 4-decimal rounding.
    expect(computeConformityRate(1_000_000, 1, 0)).toBe(1);
    // 999_999 / 1_000_000 = 0.999999 → 1.0 after 4-decimal rounding.
    expect(computeConformityRate(999_999, 1, 0)).toBe(1);
    // 999_950 / 1_000_000 = 0.99995 → 1.0 (banker's not used by Math.round; 0.99995 rounds up here since Math.round(9999.5) === 10000).
    expect(computeConformityRate(999_950, 50, 0)).toBe(1);
  });

  it('returns a value in the closed interval [0, 1] for any valid input', () => {
    const samples: [number, number, number][] = [
      [50, 25, 25],
      [1, 0, 0],
      [0, 1, 1],
      [1234, 567, 89],
      [9999, 1, 0],
    ];
    for (const [p, fs, fr] of samples) {
      const rate = computeConformityRate(p, fs, fr);
      expect(rate).not.toBeNull();
      expect(rate as number).toBeGreaterThanOrEqual(0);
      expect(rate as number).toBeLessThanOrEqual(1);
    }
  });

  it('is referentially transparent (same inputs → same output)', () => {
    const a = computeConformityRate(123, 45, 6);
    const b = computeConformityRate(123, 45, 6);
    const c = computeConformityRate(123, 45, 6);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
