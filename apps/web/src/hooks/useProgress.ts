import { useEffect, useState } from 'react';

import { useEventSource } from './useEventSource';

/**
 * K4 — subscribes to the run-scoped SSE 'progress' channel and
 * exposes the live evaluation percentage.
 *
 * The channel was defined since runEventBus.ts:103 (commit
 * 1ba9afe) but never emitted in production. K4 wires the engine
 * /evaluate handler to fire `progress` frames every 50 rules or
 * 500 ms (whichever first). This hook is the consumer side.
 *
 * Returns null when no frame has arrived yet (initial mount,
 * runId=null, or the run hasn't started evaluating). The
 * <ProgressBar> component branches on null to stay hidden until
 * the first signal.
 *
 * Defensive: payloads with the wrong shape are silently ignored
 * (no state mutation, no exception). The SSE handler signature
 * receives `unknown`; type-guards inline.
 */

export interface ProgressPayload {
  rulesEvaluated: number;
  rulesTotal: number;
  pctComplete: number;
}

interface UseProgressResult {
  progress: ProgressPayload | null;
}

function isValidProgressPayload(value: unknown): value is ProgressPayload {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['rulesEvaluated'] === 'number' &&
    typeof candidate['rulesTotal'] === 'number' &&
    typeof candidate['pctComplete'] === 'number'
  );
}

export function useProgress(runId: string | null): UseProgressResult {
  const { subscribe } = useEventSource(runId);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);

  useEffect(() => {
    if (runId === null) {
      // Reset between runs so a stale percentage from a prior run
      // does not leak into the next ribbon cycle.
      setProgress(null);
      return;
    }
    const off = subscribe('progress', (data) => {
      if (isValidProgressPayload(data)) {
        setProgress({
          rulesEvaluated: data.rulesEvaluated,
          rulesTotal: data.rulesTotal,
          pctComplete: data.pctComplete,
        });
      }
    });
    return off;
  }, [runId, subscribe]);

  return { progress };
}
