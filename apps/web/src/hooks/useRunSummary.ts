import { useCallback, useEffect, useRef, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { RunSummary } from '../types/api';

interface UseRunSummaryResult {
  summary: RunSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useRunSummary(runId: string | null): UseRunSummaryResult {
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped to force a re-fetch from the SSE 'complete' handler in
  // consumers — keeps the data flow declarative (effect re-runs on
  // dep change) instead of imperative (manual setState chain).
  const [refetchTick, setRefetchTick] = useState<number>(0);
  const cancelledRef = useRef<boolean>(false);

  const refetch = useCallback((): void => {
    setRefetchTick((n) => n + 1);
  }, []);

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
    // 2026-05-08 — clear the previous run's summary IMMEDIATELY when
    // `runId` changes. Without this, the workspace render gate
    // `summary?.run.status === 'completed'` still matches the
    // PREVIOUS run's data (a previously completed run) during the
    // brief window between Lancer click and the new fetch resolving.
    // The user sees "an old synthesis appearing briefly during the
    // launch, then disappearing" — the "déchet en cours de route"
    // they reported. Resetting state on runId change makes the gate
    // observe summary=null until the fresh data lands.
    //
    // Errors are also reset for the same reason: a stale error from
    // the prior run would otherwise leak into the new run's loading
    // state.
    setSummary(null);
    setError(null);
    cancelledRef.current = false;
    setLoading(true);
    void fetchApi<RunSummary>(`/api/tenants/${TENANT_ID}/runs/${runId}/summary`)
      .then((r) => {
        if (cancelledRef.current) return;
        setSummary(r.data);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelledRef.current) return;
        if (e instanceof ApiFetchError || e instanceof ApiConfigError) {
          setError(e.code);
        } else {
          setError('UNKNOWN');
        }
      })
      .finally(() => {
        if (!cancelledRef.current) setLoading(false);
      });
    return () => {
      cancelledRef.current = true;
    };
  }, [runId, refetchTick]);

  return { summary, loading, error, refetch };
}
