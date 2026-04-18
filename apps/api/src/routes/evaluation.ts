import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';

import { ValidationRun } from '../db/models/validation-run';
import { Verdict } from '../db/models/verdict';

const router: IRouter = Router();

/** GET /api/evaluation/runs — list validation runs for a tenant */
router.get('/runs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.headers['x-tenant-id'];
    if (typeof tenantId !== 'string' || !tenantId) {
      res.status(400).json({ error: 'x-tenant-id header is required' });
      return;
    }

    const runs = await ValidationRun.findAll({
      where: { tenant_id: tenantId },
      order: [['created_at', 'DESC']],
      limit: 100,
    });

    res.json({ runs });
  } catch (err) {
    next(err);
  }
});

/** GET /api/evaluation/runs/:runId — get run details with verdicts */
router.get('/runs/:runId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.headers['x-tenant-id'];
    if (typeof tenantId !== 'string' || !tenantId) {
      res.status(400).json({ error: 'x-tenant-id header is required' });
      return;
    }

    const run = await ValidationRun.findOne({
      where: { id: req.params['runId'], tenant_id: tenantId },
    });

    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const verdicts = await Verdict.findAll({
      where: { run_id: run.id },
      order: [['created_at', 'ASC']],
    });

    res.json({ run, verdicts });
  } catch (err) {
    next(err);
  }
});

export { router as evaluationRouter };
