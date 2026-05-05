import express from 'express';
import request from 'supertest';
import type { Pool } from 'pg';

import { apiHealthRouter, type MigratorStatusProbe } from '../src/routes/apiHealth.js';
import type { MigrationFile, MigratorStatus } from '../src/db/migrator.js';

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
  // S1 L7 — synthesise a deterministic migrator status so the suite
  // does not depend on a real migrations directory or schema_migrations
  // row set. The integration path is covered by the L10 fresh-machine
  // test against a fully migrated DB.
  const makeStatusProbe = (
    appliedCount: number,
    pendingCount: number,
    lastFilename = '075a_backdate_rules_valid_from.sql',
  ): MigratorStatusProbe => {
    return async () => {
      const applied: MigratorStatus['applied'] = Array.from({ length: appliedCount }, (_, i) => {
        const filename =
          i === appliedCount - 1 ? lastFilename : `${String(i).padStart(3, '0')}_x.sql`;
        return {
          id: String(i),
          filename,
          checksum: 'deadbeef',
          appliedAt: new Date(0),
        };
      });
      const pending: MigratorStatus['pending'] = Array.from(
        { length: pendingCount },
        (_, i): MigrationFile => ({
          id: String(appliedCount + i),
          filename: `${String(appliedCount + i).padStart(3, '0')}_pending.sql`,
          fullPath: `/dev/null/${appliedCount + i}_pending.sql`,
          content: '',
          checksum: 'deadbeef',
          noTransaction: false,
          gucGated: false,
        }),
      );
      return { applied, pending, drifted: [] };
    };
  };

  const buildApp = (pool: MockPool, statusProbe: MigratorStatusProbe): express.Express => {
    const app = express();
    // Cast: we only call .query, the rest of pg.Pool is unused.
    app.use('/api/health', apiHealthRouter(pool as unknown as Pool, { statusProbe }));
    return app;
  };

  it('returns 200 with the canonical payload shape when in sync', async () => {
    // 88 applied / 0 pending mirrors the real local DB after L2 + L3
    // (87 base migrations + 037a_seed_dev_tenant.sql, the seed which
    // L10 fix #3 renumbered from 999 to 037a so it lands before the
    // FK-dependent referential seeds). The mock pool reports tenant
    // present + 4611 active rules.
    const pool = makeMockPool({ tenantExists: true, rulesActive: 4611 });
    const app = buildApp(pool, makeStatusProbe(88, 0));
    const res = await request(app).get('/api/health/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        in_sync: true,
        tenant_dev_present: true,
        rules_active_count: 4611,
        applied_migrations_count: 88,
        expected_migrations_count: 88,
        schema_version: '075a_backdate_rules_valid_from.sql',
      }),
    );
  });

  it('returns 503 with status=out_of_sync when migrations are pending', async () => {
    const pool = makeMockPool({ tenantExists: true, rulesActive: 4611 });
    const app = buildApp(pool, makeStatusProbe(85, 3));
    const res = await request(app).get('/api/health/');
    expect(res.status).toBe(503);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'out_of_sync',
        in_sync: false,
        applied_migrations_count: 85,
        expected_migrations_count: 88,
      }),
    );
  });

  it('reports tenant_dev_present=false when the tenant is absent', async () => {
    const pool = makeMockPool({ tenantExists: false, rulesActive: 0 });
    const res = await request(buildApp(pool, makeStatusProbe(88, 0))).get('/api/health/');
    expect(res.status).toBe(200);
    expect(res.body.tenant_dev_present).toBe(false);
    expect(res.body.rules_active_count).toBe(0);
  });

  it('reports tenant_dev_present=false when the tenants table query throws', async () => {
    const pool = makeMockPool({ tenantExists: false, rulesActive: 100, failOn: 'tenant' });
    const res = await request(buildApp(pool, makeStatusProbe(88, 0))).get('/api/health/');
    expect(res.status).toBe(200);
    expect(res.body.tenant_dev_present).toBe(false);
    // Rules still queried successfully -> count surfaces.
    expect(res.body.rules_active_count).toBe(100);
  });

  it('reports rules_active_count=0 when the rules table query throws', async () => {
    const pool = makeMockPool({ tenantExists: true, rulesActive: 999, failOn: 'rules' });
    const res = await request(buildApp(pool, makeStatusProbe(88, 0))).get('/api/health/');
    expect(res.status).toBe(200);
    expect(res.body.tenant_dev_present).toBe(true);
    expect(res.body.rules_active_count).toBe(0);
  });
});
