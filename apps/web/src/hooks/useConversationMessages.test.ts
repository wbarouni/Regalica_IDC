import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConversationMessages } from './useConversationMessages';

vi.mock('../lib/config', () => ({
  API_URL: 'http://api.test',
  CHATBOT_URL: 'http://chatbot.test',
  TENANT_ID: '00000000-0000-7000-8000-0000000000aa',
  USER_ID: '00000000-0000-7000-8000-0000000000bb',
  DEFAULT_PAGE_SIZE: 50,
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
});

const CONVERSATION_ID = '22222222-2222-7222-8222-222222222222';

describe('useConversationMessages — P5 hydration', () => {
  it('starts in idle state with empty messages and no error', () => {
    const { result } = renderHook(() => useConversationMessages());
    expect(result.current.messages).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('load(conversationId) hits the messages endpoint and surfaces the rows', async () => {
    const rows = [
      {
        id: 'm1',
        sequence_number: 1,
        role: 'user',
        content_markdown: 'Bonjour',
        thinking_trace: null,
        produced_by_agent: null,
        created_at: '2026-05-01T10:00:00Z',
        linked_run_id: null,
      },
      {
        id: 'm2',
        sequence_number: 2,
        role: 'regalica_response',
        content_markdown: 'Bonjour, je vous écoute.',
        thinking_trace: null,
        produced_by_agent: 'regalica/aggregate_zoom_fail',
        created_at: '2026-05-01T10:00:01Z',
        linked_run_id: '00000000-0000-7000-8000-00000000aaaa',
      },
    ];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: rows, meta: { ts: '', version: '1', total: 2 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useConversationMessages());
    let returned: Awaited<ReturnType<typeof result.current.load>> = [];
    await act(async () => {
      returned = await result.current.load(CONVERSATION_ID);
    });
    expect(returned).toEqual(rows);
    await waitFor(() => expect(result.current.messages).toEqual(rows));
    expect(result.current.error).toBeNull();
    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain(`/conversations/${CONVERSATION_ID}/messages`);
  });

  it('exposes the API error code on a non-2xx response and re-throws', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'CONVERSATION_NOT_FOUND', message: '' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useConversationMessages());
    await act(async () => {
      await expect(result.current.load(CONVERSATION_ID)).rejects.toThrow();
    });
    await waitFor(() => expect(result.current.error).toBe('CONVERSATION_NOT_FOUND'));
    expect(result.current.messages).toEqual([]);
  });
});
