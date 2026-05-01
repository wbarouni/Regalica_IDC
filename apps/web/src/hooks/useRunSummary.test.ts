import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunSummary } from '../types/api';
import { useRunSummary } from './useRunSummary';

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

const RUN_ID = '00000000-0000-7000-8000-0000000000cc';

function summary(overrides: Partial<RunSummary['run']> = {}): RunSummary {
  return {
    run: {
      run_id: RUN_ID,
      batch_label: null,
      primary_annexe_code: 'RSM630',
      arrete_date: '2024-03-31',
      status: 'running',
      conformity_rate: null,
      total_rules_evaluated: null,
      total_pass: null,
      total_fail_severe: null,
      total_fail_rounding: null,
      execution_time_ms: null,
      step1_xsd_status: null,
      step2_embedded_status: null,
      step3_rdg_status: null,
      initiated_at: '2026-04-30T00:00:00Z',
      completed_at: null,
      ...overrides,
    },
    annexes: [],
  };
}

describe('useRunSummary', () => {
  beforeEach(() => {
    fetchApiMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the summary on mount and exposes it via state', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: summary({ status: 'running' }),
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useRunSummary(RUN_ID));
    await waitFor(() => {
      expect(result.current.summary).not.toBeNull();
    });
    expect(result.current.summary?.run.status).toBe('running');
    expect(fetchApiMock).toHaveBeenCalledTimes(1);
  });

  it('refetch() pulls a fresh summary from the API', async () => {
    fetchApiMock
      .mockResolvedValueOnce({
        data: summary({ status: 'running' }),
        meta: { ts: '', version: '1' },
      })
      .mockResolvedValueOnce({
        data: summary({
          status: 'completed',
          total_fail_severe: 0,
          synthesis_artifact: 'S',
          deliverable_c_artifact: 'C',
        }),
        meta: { ts: '', version: '1' },
      });
    const { result } = renderHook(() => useRunSummary(RUN_ID));
    await waitFor(() => expect(result.current.summary?.run.status).toBe('running'));
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(result.current.summary?.run.status).toBe('completed'));
    expect(fetchApiMock).toHaveBeenCalledTimes(2);
    expect(result.current.summary?.run.synthesis_artifact).toBe('S');
    expect(result.current.summary?.run.deliverable_c_artifact).toBe('C');
  });

  it('clears state when runId becomes null', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: summary(),
      meta: { ts: '', version: '1' },
    });
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useRunSummary(id), {
      initialProps: { id: RUN_ID as string | null },
    });
    await waitFor(() => expect(result.current.summary).not.toBeNull());
    rerender({ id: null });
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
