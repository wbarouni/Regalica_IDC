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

interface UseChatResult {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  conversationId: string | null;
  sendMessage: (text: string) => Promise<void>;
  clearError: () => void;
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
export function useChat(initialConversationId?: string): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId ?? null,
  );

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
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${CHATBOT_URL}/chat/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            tenant_id: TENANT_ID,
            user_id: USER_ID,
            conversation_id: conversationId ?? undefined,
          }),
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
    [conversationId, loading],
  );

  const clearError = useCallback(() => setError(null), []);

  return { messages, loading, error, conversationId, sendMessage, clearError };
}
