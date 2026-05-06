import { describe, expect, it } from 'vitest';

import { formatBankingNumber, formatBankingPercent } from './banking';

describe('formatBankingNumber', () => {
  it('renders fr-FR thin-space thousands + comma decimal + KTND suffix by default', () => {
    // The narrow no-break space U+202F is what Intl.NumberFormat('fr-FR')
    // emits for the thousands separator; we assert via /\s/ to tolerate
    // both U+202F and a regular space.
    const out = formatBankingNumber(57985.238);
    expect(out.replace(/\s/g, ' ')).toBe('57 985,238 KTND');
  });

  it('truncates to 3 decimals (engine emits 38-digit Decimal upstream)', () => {
    const out = formatBankingNumber(1234.123456789);
    expect(out.replace(/\s/g, ' ')).toBe('1 234,123 KTND');
  });

  it('omits the unit suffix when withSuffix=false', () => {
    expect(formatBankingNumber(42, { withSuffix: false }).replace(/\s/g, ' ')).toBe('42');
  });

  it('returns em-dash for null / undefined / empty / NaN', () => {
    expect(formatBankingNumber(null)).toBe('—');
    expect(formatBankingNumber(undefined)).toBe('—');
    expect(formatBankingNumber('')).toBe('—');
    expect(formatBankingNumber(Number.NaN)).toBe('—');
  });

  it('accepts a stringified numeric (asyncpg::numeric → string in JSON)', () => {
    expect(formatBankingNumber('21457.971').replace(/\s/g, ' ')).toBe('21 457,971 KTND');
  });
});

describe('formatBankingPercent', () => {
  it('renders ratio-as-percent with 2 decimals + space + percent sign', () => {
    expect(formatBankingPercent(0.23).replace(/\s/g, ' ')).toBe('23,00 %');
    expect(formatBankingPercent(-1).replace(/\s/g, ' ')).toBe('-100,00 %');
  });

  it('returns em-dash when input is null / undefined / NaN', () => {
    expect(formatBankingPercent(null)).toBe('—');
    expect(formatBankingPercent(Number.NaN)).toBe('—');
  });
});
