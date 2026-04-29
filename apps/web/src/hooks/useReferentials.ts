import { useEffect, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { Referential } from '../types/api';

interface UseReferentialsResult {
  referentials: Referential[];
  loading: boolean;
  error: string | null;
}

export function useReferentials(): UseReferentialsResult {
  const [referentials, setReferentials] = useState<Referential[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!TENANT_ID) {
      setError('MISSING_TENANT_ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    void fetchApi<Referential[]>(`/api/tenants/${TENANT_ID}/referentials`)
      .then((r) => {
        if (!cancelled) {
          setReferentials(r.data);
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
  }, []);

  return { referentials, loading, error };
}
