import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool } from 'pg';

import { handleDbError } from '../db/errors.js';
import { withConnection } from '../db/withConnection.js';
import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND } from '../lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * /api/tenants/:tenantId/notifications
 *   GET                       -> list unread notifications for the user
 *   PATCH /:notifId/read      -> flip is_read=TRUE + read_at=NOW()
 *
 * UPDATE relies on policy notifications_update from amendment 030a;
 * SELECT relies on the original notifications_select policy from 030.
 */
export function notificationsRouter(pool: Pool): IRouter {
  const router = Router({ mergeParams: true });

  router.get('/notifications', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    try {
      const rows = await withConnection(pool, { tenantId, userId }, async (client) => {
        const r = await client.query(
          `SELECT
             id, event_type, urgency_level, title, body,
             suggested_action, resource_link, produced_by_agent,
             is_read, read_at, created_at, expires_at
           FROM notifications
           WHERE tenant_id = $1
             AND user_id = $2
             AND is_read = FALSE
             AND (expires_at IS NULL OR expires_at > NOW())
           ORDER BY
             CASE urgency_level
               WHEN 'action_required' THEN 1
               WHEN 'attention' THEN 2
               ELSE 3
             END,
             created_at DESC
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

  router.patch('/notifications/:notifId/read', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    const notifId = req.params['notifId'] as string;
    if (!UUID_RE.test(notifId)) {
      res.status(HTTP_BAD_REQUEST).json({
        error: { code: 'INVALID_NOTIF_ID', message: 'notifId must be a valid UUID' },
      });
      return;
    }
    try {
      const updated = await withConnection(pool, { tenantId, userId }, async (client) => {
        const r = await client.query(
          `UPDATE notifications
              SET is_read = TRUE,
                  read_at = NOW()
            WHERE id = $1
              AND tenant_id = $2
              AND user_id = $3
            RETURNING id, is_read, read_at`,
          [notifId, tenantId, userId],
        );
        return r.rows[0] ?? null;
      });
      if (updated === null) {
        // RLS filtered or row truly missing — same end state for the caller.
        res.status(HTTP_NOT_FOUND).json({
          error: {
            code: 'NOTIFICATION_NOT_FOUND',
            message: 'Notification not found or not owned by user',
          },
        });
        return;
      }
      res.json({
        data: updated,
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  return router;
}
