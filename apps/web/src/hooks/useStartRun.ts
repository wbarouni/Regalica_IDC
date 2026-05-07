import { useCallback, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';

/**
 * Hook for POST /api/tenants/:tenantId/runs.
 *
 * Returns the new validation_run id and exposes loading/error state.
 * The optional conversation_id is forwarded to chatbot-py /upload by
 * the API so the T0 briefing can be persisted into the right chat
 * thread (commit A3).
 *
 * Tranche 1.1 (close silent-swallow): `error` was a bare `string |
 * null` exposing only the dotted code. Callers (Workspace +
 * UploadStagedRow) had no human-readable message to render. The
 * `error` field is now `{ code, message } | null`. The code is the
 * canonical machine-readable identifier (see CODE TABLE below); the
 * message is whatever the failing layer surfaces verbatim — useful
 * for operator support tickets and never surfaced as primary UI copy.
 *
 * CODE TABLE (audited from apps/web/src/lib/fetchApi.ts +
 * apps/api/src/routes/runs.ts + apps/api/src/db/errors.ts):
 *
 *   Config (this hook + fetchApi):
 *     MISSING_TENANT_ID, MISSING_API_URL, MISSING_USER_ID
 *
 *   Backend POST /api/tenants/:tenantId/runs:
 *     INVALID_BODY            (400, zod parse failure)
 *     PRIMARY_NOT_IN_LIST     (400, primary_upload_id ∉ upload_ids)
 *     UPLOAD_NOT_OWNED        (403, ≥1 upload not owned by tenant)
 *     TABLE_NOT_IMPLEMENTED   (501, schema gap — missing migration)
 *     COLUMN_NOT_FOUND        (501, schema gap — missing column)
 *     INTERNAL                (500, catch-all)
 *
 *   Generic transport (fetchApi):
 *     HTTP_ERROR              (non-2xx with no parseable body)
 *
 *   Catch-all (this hook):
 *     UNKNOWN                 (non-Api error reached the catch)
 *
 * Any new code added in apps/api/src/routes/runs.ts must be added
 * here AND in apps/web/src/locales/{fr,en,ar}/common.json under
 * `error.launch.<code>`. The keys-coverage test enforces the i18n
 * contract; this docblock is the human-readable mirror.
 */

export interface StartRunPayload {
  upload_ids: string[];
  primary_upload_id: string;
  arrete_date: string;
  conversation_id?: string;
}

interface CreateRunResponse {
  run_id: string;
  status: string;
}

export interface StartRunError {
  code: string;
  message: string;
}

export interface UseStartRunResult {
  starting: boolean;
  error: StartRunError | null;
  start: (payload: StartRunPayload) => Promise<CreateRunResponse>;
  reset: () => void;
}

export function useStartRun(): UseStartRunResult {
  const [starting, setStarting] = useState<boolean>(false);
  const [error, setError] = useState<StartRunError | null>(null);

  const reset = useCallback((): void => {
    setStarting(false);
    setError(null);
  }, []);

  const start = useCallback(async (payload: StartRunPayload): Promise<CreateRunResponse> => {
    if (TENANT_ID === undefined || TENANT_ID.length === 0) {
      const err: StartRunError = {
        code: 'MISSING_TENANT_ID',
        message: 'VITE_TENANT_ID is not set',
      };
      setError(err);
      throw new ApiConfigError(err.code, err.message);
    }
    setStarting(true);
    setError(null);
    try {
      // F (2026-05-08, migration 104) — generate a fresh
      // Idempotency-Key for every launch. The backend uses it to
      // dedupe retries: a network blip that triggers the user to
      // click Lancer twice in quick succession will collide on
      // (tenant_id, idempotency_key) PK and the second POST returns
      // the same run_id. Combined with launchInFlightRef (B1) this
      // closes the duplicate-launch window completely.
      const idempotencyKey = crypto.randomUUID();
      const r = await fetchApi<CreateRunResponse>(`/api/tenants/${TENANT_ID}/runs`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      return r.data;
    } catch (e: unknown) {
      if (e instanceof ApiFetchError || e instanceof ApiConfigError) {
        setError({ code: e.code, message: e.message });
      } else {
        setError({
          code: 'UNKNOWN',
          message: e instanceof Error ? e.message : String(e),
        });
      }
      throw e;
    } finally {
      setStarting(false);
    }
  }, []);

  return { starting, error, start, reset };
}
