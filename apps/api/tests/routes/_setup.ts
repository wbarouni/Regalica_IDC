import { Pool, type PoolClient } from 'pg';
import type { Express } from 'express';

import { createApp } from '../../src/app.js';
import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from '../migrations/_setup.js';

/**
 * Shared bootstrap for route integration tests.
 *
 * `setupMigrationsSchema` (from tests/migrations/_setup.ts) creates a
 * throwaway schema, applies migrations 1..lastMigrationId, and exposes a
 * `testPool`. The route handlers we are testing read tables via fresh
 * `pool.connect()` calls; without a per-connection `search_path` override
 * those connections would default to `public` and miss our test schema.
 *
 * To bridge that, we build a NEW pool here whose `connect` listener pins
 * `search_path` to the test schema, and we hand that pool to `createApp`.
 */
export interface RoutesTestContext extends MigrationsTestContext {
  app: Express;
  routesPool: Pool;
  tenantId: string;
  userId: string;
}

export async function setupRoutesContext(lastMigrationId = 47): Promise<RoutesTestContext> {
  const ctx = await setupMigrationsSchema(lastMigrationId);

  const t = await ctx.testPool.query<{ id: string }>(
    `INSERT INTO tenants (slug, legal_name)
       VALUES ('tenant-test-routes', 'Legal Routes') RETURNING id`,
  );
  const tenantId = t.rows[0]!.id;

  const u = await ctx.testPool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
       VALUES ($1, 'sso-routes', 'routes@tenant-001.example', 'Routes User')
       RETURNING id`,
    [tenantId],
  );
  const userId = u.rows[0]!.id;

  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is required for route integration tests');
  }
  const routesPool = new Pool({ connectionString: url });
  routesPool.on('connect', (client: PoolClient) => {
    void client.query(`SET search_path TO ${ctx.schemaName}, public`);
  });

  const app = createApp(routesPool);

  return { ...ctx, app, routesPool, tenantId, userId };
}

export async function teardownRoutesContext(ctx: RoutesTestContext): Promise<void> {
  await ctx.routesPool.end();
  await teardownMigrationsSchema(ctx);
}
