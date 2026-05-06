/**
 * Banking number formatter shared across FailsTable, InvestigationArtefact
 * and any future surface that renders RDG verdict numerics.
 *
 * fr-FR locale: thin-space thousands + comma decimal (CLAUDE.md §11
 * "57 985,238"). 3 decimals max so RHS/LHS columns stay aligned with
 * the engine's Decimal output (38-digit precision is preserved on the
 * server side; UI truncates for readability only).
 *
 * Suffix: per BCT reporting convention, balance-sheet rubrique values
 * are denominated in **KTND** (kilotunisien dinar = milliers de TND).
 * The user explicitly requested the suffix in the chat / table display
 * so a Compliance Officer never has to guess the unit. Pass
 * `withSuffix=false` for callers that already render the unit
 * separately (e.g. a sub-label below a chip-style KPI).
 */
const NUMBER_FORMATTER = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const FALLBACK = '—';
const UNIT_SUFFIX = 'KTND';

export interface FormatBankingNumberOptions {
  /**
   * When `false`, the unit suffix is omitted. Defaults to `true`.
   * Caller-side sites that already render the unit elsewhere should
   * pass `false`.
   */
  readonly withSuffix?: boolean;
}

export function formatBankingNumber(
  value: number | string | null | undefined,
  options: FormatBankingNumberOptions = {},
): string {
  if (value === null || value === undefined || value === '') return FALLBACK;
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) return FALLBACK;
  const formatted = NUMBER_FORMATTER.format(numeric);
  if (options.withSuffix === false) return formatted;
  return `${formatted} ${UNIT_SUFFIX}`;
}

/**
 * Returns the same numeric format as `formatBankingNumber` but as a
 * percentage (gap_relative is stored as a decimal ratio: -1.0 → -100,00 %).
 */
const PERCENT_FORMATTER = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBankingPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return FALLBACK;
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) return FALLBACK;
  return `${PERCENT_FORMATTER.format(numeric * 100)} %`;
}
