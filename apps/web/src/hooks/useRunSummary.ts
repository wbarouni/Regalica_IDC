import { useEffect, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { RunSummary } from '../types/api';

interface UseRunSummaryResult {
  summary: RunSummary | null;
  loading: boolean;
  error: string | null;
}

export function useRunSummary(runId: string | null): UseRunSummaryResult {
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (runId === null) {
      setSummary(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (!TENANT_ID) {
      setError('MISSING_TENANT_ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchApi<RunSummary>(`/api/tenants/${TENANT_ID}/runs/${runId}/summary`)
      .then((r) => {
        if (!cancelled) {
          setSummary(r.data);
          setError(null);
        }
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

  return { summary, loading, error };
}
