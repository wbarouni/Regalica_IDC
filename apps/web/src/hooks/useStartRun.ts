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

export interface UseStartRunResult {
  starting: boolean;
  error: string | null;
  start: (payload: StartRunPayload) => Promise<CreateRunResponse>;
  reset: () => void;
}

export function useStartRun(): UseStartRunResult {
  const [starting, setStarting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback((): void => {
    setStarting(false);
    setError(null);
  }, []);

  const start = useCallback(async (payload: StartRunPayload): Promise<CreateRunResponse> => {
    if (TENANT_ID === undefined || TENANT_ID.length === 0) {
      const code = 'MISSING_TENANT_ID';
      setError(code);
      throw new ApiConfigError(code, 'VITE_TENANT_ID is not set');
    }
    setStarting(true);
    setError(null);
    try {
      const r = await fetchApi<CreateRunResponse>(`/api/tenants/${TENANT_ID}/runs`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return r.data;
    } catch (e: unknown) {
      if (e instanceof ApiFetchError || e instanceof ApiConfigError) {
        setError(e.code);
      } else {
        setError('UNKNOWN');
      }
      throw e;
    } finally {
      setStarting(false);
    }
  }, []);

  return { starting, error, start, reset };
}
