import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool } from 'pg';

import { handleDbError } from '../db/errors.js';
import { withConnection } from '../db/withConnection.js';

const SUPPORTED_LANGUAGES = new Set(['fr', 'en', 'ar']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface CreateConversationBody {
  title?: unknown;
  language?: unknown;
  linked_validation_run_id?: unknown;
}

/**
 * /api/tenants/:tenantId/conversations
 *   GET   -> list active conversations of the calling user
 *   POST  -> create a new conversation (RLS WITH CHECK enforces user_id)
 */
export function conversationsRouter(pool: Pool): IRouter {
  const router = Router({ mergeParams: true });

  router.get('/conversations', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    try {
      const rows = await withConnection(pool, { tenantId, userId }, async (client) => {
        const r = await client.query(
          `SELECT id, title, language, linked_validation_run_id,
                  messages_count, tokens_total, is_archived,
                  created_at, updated_at
             FROM conversations
            WHERE tenant_id = $1
              AND user_id = $2
              AND deleted_at IS NULL
            ORDER BY updated_at DESC
            LIMIT 20`,
          [tenantId, userId],
        );
        return r.rows;
      });
      res.json({
        data: rows,
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  router.post('/conversations', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    const body = (req.body ?? {}) as CreateConversationBody;
    const title = typeof body.title === 'string' && body.title.length > 0 ? body.title : null;
    const language =
      typeof body.language === 'string' && SUPPORTED_LANGUAGES.has(body.language)
        ? body.language
        : 'fr';
    let linkedRunId: string | null = null;
    if (body.linked_validation_run_id !== undefined && body.linked_validation_run_id !== null) {
      if (
        typeof body.linked_validation_run_id !== 'string' ||
        !UUID_RE.test(body.linked_validation_run_id)
      ) {
        res.status(400).json({
          error: {
            code: 'INVALID_LINKED_RUN_ID',
            message: 'linked_validation_run_id must be a valid UUID or omitted',
          },
        });
        return;
      }
      linkedRunId = body.linked_validation_run_id;
    }
    try {
      const created = await withConnection(pool, { tenantId, userId }, async (client) => {
        const r = await client.query(
          `INSERT INTO conversations
             (tenant_id, user_id, title, language, linked_validation_run_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, title, language, linked_validation_run_id,
                     messages_count, tokens_total, is_archived,
                     created_at, updated_at`,
          [tenantId, userId, title, language, linkedRunId],
        );
        return r.rows[0];
      });
      res.status(201).json({
        data: created,
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  return router;
}
