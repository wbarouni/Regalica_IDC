import { useCallback, useState } from 'react';

import { CHATBOT_URL, TENANT_ID, USER_ID } from '../lib/config';

export interface ChatMessage {
  id: string;
  role: 'user' | 'regalica';
  content: string;
  thinking_trace?: string | null;
  agents_called?: string[];
  timestamp: string;
}

interface ChatResponseBody {
  conversation_id: string;
  message_id: string;
  thinking_trace: string | null;
  response_markdown: string;
  agents_called: string[];
  tokens_input: number;
  tokens_output: number;
  tokens_thinking: number;
  latency_ms: number;
}

/**
 * Talks to apps/chatbot-py POST /chat/message.
 *
 * Response shape (matches Pydantic ChatResponse):
 *   { conversation_id, message_id, thinking_trace, response_markdown,
 *     agents_called, tokens_*, latency_ms }
 *
 * `response_markdown` (NOT `response`) is the user-facing field.
 * The hook persists conversation_id across turns so chatbot-py keeps
 * the same conversation row alive in PostgreSQL.
 *
 * Cross-origin: chatbot-py must list the frontend origin in
 * CHATBOT_CORS_ORIGIN; otherwise the browser blocks the fetch.
 */
/**
 * Options accepted by `useChat`.
 *
 * `runId` — Tranche 0 E1: when set (the user is on a workspace with
 * an active validation run), the chat POST body carries
 * `context.validation_run_id = runId`. chatbot-py reads it via
 * `ChatRequest.context.validation_run_id` → orchestrate(current_run_id)
 * → `_SpecialistContext.current_run_id`, which is exactly what
 * `_call_t1_runner` checks before driving `_run_t1_validation`.
 *
 * Without this, the launch_validation intent always resolves to
 * `error="no_active_run"` — the chat is decoupled from the run.
 *
 * Backward-compat: omit the options bag (`useChat()`) and the body
 * carries no `context` field, identical to the pre-Tranche 0 shape.
 */
export interface UseChatOptions {
  initialConversationId?: string;
  runId?: string | null;
  /**
   * Point 2 — Local intent interceptor.
   *
   * Invoked SYNCHRONOUSLY before the chat POST when the user types
   * a message. Returns true to short-circuit the network call (the
   * caller has handled the intent locally, e.g. by calling the same
   * imperative path the LANCER button calls). Returns false (or
   * undefined) to fall through to the standard chatbot-py round-trip.
   *
   * Use case: the user types "lance la validation" / "démarre" while
   * a pendingUpload exists in the workspace state — Workspace.tsx
   * intercepts the phrase, calls handleLaunchRun(), injects a
   * synthetic Regalica acknowledgement, and skips the LLM call.
   * Without this hook, the message would route through chatbot-py's
   * launch_validation intent → t1_runner, which short-circuits with
   * "Aucun run actif" because no run row has been created yet.
   *
   * The user message is still appended to the thread (so the
   * acknowledgement reads as a chat turn). The synthetic Regalica
   * response is the caller's responsibility, surfaced via
   * `injectRegalicaMessage`.
   */
  onLocalIntentMatch?: (text: string) => boolean | undefined;
  /**
   * P1 frontend — at every send, if the caller exposes a "currently
   * focused FAIL" through this getter, the hook attaches it as
   * `context.fail` on the chat POST body. chatbot-py orchestrator
   * uses `context.fail` directly as `fail_context`, bypassing the
   * generic `_load_run_fails_context` SQL preload — so the
   * investigator analyses THE clicked row, not the largest-gap one.
   *
   * Returning `null` means "no row is currently selected" → the
   * chat falls back to the default backend preload + the regex-
   * extracted rule number from the message text.
   */
  failContextProvider?: () => Record<string, unknown> | null;
}

interface UseChatResult {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  conversationId: string | null;
  sendMessage: (text: string) => Promise<void>;
  clearError: () => void;
  /**
   * Point 2 — programmatic injection of a Regalica message into the
   * thread (skips the chatbot-py round-trip). Used by the local
   * interceptor to acknowledge a chat-driven launch_validation.
   */
  injectRegalicaMessage: (content: string) => void;
  /**
   * Sprint D — Point 5 — clear messages + conversation_id so the next
   * `sendMessage` opens a fresh chatbot-py conversation. Caller invokes
   * this when the user manually launches a NEW upload (Lancer button)
   * — NOT when Regalica is requesting a follow-up (companion upload),
   * where the conversation must persist for thread continuity.
   */
  resetConversation: () => void;
}

export function useChat(options: UseChatOptions = {}): UseChatResult {
  const { initialConversationId, runId = null, onLocalIntentMatch, failContextProvider } = options;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId ?? null,
  );

  const injectRegalicaMessage = useCallback((content: string): void => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'regalica',
        content,
        thinking_trace: null,
        agents_called: [],
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || loading) return;
      if (!CHATBOT_URL || !TENANT_ID || !USER_ID) {
        setError('MISSING_CONFIG');
        return;
      }
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Point 2 — local intent interceptor. The user's message stays
      // visible in the thread; the LLM round-trip is skipped if the
      // caller acknowledges the intent. Caller is responsible for any
      // synthetic Regalica response via injectRegalicaMessage.
      if (onLocalIntentMatch !== undefined && onLocalIntentMatch(trimmed) === true) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const requestBody: Record<string, unknown> = {
          message: trimmed,
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          conversation_id: conversationId ?? undefined,
        };
        // Build the per-turn `context` block. validation_run_id is set
        // whenever the workspace has an active run; `fail` is set when
        // a FailsTable row was clicked and the parent's
        // failContextProvider() returns it. Both are independent: a
        // chat turn can carry only the run id, only the fail, or both.
        const turnContext: Record<string, unknown> = {};
        if (runId !== null && runId !== '') {
          turnContext.validation_run_id = runId;
        }
        const focusedFail = failContextProvider?.() ?? null;
        if (focusedFail !== null) {
          turnContext.fail = focusedFail;
        }
        if (Object.keys(turnContext).length > 0) {
          requestBody.context = turnContext;
        }
        const res = await fetch(`${CHATBOT_URL}/chat/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
          let detail = 'CHATBOT_ERROR';
          try {
            const body = (await res.json()) as { detail?: unknown };
            if (typeof body.detail === 'string' && body.detail.length > 0) {
              detail = body.detail;
            }
          } catch {
            /* JSON parse failure — keep the default code */
          }
          throw new Error(detail);
        }

        const data = (await res.json()) as ChatResponseBody;
        setConversationId(data.conversation_id);
        setMessages((prev) => [
          ...prev,
          {
            id: data.message_id,
            role: 'regalica',
            content: data.response_markdown,
            thinking_trace: data.thinking_trace,
            agents_called: data.agents_called,
            timestamp: new Date().toISOString(),
          },
        ]);
      } catch (e: unknown) {
        const code = e instanceof Error ? e.message : 'UNKNOWN_ERROR';
        setError(code);
        // Roll back the optimistic user-side append so the thread
        // doesn't show an unanswered question.
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      } finally {
        setLoading(false);
      }
    },
    [conversationId, loading, runId, onLocalIntentMatch, failContextProvider],
  );

  const clearError = useCallback(() => setError(null), []);

  const resetConversation = useCallback((): void => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    conversationId,
    sendMessage,
    clearError,
    injectRegalicaMessage,
    resetConversation,
  };
}
