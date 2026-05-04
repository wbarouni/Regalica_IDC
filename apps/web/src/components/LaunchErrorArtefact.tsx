import { useTranslation } from 'react-i18next';

import { Artefact } from './Artefact';

/**
 * LaunchErrorArtefact — surface for `useStartRun.error`, the failure
 * mode of POST /api/tenants/:tenantId/runs.
 *
 * Tranche 1.1 fix: before this commit, `handleLaunchRun.catch` was a
 * silent void and the only error rendering site (UploadStagedRow's
 * "error row") was gated on `pendingUpload === null`, so any backend
 * launch failure WHILE a file was staged hid completely. The user
 * clicked "Lancer la validation" and saw absolutely nothing happen.
 *
 * This component mirrors EngineErrorArtefact (Tranche 1 fix #3,
 * commit 6b2c0e1):
 *   - rendered in the chat thread, not in the staged-file row, so
 *     it stays visible regardless of pendingUpload state
 *   - wrapped in the doctrine-conformant `<Artefact type="notification">`
 *     primitive (vermilion variant tokens, role=alert)
 *   - localised via i18n key `error.launch.<code>` with fallback to
 *     `error.launch.unknown` for unknown codes (forward-compat)
 *
 * The `code` set is documented in `useStartRun.ts` (CODE TABLE
 * docblock). Adding a new backend error code requires an entry in
 * `error.launch.<code>` for FR/EN/AR (keys-coverage test enforces).
 */

export interface LaunchErrorArtefactProps {
  code: string;
  message: string;
}

const KNOWN_LAUNCH_ERROR_CODES: ReadonlySet<string> = new Set([
  // Config (frontend-side)
  'MISSING_TENANT_ID',
  'MISSING_API_URL',
  'MISSING_USER_ID',
  // Backend POST /runs
  'INVALID_BODY',
  'PRIMARY_NOT_IN_LIST',
  'UPLOAD_NOT_OWNED',
  'TABLE_NOT_IMPLEMENTED',
  'COLUMN_NOT_FOUND',
  'INTERNAL',
  // Generic transport
  'HTTP_ERROR',
]);

export function LaunchErrorArtefact({ code, message }: LaunchErrorArtefactProps): JSX.Element {
  const { t } = useTranslation();
  const isKnown = KNOWN_LAUNCH_ERROR_CODES.has(code);
  const i18nKey = isKnown ? `error.launch.${code}` : 'error.launch.unknown';
  const localizedLabel = t(i18nKey);

  return (
    <Artefact type="notification" state="standard">
      <div
        className="rounded border border-vermilion-300 bg-vermilion-50 px-3 py-2 space-y-1"
        role="alert"
        data-testid="launch-error-artefact"
      >
        <div className="font-mono text-[10px] uppercase tracking-wider text-vermilion-700">
          {t('error.launchErrorTitle')} · {code}
        </div>
        <div className="text-sm text-vermilion-900">{localizedLabel}</div>
        {!isKnown && message && message !== code && (
          <div className="text-xs font-mono text-vermilion-700 opacity-80">{message}</div>
        )}
      </div>
    </Artefact>
  );
}
