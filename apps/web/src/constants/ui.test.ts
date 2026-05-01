import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Strict env wiring for the UI display constants (commit C4 / H7).
 *
 * The module reads `import.meta.env.VITE_*` at first import. To exercise
 * the failure path without polluting the global module cache, every spec
 * uses `vi.resetModules()` + `vi.stubEnv(...)` so a fresh evaluation
 * runs against the patched env. After each spec we restore the original
 * env and reset modules again so neighbouring suites get the canonical
 * values from `.env`.
 */

describe('constants/ui — strict env-driven UI constants', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reads valid positive integers from VITE_*', async () => {
    vi.stubEnv('VITE_RUN_ID_DISPLAY_LENGTH', '12');
    vi.stubEnv('VITE_RULE_LABEL_PREVIEW_LENGTH', '40');
    vi.stubEnv('VITE_SSE_RECONNECT_BASE_MS', '500');
    const mod = await import('./ui');
    expect(mod.RUN_ID_DISPLAY_LENGTH).toBe(12);
    expect(mod.RULE_LABEL_PREVIEW_LENGTH).toBe(40);
    expect(mod.SSE_RECONNECT_BASE_MS).toBe(500);
  });

  it('throws UiConstantsConfigError when VITE_RUN_ID_DISPLAY_LENGTH is unset', async () => {
    vi.stubEnv('VITE_RUN_ID_DISPLAY_LENGTH', '');
    vi.stubEnv('VITE_RULE_LABEL_PREVIEW_LENGTH', '60');
    vi.stubEnv('VITE_SSE_RECONNECT_BASE_MS', '1000');
    await expect(import('./ui')).rejects.toThrow(/VITE_RUN_ID_DISPLAY_LENGTH/);
  });

  it('throws when a value is not a positive integer (zero rejected)', async () => {
    vi.stubEnv('VITE_RUN_ID_DISPLAY_LENGTH', '8');
    vi.stubEnv('VITE_RULE_LABEL_PREVIEW_LENGTH', '0');
    vi.stubEnv('VITE_SSE_RECONNECT_BASE_MS', '1000');
    await expect(import('./ui')).rejects.toThrow(/VITE_RULE_LABEL_PREVIEW_LENGTH/);
  });

  it('throws when a value is not a parseable integer (alpha rejected)', async () => {
    vi.stubEnv('VITE_RUN_ID_DISPLAY_LENGTH', '8');
    vi.stubEnv('VITE_RULE_LABEL_PREVIEW_LENGTH', '60');
    vi.stubEnv('VITE_SSE_RECONNECT_BASE_MS', 'abc');
    await expect(import('./ui')).rejects.toThrow(/VITE_SSE_RECONNECT_BASE_MS/);
  });

  it('rejects negative integers', async () => {
    vi.stubEnv('VITE_RUN_ID_DISPLAY_LENGTH', '-1');
    vi.stubEnv('VITE_RULE_LABEL_PREVIEW_LENGTH', '60');
    vi.stubEnv('VITE_SSE_RECONNECT_BASE_MS', '1000');
    await expect(import('./ui')).rejects.toThrow(/VITE_RUN_ID_DISPLAY_LENGTH/);
  });
});
