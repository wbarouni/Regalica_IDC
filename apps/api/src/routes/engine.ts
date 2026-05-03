import { gunzipSync } from 'node:zlib';

import {
  loadRules,
  parseBatch,
  runEvaluation,
  type EvaluationResult,
  type Verdict,
} from '@regflow/evaluator';
import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

import { handleDbError } from '../db/errors.js';
import { emitAgentStep } from '../lib/runEventBus.js';
import {
  PlatformConfigMissingError,
  PlatformConfigTypeError,
  getPlatformConfigNumber,
} from '../lib/platformConfig.js';
import { engineAuthMiddleware } from '../middleware/engineAuth.js';
import { withConnection } from '../db/withConnection.js';
import { logger } from '../logger.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_CREATED,
  HTTP_FORBIDDEN,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
} from '../lib/http.js';

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
  // `offset: true` accepts both the W3C/RFC 3339 forms `Z` and
  // `±HH:MM`. Without it, zod's default `.datetime()` only accepts
  // `Z` and rejects every payload coming from Python's
  // `datetime.now(UTC).isoformat()` (which emits `+00:00`). That
  // mismatch is what made every chatbot-py notify_agent_step return
  // 400 INVALID_BODY silently — see commit message for the audit.
  startedAt: z.string().datetime({ offset: true }).optional(),
  completedAt: z.string().datetime({ offset: true }).optional(),
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

const evaluateBody = z.object({
  arrete_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ---------------------------------------------------------------------------
// Severity classification — pure helper, no DB.
//
// The evaluator engine emits Verdict.severity in {'severe','rounding',null}
// (cf. packages/evaluator/src/types.ts). The HTTP route maps that 3-value
// enum to the REGFlow front-facing {'BLOQUANT','MAJEUR','MINEUR',null}
// taxonomy using a per-deployment threshold seeded in platform_config
// (see migration 071 + loadSeverityThreshold below).
//
// Rule:
//   severity=null              -> null
//   severity='rounding'        -> 'MINEUR'
//   severity='severe' AND
//     |gap_relative| > T       -> 'BLOQUANT'   (strictly greater)
//   severity='severe' AND
//     |gap_relative| <= T      -> 'MAJEUR'
// ---------------------------------------------------------------------------

export function mapSeverity(
  severity: 'severe' | 'rounding' | null,
  gapRelative: number | null,
  threshold: number,
): 'BLOQUANT' | 'MAJEUR' | 'MINEUR' | null {
  if (severity === null) return null;
  if (severity === 'rounding') return 'MINEUR';
  return Math.abs(gapRelative ?? 0) > threshold ? 'BLOQUANT' : 'MAJEUR';
}

// Documented fallback used when the platform_config row is missing or
// holds an unparseable value — every divergence is logged so an
// operator notices the misconfiguration. The doctrine source of
// truth stays platform_config (migration 071 default).
const SEVERITY_THRESHOLD_FALLBACK = 0.1;

export async function loadSeverityThreshold(pool: Pool): Promise<number> {
  try {
    return await getPlatformConfigNumber(pool, 'severity_gap_relative_threshold');
  } catch (err) {
    if (err instanceof PlatformConfigMissingError || err instanceof PlatformConfigTypeError) {
      logger.warn(
        { err: err.message, fallback: SEVERITY_THRESHOLD_FALLBACK },
        'severity_gap_relative_threshold unavailable in platform_config; using documented fallback',
      );
      return SEVERITY_THRESHOLD_FALLBACK;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// HTTP response shape for POST /api/engine/runs/:runId/evaluate.
//
// Decimal columns of the Verdict are surfaced as strings to preserve
// the 38-digit precision contract (cf. CLAUDE.md §2 — decimal.js /
// Decimal stdlib). gap_relative stays a number because percentages
// fit safely in JS doubles.
// ---------------------------------------------------------------------------

interface MappedVerdict {
  ax_term: string;
  num_regle: number;
  status: string;
  severity: 'BLOQUANT' | 'MAJEUR' | 'MINEUR' | null;
  lhs: string | null;
  rhs: string | null;
  gap: string | null;
  gap_relative: number | null;
}

interface EngineEvaluateTotals {
  pass: number;
  fail_severe: number;
  fail_rounding: number;
  skipped_missing_annexe: number;
  skipped_missing_rubrique: number;
  skipped_missing_colonne: number;
  skipped_missing_data: number;
  skipped_conditional: number;
  skipped_unsupported_op: number;
  skipped_literal_text: number;
  rules_applicable_total: number;
}

interface XmlUploadRow {
  content_compressed: Buffer;
  compression_algo: string;
  encoding_detected: string;
  file_name: string;
}

function decompressXmlRow(row: XmlUploadRow): string {
  const blob = row.content_compressed;
  const encoding = row.encoding_detected !== '' ? row.encoding_detected : 'utf-8';
  let raw: Buffer;
  if (row.compression_algo === 'gzip') {
    raw = gunzipSync(blob);
  } else if (row.compression_algo === 'raw') {
    raw = blob;
  } else {
    throw new Error(`unsupported compression_algo '${row.compression_algo}' in xml_uploads`);
  }
  return raw.toString(encoding as BufferEncoding);
}

function mapTotals(result: EvaluationResult): EngineEvaluateTotals {
  const t = result.totals;
  return {
    pass: t.pass,
    fail_severe: t.failSevere,
    fail_rounding: t.failRounding,
    skipped_missing_annexe: t.skippedMissingAnnexe,
    skipped_missing_rubrique: t.skippedMissingRubrique,
    skipped_missing_colonne: t.skippedMissingColonne,
    skipped_missing_data: t.skippedMissingData,
    skipped_conditional: t.skippedConditional,
    skipped_unsupported_op: t.skippedUnsupportedOp,
    skipped_literal_text: t.skippedLiteralText,
    rules_applicable_total: t.rulesApplicableTotal,
  };
}

function mapVerdict(v: Verdict, threshold: number): MappedVerdict {
  return {
    ax_term: v.annexeCode,
    num_regle: v.numRegle,
    status: v.status,
    severity: mapSeverity(
      v.severity,
      v.gap !== null && v.rhs !== null && !v.rhs.isZero()
        ? v.gap.dividedBy(v.rhs).toNumber()
        : null,
      threshold,
    ),
    lhs: v.lhs !== null ? v.lhs.toString() : null,
    rhs: v.rhs !== null ? v.rhs.toString() : null,
    gap: v.gap !== null ? v.gap.toString() : null,
    gap_relative:
      v.gap !== null && v.rhs !== null && !v.rhs.isZero()
        ? v.gap.dividedBy(v.rhs).toNumber()
        : null,
  };
}

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
      res.status(HTTP_BAD_REQUEST).json({
        error: { code: 'INVALID_RUN_ID', message: 'runId must be a UUID' },
      });
      return;
    }
    if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
      res.status(HTTP_BAD_REQUEST).json({
        error: {
          code: 'MISSING_TENANT_CLAIM',
          message: 'JWT payload must include a UUID `tenant_id` claim',
        },
      });
      return;
    }
    const parsed = failDetailsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(HTTP_BAD_REQUEST).json({
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
        res.status(HTTP_NOT_FOUND).json({
          error: { code: 'RUN_NOT_FOUND', message: 'run not found for tenant' },
        });
        return;
      }
      res.status(HTTP_CREATED).json({
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
      res.status(HTTP_BAD_REQUEST).json({
        error: { code: 'INVALID_RUN_ID', message: 'runId must be a UUID' },
      });
      return;
    }
    if (typeof stepId !== 'string' || !UUID_RE.test(stepId)) {
      res.status(HTTP_BAD_REQUEST).json({
        error: { code: 'INVALID_STEP_ID', message: 'stepId must be a UUID' },
      });
      return;
    }
    if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
      res.status(HTTP_BAD_REQUEST).json({
        error: {
          code: 'MISSING_TENANT_CLAIM',
          message: 'JWT payload must include a UUID `tenant_id` claim',
        },
      });
      return;
    }
    const parsed = agentStepUpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(HTTP_BAD_REQUEST).json({
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
        res.status(HTTP_NOT_FOUND).json({
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

      res.status(HTTP_OK).json({
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
      res.status(HTTP_BAD_REQUEST).json({
        error: {
          code: 'INVALID_CONVERSATION_ID',
          message: 'conversationId must be a UUID',
        },
      });
      return;
    }
    if (typeof claimTenantId !== 'string' || !UUID_RE.test(claimTenantId)) {
      res.status(HTTP_BAD_REQUEST).json({
        error: {
          code: 'MISSING_TENANT_CLAIM',
          message: 'JWT payload must include a UUID `tenant_id` claim',
        },
      });
      return;
    }
    const parsed = messageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(HTTP_BAD_REQUEST).json({
        error: {
          code: 'INVALID_BODY',
          message: parsed.error.issues[0]?.message ?? 'invalid',
        },
      });
      return;
    }
    const body = parsed.data;
    if (body.tenant_id !== claimTenantId) {
      res.status(HTTP_FORBIDDEN).json({
        error: {
          code: 'TENANT_MISMATCH',
          message: 'body tenant_id must match JWT tenant_id claim',
        },
      });
      return;
    }
    const dbRole = ENGINE_ROLE_TO_DB[body.role];
    if (dbRole === undefined) {
      res.status(HTTP_BAD_REQUEST).json({
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
        res.status(HTTP_NOT_FOUND).json({
          error: {
            code: 'CONVERSATION_NOT_FOUND',
            message: 'conversation not found for tenant',
          },
        });
        return;
      }
      res.status(HTTP_CREATED).json({
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

  // -------------------------------------------------------------------
  // POST /runs/:runId/evaluate
  //
  // Drive the full RDG validation pipeline for a run:
  //   1. Load every XML attached to the run (validation_run_uploads).
  //   2. Decompress and feed parseBatch() (Phase A of the engine).
  //   3. Load active rules for the arrete_date via loadRules().
  //   4. Run the evaluator engine.
  //   5. Map the result to the HTTP envelope (Decimal -> string,
  //      severity -> BLOQUANT/MAJEUR/MINEUR via the platform_config
  //      threshold).
  //
  // No persistence happens here: the caller (chatbot-py) writes
  // fail-details and totals through the existing dedicated routes.
  // -------------------------------------------------------------------
  router.post('/runs/:runId/evaluate', async (req: Request, res: Response) => {
    const runId = req.params['runId'];
    const tenantId = res.locals['enginePayloadTenantId'] as string | undefined;
    if (typeof runId !== 'string' || !UUID_RE.test(runId)) {
      res.status(HTTP_BAD_REQUEST).json({
        error: { code: 'INVALID_RUN_ID', message: 'runId must be a UUID' },
      });
      return;
    }
    if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
      res.status(HTTP_BAD_REQUEST).json({
        error: {
          code: 'MISSING_TENANT_CLAIM',
          message: 'JWT payload must include a UUID `tenant_id` claim',
        },
      });
      return;
    }
    const parsed = evaluateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(HTTP_BAD_REQUEST).json({
        error: {
          code: 'INVALID_ARRETE_DATE',
          message: 'arrete_date must match ISO YYYY-MM-DD',
        },
      });
      return;
    }

    const arreteDate = parsed.data.arrete_date;

    let rows: XmlUploadRow[];
    try {
      rows = await withConnection(pool, { tenantId, userId: tenantId }, async (client) => {
        const r = await client.query<XmlUploadRow>(
          `SELECT u.content_compressed, u.compression_algo,
                  u.encoding_detected, u.file_name
             FROM xml_uploads u
             JOIN validation_run_uploads vru ON vru.xml_upload_id = u.id
            WHERE vru.validation_run_id = $1::uuid
              AND u.tenant_id = $2::uuid
              AND u.deleted_at IS NULL`,
          [runId, tenantId],
        );
        return r.rows;
      });
    } catch (err) {
      handleDbError(err, res);
      return;
    }
    if (rows.length === 0) {
      res.status(HTTP_NOT_FOUND).json({
        error: {
          code: 'RUN_XML_NOT_FOUND',
          message: 'no xml uploads attached to this run for tenant',
        },
      });
      return;
    }

    let xmlStrings: string[];
    try {
      xmlStrings = rows.map((row) => decompressXmlRow(row));
    } catch (err) {
      logger.error({ err, runId }, 'xml decompression failed');
      res.status(HTTP_INTERNAL_SERVER_ERROR).json({
        error: {
          code: 'XML_DECOMPRESSION_ERROR',
          message: 'failed to decompress one or more xml uploads',
        },
      });
      return;
    }

    let result: EvaluationResult;
    let threshold: number;
    try {
      threshold = await loadSeverityThreshold(pool);
      const phaseA = parseBatch(xmlStrings);
      // ParsedXml does not carry a filename property — keys are derived
      // from the matching xml_uploads row when available, falling back
      // to a synthetic xml-N identifier (the engine does not interpret
      // the key, only its uniqueness matters for deduplication).
      const parsedXmlsMap = new Map(
        phaseA.parsedXmls.map((p, idx) => [rows[idx]?.file_name ?? `xml-${idx}`, p]),
      );
      const rules = await loadRules({
        pool,
        tenantId,
        arreteDate: new Date(arreteDate),
        statuses: ['active'],
      });
      result = await runEvaluation({
        tenantId,
        arreteDate,
        parsedXmls: parsedXmlsMap,
        mergedCells: phaseA.mergedCells,
        rules,
      });
    } catch (err) {
      logger.error({ err, runId, arreteDate }, 'runEvaluation failed');
      res.status(HTTP_INTERNAL_SERVER_ERROR).json({
        error: {
          code: 'EVALUATION_ENGINE_ERROR',
          message: 'evaluator engine raised — see server logs for details',
        },
      });
      return;
    }

    const verdicts = result.verdicts.map((v) => mapVerdict(v, threshold));
    const totals = mapTotals(result);

    res.status(HTTP_OK).json({
      data: {
        run_id: runId,
        arrete_date: arreteDate,
        evaluated_at: new Date().toISOString(),
        duration_ms: result.durationMs,
        verdicts,
        totals,
      },
      meta: { ts: new Date().toISOString(), version: '1' },
    });
  });

  return router;
}
