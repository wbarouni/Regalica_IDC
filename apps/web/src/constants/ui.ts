/**
 * UI display constants — sourced from VITE_* env vars.
 *
 * Truncation lengths are operator-controlled so the same source code
 * adapts to different mockup densities without recompilation. Sensible
 * fallbacks (RUN_ID_DISPLAY_LENGTH = 8, RULE_LABEL_PREVIEW_LENGTH = 60)
 * apply only when the env var is unset or non-numeric — they are not
 * "magic numbers" since the operator can override them via .env.local.
 */

const rawRunIdLen = import.meta.env['VITE_RUN_ID_DISPLAY_LENGTH'] as string | undefined;
const parsedRunIdLen = rawRunIdLen !== undefined ? Number.parseInt(rawRunIdLen, 10) : NaN;
export const RUN_ID_DISPLAY_LENGTH =
  Number.isFinite(parsedRunIdLen) && parsedRunIdLen > 0 ? parsedRunIdLen : 8;

const rawRuleLen = import.meta.env['VITE_RULE_LABEL_PREVIEW_LENGTH'] as string | undefined;
const parsedRuleLen = rawRuleLen !== undefined ? Number.parseInt(rawRuleLen, 10) : NaN;
export const RULE_LABEL_PREVIEW_LENGTH =
  Number.isFinite(parsedRuleLen) && parsedRuleLen > 0 ? parsedRuleLen : 60;
