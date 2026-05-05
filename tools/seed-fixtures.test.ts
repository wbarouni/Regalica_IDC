/**
 * S1 L5 — seed-fixtures tests (pure functions).
 *
 * Per Q3, the IO orchestration (network POSTs, real filesystem) is
 * exercised by the ultimate fresh-machine test (L10). The pure
 * helpers below cover the env-driven config resolution and the
 * response parsing branches that decide uploaded vs deduplicated vs
 * error.
 *
 * Runner: node:test (built-in). Run via `pnpm test:tools`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readConfig, parseUploadResponse } from './seed-fixtures.js';

describe('readConfig', () => {
  it('returns the dev defaults when no SEED_FIXTURES_* env is set', () => {
    const cfg = readConfig({});
    assert.equal(cfg.tenantId, 'd3a7c6e6-2d18-4ff6-8183-94507eded6d7');
    assert.equal(cfg.userId, '2cb0ce35-4b43-499f-b23a-722ef86902ce');
    assert.equal(cfg.apiUrl, 'http://localhost:3000');
    assert.match(cfg.fixturesDir, /tests[\\/]fixtures[\\/]golden[\\/]tenant-001[\\/]2026-02-28/);
  });

  it('every default is overridable independently', () => {
    const cfg = readConfig({
      SEED_FIXTURES_DIR: '/tmp/fakefixtures',
      SEED_FIXTURES_TENANT_ID: '11111111-1111-1111-1111-111111111111',
      SEED_FIXTURES_USER_ID: '22222222-2222-2222-2222-222222222222',
      SEED_FIXTURES_API_URL: 'http://api-test:3000',
    });
    assert.equal(cfg.fixturesDir, '/tmp/fakefixtures');
    assert.equal(cfg.tenantId, '11111111-1111-1111-1111-111111111111');
    assert.equal(cfg.userId, '22222222-2222-2222-2222-222222222222');
    assert.equal(cfg.apiUrl, 'http://api-test:3000');
  });

  it('mixes overrides with defaults when only some env vars are set', () => {
    const cfg = readConfig({ SEED_FIXTURES_API_URL: 'http://override:9000' });
    assert.equal(cfg.apiUrl, 'http://override:9000');
    assert.equal(cfg.tenantId, 'd3a7c6e6-2d18-4ff6-8183-94507eded6d7');
  });
});

describe('parseUploadResponse', () => {
  it('marks as uploaded when the API returns 201 with a non-deduplicated envelope', () => {
    const out = parseUploadResponse(201, {
      data: { upload_id: 'abc-123', deduplicated: false },
      meta: { ts: '...', version: '1' },
    });
    assert.equal(out.uploadId, 'abc-123');
    assert.equal(out.deduplicated, false);
    assert.equal(out.error, null);
    assert.equal(out.status, 201);
  });

  it('marks as deduplicated when the API returns 200 with deduplicated=true', () => {
    const out = parseUploadResponse(200, {
      data: { upload_id: 'def-456', deduplicated: true },
      meta: { ts: '...', version: '1' },
    });
    assert.equal(out.uploadId, 'def-456');
    assert.equal(out.deduplicated, true);
    assert.equal(out.error, null);
  });

  it('captures the API error code on 4xx', () => {
    const out = parseUploadResponse(422, {
      error: { code: 'XML_HEADER_INVALID', message: 'missing CodeAnnexe' },
    });
    assert.equal(out.uploadId, null);
    assert.equal(out.error, 'XML_HEADER_INVALID');
  });

  it('falls back to http_<status> when the body has no error envelope', () => {
    const out = parseUploadResponse(500, { unrelated: 'shape' });
    assert.equal(out.error, 'http_500');
  });

  it('flags non-object body as a parse error', () => {
    const out = parseUploadResponse(200, 'plain text instead of json');
    assert.equal(out.error, 'non-object response body');
  });

  it('flags missing data envelope on 2xx', () => {
    const out = parseUploadResponse(200, { meta: { ts: '', version: '1' } });
    assert.equal(out.error, 'missing data envelope');
  });

  it('handles non-string upload_id (defensive)', () => {
    const out = parseUploadResponse(200, {
      data: { upload_id: 12345, deduplicated: false },
    });
    // The defensive guard preserves null when the upload_id is not a
    // string — caller can still see the row was created (error=null,
    // status=200) but cannot reference it by id.
    assert.equal(out.uploadId, null);
    assert.equal(out.error, null);
  });
});
