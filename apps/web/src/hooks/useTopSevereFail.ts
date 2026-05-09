import { useEffect, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { FailDetail } from '../types/api';

interface UseTopSevereFailResult {
  fail: FailDetail | null;
  loading: boolean;
  error: string | null;
}

/**
 * C — fetches the first severe fail of a run for the
 * <InvestigationArtefact> auto-mount above the FailsTable.
 *
 * Distinct from `useFails` (which paginates the full list inside the
 * FailsTable component): this hook is fire-and-forget, returns at
 * most one row, and exposes a tightly-scoped { fail, loading, error }
 * shape so the caller can branch on null without juggling an
 * array length. The route already supports filter=fail (apps/api/
 * src/routes/workspace.ts:320), so no API change is needed.
 */
export function useTopSevereFail(runId: string | null): UseTopSevereFailResult {
  const [fail, setFail] = useState<FailDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (runId === null) {
      setFail(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (!TENANT_ID) {
      setError('MISSING_TENANT_ID');
      setLoading(false);
      return;
    }
    // 2026-05-08 — clear stale top fail IMMEDIATELY when runId
    // changes so the InvestigationArtefact never auto-mounts on the
    // PREVIOUS run's top FAIL during the launch window before the
    // new fetch resolves. Same pattern as useRunSummary + useFails.
    setFail(null);
    setError(null);
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ filter: 'fail', page: '1', limit: '1' });
    void fetchApi<FailDetail[]>(`/api/tenants/${TENANT_ID}/runs/${runId}/fails?${qs.toString()}`)
      .then((r) => {
        if (cancelled) return;
        setFail(r.data.length > 0 ? (r.data[0] as FailDetail) : null);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiFetchError || e instanceof ApiConfigError) {
          setError(e.code);
        } else {
          setError('UNKNOWN');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return { fail, loading, error };
}
