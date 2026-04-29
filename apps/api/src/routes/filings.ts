import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool } from 'pg';

import { handleDbError } from '../db/errors.js';
import { withConnection } from '../db/withConnection.js';

const VALID_XSD_STATUSES: ReadonlySet<string> = new Set(['passed', 'failed', 'pending']);

/**
 * /api/tenants/:tenantId/filings
 *   GET ?annexe=...&status=passed|failed|pending&page=&limit=
 *     -> paginated xml_uploads list
 *
 * Source columns from migration 024_xml_uploads.sql.
 * RLS via withConnection (tenant_id + user_id GUCs).
 */
export function filingsRouter(pool: Pool): IRouter {
  const router = Router({ mergeParams: true });

  router.get('/filings', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;

    const annexe = typeof req.query['annexe'] === 'string' ? req.query['annexe'] : null;
    const status = typeof req.query['status'] === 'string' ? req.query['status'] : null;
    if (status !== null && !VALID_XSD_STATUSES.has(status)) {
      res.status(400).json({
        error: {
          code: 'INVALID_XSD_STATUS',
          message: 'status must be one of: passed, failed, pending',
        },
      });
      return;
    }
    const pageStr = typeof req.query['page'] === 'string' ? req.query['page'] : '1';
    const limitStr = typeof req.query['limit'] === 'string' ? req.query['limit'] : '50';
    const page = Math.max(1, Number.parseInt(pageStr, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(limitStr, 10) || 50));
    const offset = (page - 1) * limit;

    try {
      const data = await withConnection(pool, { tenantId, userId }, async (client) => {
        const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL'];
        const values: (string | number)[] = [tenantId];
        if (annexe !== null) {
          values.push(annexe);
          conditions.push(`code_annexe = $${values.length}`);
        }
        if (status !== null) {
          values.push(status);
          conditions.push(`xsd_validation_status = $${values.length}`);
        }
        const whereSql = conditions.join(' AND ');
        values.push(limit);
        values.push(offset);
        const rows = await client.query(
          `SELECT
             id, code_annexe, date_annexe, file_name,
             file_size_bytes, xsd_validation_status,
             uploaded_at, uploaded_by_user_id
           FROM xml_uploads
           WHERE ${whereSql}
           ORDER BY uploaded_at DESC
           LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        );
        const cnt = await client.query(
          `SELECT COUNT(*)::int AS total FROM xml_uploads WHERE ${whereSql}`,
          values.slice(0, values.length - 2),
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
        },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  return router;
}
