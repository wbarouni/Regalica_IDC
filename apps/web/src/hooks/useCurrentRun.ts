import { useCallback, useEffect, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { ValidationRun } from '../types/api';

interface UseCurrentRunResult {
  run: ValidationRun | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Tranche 1 — fix #2: useCurrentRun gains a refetch() entry-point.
 *
 * Before this commit, the hook fired exactly once on mount (no
 * dependencies). When the engine emitted SSE `complete` and
 * useRunSummary refetched, the surrounding `run` snapshot kept the
 * stale `status='running'` + null KPIs from the initial GET. The
 * persona sidebar, the "no active run" banner, and any KPI surface
 * driven from `run` (Workspace.tsx KpiGrid) all rendered against an
 * outdated row until the next page load.
 *
 * The fix mirrors useRunSummary's `refetchTick` pattern: a stable
 * `refetch()` increments a tick counted in the effect dependency
 * array, which re-pulls /current and replaces the snapshot. The
 * caller (Workspace.tsx) wires it next to `refetchSummary()` in the
 * existing SSE `complete` handler so a single emitter (`/finalize`)
 * triggers both pulls atomically from the consumer's perspective.
 */
export function useCurrentRun(): UseCurrentRunResult {
  const [run, setRun] = useState<ValidationRun | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTick, setRefetchTick] = useState<number>(0);

  const refetch = useCallback((): void => {
    setRefetchTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!TENANT_ID) {
      setError('MISSING_TENANT_ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchApi<ValidationRun | null>(`/api/tenants/${TENANT_ID}/runs/current`)
      .then((r) => {
        if (!cancelled) {
          setRun(r.data);
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
  }, [refetchTick]);

  return { run, loading, error, refetch };
}
