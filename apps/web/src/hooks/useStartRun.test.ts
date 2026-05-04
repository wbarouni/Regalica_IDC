import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStartRun } from './useStartRun';

vi.mock('../lib/config', () => ({
  API_URL: 'http://api.test',
  CHATBOT_URL: 'http://chatbot.test',
  TENANT_ID: '00000000-0000-7000-8000-0000000000aa',
  USER_ID: '00000000-0000-7000-8000-0000000000bb',
}));

const fetchApiMock = vi.fn();
vi.mock('../lib/fetchApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/fetchApi')>('../lib/fetchApi');
  return {
    ...actual,
    fetchApi: (...args: unknown[]) => fetchApiMock(...args),
  };
});

describe('useStartRun', () => {
  beforeEach(() => {
    fetchApiMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs to /api/tenants/:tenantId/runs and returns the run_id', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: { run_id: '11111111-1111-7111-8111-111111111111', status: 'running' },
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useStartRun());
    let runId = '';
    await act(async () => {
      const res = await result.current.start({
        upload_ids: ['22222222-2222-7222-8222-222222222222'],
        primary_upload_id: '22222222-2222-7222-8222-222222222222',
        arrete_date: '2026-03-31',
      });
      runId = res.run_id;
    });
    expect(runId).toBe('11111111-1111-7111-8111-111111111111');
    const [path, init] = fetchApiMock.mock.calls[0]!;
    expect(path).toBe('/api/tenants/00000000-0000-7000-8000-0000000000aa/runs');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      upload_ids: ['22222222-2222-7222-8222-222222222222'],
      primary_upload_id: '22222222-2222-7222-8222-222222222222',
      arrete_date: '2026-03-31',
    });
  });

  it('forwards conversation_id when supplied', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: { run_id: 'r', status: 'running' },
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useStartRun());
    await act(async () => {
      await result.current.start({
        upload_ids: ['x'],
        primary_upload_id: 'x',
        arrete_date: '2026-03-31',
        conversation_id: '33333333-3333-7333-8333-333333333333',
      });
    });
    const body = JSON.parse(fetchApiMock.mock.calls[0]![1]?.body as string);
    expect(body.conversation_id).toBe('33333333-3333-7333-8333-333333333333');
  });

  it('exposes the API error code on failure', async () => {
    const { ApiFetchError } = await import('../lib/fetchApi');
    fetchApiMock.mockRejectedValueOnce(new ApiFetchError('UPLOAD_NOT_OWNED', 'nope', 403));
    const { result } = renderHook(() => useStartRun());
    await act(async () => {
      await expect(
        result.current.start({
          upload_ids: ['x'],
          primary_upload_id: 'x',
          arrete_date: '2026-03-31',
        }),
      ).rejects.toBeInstanceOf(ApiFetchError);
    });
    await waitFor(() => {
      // Tranche 1.1 — error shape is { code, message } so callers can
      // render both the canonical machine-readable code and the raw
      // server message for support tickets.
      expect(result.current.error).toEqual({ code: 'UPLOAD_NOT_OWNED', message: 'nope' });
      expect(result.current.starting).toBe(false);
    });
  });

  it('exposes UNKNOWN with the raw message when a non-Api error reaches the catch', async () => {
    fetchApiMock.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useStartRun());
    await act(async () => {
      await result.current
        .start({ upload_ids: ['x'], primary_upload_id: 'x', arrete_date: '2026-03-31' })
        .catch(() => undefined);
    });
    expect(result.current.error).toEqual({ code: 'UNKNOWN', message: 'boom' });
  });

  it('reset clears error state', async () => {
    const { ApiFetchError } = await import('../lib/fetchApi');
    fetchApiMock.mockRejectedValueOnce(new ApiFetchError('BOOM', 'x', 500));
    const { result } = renderHook(() => useStartRun());
    await act(async () => {
      await result.current
        .start({ upload_ids: ['x'], primary_upload_id: 'x', arrete_date: '2026-03-31' })
        .catch(() => undefined);
    });
    expect(result.current.error).toEqual({ code: 'BOOM', message: 'x' });
    act(() => {
      result.current.reset();
    });
    expect(result.current.error).toBeNull();
  });
});
