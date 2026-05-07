import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

import { config } from '../config.js';
import { handleDbError } from '../db/errors.js';
import { getPlatformConfig, getPlatformConfigNumber } from '../lib/platformConfig.js';
import { logger } from '../logger.js';
import { withConnection } from '../db/withConnection.js';
import { HTTP_BAD_REQUEST, HTTP_CREATED, HTTP_FORBIDDEN } from '../lib/http.js';

/**
 * /api/tenants/:tenantId/runs
 *   POST                       — create a validation_run from one or
 *                                more uploads, link them via
 *                                validation_run_uploads, fire-and-
 *                                forget the chatbot-py /upload call
 *
 * The engine-only /runs/:runId/fail-details route lives in
 * apps/api/src/routes/engine.ts (mounted at /api/engine, not
 * /api/tenants/:tenantId — service-to-service auth chain).
 *
 * The /runs/current, /runs/:runId/agents, /runs/:runId/stream and
 * /runs/:runId/fails routes are owned by workspace.ts (Phase B).
 * This file only adds the *write* surface for the upload pipeline.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createRunBody = z.object({
  upload_ids: z.array(z.string().regex(UUID_RE)).min(1),
  primary_upload_id: z.string().regex(UUID_RE),
  arrete_date: z.string().regex(ISO_DATE_RE),
  // Optional. When the frontend has already opened a chat conversation
  // for the user, it threads the conversation_id here so the chatbot-py
  // T0 briefing can be persisted into that thread (see commit A3).
  conversation_id: z.string().regex(UUID_RE).optional(),
});

interface UploadOwnershipRow {
  id: string;
  code_annexe: string;
}

async function checkUploadsBelongToTenant(
  client: PoolClient,
  uploadIds: readonly string[],
  tenantId: string,
): Promise<UploadOwnershipRow[] | null> {
  const r = await client.query<UploadOwnershipRow>(
    `SELECT id, code_annexe
     FROM xml_uploads
     WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND deleted_at IS NULL`,
    [uploadIds, tenantId],
  );
  if (r.rows.length !== uploadIds.length) {
    return null;
  }
  return r.rows;
}

interface ChatbotPyKickoffPayload {
  run_id: string;
  primary_upload_id: string;
  upload_ids: string[];
  arrete_date: string;
  tenant_id: string;
  conversation_id?: string;
}

function kickoffEngineAsync(payload: ChatbotPyKickoffPayload, correlationId: string): void {
  const baseUrl = config.chatbotPyUrl;
  if (baseUrl === undefined || baseUrl.length === 0) {
    logger.warn(
      { runId: payload.run_id, correlation_id: correlationId },
      'CHATBOT_PY_URL not set — engine kickoff skipped',
    );
    return;
  }
  const url = `${baseUrl.replace(/\/$/, '')}/upload`;
  void fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Propagate the correlation_id end-to-end so chatbot-py logs and
      // any downstream POST /finalize call carry the same value. The
      // FastAPI side reads it via the mirror correlation_id middleware.
      'X-Correlation-Id': correlationId,
    },
    body: JSON.stringify(payload),
  }).catch((err: unknown) => {
    logger.warn(
      {
        runId: payload.run_id,
        correlation_id: correlationId,
        err: err instanceof Error ? err.message : String(err),
      },
      'engine kickoff failed (fire-and-forget)',
    );
  });
}

export function runsRouter(pool: Pool): IRouter {
  const router = Router({ mergeParams: true });

  // B3 (2026-05-08) — GET /runs/eta
  // Returns the platform-wide p50 latency estimate (seconds) for a
  // complete T1 validation. The frontend renders the Lancer ack
  // message ETA from this value so the constant never lives in
  // source. Seeded by migration 104; future refresh by a percentile
  // computation over validation_runs (planned Phase 2). The value is
  // tenant-agnostic for now — every tenant uses the same engine path.
  router.get('/runs/eta', async (_req: Request, res: Response) => {
    try {
      const seconds = await getPlatformConfigNumber(pool, 't1_run_eta_p50_seconds');
      res.json({
        data: { seconds },
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      // The key is seeded by migration 104; if it's missing the
      // tenant has been bootstrapped on a stale schema. Surface a
      // 200 with seconds=null so the frontend renders the ack
      // without an ETA clause rather than crashing.
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        't1_run_eta_p50_seconds platform_config lookup failed',
      );
      res.json({
        data: { seconds: null },
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    }
  });

  router.post('/runs', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    // Set by correlationIdMiddleware (mounted in app.ts before any
    // router). Always present — defaults to a fresh UUID v4 when the
    // client did not supply X-Correlation-Id.
    const correlationId = res.locals['correlationId'] as string;
    const parsed = createRunBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(HTTP_BAD_REQUEST).json({
        error: { code: 'INVALID_BODY', message: parsed.error.issues[0]?.message ?? 'invalid' },
      });
      return;
    }
    const { upload_ids, primary_upload_id, arrete_date, conversation_id } = parsed.data;
    if (!upload_ids.includes(primary_upload_id)) {
      res.status(HTTP_BAD_REQUEST).json({
        error: {
          code: 'PRIMARY_NOT_IN_LIST',
          message: 'primary_upload_id must be present in upload_ids',
        },
      });
      return;
    }
    let engineVersion: string;
    let rulesSnapshot: unknown;
    let referentialsSnapshot: unknown;
    try {
      engineVersion = await getPlatformConfig<string>(pool, 'engine_version');
      rulesSnapshot = await getPlatformConfig(pool, 'rules_version_snapshot_default');
      referentialsSnapshot = await getPlatformConfig(pool, 'referentials_version_snapshot_default');
    } catch (err) {
      handleDbError(err, res);
      return;
    }

    try {
      const result = await withConnection(pool, { tenantId, userId }, async (client) => {
        const uploads = await checkUploadsBelongToTenant(client, upload_ids, tenantId);
        if (uploads === null) {
          return { kind: 'forbidden' as const };
        }
        const primary = uploads.find((u) => u.id === primary_upload_id);
        if (primary === undefined) {
          return { kind: 'forbidden' as const };
        }
        const runIns = await client.query<{ id: string; status: string }>(
          `INSERT INTO validation_runs
             (tenant_id, primary_annexe_code, arrete_date, primary_upload_id,
              initiated_by_user_id, rules_version_snapshot,
              referentials_version_snapshot, engine_version, status,
              correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, 'running', $9::uuid)
           RETURNING id, status`,
          [
            tenantId,
            primary.code_annexe,
            arrete_date,
            primary_upload_id,
            userId,
            JSON.stringify(rulesSnapshot ?? {}),
            JSON.stringify(referentialsSnapshot ?? {}),
            engineVersion,
            correlationId,
          ],
        );
        const runId = runIns.rows[0]!.id;
        const runStatus = runIns.rows[0]!.status;
        for (const id of upload_ids) {
          const role = id === primary_upload_id ? 'primary' : 'companion';
          await client.query(
            `INSERT INTO validation_run_uploads (validation_run_id, xml_upload_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (validation_run_id, xml_upload_id) DO NOTHING`,
            [runId, id, role],
          );
        }
        return { kind: 'ok' as const, runId, runStatus };
      });
      if (result.kind === 'forbidden') {
        res.status(HTTP_FORBIDDEN).json({
          error: {
            code: 'UPLOAD_NOT_OWNED',
            message: 'one or more uploads do not belong to tenant',
          },
        });
        return;
      }
      kickoffEngineAsync(
        {
          run_id: result.runId,
          primary_upload_id,
          upload_ids,
          arrete_date,
          tenant_id: tenantId,
          ...(conversation_id !== undefined ? { conversation_id } : {}),
        },
        correlationId,
      );
      res.status(HTTP_CREATED).json({
        data: { run_id: result.runId, status: result.runStatus },
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  return router;
}
