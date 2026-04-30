import { useEffect, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { ValidationRun } from '../types/api';

interface UseCurrentRunResult {
  run: ValidationRun | null;
  loading: boolean;
  error: string | null;
}

export function useCurrentRun(): UseCurrentRunResult {
  const [run, setRun] = useState<ValidationRun | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!TENANT_ID) {
      setError('MISSING_TENANT_ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
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
  }, []);

  return { run, loading, error };
}
