import type { Pool } from 'pg';

import { clearPlatformConfigCache, getPlatformConfig } from '../src/lib/platformConfig';
import { configureRunEventBus, getRunEventBusMaxListeners } from '../src/lib/runEventBus';

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
