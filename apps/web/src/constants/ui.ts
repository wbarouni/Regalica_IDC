/**
 * UI display constants — sourced exclusively from VITE_* env vars.
 *
 * Doctrine (commit C4 / H7)
 *   ZERO hardcoding includes UI display widths. Every constant below
 *   is REQUIRED in the operator's `.env.local` (or `.env` in dev) —
 *   missing or invalid values throw `UiConstantsConfigError` at
 *   module load. There is no implicit fallback. The contract is
 *   symmetric with the chatbot-py Pydantic Settings strict mode and
 *   the Node API zod schema: the app fails fast at boot rather than
 *   silently picking a baked-in number.
 *
 * Required variables (see `.env.example`):
 *   VITE_RUN_ID_DISPLAY_LENGTH      positive integer
 *   VITE_RULE_LABEL_PREVIEW_LENGTH  positive integer
 *   VITE_SSE_RECONNECT_BASE_MS      positive integer (milliseconds)
 */

export class UiConstantsConfigError extends Error {
  public readonly varName: string;
  constructor(varName: string, raw: string | undefined) {
    super(
      `UI constant ${varName} is required: must be a positive integer in import.meta.env. ` +
        `Got: ${raw === undefined ? '<unset>' : `"${raw}"`}.`,
    );
    this.name = 'UiConstantsConfigError';
    this.varName = varName;
  }
}

function readPositiveIntEnv(varName: string): number {
  const raw = import.meta.env[varName] as string | undefined;
  if (raw === undefined || raw.length === 0) {
    throw new UiConstantsConfigError(varName, raw);
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new UiConstantsConfigError(varName, raw);
  }
  return parsed;
}

export const RUN_ID_DISPLAY_LENGTH = readPositiveIntEnv('VITE_RUN_ID_DISPLAY_LENGTH');
export const RULE_LABEL_PREVIEW_LENGTH = readPositiveIntEnv('VITE_RULE_LABEL_PREVIEW_LENGTH');
export const SSE_RECONNECT_BASE_MS = readPositiveIntEnv('VITE_SSE_RECONNECT_BASE_MS');
