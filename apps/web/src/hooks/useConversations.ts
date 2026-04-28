import { useCallback, useEffect, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { Conversation } from '../types/api';

interface CreateConversationInput {
  title?: string;
  language?: 'fr' | 'en' | 'ar';
  linked_validation_run_id?: string;
}

interface UseConversationsResult {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  createConversation: (input: CreateConversationInput) => Promise<Conversation>;
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!TENANT_ID) {
      setError('MISSING_TENANT_ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    void fetchApi<Conversation[]>(`/api/tenants/${TENANT_ID}/conversations`)
      .then((r) => {
        if (!cancelled) {
          setConversations(r.data);
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

  const createConversation = useCallback(
    async (input: CreateConversationInput): Promise<Conversation> => {
      if (!TENANT_ID) {
        throw new ApiConfigError('MISSING_TENANT_ID', 'VITE_TENANT_ID is not set');
      }
      const res = await fetchApi<Conversation>(`/api/tenants/${TENANT_ID}/conversations`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setConversations((prev) => [res.data, ...prev]);
      return res.data;
    },
    [],
  );

  return { conversations, loading, error, createConversation };
}
