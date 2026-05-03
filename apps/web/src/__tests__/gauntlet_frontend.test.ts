/**
 * GAUNTLET — Bloc F : Frontend contrats URL.
 *
 * Vérifie les invariants de routage frontend → backend :
 *  - useCurrentRun, useRunSummary, useFails appellent l'API Node sur les
 *    bons paths (via fetchApi → VITE_API_URL).
 *  - useChat appelle directement chatbot-py (VITE_CHATBOT_URL :8000),
 *    PAS l'API Node :3000 — un dérapage casserait toutes les conversations.
 *  - useUpload utilise XHR + FormData multipart vers /uploads.
 *  - fetchApi inclut systématiquement le header X-User-Id (boundary
 *    d'attribution des écritures côté API).
 *
 * Pattern vi.mock('../lib/config', ...) reproduit verbatim de
 * apps/web/src/hooks/useStartRun.test.ts.
 *
 * Réf. doc 03 §11 : Frontend React + Tailwind
 * Réf. CLAUDE.md §11 : VITE_API_URL → :3000, VITE_CHATBOT_URL → :8000
 */

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_API_URL = 'http://api.test';
const TEST_CHATBOT_URL = 'http://chatbot.test';
const TEST_TENANT_ID = '00000000-0000-7000-8000-0000000000aa';
const TEST_USER_ID = '00000000-0000-7000-8000-0000000000bb';
const TEST_RUN_ID = '11111111-1111-7111-8111-111111111111';

vi.mock('../lib/config', () => ({
  API_URL: TEST_API_URL,
  CHATBOT_URL: TEST_CHATBOT_URL,
  TENANT_ID: TEST_TENANT_ID,
  USER_ID: TEST_USER_ID,
  TENANT_DISPLAY_NAME: 'Tenant Test',
  DEFAULT_PAGE_SIZE: 50,
  BRAND_NAME: 'REGFlow',
  PRODUCT_NAME: 'REGFlow',
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// F-01 : useCurrentRun → /api/tenants/:tenantId/runs/current
// ---------------------------------------------------------------------------
describe('GAUNTLET F-01: useCurrentRun URL contract', () => {
  it('GETs /api/tenants/:tenantId/runs/current via VITE_API_URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: null, meta: { ts: '', version: '1' } }));
    const { useCurrentRun } = await import('../hooks/useCurrentRun');
    renderHook(() => useCurrentRun());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`${TEST_API_URL}/api/tenants/${TEST_TENANT_ID}/runs/current`);
  });
});

// ---------------------------------------------------------------------------
// F-02 : useRunSummary → /api/tenants/:tenantId/runs/:runId/summary
// ---------------------------------------------------------------------------
describe('GAUNTLET F-02: useRunSummary URL contract', () => {
  it('GETs /api/tenants/:tenantId/runs/:runId/summary when runId is provided', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: null, meta: { ts: '', version: '1' } }));
    const { useRunSummary } = await import('../hooks/useRunSummary');
    renderHook(() => useRunSummary(TEST_RUN_ID));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`${TEST_API_URL}/api/tenants/${TEST_TENANT_ID}/runs/${TEST_RUN_ID}/summary`);
  });
});

// ---------------------------------------------------------------------------
// F-03 : useFails → /api/tenants/:tenantId/runs/:runId/fails
// ---------------------------------------------------------------------------
describe('GAUNTLET F-03: useFails URL base contract (query params variable)', () => {
  it('GETs /api/tenants/:tenantId/runs/:runId/fails (path checked, query string ignored)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { ts: '', version: '1', total: 0 } }),
    );
    const { useFails } = await import('../hooks/useFails');
    renderHook(() => useFails(TEST_RUN_ID, 'all'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    // Décision GAUNTLET B4: vérifier la base sans matcher les query params.
    expect(url).toMatch(
      new RegExp(`^${TEST_API_URL}/api/tenants/${TEST_TENANT_ID}/runs/${TEST_RUN_ID}/fails(\\?|$)`),
    );
  });
});

// ---------------------------------------------------------------------------
// F-04 : useChat → CHATBOT_URL/chat/message (port 8000), PAS l'API Node
// ---------------------------------------------------------------------------
describe('GAUNTLET F-04: useChat targets chatbot-py, NOT the Node API', () => {
  it('POSTs to CHATBOT_URL/chat/message — never to API_URL', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
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
    );
    const { useChat } = await import('../hooks/useChat');
    const { result } = renderHook(() => useChat());
    await result.current.sendMessage('Bonjour');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    // INVARIANT critique : si une régression pointait useChat vers
    // API_URL, toutes les conversations seraient cassées en silence.
    expect(url).toBe(`${TEST_CHATBOT_URL}/chat/message`);
    expect(url.startsWith(TEST_API_URL)).toBe(false);
    expect(init.method).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// F-05 : useUpload → POST multipart vers /uploads
// ---------------------------------------------------------------------------
describe('GAUNTLET F-05: useUpload sends FormData via XHR to /uploads', () => {
  // useUpload utilise XMLHttpRequest (pas fetch) pour exposer les events
  // upload-progress natifs du navigateur. On reproduit le pattern de mock
  // XHR de tests/useUpload.test.ts pour ne pas inventer.

  interface MockXhr {
    open: ReturnType<typeof vi.fn>;
    setRequestHeader: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
    upload: { onprogress: ((ev: ProgressEvent) => void) | null };
    onload: (() => void) | null;
    onerror: (() => void) | null;
    onabort: (() => void) | null;
    responseText: string;
    status: number;
  }

  let lastXhr: MockXhr | null = null;
  let originalXhr: typeof XMLHttpRequest;

  beforeEach(() => {
    originalXhr = globalThis.XMLHttpRequest;
    lastXhr = null;
    (globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = vi
      .fn()
      .mockImplementation((): MockXhr => {
        const xhr: MockXhr = {
          open: vi.fn(),
          setRequestHeader: vi.fn(),
          send: vi.fn(),
          abort: vi.fn(),
          upload: { onprogress: null },
          onload: null,
          onerror: null,
          onabort: null,
          responseText: '',
          status: 0,
        };
        lastXhr = xhr;
        return xhr;
      });
  });

  afterEach(() => {
    (globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = originalXhr;
  });

  it('POSTs multipart FormData to API_URL/api/tenants/:tenantId/uploads', async () => {
    const { useUpload } = await import('../hooks/useUpload');
    const { result } = renderHook(() => useUpload());
    const file = new File(['<x/>'], 'rsm630.xml', { type: 'application/xml' });
    void result.current.upload(file);
    await waitFor(() => expect(lastXhr).not.toBeNull());
    const xhr = lastXhr as unknown as MockXhr;
    expect(xhr.open).toHaveBeenCalledWith(
      'POST',
      `${TEST_API_URL}/api/tenants/${TEST_TENANT_ID}/uploads`,
    );
    expect(xhr.send).toHaveBeenCalledTimes(1);
    const [sentForm] = xhr.send.mock.calls[0]! as [FormData];
    expect(sentForm).toBeInstanceOf(FormData);
  });
});

// ---------------------------------------------------------------------------
// F-06 : fetchApi inclut systématiquement le header X-User-Id
// ---------------------------------------------------------------------------
describe('GAUNTLET F-06: fetchApi sets X-User-Id on every request', () => {
  it('every request through fetchApi carries the X-User-Id header from VITE_USER_ID', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { x: 1 }, meta: { ts: '', version: '1' } }),
    );
    const { fetchApi } = await import('../lib/fetchApi');
    await fetchApi('/some/path');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-User-Id']).toBe(TEST_USER_ID);
  });
});
