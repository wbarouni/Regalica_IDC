/**
 * S1 L6 — setup-dev tests (pure functions).
 *
 * The orchestrator's IO-heavy steps (docker compose, migrate runs,
 * fetches against the API) are exercised by the ultimate fresh-machine
 * test (L10). This suite covers the pure logic exported for unit-level
 * verification: env-driven config + the public spawn helper signature.
 *
 * Runner: node:test (built-in). Run via `pnpm test:tools`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readSetupConfig, run } from './setup-dev.js';

describe('readSetupConfig', () => {
  it('returns nonInteractive=false when BOOTSTRAP_ENV_NONINTERACTIVE is unset', () => {
    const cfg = readSetupConfig({});
    assert.equal(cfg.nonInteractive, false);
  });

  it('returns nonInteractive=true when BOOTSTRAP_ENV_NONINTERACTIVE=true', () => {
    const cfg = readSetupConfig({ BOOTSTRAP_ENV_NONINTERACTIVE: 'true' });
    assert.equal(cfg.nonInteractive, true);
  });

  it('returns nonInteractive=false for any non-true value', () => {
    assert.equal(readSetupConfig({ BOOTSTRAP_ENV_NONINTERACTIVE: 'false' }).nonInteractive, false);
    assert.equal(readSetupConfig({ BOOTSTRAP_ENV_NONINTERACTIVE: '1' }).nonInteractive, false);
    assert.equal(readSetupConfig({ BOOTSTRAP_ENV_NONINTERACTIVE: '' }).nonInteractive, false);
  });
});

describe('run helper', () => {
  it('captures stdout from `node --version` and returns exit code 0', async () => {
    // `node --version` is the most portable success-with-output probe
    // we can run from a test: no shell quoting, no temp file, output
    // shape is guaranteed by Node itself (`vXX.YY.ZZ`).
    const res = await run('node', ['--version'], { inheritStdio: false });
    assert.equal(res.code, 0);
    assert.match(res.stdout, /^v\d+\.\d+\.\d+/);
  });

  it('returns a non-zero exit code when the command fails', async () => {
    // `node --bogus-flag-that-does-not-exist` exits with code 9
    // (per node's CLI contract for unknown flags). The exact code is
    // not what we assert — only that the helper surfaces a non-zero
    // value rather than masking the failure.
    const res = await run('node', ['--bogus-flag-that-does-not-exist'], {
      inheritStdio: false,
    });
    assert.notEqual(res.code, 0);
  });
});
