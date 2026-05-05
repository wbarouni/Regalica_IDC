import { resolve } from 'node:path';

import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool } from 'pg';

import { logger } from '../logger.js';
import { getStatus } from '../db/migrator.js';
import { HTTP_OK, HTTP_INTERNAL_SERVER_ERROR } from '../lib/http.js';

/**
 * S1 L7 — `GET /api/health` (rich health check).
 *
 * Distinct from the legacy `GET /health` (apps/api/src/routes/health.ts)
 * which is mounted DB-less and only proves the process is up. This
 * route reports the structural state of the DB so a fresh-machine
 * `pnpm setup:dev` operator can verify in one curl that:
 *   - the migration runner has applied every file on disk
 *   - the dev tenant from migration 999 is present
 *   - the rules corpus seeded by 042 + promoted by 075/075a is active
 *
 * Returns 200 with the full payload when applied == expected;
 * 503 with the same payload + in_sync=false when they diverge.
 *
 * Shape (stable, mirrors the spec in the S1 chantier prompt):
 *   {
 *     status:                       'ok' | 'out_of_sync',
 *     schema_version:               '<latest applied filename>',
 *     applied_migrations_count:      number,
 *     expected_migrations_count:     number,
 *     in_sync:                      boolean,
 *     tenant_dev_present:           boolean,
 *     rules_active_count:           number
 *   }
 */

// Dev tenant id seeded by migration 999_seed_dev_tenant.sql. The
// health endpoint reads the tenant_dev_present boolean against this
// canonical UUID so a fresh-machine setup can confirm the seed
// migration actually ran (vs. silently no-opped due to a missing
// app.seed_dev_tenant GUC).
//
// nosemgrep: D-004-var-name-string-literal
const DEV_TENANT_ID = 'd3a7c6e6-2d18-4ff6-8183-94507eded6d7';

interface ApiHealthPayload {
  status: 'ok' | 'out_of_sync';
  schema_version: string | null;
  applied_migrations_count: number;
  expected_migrations_count: number;
  in_sync: boolean;
  tenant_dev_present: boolean;
  rules_active_count: number;
}

async function buildPayload(pool: Pool, migrationsDir: string): Promise<ApiHealthPayload> {
  const status = await getStatus({ migrationsDir });
  const expectedCount = status.applied.length + status.pending.length;
  const appliedCount = status.applied.length;
  const lastApplied = status.applied[status.applied.length - 1];
  const inSync = status.pending.length === 0;

  // tenant_dev_present + rules_active_count rely on tables created by
  // migrations 003/022; if the DB is at an earlier tier the queries
  // throw 42P01 and we surface the booleans as false / 0 instead of
  // crashing the health route.
  let tenantDevPresent = false;
  let rulesActiveCount = 0;
  try {
    const r = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM tenants WHERE id = $1::uuid AND is_active = TRUE
       ) AS exists`,
      [DEV_TENANT_ID],
    );
    tenantDevPresent = r.rows[0]?.exists === true;
  } catch (err) {
    logger.warn({ err }, '/api/health — tenant probe failed; reporting tenant_dev_present=false');
  }
  try {
    const r = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM rules
        WHERE status = 'active' AND deleted_at IS NULL`,
    );
    rulesActiveCount = Number.parseInt(r.rows[0]?.count ?? '0', 10);
  } catch (err) {
    logger.warn({ err }, '/api/health — rules probe failed; reporting rules_active_count=0');
  }

  return {
    status: inSync ? 'ok' : 'out_of_sync',
    schema_version: lastApplied !== undefined ? lastApplied.filename : null,
    applied_migrations_count: appliedCount,
    expected_migrations_count: expectedCount,
    in_sync: inSync,
    tenant_dev_present: tenantDevPresent,
    rules_active_count: rulesActiveCount,
  };
}

export function apiHealthRouter(pool: Pool): IRouter {
  const router = Router();
  // Resolve the migrations dir at module init from the API process'
  // cwd (same convention as apps/api/src/cli/migrate.ts). Tests
  // override via the factory's second argument.
  const migrationsDir = resolve(process.cwd(), 'migrations');

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const payload = await buildPayload(pool, migrationsDir);
      const httpStatus = payload.in_sync ? HTTP_OK : 503;
      res.status(httpStatus).json(payload);
    } catch (err) {
      logger.error({ err }, '/api/health failed');
      res.status(HTTP_INTERNAL_SERVER_ERROR).json({
        error: { code: 'HEALTH_CHECK_FAILED', message: 'unable to compute health payload' },
      });
    }
  });

  return router;
}

// Exported for tests.
export const __testing__ = { buildPayload, DEV_TENANT_ID };
