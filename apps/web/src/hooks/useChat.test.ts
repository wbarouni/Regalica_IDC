import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useChat } from './useChat';

vi.mock('../lib/config', () => ({
  API_URL: 'http://api.test',
  CHATBOT_URL: 'http://chatbot.test',
  TENANT_ID: '00000000-0000-7000-8000-0000000000aa',
  USER_ID: '00000000-0000-7000-8000-0000000000bb',
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
});

const RUN_ID = '11111111-1111-7111-8111-111111111111';

function chatResponseStub(): Response {
  return new Response(
    JSON.stringify({
      conversation_id: 'cv',
      message_id: 'msg',
      thinking_trace: null,
      response_markdown: 'reply',
      agents_called: [],
      tokens_input: 0,
      tokens_output: 0,
      tokens_thinking: 0,
      latency_ms: 0,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('useChat — Tranche 0 E1: runId propagation', () => {
  it('omits context field when runId is null (backward-compat default)', async () => {
    fetchMock.mockResolvedValueOnce(chatResponseStub());
    const { result } = renderHook(() => useChat({ runId: null }));
    await act(async () => {
      await result.current.sendMessage('Bonjour');
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty('context');
    expect(body.message).toBe('Bonjour');
  });

  it('omits context field when no options object is supplied (legacy callers)', async () => {
    fetchMock.mockResolvedValueOnce(chatResponseStub());
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.sendMessage('Hello');
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty('context');
  });

  it('includes context.validation_run_id when runId is supplied', async () => {
    fetchMock.mockResolvedValueOnce(chatResponseStub());
    const { result } = renderHook(() => useChat({ runId: RUN_ID }));
    await act(async () => {
      await result.current.sendMessage('lance la validation');
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.context).toEqual({ validation_run_id: RUN_ID });
  });

  it('omits context field when runId is empty string', async () => {
    fetchMock.mockResolvedValueOnce(chatResponseStub());
    const { result } = renderHook(() => useChat({ runId: '' }));
    await act(async () => {
      await result.current.sendMessage('?');
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty('context');
  });

  it('still POSTs to CHATBOT_URL/chat/message regardless of runId', async () => {
    fetchMock.mockResolvedValueOnce(chatResponseStub());
    const { result } = renderHook(() => useChat({ runId: RUN_ID }));
    await act(async () => {
      await result.current.sendMessage('?');
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('http://chatbot.test/chat/message');
    expect(init.method).toBe('POST');
  });
});
