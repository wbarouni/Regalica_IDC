import { useCallback, useEffect, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { Notification } from '../types/api';

interface UseNotificationsResult {
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  markAsRead: (id: string) => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!TENANT_ID) {
      setError('MISSING_TENANT_ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    void fetchApi<Notification[]>(`/api/tenants/${TENANT_ID}/notifications`)
      .then((r) => {
        if (!cancelled) {
          setNotifications(r.data);
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

  const markAsRead = useCallback(async (id: string): Promise<void> => {
    if (!TENANT_ID) {
      throw new ApiConfigError('MISSING_TENANT_ID', 'VITE_TENANT_ID is not set');
    }
    await fetchApi<{ id: string; is_read: boolean; read_at: string }>(
      `/api/tenants/${TENANT_ID}/notifications/${id}/read`,
      { method: 'PATCH' },
    );
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }, []);

  return { notifications, loading, error, markAsRead };
}
