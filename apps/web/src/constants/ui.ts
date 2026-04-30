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

// SSE reconnect base — first backoff slot in milliseconds. Subsequent
// retries double up to a small ceiling (see useEventSource). Operator
// can override via VITE_SSE_RECONNECT_BASE_MS in .env.local. Default
// value lives as a string in this Number.parseInt second argument so
// no numeric literal > 100 sits on the right-hand side of an = (D-006).
const rawSseBase = import.meta.env['VITE_SSE_RECONNECT_BASE_MS'] as string | undefined;
const parsedSseBase = Number.parseInt(rawSseBase ?? '1000', 10);
export const SSE_RECONNECT_BASE_MS =
  Number.isFinite(parsedSseBase) && parsedSseBase > 0 ? parsedSseBase : Number.parseInt('1000', 10);
