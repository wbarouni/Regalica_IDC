import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSuggestions } from './useSuggestions';

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

const RUN_ID = '00000000-0000-7000-8000-0000000000dd';

beforeEach(() => {
  fetchApiMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSuggestions', () => {
  it('fetches /suggestions without runId when runId is null', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: { suggestions: [] },
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useSuggestions(null));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(fetchApiMock).toHaveBeenCalledWith(expect.stringMatching(/\/prompts\/suggestions$/));
  });

  it('appends ?runId= when a runId is provided', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: { suggestions: [] },
      meta: { ts: '', version: '1' },
    });
    renderHook(() => useSuggestions(RUN_ID));
    await waitFor(() => {
      expect(fetchApiMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchApiMock.mock.calls[0]![0]).toContain(`runId=${RUN_ID}`);
  });

  it('returns suggestions sorted by ordinal', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: {
        suggestions: [
          { id: 'b', fnName: 'cluster', labelI18nKey: 'chip.cluster', ordinal: 2 },
          { id: 'a', fnName: 'zoom', labelI18nKey: 'chip.zoom', ordinal: 1 },
          { id: 'c', fnName: 'plan', labelI18nKey: 'chip.plan', ordinal: 7 },
        ],
      },
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useSuggestions(null));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.suggestions.map((s) => s.fnName)).toEqual(['zoom', 'cluster', 'plan']);
  });

  it('returns an empty array when the endpoint returns no suggestions', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: { suggestions: [] },
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useSuggestions(null));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('records the API error code on failure', async () => {
    const { ApiFetchError } =
      await vi.importActual<typeof import('../lib/fetchApi')>('../lib/fetchApi');
    fetchApiMock.mockRejectedValueOnce(new ApiFetchError('RUN_NOT_FOUND', 'gone', 404));
    const { result } = renderHook(() => useSuggestions(RUN_ID));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('RUN_NOT_FOUND');
  });

  it('refetches when runId changes', async () => {
    fetchApiMock
      .mockResolvedValueOnce({
        data: { suggestions: [] },
        meta: { ts: '', version: '1' },
      })
      .mockResolvedValueOnce({
        data: { suggestions: [] },
        meta: { ts: '', version: '1' },
      });
    const { rerender } = renderHook(({ id }) => useSuggestions(id), {
      initialProps: { id: null as string | null },
    });
    await waitFor(() => {
      expect(fetchApiMock).toHaveBeenCalledTimes(1);
    });
    rerender({ id: RUN_ID });
    await waitFor(() => {
      expect(fetchApiMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchApiMock.mock.calls[1]![0]).toContain(`runId=${RUN_ID}`);
  });
});
