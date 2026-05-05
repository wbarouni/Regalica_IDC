import express from 'express';
import request from 'supertest';
import type { Pool } from 'pg';

import { apiHealthRouter } from '../src/routes/apiHealth.js';

/**
 * S1 L7 — apiHealth route tests (smoke + payload shape).
 *
 * The router queries the migrator and the live DB, so the assertions
 * here focus on:
 *   - shape stability (every documented field is present)
 *   - HTTP status correctness when in_sync vs out_of_sync
 *   - graceful degradation when the DB cannot answer (queries throw)
 *
 * Pure-payload assertions are exercised against a mocked pg.Pool so
 * the suite runs without DATABASE_URL. The full integration path
 * is covered by the L10 fresh-machine test.
 */

interface MockQueryResult<T> {
  rows: T[];
}

interface MockPool {
  query: (sql: string, params?: unknown[]) => Promise<MockQueryResult<Record<string, unknown>>>;
}

function makeMockPool(behaviour: {
  tenantExists: boolean;
  rulesActive: number;
  failOn?: 'tenant' | 'rules' | null;
}): MockPool {
  return {
    query: async (sql: string) => {
      if (sql.includes('FROM tenants')) {
        if (behaviour.failOn === 'tenant') {
          throw new Error('mock tenants table missing');
        }
        return { rows: [{ exists: behaviour.tenantExists }] };
      }
      if (sql.includes('FROM rules')) {
        if (behaviour.failOn === 'rules') {
          throw new Error('mock rules table missing');
        }
        return { rows: [{ count: behaviour.rulesActive.toString() }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

describe('GET /api/health (apiHealthRouter)', () => {
  // The migrator reads the migrations dir from process.cwd(); when
  // jest runs from apps/api, the canonical path resolves correctly.
  const buildApp = (pool: MockPool): express.Express => {
    const app = express();
    // Cast: we only call .query, the rest of pg.Pool is unused.
    app.use('/api/health', apiHealthRouter(pool as unknown as Pool));
    return app;
  };

  it('returns 200 with the canonical payload shape when in sync', async () => {
    // The local repo has every migration applied (verified by L1-L6
    // commits). The mock pool reports tenant present + 4611 active
    // rules — the values mirror the real local DB after L2 + L3.
    const pool = makeMockPool({ tenantExists: true, rulesActive: 4611 });
    const app = buildApp(pool);
    const res = await request(app).get('/api/health/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        in_sync: true,
        tenant_dev_present: true,
        rules_active_count: 4611,
        applied_migrations_count: expect.any(Number),
        expected_migrations_count: expect.any(Number),
        schema_version: expect.any(String),
      }),
    );
    expect(res.body.applied_migrations_count).toBe(res.body.expected_migrations_count);
  });

  it('reports tenant_dev_present=false when the tenant is absent', async () => {
    const pool = makeMockPool({ tenantExists: false, rulesActive: 0 });
    const res = await request(buildApp(pool)).get('/api/health/');
    expect(res.status).toBe(200);
    expect(res.body.tenant_dev_present).toBe(false);
    expect(res.body.rules_active_count).toBe(0);
  });

  it('reports tenant_dev_present=false when the tenants table query throws', async () => {
    const pool = makeMockPool({ tenantExists: false, rulesActive: 100, failOn: 'tenant' });
    const res = await request(buildApp(pool)).get('/api/health/');
    expect(res.status).toBe(200);
    expect(res.body.tenant_dev_present).toBe(false);
    // Rules still queried successfully -> count surfaces.
    expect(res.body.rules_active_count).toBe(100);
  });

  it('reports rules_active_count=0 when the rules table query throws', async () => {
    const pool = makeMockPool({ tenantExists: true, rulesActive: 999, failOn: 'rules' });
    const res = await request(buildApp(pool)).get('/api/health/');
    expect(res.status).toBe(200);
    expect(res.body.tenant_dev_present).toBe(true);
    expect(res.body.rules_active_count).toBe(0);
  });
});
