import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool } from 'pg';

import { handleDbError } from '../db/errors.js';
import { getPlatformConfigNumber } from '../lib/platformConfig.js';
import { subscribeRunEvents } from '../lib/runEventBus.js';
import { withConnection } from '../db/withConnection.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RunAgentStepRow {
  id: string;
  agent_type: string;
  function_name: string;
  ordinal: number;
  status: string;
  duration_ms: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  error_message: string | null;
}

function toAgentStepDto(r: RunAgentStepRow): {
  id: string;
  agentType: string;
  functionName: string;
  ordinal: number;
  status: string;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
} {
  return {
    id: r.id,
    agentType: r.agent_type,
    functionName: r.function_name,
    ordinal: r.ordinal,
    status: r.status,
    durationMs: r.duration_ms,
    startedAt: r.started_at !== null ? r.started_at.toISOString() : null,
    completedAt: r.completed_at !== null ? r.completed_at.toISOString() : null,
    errorMessage: r.error_message,
  };
}

/**
 * Mounted at /api/tenants/:tenantId — assumes authMiddleware +
 * tenantMiddleware have already populated res.locals['userId'] and
 * validated `:tenantId` as a UUID.
 *
 * Route inventory (Doc 6 §11, §12 / Phase 4):
 *   GET  /runs/current
 *   GET  /runs/:runId/summary
 *   GET  /runs/:runId/agents      -> Phase B (run_agent_steps + lazy init)
 *   GET  /runs/:runId/stream      -> Phase B (SSE relay over runEventBus)
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
      res.json({
        data: rows[0] ?? null,
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

  router.get('/runs/:runId/agents', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const runId = req.params['runId'] as string;
    const userId = res.locals['userId'] as string;
    if (!UUID_RE.test(runId)) {
      res.status(400).json({
        error: { code: 'INVALID_RUN_ID', message: 'runId must be a valid UUID' },
      });
      return;
    }
    try {
      const dto = await withConnection(pool, { tenantId, userId }, async (client) => {
        // Verify the run belongs to this tenant before any read on
        // run_agent_steps. RLS would also stop a cross-tenant query
        // but checking the run row first lets us return 404 with a
        // domain code instead of an empty array.
        const runQ = await client.query<{ id: string }>(
          `SELECT id FROM validation_runs WHERE id = $1 AND tenant_id = $2`,
          [runId, tenantId],
        );
        if (runQ.rows.length === 0) {
          return null;
        }

        const existing = await client.query<RunAgentStepRow>(
          `SELECT id, agent_type, function_name, ordinal, status,
                  duration_ms, started_at, completed_at, error_message
           FROM run_agent_steps
           WHERE run_id = $1 AND deleted_at IS NULL
           ORDER BY ordinal`,
          [runId],
        );
        if (existing.rows.length > 0) {
          return existing.rows.map(toAgentStepDto);
        }

        // Lazy initialise the timeline from the active prompt_bank.
        // The pipeline ordinal is alphabetical-stable per (agent_type,
        // function_name) — chatbot-py owns the canonical ordering and
        // will overwrite this default the first time it transitions a
        // step to 'current'.
        await client.query(
          `INSERT INTO run_agent_steps
             (run_id, tenant_id, agent_type, function_name, ordinal, status)
           SELECT
             $1, $2, agent_type, function_name,
             ROW_NUMBER() OVER (ORDER BY agent_type, function_name)::SMALLINT AS ordinal,
             'pending'
           FROM prompt_bank
           WHERE status = 'active'
           ORDER BY agent_type, function_name
           ON CONFLICT (run_id, agent_type, function_name) DO NOTHING`,
          [runId, tenantId],
        );

        const after = await client.query<RunAgentStepRow>(
          `SELECT id, agent_type, function_name, ordinal, status,
                  duration_ms, started_at, completed_at, error_message
           FROM run_agent_steps
           WHERE run_id = $1 AND deleted_at IS NULL
           ORDER BY ordinal`,
          [runId],
        );
        return after.rows.map(toAgentStepDto);
      });
      if (dto === null) {
        res.status(404).json({
          error: { code: 'RUN_NOT_FOUND', message: 'Run not found' },
        });
        return;
      }
      res.json({
        data: { steps: dto },
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  router.get('/runs/:runId/stream', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const runId = req.params['runId'] as string;
    const userId = res.locals['userId'] as string;
    if (!UUID_RE.test(runId)) {
      res.status(400).json({
        error: { code: 'INVALID_RUN_ID', message: 'runId must be a valid UUID' },
      });
      return;
    }

    // Tenant ownership check before opening the long-lived stream.
    // We exit the transaction immediately; the stream itself does not
    // need a DB session.
    let runExists = false;
    try {
      runExists = await withConnection(pool, { tenantId, userId }, async (client) => {
        const r = await client.query<{ id: string }>(
          `SELECT id FROM validation_runs WHERE id = $1 AND tenant_id = $2`,
          [runId, tenantId],
        );
        return r.rows.length > 0;
      });
    } catch (err) {
      handleDbError(err, res);
      return;
    }
    if (!runExists) {
      res.status(404).json({
        error: { code: 'RUN_NOT_FOUND', message: 'Run not found' },
      });
      return;
    }

    let heartbeatMs: number;
    try {
      heartbeatMs = await getPlatformConfigNumber(pool, 'sse_heartbeat_ms');
    } catch (err) {
      handleDbError(err, res);
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let eventId = 0;
    const writeFrame = (type: string, payload: unknown): void => {
      eventId += 1;
      res.write(`id: ${String(eventId)}\n`);
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // Initial sync frame so the client can confirm subscription.
    writeFrame('subscribed', { runId });

    const unsubscribe = subscribeRunEvents(runId, (event) => {
      writeFrame(event.type, event.payload);
    });

    const heartbeat = setInterval(() => {
      // SSE comment line — keeps proxies and browsers from timing out
      // an otherwise idle connection. Not delivered as a custom event.
      res.write(`: ping ${String(Date.now())}\n\n`);
    }, heartbeatMs);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
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
