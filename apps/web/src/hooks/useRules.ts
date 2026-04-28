import { useEffect, useState } from 'react';

import { DEFAULT_PAGE_SIZE, TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { Rule } from '../types/api';

interface UseRulesParams {
  axTerm?: string;
  status?: string;
}

interface UseRulesResult {
  rules: Rule[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  setPage: (next: number) => void;
}

export function useRules(params: UseRulesParams = {}): UseRulesResult {
  const { axTerm, status } = params;
  const [rules, setRules] = useState<Rule[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!TENANT_ID) {
      setError('MISSING_TENANT_ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(DEFAULT_PAGE_SIZE),
    });
    if (axTerm !== undefined && axTerm.length > 0) qs.set('ax_term', axTerm);
    if (status !== undefined && status.length > 0) qs.set('status', status);
    void fetchApi<Rule[]>(`/api/tenants/${TENANT_ID}/rules?${qs.toString()}`)
      .then((r) => {
        if (cancelled) return;
        setRules(r.data);
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
  }, [axTerm, status, page]);

  return { rules, loading, error, total, page, setPage };
}
