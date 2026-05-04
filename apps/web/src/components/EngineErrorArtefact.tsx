import { useTranslation } from 'react-i18next';

import { Artefact } from './Artefact';

/**
 * EngineErrorArtefact — surface for the SSE `error` event emitted by
 * the /finalize route (Tranche 0 single-emitter pattern).
 *
 * Tranche 1 fix: before this commit, the runEventBus emitted `error`
 * frames with shape `{code, message}` (engine.ts:1072) but no frontend
 * listener consumed them — engine errors were invisible to the user.
 *
 * Localisation: the i18n key `error.engine.<code>` resolves the
 * doctrinally-aligned label (FR/EN/AR copy mirrors
 * apps/api/seeds/run_error_codes.json verbatim, no runtime fetch).
 * Unknown codes (a future code added in the seed without a
 * corresponding i18n entry) fall back to `error.engine.unknown` and
 * surface the raw `message` payload as a secondary line so the
 * operator still has the engine's machine-readable hint.
 *
 * Visual: reuses the existing Edition One `.artefact` primitive with
 * vermilion variant tokens (border-vermilion-300 / bg-vermilion-50)
 * already in primitives.css. No new CSS class introduced.
 */

export interface EngineErrorArtefactProps {
  code: string;
  message: string;
}

const KNOWN_ENGINE_ERROR_CODES: ReadonlySet<string> = new Set([
  't0_xsd_invalid',
  't0_embedded_fail',
  't0_parse_error',
  't1_engine_exception',
  't1_no_verdicts',
  't1_timeout',
]);

export function EngineErrorArtefact({ code, message }: EngineErrorArtefactProps): JSX.Element {
  const { t } = useTranslation();
  const isKnown = KNOWN_ENGINE_ERROR_CODES.has(code);
  const i18nKey = isKnown ? `error.engine.${code}` : 'error.engine.unknown';
  const localizedLabel = t(i18nKey);

  return (
    <Artefact type="notification" state="standard">
      <div
        className="rounded border border-vermilion-300 bg-vermilion-50 px-3 py-2 space-y-1"
        role="alert"
        data-testid="engine-error-artefact"
      >
        <div className="font-mono text-[10px] uppercase tracking-wider text-vermilion-700">
          {t('error.engineErrorTitle')} · {code}
        </div>
        <div className="text-sm text-vermilion-900">{localizedLabel}</div>
        {!isKnown && message && message !== code && (
          <div className="text-xs font-mono text-vermilion-700 opacity-80">{message}</div>
        )}
      </div>
    </Artefact>
  );
}
