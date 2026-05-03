import jwt from 'jsonwebtoken';
import request from 'supertest';

import { config } from '../../src/config.js';
import { loadSeverityThreshold, mapSeverity } from '../../src/routes/engine.js';
import { clearPlatformConfigCache } from '../../src/lib/platformConfig.js';
import { logger } from '../../src/logger.js';

import { setupRoutesContext, teardownRoutesContext, type RoutesTestContext } from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

function engineToken(tenantId: string): string {
  const secret = config.jwt.secret;
  if (secret === undefined) {
    throw new Error('JWT_SECRET must be set in test env');
  }
  return jwt.sign({ role: 'regflow_engine', tenant_id: tenantId }, secret);
}

// ---------------------------------------------------------------------------
// Pure unit tests — mapSeverity is the canonical translator from the
// engine's severe/rounding enum to the REGFlow front-facing
// BLOQUANT/MAJEUR/MINEUR taxonomy.
// ---------------------------------------------------------------------------

describe('mapSeverity (pure helper)', () => {
  it('returns null when engine severity is null', () => {
    expect(mapSeverity(null, 0.5, 0.1)).toBeNull();
    expect(mapSeverity(null, null, 0.1)).toBeNull();
  });

  it('returns MINEUR for any rounding fail regardless of gap_relative', () => {
    expect(mapSeverity('rounding', 0.5, 0.1)).toBe('MINEUR');
    expect(mapSeverity('rounding', null, 0.1)).toBe('MINEUR');
    expect(mapSeverity('rounding', 0, 0.1)).toBe('MINEUR');
  });

  it('returns MAJEUR when severe and |gap_relative| is below the threshold', () => {
    expect(mapSeverity('severe', 0.05, 0.1)).toBe('MAJEUR');
    expect(mapSeverity('severe', -0.05, 0.1)).toBe('MAJEUR');
  });

  it('returns BLOQUANT when severe and |gap_relative| strictly exceeds the threshold', () => {
    expect(mapSeverity('severe', 0.15, 0.1)).toBe('BLOQUANT');
    expect(mapSeverity('severe', -0.15, 0.1)).toBe('BLOQUANT');
  });

  it('returns MAJEUR when severe and gap_relative equals the threshold (strict greater-than)', () => {
    expect(mapSeverity('severe', 0.1, 0.1)).toBe('MAJEUR');
    expect(mapSeverity('severe', -0.1, 0.1)).toBe('MAJEUR');
  });

  it('returns MAJEUR when severe and gap_relative is null (treated as zero)', () => {
    expect(mapSeverity('severe', null, 0.1)).toBe('MAJEUR');
  });
});

// ---------------------------------------------------------------------------
// loadSeverityThreshold — exercises the platform_config loader path with
// the real DB (DATABASE_URL required); the helper is also documented
// to fall back to 0.10 + log.warn when the row is missing.
// ---------------------------------------------------------------------------

describeIfDb('loadSeverityThreshold (DB-backed)', () => {
  let ctx: RoutesTestContext;

  beforeAll(async () => {
    ctx = await setupRoutesContext(71);
  }, 120000);

  afterAll(async () => {
    await teardownRoutesContext(ctx);
  });

  beforeEach(() => {
    clearPlatformConfigCache();
  });

  it('reads the seeded threshold value (0.10) from platform_config', async () => {
    const value = await loadSeverityThreshold(ctx.testPool);
    expect(value).toBe(0.1);
  });

  it('falls back to 0.10 and logs a warning when the key is missing', async () => {
    // Drop the seeded row so the loader hits the missing-key branch.
    await ctx.testPool.query(
      `DELETE FROM platform_config WHERE config_key = 'severity_gap_relative_threshold'`,
    );
    clearPlatformConfigCache();

    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      const value = await loadSeverityThreshold(ctx.testPool);
      expect(value).toBe(0.1);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      // Re-seed for any subsequent test that may share this schema.
      await ctx.testPool.query(
        `INSERT INTO platform_config (config_key, config_value, description)
         VALUES ('severity_gap_relative_threshold', '0.1'::jsonb, 're-seeded for tests')
         ON CONFLICT (config_key) DO NOTHING`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// HTTP route — exercises the auth/validation/data-presence boundaries.
// The full evaluation pipeline (parseBatch + loadRules + runEvaluation)
// is exercised by the C18 E2E test on the golden fixtures; here we only
// guarantee the contract surface of the route itself.
// ---------------------------------------------------------------------------

describeIfDb('routes — engine /runs/:runId/evaluate', () => {
  let ctx: RoutesTestContext;
  const fakeRunId = '00000000-0000-7000-8000-000000000000';

  beforeAll(async () => {
    ctx = await setupRoutesContext(71);
  }, 120000);

  afterAll(async () => {
    await teardownRoutesContext(ctx);
  });

  it('rejects without Authorization header (401 MISSING_BEARER)', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${fakeRunId}/evaluate`)
      .send({ arrete_date: '2026-02-28' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_BEARER');
  });

  it('rejects without arrete_date (400 INVALID_ARRETE_DATE)', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${fakeRunId}/evaluate`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ARRETE_DATE');
  });

  it('rejects malformed arrete_date (400 INVALID_ARRETE_DATE)', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${fakeRunId}/evaluate`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send({ arrete_date: '28/02/2026' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ARRETE_DATE');
  });

  it('rejects malformed runId (400 INVALID_RUN_ID)', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/runs/not-a-uuid/evaluate`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send({ arrete_date: '2026-02-28' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RUN_ID');
  });

  it('returns 404 RUN_XML_NOT_FOUND when no xml_uploads attached to the run', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${fakeRunId}/evaluate`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send({ arrete_date: '2026-02-28' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RUN_XML_NOT_FOUND');
  });
});
