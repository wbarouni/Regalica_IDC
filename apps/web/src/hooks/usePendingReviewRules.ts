import { useEffect, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { PendingRule } from '../types/api';

interface UsePendingReviewRulesResult {
  rules: PendingRule[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * K3 — wires the dedicated GET /api/tenants/:tenantId/rules/pending-review
 * route (apps/api/src/routes/library.ts:48). Distinct from
 * `useRules({ status: 'pending_review' })` which targets the paginated
 * /rules surface: this hook hits the dedicated 4-yeux review endpoint
 * that ALSO returns `author_user_id` + `created_at`, the two columns the
 * compliance-officer panel needs for governance accountability.
 *
 * Hard-capped at 50 rows server-side (library.ts:62 LIMIT 50). The
 * panel surfaces the count so the operator knows whether to escalate
 * to a back-office filter.
 *
 * Auth: regular tenant JWT via fetchApi — no special role check on
 * the route, RLS handles tenant isolation.
 */
export function usePendingReviewRules(): UsePendingReviewRulesResult {
  const [rules, setRules] = useState<PendingRule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState<number>(0);

  function refetch(): void {
    setTick((n) => n + 1);
  }

  useEffect(() => {
    if (!TENANT_ID) {
      setError('MISSING_TENANT_ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchApi<PendingRule[]>(`/api/tenants/${TENANT_ID}/rules/pending-review`)
      .then((r) => {
        if (cancelled) return;
        setRules(r.data);
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
  }, [tick]);

  return { rules, loading, error, refetch };
}
