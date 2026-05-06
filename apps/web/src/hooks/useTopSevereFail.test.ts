import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTopSevereFail } from './useTopSevereFail';

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

const RUN_ID = '11111111-1111-7111-8111-111111111111';

describe('useTopSevereFail — D precondition', () => {
  it('returns null fail and idle state when runId is null', async () => {
    const { result } = renderHook(() => useTopSevereFail(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.fail).toBeNull();
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hits /fails?filter=fail&page=1&limit=1 and exposes the first row', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'fail-1',
              ax_term: '630',
              num_regle: 266,
              operateur: '=',
              regle_label: 'r',
              severity: 'severe',
              expected_value: 100,
              computed_value: 80,
              gap_absolute: 20,
              gap_relative: 0.2,
              cluster_id: null,
              is_sentinel_iteration: false,
              iteration_index: null,
              created_at: '2026-04-30T11:00:00Z',
              rubrique_codes: [],
            },
          ],
          meta: { ts: '', version: '1', total: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { result } = renderHook(() => useTopSevereFail(RUN_ID));
    await waitFor(() => expect(result.current.fail).not.toBeNull());
    expect(result.current.fail?.id).toBe('fail-1');
    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('filter=fail');
    expect(url).toContain('page=1');
    expect(url).toContain('limit=1');
  });

  it('returns null fail when the API yields zero rows', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], meta: { ts: '', version: '1', total: 0 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useTopSevereFail(RUN_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.fail).toBeNull();
  });

  it('exposes the API error code on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'RUN_NOT_FOUND', message: '' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useTopSevereFail(RUN_ID));
    await waitFor(() => expect(result.current.error).toBe('RUN_NOT_FOUND'));
    expect(result.current.fail).toBeNull();
  });
});
