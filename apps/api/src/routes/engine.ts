import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

import { handleDbError } from '../db/errors.js';
import { emitAgentStep } from '../lib/runEventBus.js';
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

const agentStepUpdateBody = z.object({
  status: z.enum(['current', 'done', 'error']),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
});

// messages.role enum (migration 032). The engine writes assistant /
// system payloads only — user messages flow through the regular
// /chat/message route. Map the small public role -> the strict DB
// enum so the API surface stays clean.
const ENGINE_ROLE_TO_DB: Record<string, string> = {
  assistant: 'regalica_response',
  system: 'system_notification',
};

const messageBody = z.object({
  tenant_id: z.string().regex(UUID_RE),
  run_id: z.string().regex(UUID_RE).optional(),
  role: z.enum(['assistant', 'system']).default('assistant'),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  produced_by_agent: z.string().max(50).optional(),
});

interface AgentStepRow {
  id: string;
  run_id: string;
  agent_type: string;
  function_name: string;
  ordinal: number;
  status: string;
  duration_ms: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  error_message: string | null;
}

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

  // -------------------------------------------------------------------
  // POST /runs/:runId/agent-steps/:stepId
  //
  // Called by chatbot-py after each T0/T1 step transition. Updates
  // run_agent_steps + emits the matching SSE frame via runEventBus so
  // the workspace ribbon animates in real time. duration_ms is GENERATED
  // ALWAYS STORED on the column — no app-side arithmetic.
  // -------------------------------------------------------------------
  router.post('/runs/:runId/agent-steps/:stepId', async (req: Request, res: Response) => {
    const runId = req.params['runId'];
    const stepId = req.params['stepId'];
    const tenantId = res.locals['enginePayloadTenantId'] as string | undefined;
    if (typeof runId !== 'string' || !UUID_RE.test(runId)) {
      res.status(400).json({
        error: { code: 'INVALID_RUN_ID', message: 'runId must be a UUID' },
      });
      return;
    }
    if (typeof stepId !== 'string' || !UUID_RE.test(stepId)) {
      res.status(400).json({
        error: { code: 'INVALID_STEP_ID', message: 'stepId must be a UUID' },
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
    const parsed = agentStepUpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_BODY',
          message: parsed.error.issues[0]?.message ?? 'invalid',
        },
      });
      return;
    }
    const { status, startedAt, completedAt, errorMessage } = parsed.data;

    try {
      const updated = await withConnection(pool, { tenantId, userId: tenantId }, async (client) => {
        const ownership = await client.query<{ id: string }>(
          `SELECT s.id
               FROM run_agent_steps s
               JOIN validation_runs r ON r.id = s.run_id
               WHERE s.id = $1 AND s.run_id = $2 AND r.tenant_id = $3
                 AND s.deleted_at IS NULL`,
          [stepId, runId, tenantId],
        );
        if (ownership.rows.length === 0) {
          return null;
        }
        const r = await client.query<AgentStepRow>(
          `UPDATE run_agent_steps
               SET status        = $1,
                   started_at    = COALESCE($2::timestamptz, started_at),
                   completed_at  = COALESCE($3::timestamptz, completed_at),
                   error_message = $4,
                   updated_at    = NOW()
               WHERE id = $5
               RETURNING id, run_id, agent_type, function_name,
                         ordinal, status, duration_ms,
                         started_at, completed_at, error_message`,
          [status, startedAt ?? null, completedAt ?? null, errorMessage ?? null, stepId],
        );
        return r.rows[0] ?? null;
      });
      if (updated === null) {
        res.status(404).json({
          error: {
            code: 'STEP_NOT_FOUND',
            message: 'agent step not found for run + tenant',
          },
        });
        return;
      }

      emitAgentStep(runId, {
        stepId: updated.id,
        agentType: updated.agent_type,
        functionName: updated.function_name,
        status: updated.status as 'pending' | 'current' | 'done' | 'error',
        ordinal: updated.ordinal,
        durationMs: updated.duration_ms,
      });

      res.status(200).json({
        data: {
          id: updated.id,
          agentType: updated.agent_type,
          functionName: updated.function_name,
          ordinal: updated.ordinal,
          status: updated.status,
          durationMs: updated.duration_ms,
          startedAt: updated.started_at !== null ? updated.started_at.toISOString() : null,
          completedAt: updated.completed_at !== null ? updated.completed_at.toISOString() : null,
          errorMessage: updated.error_message,
        },
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  // -------------------------------------------------------------------
  // POST /conversations/:conversationId/messages
  //
  // Called by chatbot-py to persist a Regalica-produced message that
  // didn't transit through the standard /chat/message route — typically
  // the T0 briefing produced by /upload after the deterministic agents
  // succeed. The route assigns the next sequence_number atomically and
  // maps the wire role -> the strict DB enum.
  // -------------------------------------------------------------------
  router.post('/conversations/:conversationId/messages', async (req: Request, res: Response) => {
    const conversationId = req.params['conversationId'];
    const claimTenantId = res.locals['enginePayloadTenantId'] as string | undefined;
    if (typeof conversationId !== 'string' || !UUID_RE.test(conversationId)) {
      res.status(400).json({
        error: {
          code: 'INVALID_CONVERSATION_ID',
          message: 'conversationId must be a UUID',
        },
      });
      return;
    }
    if (typeof claimTenantId !== 'string' || !UUID_RE.test(claimTenantId)) {
      res.status(400).json({
        error: {
          code: 'MISSING_TENANT_CLAIM',
          message: 'JWT payload must include a UUID `tenant_id` claim',
        },
      });
      return;
    }
    const parsed = messageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_BODY',
          message: parsed.error.issues[0]?.message ?? 'invalid',
        },
      });
      return;
    }
    const body = parsed.data;
    if (body.tenant_id !== claimTenantId) {
      res.status(403).json({
        error: {
          code: 'TENANT_MISMATCH',
          message: 'body tenant_id must match JWT tenant_id claim',
        },
      });
      return;
    }
    const dbRole = ENGINE_ROLE_TO_DB[body.role];
    if (dbRole === undefined) {
      res.status(400).json({
        error: { code: 'INVALID_ROLE', message: `unknown role ${body.role}` },
      });
      return;
    }

    try {
      const created = await withConnection(
        pool,
        { tenantId: claimTenantId, userId: claimTenantId },
        async (client) => {
          const conv = await client.query<{ id: string }>(
            `SELECT id FROM conversations
               WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
            [conversationId, claimTenantId],
          );
          if (conv.rows.length === 0) {
            return null;
          }
          const seqRow = await client.query<{ next_seq: number }>(
            `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq
               FROM messages WHERE conversation_id = $1`,
            [conversationId],
          );
          const nextSeq = seqRow.rows[0]?.next_seq ?? 1;
          const ins = await client.query<{ id: string; created_at: Date }>(
            `INSERT INTO messages
                 (tenant_id, conversation_id, sequence_number, role,
                  content_markdown, content_json, produced_by_agent)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
               RETURNING id, created_at`,
            [
              claimTenantId,
              conversationId,
              nextSeq,
              dbRole,
              body.content,
              body.metadata !== undefined ? JSON.stringify(body.metadata) : null,
              body.produced_by_agent ?? null,
            ],
          );
          return {
            id: ins.rows[0]!.id,
            created_at: ins.rows[0]!.created_at,
            sequence_number: nextSeq,
          };
        },
      );
      if (created === null) {
        res.status(404).json({
          error: {
            code: 'CONVERSATION_NOT_FOUND',
            message: 'conversation not found for tenant',
          },
        });
        return;
      }
      res.status(201).json({
        data: {
          id: created.id,
          sequence_number: created.sequence_number,
          created_at: created.created_at.toISOString(),
          role: dbRole,
        },
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  return router;
}
