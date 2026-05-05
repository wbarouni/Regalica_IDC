import { useEffect, useState } from 'react';

import { DEFAULT_PAGE_SIZE, TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { Rubrique } from '../types/api';

interface UseRubriquesParams {
  annexeCode?: string;
  q?: string;
}

interface UseRubriquesResult {
  rubriques: Rubrique[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  setPage: (next: number) => void;
}

export function useRubriques(params: UseRubriquesParams = {}): UseRubriquesResult {
  const { annexeCode, q } = params;
  const [rubriques, setRubriques] = useState<Rubrique[]>([]);
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
    if (annexeCode !== undefined && annexeCode.length > 0) qs.set('annexe_code', annexeCode);
    if (q !== undefined && q.length > 0) qs.set('q', q);
    void fetchApi<Rubrique[]>(`/api/tenants/${TENANT_ID}/rubriques?${qs.toString()}`)
      .then((r) => {
        if (cancelled) return;
        setRubriques(r.data);
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
  }, [annexeCode, q, page]);

  return { rubriques, loading, error, total, page, setPage };
}
