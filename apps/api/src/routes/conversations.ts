import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool } from 'pg';

import { handleDbError } from '../db/errors.js';
import { withConnection } from '../db/withConnection.js';
import { HTTP_BAD_REQUEST, HTTP_CREATED, HTTP_NOT_FOUND, HTTP_OK } from '../lib/http.js';

const SUPPORTED_LANGUAGES = new Set(['fr', 'en', 'ar']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// P5 — roles surfaced to the frontend when hydrating a past thread.
// `regalica_thinking`, `agent_internal`, `system_notification` are
// internal-only signals (telemetry / audit trail) and stay hidden from
// the chat hydration path; the UI only renders user-facing turns.
const SURFACED_ROLES = ['user', 'regalica_response'] as const;

interface CreateConversationBody {
  title?: unknown;
  language?: unknown;
  linked_validation_run_id?: unknown;
}

/**
 * /api/tenants/:tenantId/conversations
 *   GET   -> list active conversations of the calling user
 *   POST  -> create a new conversation (RLS WITH CHECK enforces user_id)
 *   GET /:conversationId/messages -> hydrate a past thread (P5)
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
        res.status(HTTP_BAD_REQUEST).json({
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
      res.status(HTTP_CREATED).json({
        data: created,
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  // Feature 3 — DELETE /:conversationId (soft delete)
  // Sets conversations.deleted_at = NOW() so the row drops out of the
  // partial index `conv_idx_user_recent` and the GET /conversations
  // list query (which filters `deleted_at IS NULL`). Messages stay
  // intact for audit / compliance review — only the surface listing
  // is hidden from the user. RLS conversations_update policy enforces
  // tenant + ownership; a non-owner gets the same 404 as a missing
  // conversation, which is the desired information-hiding behaviour.
  router.delete('/conversations/:conversationId', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    const conversationId = req.params['conversationId'] as string;
    if (!UUID_RE.test(conversationId)) {
      res.status(HTTP_BAD_REQUEST).json({
        error: {
          code: 'INVALID_CONVERSATION_ID',
          message: 'conversationId must be a valid UUID',
        },
      });
      return;
    }
    try {
      const deleted = await withConnection(pool, { tenantId, userId }, async (client) => {
        const r = await client.query<{ id: string }>(
          `UPDATE conversations
              SET deleted_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1
              AND tenant_id = $2
              AND deleted_at IS NULL
            RETURNING id`,
          [conversationId, tenantId],
        );
        return r.rows[0] ?? null;
      });
      if (deleted === null) {
        res.status(HTTP_NOT_FOUND).json({
          error: {
            code: 'CONVERSATION_NOT_FOUND',
            message: 'conversation not found for tenant',
          },
        });
        return;
      }
      res.status(HTTP_OK).json({
        data: { id: deleted.id, deleted: true },
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  // P5 — GET /:conversationId/messages
  // Returns the ordered, RLS-filtered messages of a single conversation.
  // Used by the frontend `useConversationMessages` hook to hydrate the
  // chat thread when the user clicks a past row in the history sidebar.
  // RLS on `messages` already gates access to conversations the user
  // owns (or that compliance_director / support_readonly can read), so
  // a 404 from the conversations table check + the RLS-filtered SELECT
  // are sufficient — no extra ownership check is needed.
  router.get('/conversations/:conversationId/messages', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    const conversationId = req.params['conversationId'] as string;
    if (!UUID_RE.test(conversationId)) {
      res.status(HTTP_BAD_REQUEST).json({
        error: {
          code: 'INVALID_CONVERSATION_ID',
          message: 'conversationId must be a valid UUID',
        },
      });
      return;
    }
    try {
      const result = await withConnection(pool, { tenantId, userId }, async (client) => {
        const conv = await client.query<{ id: string }>(
          `SELECT id FROM conversations
             WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [conversationId, tenantId],
        );
        if (conv.rows.length === 0) {
          return null;
        }
        const msgs = await client.query(
          `SELECT id, sequence_number, role, content_markdown,
                  thinking_trace, produced_by_agent, created_at,
                  linked_run_id::text AS linked_run_id
             FROM messages
            WHERE conversation_id = $1
              AND role = ANY($2::text[])
            ORDER BY sequence_number ASC`,
          [conversationId, [...SURFACED_ROLES]],
        );
        return msgs.rows;
      });
      if (result === null) {
        res.status(HTTP_NOT_FOUND).json({
          error: {
            code: 'CONVERSATION_NOT_FOUND',
            message: 'conversation not found for tenant',
          },
        });
        return;
      }
      res.json({
        data: result,
        meta: {
          ts: new Date().toISOString(),
          version: '1',
          total: result.length,
        },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  return router;
}
