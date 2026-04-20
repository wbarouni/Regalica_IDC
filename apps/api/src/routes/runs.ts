import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';

import { sequelize } from '../db/sequelize';
import { logger } from '../logger';

export const runsRouter: IRouter = Router();

interface RunSummaryRow {
  id: string;
  tenant_id: string;
  status: string;
  pass_count: string;
  fail_count: string;
  skip_count: string;
  created_at: string;
}

interface FirstFailRow {
  verdict_id: string;
  run_id: string;
  annexe_code: string;
  num_regle: number;
  oper_regle: string;
  lhs: string | null;
  rhs: string | null;
  gap: string | null;
  zone_texte: string | null;
}

/** GET /api/runs/:id — run summary with PASS/FAIL/SKIP counts */
runsRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'];
      if (typeof tenantId !== 'string' || !tenantId) {
        res.status(400).json({ error: 'x-tenant-id header is required' });
        return;
      }

      const runId = req.params['id'];
      logger.debug({ runId, tenantId }, 'GET /api/runs/:id');

      const rows = await sequelize.query<RunSummaryRow>(
        `SELECT
           r.id,
           r.tenant_id,
           r.status,
           COUNT(*) FILTER (WHERE v.status = 'PASS') AS pass_count,
           COUNT(*) FILTER (WHERE v.status = 'FAIL') AS fail_count,
           COUNT(*) FILTER (WHERE v.status = 'SKIP') AS skip_count,
           r.created_at
         FROM validation_runs r
         LEFT JOIN verdicts v ON v.run_id = r.id
         WHERE r.id = :runId
           AND r.tenant_id = :tenantId
         GROUP BY r.id`,
        {
          replacements: { runId, tenantId },
          type: 'SELECT' as any,
        },
      );

      if (rows.length === 0) {
        logger.warn({ runId, tenantId }, 'run not found');
        res.status(404).json({ error: 'Run not found' });
        return;
      }

      const row = rows[0]!;
      res.json({
        runId: row.id,
        tenantId: row.tenant_id,
        status: row.status,
        pass: Number(row.pass_count),
        fail: Number(row.fail_count),
        skip: Number(row.skip_count),
        createdAt: row.created_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/runs/:id/fails/first — first FAIL verdict enriched with rule metadata */
runsRouter.get(
  '/:id/fails/first',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'];
      if (typeof tenantId !== 'string' || !tenantId) {
        res.status(400).json({ error: 'x-tenant-id header is required' });
        return;
      }

      const runId = req.params['id'];
      logger.debug({ runId, tenantId }, 'GET /api/runs/:id/fails/first');

      // Verify the run exists and belongs to this tenant
      const runRows = await sequelize.query<{ id: string }>(
        `SELECT id FROM validation_runs WHERE id = :runId AND tenant_id = :tenantId LIMIT 1`,
        {
          replacements: { runId, tenantId },
          type: 'SELECT' as any,
        },
      );

      if (runRows.length === 0) {
        logger.warn({ runId, tenantId }, 'run not found');
        res.status(404).json({ error: 'Run not found' });
        return;
      }

      const rows = await sequelize.query<FirstFailRow>(
        `SELECT
           v.id           AS verdict_id,
           v.run_id,
           v.annexe_code,
           v.num_regle,
           v.oper_regle,
           v.lhs,
           v.rhs,
           v.gap,
           r.zone_texte
         FROM verdicts v
         LEFT JOIN rules r ON v.rule_id = r.id
         WHERE v.run_id  = :runId
           AND v.status   = 'FAIL'
         ORDER BY v.created_at
         LIMIT 1`,
        {
          replacements: { runId },
          type: 'SELECT' as any,
        },
      );

      if (rows.length === 0) {
        logger.warn({ runId, tenantId }, 'no FAIL verdict found for run');
        res.status(404).json({ error: 'No FAIL verdict found for this run' });
        return;
      }

      const row = rows[0]!;
      res.json({
        runId: row.run_id,
        verdictId: row.verdict_id,
        annexeCode: row.annexe_code,
        numRegle: row.num_regle,
        operRegle: row.oper_regle,
        lhs: row.lhs,
        rhs: row.rhs,
        gap: row.gap,
        zoneTexte: row.zone_texte,
      });
    } catch (err) {
      next(err);
    }
  },
);
