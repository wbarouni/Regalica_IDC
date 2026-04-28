import { Router, type IRouter, type Request, type Response } from 'express';
import type { Pool } from 'pg';

import { handleDbError } from '../db/errors.js';
import { withConnection } from '../db/withConnection.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RULES_STATUS_VALUES = new Set([
  'draft',
  'pending_review',
  'active',
  'deprecated',
  'rejected',
]);

// 14 referentials_*_active views from migration 037, in the
// order declared there. Each entry maps to the public-facing
// `code` returned by GET /referentials.
const REFERENTIAL_VIEWS: ReadonlyArray<{ code: string; view: string }> = [
  { code: 'annexes', view: 'referentials_annexes_active' },
  { code: 'rubriques', view: 'referentials_rubriques_active' },
  { code: 'colonnes', view: 'referentials_colonnes_active' },
  { code: 'xml_structures', view: 'referentials_xml_structures_active' },
  { code: 'sentinels', view: 'referentials_sentinels_active' },
  { code: 'banks', view: 'referentials_banks_active' },
  { code: 'currencies', view: 'referentials_currencies_active' },
  { code: 'sectors', view: 'referentials_sectors_active' },
  { code: 'identifier_types', view: 'referentials_identifier_types_active' },
  { code: 'consolidation_methods', view: 'referentials_consolidation_methods_active' },
  { code: 'instruments', view: 'referentials_instruments_active' },
  { code: 'contract_types', view: 'referentials_contract_types_active' },
  { code: 'error_codes', view: 'referentials_error_codes_active' },
  { code: 'annexe_dependencies', view: 'referentials_annexe_dependencies_active' },
];

/**
 * /api/tenants/:tenantId
 *   GET /rules                 -> rules_active, paginated, optional ax_term
 *   GET /rules/pending-review  -> rules WHERE status='pending_review'
 *   GET /rules/:ruleId         -> rules_active row + terms JSONB
 *   GET /referentials          -> 14-view UNION ALL aggregate
 */
export function libraryRouter(pool: Pool): IRouter {
  const router = Router({ mergeParams: true });

  router.get('/rules/pending-review', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    try {
      const rows = await withConnection(pool, { tenantId, userId }, async (client) => {
        const r = await client.query(
          `SELECT id, ax_term, num_regle, version, operator,
                  natural_language, terms_count, is_inter_annexe,
                  status, valid_from, author_user_id, created_at
             FROM rules
            WHERE tenant_id = $1
              AND status = 'pending_review'
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT 50`,
          [tenantId],
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

  router.get('/rules/:ruleId', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    const ruleId = req.params['ruleId'] as string;
    if (!UUID_RE.test(ruleId)) {
      res.status(400).json({
        error: { code: 'INVALID_RULE_ID', message: 'ruleId must be a valid UUID' },
      });
      return;
    }
    try {
      const row = await withConnection(pool, { tenantId, userId }, async (client) => {
        const r = await client.query(
          `SELECT id, ax_term, num_regle, version, operator,
                  type_ctrl_declared, type_ctrl_computed,
                  condition_expression, zone_texte, natural_language,
                  terms, terms_count, is_inter_annexe, involved_annexes,
                  source_circulaire, source_article, source_page,
                  source_rag_chunk_id, valid_from, valid_to,
                  status, created_at, updated_at
             FROM rules_active
            WHERE id = $1 AND tenant_id = $2`,
          [ruleId, tenantId],
        );
        return r.rows[0] ?? null;
      });
      if (row === null) {
        res.status(404).json({
          error: { code: 'RULE_NOT_FOUND', message: 'Rule not found or not active' },
        });
        return;
      }
      res.json({
        data: row,
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  router.get('/rules', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    const axTerm = typeof req.query['ax_term'] === 'string' ? req.query['ax_term'] : null;
    const statusFilter =
      typeof req.query['status'] === 'string' && RULES_STATUS_VALUES.has(req.query['status'])
        ? req.query['status']
        : null;
    const pageStr = typeof req.query['page'] === 'string' ? req.query['page'] : '1';
    const limitStr = typeof req.query['limit'] === 'string' ? req.query['limit'] : '50';
    const page = Math.max(1, Number.parseInt(pageStr, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(limitStr, 10) || 50));
    const offset = (page - 1) * limit;

    // When status is explicitly provided we drop the rules_active view (which
    // forces status='active') and query the base table; otherwise we use the
    // view to honour the bitemporal active-version contract.
    const useView = statusFilter === null;
    const fromClause = useView ? 'rules_active' : 'rules';
    const conditions: string[] = ['tenant_id = $1'];
    const args: Array<string | number> = [tenantId];
    if (axTerm !== null) {
      args.push(axTerm);
      conditions.push(`ax_term = $${args.length}`);
    }
    if (statusFilter !== null) {
      args.push(statusFilter);
      conditions.push(`status = $${args.length}`);
      conditions.push('deleted_at IS NULL');
    }
    args.push(limit);
    args.push(offset);
    const limitOffsetSql = `LIMIT $${args.length - 1} OFFSET $${args.length}`;

    try {
      const data = await withConnection(pool, { tenantId, userId }, async (client) => {
        const rows = await client.query(
          `SELECT id, ax_term, num_regle, version, operator,
                  natural_language, terms_count, is_inter_annexe,
                  status, valid_from, type_ctrl_computed
             FROM ${fromClause}
            WHERE ${conditions.join(' AND ')}
            ORDER BY ax_term, num_regle
            ${limitOffsetSql}`,
          args,
        );
        const cnt = await client.query(
          `SELECT COUNT(*)::int AS total
             FROM ${fromClause}
            WHERE ${conditions.join(' AND ')}`,
          args.slice(0, args.length - 2),
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

  router.get('/referentials', async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    // Build a deterministic UNION ALL across the 14 _active views.
    // Each subquery exposes the same shape: (code, entry_count, last_valid_from).
    // `code` is a literal per view (not a SQL parameter) so the planner can
    // pick the right index per view; the literals come from REFERENTIAL_VIEWS,
    // which is protocol grammar (constant in source), not user input.
    const unionSql = REFERENTIAL_VIEWS.map(
      ({ code, view }) =>
        `SELECT '${code}' AS code,
              COUNT(*)::int            AS entry_count,
              MAX(valid_from)          AS last_valid_from,
              MAX(updated_at)          AS last_updated_at
         FROM ${view}
        WHERE tenant_id = $1`,
    ).join('\n  UNION ALL\n  ');
    try {
      const rows = await withConnection(pool, { tenantId, userId }, async (client) => {
        const r = await client.query(`${unionSql}\nORDER BY code`, [tenantId]);
        return r.rows;
      });
      res.json({
        data: rows,
        meta: { ts: new Date().toISOString(), version: '1', view_count: REFERENTIAL_VIEWS.length },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  return router;
}
