import { useCallback, useEffect, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';

/**
 * Shape of a single row returned by GET
 * /api/tenants/:tenantId/conversations/:conversationId/messages.
 *
 * The endpoint already filters out internal-only roles
 * (regalica_thinking, agent_internal, system_notification) and
 * surfaces only the two user-facing turns: 'user' and
 * 'regalica_response'. The frontend maps them to the ChatMessage
 * shape consumed by the chat thread (see useChat).
 */
export interface PersistedMessage {
  id: string;
  sequence_number: number;
  role: 'user' | 'regalica_response';
  content_markdown: string;
  thinking_trace: unknown;
  produced_by_agent: string | null;
  created_at: string;
  /**
   * B7 (2026-05-08, migration 104) — id of the validation_run that
   * produced this message, or null when the turn carried no run
   * context. Workspace.handleHistorySelect reads the LATEST non-null
   * value across the loaded thread to rebind `lastRunInChat`, so the
   * run-completed canvas (Synthèse + KPIs + FailsTable +
   * InvestigationArtefact) reattaches to the right run when the user
   * picks a past conversation in the history sidebar.
   */
  linked_run_id: string | null;
}

interface UseConversationMessagesResult {
  messages: PersistedMessage[];
  loading: boolean;
  error: string | null;
  /**
   * Imperative loader — explicit calling pattern matches the way
   * Workspace.tsx triggers hydration when the user picks a past row
   * in the history sidebar. Returns the freshly loaded list (or
   * throws an `ApiFetchError`) so the caller can pipe it directly
   * into `useChat.loadConversation` without juggling effect timing.
   */
  load: (conversationId: string) => Promise<PersistedMessage[]>;
}

/**
 * P5 — load past messages of a single conversation so the chat thread
 * can be hydrated when the user clicks a row in the history sidebar.
 *
 * The hook stays passive: it does NOT auto-fetch on mount. The caller
 * (Workspace) triggers `load(conversationId)` on demand. This matches
 * the UX flow:
 *   1. User clicks a past conversation in <ConversationHistorySidebar>
 *   2. Workspace calls `messagesHook.load(selectedId)`
 *   3. The promise resolves with the persisted list
 *   4. Workspace passes that list to `useChat.loadConversation` to
 *      replace the in-memory thread + pin the conversation_id
 *
 * Auto-fetching on mount would force every Workspace render to hit
 * the messages endpoint even before the user opens history — wasteful
 * and at odds with the explicit "click to load" UX.
 */
export function useConversationMessages(): UseConversationMessagesResult {
  const [messages, setMessages] = useState<PersistedMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (conversationId: string): Promise<PersistedMessage[]> => {
    if (!TENANT_ID) {
      const err = new ApiConfigError('MISSING_TENANT_ID', 'VITE_TENANT_ID is not set');
      setError(err.code);
      throw err;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi<PersistedMessage[]>(
        `/api/tenants/${TENANT_ID}/conversations/${conversationId}/messages`,
      );
      setMessages(res.data);
      return res.data;
    } catch (e: unknown) {
      if (e instanceof ApiFetchError || e instanceof ApiConfigError) {
        setError(e.code);
      } else {
        setError('UNKNOWN');
      }
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset local state if the consumer unmounts mid-load.
  useEffect(() => {
    return () => {
      setMessages([]);
      setLoading(false);
      setError(null);
    };
  }, []);

  return { messages, loading, error, load };
}
