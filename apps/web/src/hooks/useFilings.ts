import { useEffect, useState } from 'react';

import { buildUrl } from '../lib/buildUrl';
import { DEFAULT_PAGE_SIZE, TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { Filing } from '../types/api';

export interface FilingFilter {
  annexe?: string;
  status?: string;
  page?: number;
}

interface UseFilingsResult {
  filings: Filing[];
  loading: boolean;
  error: string | null;
  total: number;
}

export function useFilings(filter: FilingFilter = {}): UseFilingsResult {
  const { annexe, status } = filter;
  const page = filter.page ?? 1;
  const [filings, setFilings] = useState<Filing[]>([]);
  const [total, setTotal] = useState<number>(0);
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
    const url = buildUrl(`/api/tenants/${TENANT_ID}/filings`, {
      page,
      limit: DEFAULT_PAGE_SIZE,
      annexe,
      status,
    });
    void fetchApi<Filing[]>(url)
      .then((r) => {
        if (cancelled) return;
        setFilings(r.data);
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
  }, [page, annexe, status]);

  return { filings, loading, error, total };
}
