import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunAgentStep } from '../types/api';
import { useAgentSteps } from './useAgentSteps';

vi.mock('../lib/config', () => ({
  API_URL: 'http://api.test',
  CHATBOT_URL: 'http://chatbot.test',
  TENANT_ID: '00000000-0000-7000-8000-0000000000aa',
  USER_ID: '00000000-0000-7000-8000-0000000000bb',
}));

// Capture every subscribe(eventType, handler) so tests can drive the
// SSE side of the hook without touching the real EventSource impl.
const sseSubscribers: Array<{ eventType: string; handler: (data: unknown) => void }> = [];

vi.mock('./useEventSource', () => ({
  useEventSource: () => ({
    subscribe: (eventType: string, handler: (data: unknown) => void) => {
      const entry = { eventType, handler };
      sseSubscribers.push(entry);
      return () => {
        const idx = sseSubscribers.indexOf(entry);
        if (idx !== -1) {
          sseSubscribers.splice(idx, 1);
        }
      };
    },
    ready: true,
  }),
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

function step(overrides: Partial<RunAgentStep> & { id: string; ordinal: number }): RunAgentStep {
  return {
    id: overrides.id,
    agentType: overrides.agentType ?? 'investigator',
    functionName: overrides.functionName ?? 'analyze_fail',
    ordinal: overrides.ordinal,
    status: overrides.status ?? 'pending',
    durationMs: overrides.durationMs ?? null,
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    errorMessage: overrides.errorMessage ?? null,
  };
}

beforeEach(() => {
  sseSubscribers.length = 0;
  fetchApiMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAgentSteps', () => {
  it('returns empty steps when runId is null', () => {
    const { result } = renderHook(() => useAgentSteps(null));
    expect(result.current.steps).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchApiMock).not.toHaveBeenCalled();
  });

  it('fetches steps and sorts them by ordinal', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: {
        steps: [
          step({ id: 'b', ordinal: 2, agentType: 'reporter' }),
          step({ id: 'a', ordinal: 1 }),
          step({ id: 'c', ordinal: 3, status: 'done' }),
        ],
      },
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useAgentSteps(RUN_ID));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.steps.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(fetchApiMock).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`/runs/${RUN_ID}/agents$`)),
    );
  });

  it('records the API error code on failure', async () => {
    const { ApiFetchError } =
      await vi.importActual<typeof import('../lib/fetchApi')>('../lib/fetchApi');
    fetchApiMock.mockRejectedValueOnce(new ApiFetchError('RUN_NOT_FOUND', 'gone', 404));
    const { result } = renderHook(() => useAgentSteps(RUN_ID));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('RUN_NOT_FOUND');
    expect(result.current.steps).toEqual([]);
  });

  it('merges an SSE agent_step event into the local state', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: {
        steps: [
          step({ id: 'a', ordinal: 1, status: 'pending' }),
          step({ id: 'b', ordinal: 2, status: 'pending' }),
        ],
      },
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useAgentSteps(RUN_ID));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const subscriber = sseSubscribers.find((s) => s.eventType === 'agent_step');
    expect(subscriber).not.toBeUndefined();
    act(() => {
      subscriber!.handler({
        stepId: 'a',
        agentType: 'investigator',
        functionName: 'analyze_fail',
        status: 'done',
        ordinal: 1,
        durationMs: 1234,
      });
    });
    await waitFor(() => {
      expect(result.current.steps[0]!.status).toBe('done');
    });
    expect(result.current.steps[0]!.durationMs).toBe(1234);
    // Other rows untouched.
    expect(result.current.steps[1]!.status).toBe('pending');
  });

  it('appends a new step when the SSE event references an unknown id', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: { steps: [step({ id: 'a', ordinal: 1 })] },
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useAgentSteps(RUN_ID));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => {
      sseSubscribers
        .find((s) => s.eventType === 'agent_step')!
        .handler({
          stepId: 'z',
          agentType: 'reporter',
          functionName: 'generate_pdf',
          status: 'current',
          ordinal: 2,
          durationMs: null,
        });
    });
    await waitFor(() => {
      expect(result.current.steps.length).toBe(2);
    });
    expect(result.current.steps[1]!.id).toBe('z');
  });

  it('ignores SSE payloads that do not match the expected shape', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: { steps: [step({ id: 'a', ordinal: 1 })] },
      meta: { ts: '', version: '1' },
    });
    const { result } = renderHook(() => useAgentSteps(RUN_ID));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => {
      sseSubscribers.find((s) => s.eventType === 'agent_step')!.handler({ unrelated: true });
      sseSubscribers.find((s) => s.eventType === 'agent_step')!.handler('garbage');
      sseSubscribers.find((s) => s.eventType === 'agent_step')!.handler(null);
    });
    expect(result.current.steps).toHaveLength(1);
    expect(result.current.steps[0]!.status).toBe('pending');
  });
});
