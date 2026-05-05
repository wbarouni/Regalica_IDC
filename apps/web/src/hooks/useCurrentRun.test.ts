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
    error_code: null,
    correlation_id: null,
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

  // K1 — Persisted error survives reload via /runs/current.
  // The SSE 'error' frame is single-shot; the validation_runs row
  // carries error_code + correlation_id since migration 073, and
  // /runs/current now includes 'failed' status in its filter so the
  // hook can rehydrate the artefact source after a page refresh.
  it('K1 — exposes status=failed with error_code on a freshly loaded failed run', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: run({
        status: 'failed',
        error_code: 't0_xsd_invalid',
        correlation_id: '00000000-0000-7000-8000-0000000000ee',
        completed_at: '2026-04-30T00:00:05Z',
      }),
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useCurrentRun());
    await waitFor(() => expect(result.current.run).not.toBeNull());
    expect(result.current.run?.status).toBe('failed');
    expect(result.current.run?.error_code).toBe('t0_xsd_invalid');
    expect(result.current.run?.correlation_id).toBe('00000000-0000-7000-8000-0000000000ee');
  });

  it('K1 — error_code stays null on a successful (status=completed) run', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: run({
        status: 'completed',
        error_code: null,
        correlation_id: '00000000-0000-7000-8000-0000000000ff',
      }),
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useCurrentRun());
    await waitFor(() => expect(result.current.run?.status).toBe('completed'));
    expect(result.current.run?.error_code).toBeNull();
  });

  it('K1 — failed run survives a refetch (reload simulation)', async () => {
    // Simulate: SSE error frame consumed by Workspace state; the user
    // refreshes the browser; useCurrentRun re-mounts and pulls the same
    // failed row again — the artefact must rehydrate from run.error_code.
    fetchApiMock.mockResolvedValue({
      data: run({
        status: 'failed',
        error_code: 't1_engine_exception',
        correlation_id: '00000000-0000-7000-8000-000000000a01',
      }),
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useCurrentRun());
    await waitFor(() => expect(result.current.run?.error_code).toBe('t1_engine_exception'));
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(fetchApiMock).toHaveBeenCalledTimes(2));
    expect(result.current.run?.status).toBe('failed');
    expect(result.current.run?.error_code).toBe('t1_engine_exception');
  });
});
