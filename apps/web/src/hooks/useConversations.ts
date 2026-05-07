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
  /**
   * Fix-5 — re-pulls the conversations list. Workspace calls this when
   * a new chat turn lands so the sidebar's "most recent" ordering and
   * the messages_count column stay coherent without a page reload.
   */
  refetch: () => void;
  /**
   * Feature 3 — soft-delete a past conversation (sets deleted_at on
   * the row). Optimistically removes the entry from the local list so
   * the sidebar reacts immediately; on backend failure the list is
   * re-fetched to revert the optimistic removal. Caller (Workspace)
   * additionally clears the active thread when the deleted id is the
   * one currently in view.
   */
  deleteConversation: (conversationId: string) => Promise<void>;
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState<number>(0);
  const refetch = useCallback((): void => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!TENANT_ID) {
      setError('MISSING_TENANT_ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
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
  }, [tick]);

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

  const deleteConversation = useCallback(
    async (conversationId: string): Promise<void> => {
      if (!TENANT_ID) {
        throw new ApiConfigError('MISSING_TENANT_ID', 'VITE_TENANT_ID is not set');
      }
      // Optimistic removal — the row disappears from the sidebar before
      // the network call completes so the UX feels instant. If the DELETE
      // fails (network, RLS denial, race against a concurrent reader),
      // we re-fetch the canonical list to revert the optimistic state.
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      try {
        await fetchApi<{ id: string; deleted: boolean }>(
          `/api/tenants/${TENANT_ID}/conversations/${conversationId}`,
          { method: 'DELETE' },
        );
      } catch (e: unknown) {
        // Roll back the optimistic removal by triggering a refetch.
        refetch();
        throw e;
      }
    },
    [refetch],
  );

  return { conversations, loading, error, createConversation, refetch, deleteConversation };
}
