import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool } from 'pg';

import { handleDbError } from '../db/errors.js';
import { withConnection } from '../db/withConnection.js';
import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND } from '../lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface QuestionTypeRow {
  id: string;
  fn_name: string;
  label_i18n_key: string;
  ordinal: number;
}

/**
 * Mounted at /api/tenants/:tenantId — assumes authMiddleware +
 * tenantMiddleware have already populated res.locals['userId'] and
 * validated `:tenantId` as a UUID.
 *
 * Route inventory (Phase B):
 *   GET /prompts/suggestions[?runId=<UUID>]
 *
 * Returns the active T2 question types ordered by `ordinal`. The
 * optional `runId` query param is verified against the tenant before
 * any chip is returned — Phase 3 will use it to narrow the chips by
 * the run's actual FAIL profile (e.g. hide 'simulation' when no
 * severe FAIL exists).
 */
export function promptsRouter(pool: Pool): IRouter {
  const router = Router({ mergeParams: true });

  router.get('/prompts/suggestions', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    const runIdRaw = req.query['runId'];
    const runId = typeof runIdRaw === 'string' && runIdRaw.length > 0 ? runIdRaw : null;
    if (runId !== null && !UUID_RE.test(runId)) {
      res.status(HTTP_BAD_REQUEST).json({
        error: { code: 'INVALID_RUN_ID', message: 'runId must be a valid UUID' },
      });
      return;
    }

    try {
      const rows = await withConnection(pool, { tenantId, userId }, async (client) => {
        if (runId !== null) {
          const owns = await client.query<{ id: string }>(
            `SELECT id FROM validation_runs WHERE id = $1 AND tenant_id = $2`,
            [runId, tenantId],
          );
          if (owns.rows.length === 0) {
            return null;
          }
        }

        const r = await client.query<QuestionTypeRow>(
          `SELECT id, fn_name, label_i18n_key, ordinal
           FROM question_types
           WHERE is_active = TRUE AND deleted_at IS NULL
           ORDER BY ordinal`,
        );
        return r.rows;
      });

      if (rows === null) {
        res.status(HTTP_NOT_FOUND).json({
          error: { code: 'RUN_NOT_FOUND', message: 'Run not found' },
        });
        return;
      }

      res.json({
        data: {
          suggestions: rows.map((r) => ({
            id: r.id,
            fnName: r.fn_name,
            labelI18nKey: r.label_i18n_key,
            ordinal: r.ordinal,
          })),
        },
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  return router;
}
