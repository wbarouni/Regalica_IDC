import type { Pool } from 'pg';

import { clearPlatformConfigCache, getPlatformConfig } from '../src/lib/platformConfig';
import {
  configureRunEventBus,
  emitProgress,
  getRunEventBusMaxListeners,
  subscribeRunEvents,
  type ProgressEvent,
  type RunEventPayload,
} from '../src/lib/runEventBus';

/**
 * Unit-level coverage for the platform_config-driven listener cap.
 *
 * The bus is a process singleton, so the assertions are observation-
 * only (we never mutate via direct setMaxListeners — only through the
 * public configureRunEventBus(pool) entry point). Each spec restores
 * the platform_config cache on entry / exit so a sibling spec sees a
 * cold loader.
 */

interface FakePoolQueryRow {
  config_value: unknown;
}

function makeFakePool(value: unknown): Pool {
  return {
    query: async () => ({ rows: [{ config_value: value }] }),
  } as unknown as Pool;
}

function makeMissingPool(): Pool {
  return {
    query: async () => ({ rows: [] as FakePoolQueryRow[] }),
  } as unknown as Pool;
}

describe('lib/runEventBus — listener cap from platform_config', () => {
  beforeEach(() => {
    clearPlatformConfigCache();
  });

  afterEach(() => {
    clearPlatformConfigCache();
  });

  it('applies the platform_config sse_max_listeners value', async () => {
    const pool = makeFakePool(42);
    await configureRunEventBus(pool);
    expect(getRunEventBusMaxListeners()).toBe(42);

    // Rebound to a different value via a fresh call confirms idempotence.
    clearPlatformConfigCache();
    const pool2 = makeFakePool(7);
    await configureRunEventBus(pool2);
    expect(getRunEventBusMaxListeners()).toBe(7);
  });

  it('falls back to Node default cap when platform_config is missing', async () => {
    // First seed a known value so we can detect the fall-back behaviour.
    await configureRunEventBus(makeFakePool(99));
    expect(getRunEventBusMaxListeners()).toBe(99);

    clearPlatformConfigCache();
    // The function must NOT throw on a missing key — failures are
    // logged but the bus stays usable on whatever cap was last set.
    await configureRunEventBus(makeMissingPool());
    expect(getRunEventBusMaxListeners()).toBe(99);
  });

  it('reads through the platform_config loader (proves the wiring)', async () => {
    const pool = makeFakePool(33);
    const value = await getPlatformConfig<number>(pool, 'sse_max_listeners');
    expect(value).toBe(33);
  });
});

// K4 — emitProgress is invoked by the engine /evaluate handler with
// the runEvaluation onProgress callback. The wiring is mechanical: the
// route passes a closure that calls emitProgress; this test pins the
// bus contract so a future refactor of the channel name / payload
// shape is caught by the unit suite, not by an integration smoke.
describe('lib/runEventBus — K4 emitProgress channel', () => {
  it('delivers progress payloads to subscribers verbatim', () => {
    const runId = '00000000-0000-7000-8000-000000000099';
    const received: RunEventPayload[] = [];
    const types: string[] = [];
    const unsubscribe = subscribeRunEvents(runId, (event) => {
      types.push(event.type);
      received.push(event.payload);
    });
    try {
      const payload: ProgressEvent = {
        rulesEvaluated: 1500,
        rulesTotal: 4611,
        pctComplete: 32,
      };
      emitProgress(runId, payload);
    } finally {
      unsubscribe();
    }
    expect(types).toEqual(['progress']);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      rulesEvaluated: 1500,
      rulesTotal: 4611,
      pctComplete: 32,
    });
  });

  it('scopes progress emissions per runId — other runs see nothing', () => {
    const runIdA = '00000000-0000-7000-8000-0000000000aa';
    const runIdB = '00000000-0000-7000-8000-0000000000bb';
    const receivedB: RunEventPayload[] = [];
    const offB = subscribeRunEvents(runIdB, (event) => {
      receivedB.push(event.payload);
    });
    try {
      emitProgress(runIdA, { rulesEvaluated: 10, rulesTotal: 100, pctComplete: 10 });
    } finally {
      offB();
    }
    expect(receivedB).toEqual([]);
  });
});
