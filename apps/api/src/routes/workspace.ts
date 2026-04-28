import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool } from 'pg';

import { handleDbError } from '../db/errors.js';
import { withConnection } from '../db/withConnection.js';

/**
 * Mounted at /api/tenants/:tenantId — assumes authMiddleware +
 * tenantMiddleware have already populated res.locals['userId'] and
 * validated `:tenantId` as a UUID.
 *
 * Route inventory (Doc 6 §11, §12 / Phase 4):
 *   GET  /runs/current
 *   GET  /runs/:runId/summary
 *   GET  /runs/:runId/agents      -> 501 (run_agent_steps absent)
 *   GET  /runs/:runId/fails       -> filter all|fail|rounding ; pass=400
 */
export function workspaceRouter(pool: Pool): IRouter {
  const router = Router({ mergeParams: true });

  router.get('/runs/current', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    try {
      const rows = await withConnection(pool, { tenantId, userId }, async (client) => {
        const r = await client.query(
          `SELECT
             id                     AS run_id,
             batch_label,
             primary_annexe_code,
             arrete_date,
             status,
             conformity_rate,
             total_rules_evaluated,
             total_pass,
             total_fail_severe,
             total_fail_rounding,
             execution_time_ms,
             step1_xsd_status,
             step2_embedded_status,
             step3_rdg_status,
             initiated_at,
             completed_at
           FROM validation_runs
           WHERE tenant_id = $1
             AND status IN ('running', 'completed')
           ORDER BY initiated_at DESC
           LIMIT 1`,
          [tenantId],
        );
        return r.rows;
      });
      if (rows.length === 0) {
        res.status(404).json({
          error: { code: 'NO_ACTIVE_RUN', message: 'No active run found' },
        });
        return;
      }
      res.json({
        data: rows[0],
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  router.get('/runs/:runId/summary', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const runId = req.params['runId'] as string;
    const userId = res.locals['userId'] as string;
    try {
      const data = await withConnection(pool, { tenantId, userId }, async (client) => {
        const runQ = await client.query(
          `SELECT
             id AS run_id, batch_label, primary_annexe_code,
             arrete_date, status, conformity_rate,
             total_rules_evaluated, total_pass,
             total_fail_severe, total_fail_rounding,
             execution_time_ms, initiated_at, completed_at,
             step1_xsd_status, step2_embedded_status, step3_rdg_status,
             synthesis_artifact, deliverable_c_artifact
           FROM validation_runs
           WHERE id = $1 AND tenant_id = $2`,
          [runId, tenantId],
        );
        if (runQ.rows.length === 0) {
          return null;
        }
        // PASS verdicts are NOT persisted (validation_fail_details only
        // stores 'severe' and 'rounding' rows). The breakdown below
        // therefore reports FAIL counts per annexe only; aggregate PASS
        // totals live on validation_runs.total_pass.
        const annexQ = await client.query(
          `SELECT
             ax_term                                       AS code,
             COUNT(*) FILTER (WHERE severity = 'severe')   AS fail_severe,
             COUNT(*) FILTER (WHERE severity = 'rounding') AS fail_rounding,
             COUNT(*)                                      AS total_fail
           FROM validation_fail_details
           WHERE validation_run_id = $1
           GROUP BY ax_term
           ORDER BY ax_term`,
          [runId],
        );
        return { run: runQ.rows[0], annexes: annexQ.rows };
      });
      if (data === null) {
        res.status(404).json({ error: { code: 'RUN_NOT_FOUND', message: 'Run not found' } });
        return;
      }
      res.json({
        data,
        meta: {
          ts: new Date().toISOString(),
          version: '1',
          pass_per_annexe_available: false,
        },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  router.get('/runs/:runId/agents', (_req: Request, res: Response) => {
    res.status(501).json({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Agent step tracking table not yet implemented',
      },
    });
  });

  router.get('/runs/:runId/fails', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const runId = req.params['runId'] as string;
    const userId = res.locals['userId'] as string;
    const filter = typeof req.query['filter'] === 'string' ? req.query['filter'] : 'all';
    if (filter === 'pass') {
      res.status(400).json({
        error: {
          code: 'FILTER_NOT_SUPPORTED',
          message: 'PASS verdicts are not persisted by design',
        },
      });
      return;
    }
    const pageStr = typeof req.query['page'] === 'string' ? req.query['page'] : '1';
    const limitStr = typeof req.query['limit'] === 'string' ? req.query['limit'] : '50';
    const page = Math.max(1, Number.parseInt(pageStr, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(limitStr, 10) || 50));
    const offset = (page - 1) * limit;
    const severityFilter =
      filter === 'fail'
        ? "AND vfd.severity = 'severe'"
        : filter === 'rounding'
          ? "AND vfd.severity = 'rounding'"
          : '';
    try {
      const data = await withConnection(pool, { tenantId, userId }, async (client) => {
        const rows = await client.query(
          `SELECT
             vfd.id,
             vfd.ax_term,
             vfd.num_regle,
             r.operator         AS operateur,
             r.natural_language AS regle_label,
             vfd.severity,
             vfd.expected_value,
             vfd.computed_value,
             vfd.gap_absolute,
             vfd.gap_relative,
             vfd.cluster_id,
             vfd.is_sentinel_iteration,
             vfd.iteration_index,
             vfd.created_at
           FROM validation_fail_details vfd
           JOIN rules r ON r.id = vfd.rule_id
           WHERE vfd.validation_run_id = $1
             ${severityFilter}
           ORDER BY
             CASE vfd.severity
               WHEN 'severe'   THEN 1
               WHEN 'rounding' THEN 2
               ELSE 3
             END,
             vfd.ax_term, vfd.num_regle
           LIMIT $2 OFFSET $3`,
          [runId, limit, offset],
        );
        const cnt = await client.query(
          `SELECT COUNT(*)::int AS total
           FROM validation_fail_details vfd
           WHERE vfd.validation_run_id = $1 ${severityFilter}`,
          [runId],
        );
        return { rows: rows.rows, total: (cnt.rows[0] as { total: number }).total };
      });
      res.json({
        data: data.rows,
        meta: {
          ts: new Date().toISOString(),
          version: '1',
          page,
          limit,
          total: data.total,
          pass_persisted: false,
        },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  return router;
}
