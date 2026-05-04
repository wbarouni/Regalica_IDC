import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ValidationRun } from '../types/api';

import { useCurrentRun } from './useCurrentRun';

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

function run(overrides: Partial<ValidationRun> = {}): ValidationRun {
  return {
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
  };
}

describe('useCurrentRun', () => {
  beforeEach(() => {
    fetchApiMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches /current on mount and exposes the run snapshot', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: run({ status: 'running' }),
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useCurrentRun());
    await waitFor(() => {
      expect(result.current.run).not.toBeNull();
    });
    expect(result.current.run?.status).toBe('running');
    expect(fetchApiMock).toHaveBeenCalledTimes(1);
    expect(fetchApiMock).toHaveBeenCalledWith(expect.stringContaining('/runs/current'));
  });

  it('refetch() pulls /current again and replaces the snapshot', async () => {
    // The exact behaviour Tranche 1 fix #2 unlocks: SSE complete fires,
    // Workspace calls refetchCurrentRun(), and the persona/KPI surface
    // sees the post-finalize totals + status='completed' without a
    // page reload.
    fetchApiMock
      .mockResolvedValueOnce({
        data: run({ status: 'running' }),
        meta: { ts: '', version: '1' },
      })
      .mockResolvedValueOnce({
        data: run({
          status: 'completed',
          total_pass: 73,
          total_fail_severe: 0,
          total_fail_rounding: 0,
          conformity_rate: 1,
          completed_at: '2026-04-30T00:00:30Z',
        }),
        meta: { ts: '', version: '1' },
      });
    const { result } = renderHook(() => useCurrentRun());
    await waitFor(() => expect(result.current.run?.status).toBe('running'));
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(result.current.run?.status).toBe('completed'));
    expect(fetchApiMock).toHaveBeenCalledTimes(2);
    expect(result.current.run?.total_pass).toBe(73);
    expect(result.current.run?.conformity_rate).toBe(1);
    expect(result.current.run?.completed_at).toBe('2026-04-30T00:00:30Z');
  });

  it('refetch() reflects API errors via error state without crashing', async () => {
    fetchApiMock
      .mockResolvedValueOnce({
        data: run({ status: 'running' }),
        meta: { ts: '', version: '1' },
      })
      .mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useCurrentRun());
    await waitFor(() => expect(result.current.run?.status).toBe('running'));
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(result.current.error).toBe('UNKNOWN'));
    expect(fetchApiMock).toHaveBeenCalledTimes(2);
  });

  it('exposes a stable refetch reference across renders', async () => {
    fetchApiMock.mockResolvedValue({
      data: run({ status: 'running' }),
      meta: { ts: '', version: '1' },
    });
    const { result, rerender } = renderHook(() => useCurrentRun());
    await waitFor(() => expect(result.current.run).not.toBeNull());
    const firstRef = result.current.refetch;
    rerender();
    expect(result.current.refetch).toBe(firstRef);
  });
});
