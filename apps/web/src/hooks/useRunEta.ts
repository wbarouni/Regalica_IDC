import { useEffect, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';

interface UseRunEtaResult {
  /**
   * Estimated p50 latency (seconds) of a complete T1 validation, or
   * null when the value cannot be loaded (cold-start tenant, stale
   * schema, network error). Callers MUST handle the null case
   * gracefully — the launch ack omits the ETA clause when the value
   * is unavailable rather than fabricating one.
   */
  seconds: number | null;
  loading: boolean;
}

/**
 * B3 (2026-05-08) — read the platform-wide T1 ETA from
 * `GET /api/tenants/:tenantId/runs/eta`. The value is seeded in
 * `platform_config.t1_run_eta_p50_seconds` by migration 104 and may
 * be refreshed periodically by an operator UPDATE or a percentile
 * job over `validation_runs` (Phase 2). Never hardcoded in source —
 * the user's contract: "ETA calculée dynamiquement par percentile
 * sur historique, jamais en dur".
 *
 * The hook fetches once on mount. The endpoint is cheap (one
 * SELECT on a small platform_config row, cached process-wide by
 * `getPlatformConfigNumber`) so re-fetching on every Workspace
 * mount is acceptable. No interval polling — the value drifts on
 * timescales of days, not seconds.
 */
export function useRunEta(): UseRunEtaResult {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!TENANT_ID) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchApi<{ seconds: number | null }>(`/api/tenants/${TENANT_ID}/runs/eta`)
      .then((r) => {
        if (cancelled) return;
        const value = r.data.seconds;
        // Defensive: only accept a positive integer. The endpoint
        // already returns null on lookup failure; non-positive
        // values would render as nonsense ("environ 0 secondes").
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          setSeconds(Math.round(value));
        } else {
          setSeconds(null);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Silent fallback to null — the caller renders the ack
        // without ETA. We still log via the centralized fetchApi
        // path; nothing to surface to the user here.
        if (!(e instanceof ApiFetchError) && !(e instanceof ApiConfigError)) {
          // eslint-disable-next-line no-console
          console.warn('useRunEta: unexpected error', e);
        }
        setSeconds(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { seconds, loading };
}
