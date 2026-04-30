import { useCallback, useEffect, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { AgentStepStatus, RunAgentStep } from '../types/api';

import { useEventSource } from './useEventSource';

interface AgentsResponse {
  steps: RunAgentStep[];
}

/**
 * Live view of run_agent_steps for a single run.
 *
 * 1. Initial load: GET /api/tenants/:tenantId/runs/:runId/agents.
 *    Backend lazy-initializes from prompt_bank if no rows exist
 *    for the run yet.
 * 2. Live updates: subscribes to the SSE `agent_step` event and
 *    merges each payload by `id` into the local state.
 *
 * Returns the steps array sorted by ordinal, plus loading + error
 * book-keeping. When `runId` is null, returns an empty array and
 * never opens the EventSource.
 */

interface AgentStepEventPayload {
  stepId: string;
  agentType: string;
  functionName: string;
  status: AgentStepStatus;
  ordinal: number;
  durationMs: number | null;
}

function isAgentStepEventPayload(value: unknown): value is AgentStepEventPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const c = value as Record<string, unknown>;
  return (
    typeof c['stepId'] === 'string' &&
    typeof c['agentType'] === 'string' &&
    typeof c['functionName'] === 'string' &&
    typeof c['status'] === 'string' &&
    typeof c['ordinal'] === 'number'
  );
}

export interface UseAgentStepsResult {
  steps: RunAgentStep[];
  loading: boolean;
  error: string | null;
}

export function useAgentSteps(runId: string | null): UseAgentStepsResult {
  const [steps, setSteps] = useState<RunAgentStep[]>([]);
  const [loading, setLoading] = useState<boolean>(runId !== null);
  const [error, setError] = useState<string | null>(null);

  const { subscribe } = useEventSource(runId);

  useEffect(() => {
    if (runId === null) {
      setSteps([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (TENANT_ID === undefined || TENANT_ID === '') {
      setError('MISSING_TENANT_ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchApi<AgentsResponse>(`/api/tenants/${TENANT_ID}/runs/${runId}/agents`)
      .then((r) => {
        if (cancelled) {
          return;
        }
        const sorted = [...r.data.steps].sort((a, b) => a.ordinal - b.ordinal);
        setSteps(sorted);
      })
      .catch((e: unknown) => {
        if (cancelled) {
          return;
        }
        if (e instanceof ApiFetchError || e instanceof ApiConfigError) {
          setError(e.code);
        } else {
          setError('UNKNOWN');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [runId]);

  // Merge SSE patches into local state. The handler is stable across
  // renders so the underlying EventSource listener is registered once.
  const onAgentStep = useCallback((data: unknown) => {
    if (!isAgentStepEventPayload(data)) {
      return;
    }
    setSteps((prev) => {
      const next = prev.slice();
      const idx = next.findIndex((s) => s.id === data.stepId);
      if (idx === -1) {
        next.push({
          id: data.stepId,
          agentType: data.agentType,
          functionName: data.functionName,
          ordinal: data.ordinal,
          status: data.status,
          durationMs: data.durationMs,
          startedAt: null,
          completedAt: null,
          errorMessage: null,
        });
      } else {
        const current = next[idx]!;
        next[idx] = {
          ...current,
          status: data.status,
          ordinal: data.ordinal,
          durationMs: data.durationMs,
        };
      }
      next.sort((a, b) => a.ordinal - b.ordinal);
      return next;
    });
  }, []);

  useEffect(() => {
    if (runId === null) {
      return;
    }
    const off = subscribe('agent_step', onAgentStep);
    return off;
  }, [runId, subscribe, onAgentStep]);

  return { steps, loading, error };
}
