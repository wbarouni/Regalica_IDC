import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool } from 'pg';

import { handleDbError } from '../db/errors.js';
import { getPlatformConfigNumber } from '../lib/platformConfig.js';
import { subscribeRunEvents } from '../lib/runEventBus.js';
import { withConnection } from '../db/withConnection.js';
import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND, HTTP_OK } from '../lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// T-ZOOM-T2-002 — canonical breakdown shape contract enforced when
// reading `validation_fail_details.calculation_trace`. Plan §5.1.
const ALLOWED_TERM_ROLES = new Set(['lhs', 'rhs']);
const ALLOWED_TERM_STATUS = new Set(['present', 'missing', 'null', 'grayed']);
const ALLOWED_SENTINEL_CODES = new Set(['C', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6']);

interface BreakdownTermDto {
  rang: number;
  role: 'lhs' | 'rhs';
  is_sentinel: boolean;
  sentinel_code: 'C' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | null;
  rubrique_code: string;
  colonne_code: string;
  expected_value: string | null;
  computed_value: string | null;
  status: 'present' | 'missing' | 'null' | 'grayed';
}

interface RubriqueConfidenceDto {
  annexe_code: string;
  rubrique_code: string;
  colonne_code: string;
  score: string;
  contributing_rules_count: number;
  classification: 'innocent' | 'suspect' | 'undetermined';
  contributing_rule_ids: readonly string[];
}

interface FailRowRaw {
  id: string;
  rule_id: string;
  ax_term: string;
  num_regle: number;
  operateur: string;
  regle_label: string;
  rule_terms: unknown;
  severity: 'severe' | 'rounding';
  expected_value: string | number | null;
  computed_value: string | number | null;
  gap_absolute: string | number | null;
  gap_relative: string | number | null;
  cluster_id: string | null;
  is_sentinel_iteration: boolean;
  iteration_index: number | null;
  created_at: Date | string;
  calculation_trace: unknown;
  rubrique_codes: readonly string[];
}

interface ConfidenceRowRaw {
  annexe_code: string;
  rubrique_code: string;
  colonne_code: string;
  score: string;
  contributing_rules_count: number;
  classification: 'innocent' | 'suspect' | 'undetermined';
  contributing_rule_ids: readonly string[];
}

/**
 * Tolerant parser for the `calculation_trace` JSONB into the canonical
 * BreakdownTermDto[] shape. Returns `null` when the payload diverges
 * from the contract — the caller flips `breakdown_unavailable` to true
 * and the UI degrades to the R1/R2 minimal summary.
 *
 * Rejection criteria (every term must respect ALL of them):
 *   - is an object
 *   - rang ∈ integers >= 1
 *   - role ∈ {'lhs', 'rhs'}
 *   - rubrique_code, colonne_code non-empty strings
 *   - status ∈ {'present', 'missing', 'null', 'grayed'}
 *   - sentinel_code is null or ∈ {'C', 'D1'..'D6'}
 */
function parseBreakdown(trace: unknown): readonly BreakdownTermDto[] | null {
  if (trace === null || typeof trace !== 'object' || Array.isArray(trace)) {
    return null;
  }
  const obj = trace as Record<string, unknown>;
  if (!Array.isArray(obj['terms'])) {
    return null;
  }
  const out: BreakdownTermDto[] = [];
  for (const raw of obj['terms']) {
    if (raw === null || typeof raw !== 'object') {
      return null;
    }
    const t = raw as Record<string, unknown>;
    const rang = t['rang'];
    const role = t['role'];
    const rubrique = t['rubrique_code'];
    const colonne = t['colonne_code'];
    const status = t['status'];
    const isSentinel = t['is_sentinel'];
    const sentinelCode = t['sentinel_code'] ?? null;
    if (typeof rang !== 'number' || !Number.isInteger(rang) || rang < 1) {
      return null;
    }
    if (typeof role !== 'string' || !ALLOWED_TERM_ROLES.has(role)) {
      return null;
    }
    if (typeof rubrique !== 'string' || rubrique.length === 0) {
      return null;
    }
    if (typeof colonne !== 'string' || colonne.length === 0) {
      return null;
    }
    if (typeof status !== 'string' || !ALLOWED_TERM_STATUS.has(status)) {
      return null;
    }
    if (typeof isSentinel !== 'boolean') {
      return null;
    }
    if (
      sentinelCode !== null &&
      (typeof sentinelCode !== 'string' || !ALLOWED_SENTINEL_CODES.has(sentinelCode))
    ) {
      return null;
    }
    const expected = t['expected_value'];
    const computed = t['computed_value'];
    out.push({
      rang,
      role: role as 'lhs' | 'rhs',
      is_sentinel: isSentinel,
      sentinel_code: sentinelCode as BreakdownTermDto['sentinel_code'],
      rubrique_code: rubrique,
      colonne_code: colonne,
      expected_value:
        typeof expected === 'string'
          ? expected
          : expected === null || expected === undefined
            ? null
            : String(expected),
      computed_value:
        typeof computed === 'string'
          ? computed
          : computed === null || computed === undefined
            ? null
            : String(computed),
      status: status as BreakdownTermDto['status'],
    });
  }
  return out;
}

/**
 * Build the cell signature set referenced by a rule's terms array,
 * used to filter `rubrique_confidence_run` rows down to the cells
 * actually relevant to the FAIL being inspected.
 */
function ruleCellSignatures(ruleTerms: unknown, axTerm: string): Set<string> {
  const sigs = new Set<string>();
  if (!Array.isArray(ruleTerms)) {
    return sigs;
  }
  for (const t of ruleTerms) {
    if (t === null || typeof t !== 'object') {
      continue;
    }
    const term = t as Record<string, unknown>;
    const annexe = typeof term['ax_origine'] === 'string' ? (term['ax_origine'] as string) : axTerm;
    const rubrique = typeof term['rubrique'] === 'string' ? (term['rubrique'] as string) : null;
    const colonne = typeof term['colonne'] === 'string' ? (term['colonne'] as string) : null;
    if (rubrique === null || colonne === null) {
      continue;
    }
    sigs.add(`${annexe} ${rubrique} ${colonne}`);
  }
  return sigs;
}

interface FailDetailDto {
  id: string;
  ax_term: string;
  num_regle: number;
  operateur: string;
  regle_label: string;
  severity: 'severe' | 'rounding';
  expected_value: string | number | null;
  computed_value: string | number | null;
  gap_absolute: string | number | null;
  gap_relative: string | number | null;
  cluster_id: string | null;
  is_sentinel_iteration: boolean;
  iteration_index: number | null;
  created_at: string | Date;
  rubrique_codes: readonly string[];
  breakdown: readonly BreakdownTermDto[];
  breakdown_unavailable: boolean;
  rubrique_confidence: readonly RubriqueConfidenceDto[];
}

function enrichFailRow(row: FailRowRaw, allConfidence: readonly ConfidenceRowRaw[]): FailDetailDto {
  const breakdown = parseBreakdown(row.calculation_trace);
  const cellSigs = ruleCellSignatures(row.rule_terms, row.ax_term);
  const rubriqueConfidence: RubriqueConfidenceDto[] = [];
  for (const c of allConfidence) {
    const sig = `${c.annexe_code} ${c.rubrique_code} ${c.colonne_code}`;
    if (cellSigs.has(sig)) {
      rubriqueConfidence.push({
        annexe_code: c.annexe_code,
        rubrique_code: c.rubrique_code,
        colonne_code: c.colonne_code,
        score: c.score,
        contributing_rules_count: c.contributing_rules_count,
        classification: c.classification,
        contributing_rule_ids: c.contributing_rule_ids,
      });
    }
  }
  return {
    id: row.id,
    ax_term: row.ax_term,
    num_regle: row.num_regle,
    operateur: row.operateur,
    regle_label: row.regle_label,
    severity: row.severity,
    expected_value: row.expected_value,
    computed_value: row.computed_value,
    gap_absolute: row.gap_absolute,
    gap_relative: row.gap_relative,
    cluster_id: row.cluster_id,
    is_sentinel_iteration: row.is_sentinel_iteration,
    iteration_index: row.iteration_index,
    created_at: row.created_at,
    rubrique_codes: row.rubrique_codes,
    breakdown: breakdown ?? [],
    breakdown_unavailable: breakdown === null,
    rubrique_confidence: rubriqueConfidence,
  };
}

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
             completed_at,
             error_code,
             correlation_id
           FROM validation_runs
           WHERE tenant_id = $1
             AND status IN ('running', 'completed', 'failed')
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
             synthesis_artifact, deliverable_c_artifact,
             error_code, correlation_id
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
        res
          .status(HTTP_NOT_FOUND)
          .json({ error: { code: 'RUN_NOT_FOUND', message: 'Run not found' } });
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
      res.status(HTTP_BAD_REQUEST).json({
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
        res.status(HTTP_NOT_FOUND).json({
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
      res.status(HTTP_BAD_REQUEST).json({
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
      res.status(HTTP_NOT_FOUND).json({
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

    res.status(HTTP_OK);
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
      res.status(HTTP_BAD_REQUEST).json({
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
        // Sprint B — surface the distinct rubrique codes referenced by
        // each rule's `terms` JSONB so the FailsTable shows the rubrique
        // addressing alongside (ax_term, num_regle). The LATERAL unwrap
        // deduplicates and collapses to an empty array when terms is
        // missing or empty (defensive: rule_id may legitimately be NULL
        // for a synthetic fail, although the JOIN above filters that
        // case out).
        //
        // T-ZOOM-T2-002 — additionally surface
        //   (a) `calculation_trace` JSONB so the overlay zoom can
        //       render the term-by-term decomposition,
        //   (b) `rule_id` so the post-fetch step can resolve the cells
        //       referenced by the rule (used for cross-rule confidence
        //       attachment below).
        const rows = await client.query(
          `SELECT
             vfd.id,
             vfd.rule_id,
             vfd.ax_term,
             vfd.num_regle,
             r.operator         AS operateur,
             r.natural_language AS regle_label,
             r.terms            AS rule_terms,
             vfd.severity,
             vfd.expected_value,
             vfd.computed_value,
             vfd.gap_absolute,
             vfd.gap_relative,
             vfd.cluster_id,
             vfd.is_sentinel_iteration,
             vfd.iteration_index,
             vfd.created_at,
             vfd.calculation_trace,
             COALESCE(
               (
                 SELECT array_agg(DISTINCT t->>'rubrique')
                   FROM jsonb_array_elements(COALESCE(r.terms, '[]'::jsonb)) AS t
                  WHERE t ? 'rubrique' AND t->>'rubrique' <> ''
               ),
               ARRAY[]::text[]
             ) AS rubrique_codes
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
        // T-ZOOM-T2-002 — bulk-load the entire rubrique_confidence_run
        // snapshot for this run in one query. Per-fail attachment is
        // done in JS by intersecting each rule's term cells with the
        // confidence rows. Cheaper than a per-fail sub-select on
        // typical run sizes (< 1k cells).
        //
        // GRACEFUL DEGRADATION — when the table does not yet exist
        // (migration 107 not applied on this DB) the query throws
        // pg error 42P01 / undefined_table. We catch it locally,
        // surface a single WARN log, and return an empty confidence
        // array so the /fails handler keeps responding with the
        // legacy payload shape (breakdown empty, rubrique_confidence
        // empty). Same doctrine as engine.ts §confidenceWeights:
        // a missing T-ZOOM-T2-002 seed must never break the legacy
        // FailsTable / overlay zoom path.
        let confidenceRowsResult: { rows: unknown[] } = { rows: [] };
        try {
          confidenceRowsResult = await client.query(
            `SELECT annexe_code, rubrique_code, colonne_code,
                    score::text AS score,
                    contributing_rules_count,
                    classification,
                    contributing_rule_ids
               FROM rubrique_confidence_run
              WHERE validation_run_id = $1`,
            [runId],
          );
        } catch (confidenceErr) {
          const code =
            confidenceErr !== null && typeof confidenceErr === 'object' && 'code' in confidenceErr
              ? (confidenceErr as { code?: string }).code
              : undefined;
          // 42P01 = undefined_table (migration 107 not applied yet).
          // Any other PG error code falls through to handleDbError
          // via the outer try/catch — only the "table missing" case
          // is silently degraded.
          if (code === '42P01') {
            // Caught and degraded; not re-thrown. The handler keeps
            // serving the legacy payload shape.
          } else {
            throw confidenceErr;
          }
        }
        return {
          rows: rows.rows,
          total: (cnt.rows[0] as { total: number }).total,
          confidence: confidenceRowsResult.rows,
        };
      });
      const enriched = data.rows.map((row) =>
        enrichFailRow(row as FailRowRaw, data.confidence as ConfidenceRowRaw[]),
      );
      res.json({
        data: enriched,
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
