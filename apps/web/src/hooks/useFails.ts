import { useEffect, useState } from 'react';

import { DEFAULT_PAGE_SIZE, TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { FailDetail } from '../types/api';

export type FailFilter = 'all' | 'fail' | 'rounding';

interface UseFailsResult {
  fails: FailDetail[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  setPage: (next: number) => void;
}

export function useFails(runId: string | null, filter: FailFilter): UseFailsResult {
  const [fails, setFails] = useState<FailDetail[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (runId === null) {
      setFails([]);
      setTotal(0);
      setLoading(false);
      setError(null);
      return;
    }
    if (!TENANT_ID) {
      setError('MISSING_TENANT_ID');
      setLoading(false);
      return;
    }
    // 2026-05-08 — clear stale fails IMMEDIATELY when runId changes
    // so the workspace picker / FailsTable never renders the
    // PREVIOUS run's rows during the brief window before the new
    // fetch resolves. Same pattern as useRunSummary.
    setFails([]);
    setTotal(0);
    setError(null);
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({
      filter,
      page: String(page),
      limit: String(DEFAULT_PAGE_SIZE),
    });
    void fetchApi<FailDetail[]>(`/api/tenants/${TENANT_ID}/runs/${runId}/fails?${qs.toString()}`)
      .then((r) => {
        if (cancelled) return;
        setFails(r.data);
        setTotal(typeof r.meta['total'] === 'number' ? (r.meta['total'] as number) : 0);
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
  }, [runId, filter, page]);

  return { fails, loading, error, total, page, setPage };
}
