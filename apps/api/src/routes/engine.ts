import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

import { handleDbError } from '../db/errors.js';
import { engineAuthMiddleware } from '../middleware/engineAuth.js';
import { withConnection } from '../db/withConnection.js';

/**
 * /api/engine/...
 *
 * Service-to-service routes called by chatbot-py and the validation
 * engine. Mounted OUTSIDE the user authMiddleware chain (which
 * requires an X-User-Id header that the engine does not produce).
 * Auth is exclusively engineAuthMiddleware: HS256 JWT signed with the
 * shared JWT_SECRET, role claim must equal "regflow_engine".
 *
 * tenant_id flows through the JWT payload — the engine signs the
 * token with the tenant it is acting on. The handler reads it from
 * res.locals['enginePayloadTenantId'].
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const failDetailItem = z.object({
  rule_id: z.string().regex(UUID_RE),
  ax_term: z.string().min(1).max(10),
  num_regle: z.number().int(),
  is_sentinel_iteration: z.boolean().optional(),
  iteration_index: z.number().int().nullable().optional(),
  iteration_xpath: z.string().nullable().optional(),
  iteration_label: z.string().nullable().optional(),
  severity: z.enum(['severe', 'rounding']),
  expected_value: z.number().nullable().optional(),
  computed_value: z.number().nullable().optional(),
  gap_absolute: z.number().nullable().optional(),
  gap_relative: z.number().nullable().optional(),
  calculation_trace: z.unknown(),
});

const failDetailsBody = z.object({
  items: z.array(failDetailItem).min(1),
});

export function engineRouter(pool: Pool): IRouter {
  const router = Router();

  // engineAuthMiddleware sits at the router level so every endpoint
  // below inherits it without per-route boilerplate.
  router.use(engineAuthMiddleware);

  router.post('/runs/:runId/fail-details', async (req: Request, res: Response) => {
    const runId = req.params['runId'];
    const tenantId = res.locals['enginePayloadTenantId'] as string | undefined;
    if (typeof runId !== 'string' || !UUID_RE.test(runId)) {
      res.status(400).json({
        error: { code: 'INVALID_RUN_ID', message: 'runId must be a UUID' },
      });
      return;
    }
    if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
      res.status(400).json({
        error: {
          code: 'MISSING_TENANT_CLAIM',
          message: 'JWT payload must include a UUID `tenant_id` claim',
        },
      });
      return;
    }
    const parsed = failDetailsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'INVALID_BODY', message: parsed.error.issues[0]?.message ?? 'invalid' },
      });
      return;
    }
    const items = parsed.data.items;
    try {
      const inserted = await withConnection(
        pool,
        { tenantId, userId: tenantId },
        async (client) => {
          const runRow = await client.query<{ id: string }>(
            `SELECT id FROM validation_runs WHERE id = $1 AND tenant_id = $2`,
            [runId, tenantId],
          );
          if (runRow.rows.length === 0) {
            return null;
          }
          let count = 0;
          for (const item of items) {
            await client.query(
              `INSERT INTO validation_fail_details
                 (tenant_id, validation_run_id, rule_id, ax_term, num_regle,
                  is_sentinel_iteration, iteration_index, iteration_xpath,
                  iteration_label, severity, expected_value, computed_value,
                  gap_absolute, gap_relative, calculation_trace)
               VALUES
                 ($1, $2, $3, $4, $5,
                  COALESCE($6, FALSE), $7, $8,
                  $9, $10, $11, $12,
                  $13, $14, $15::jsonb)`,
              [
                tenantId,
                runId,
                item.rule_id,
                item.ax_term,
                item.num_regle,
                item.is_sentinel_iteration ?? false,
                item.iteration_index ?? null,
                item.iteration_xpath ?? null,
                item.iteration_label ?? null,
                item.severity,
                item.expected_value ?? null,
                item.computed_value ?? null,
                item.gap_absolute ?? null,
                item.gap_relative ?? null,
                JSON.stringify(item.calculation_trace ?? {}),
              ],
            );
            count += 1;
          }
          return count;
        },
      );
      if (inserted === null) {
        res.status(404).json({
          error: { code: 'RUN_NOT_FOUND', message: 'run not found for tenant' },
        });
        return;
      }
      res.status(201).json({
        data: { inserted },
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  return router;
}
