import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import type { Server as SocketServer } from 'socket.io';

import { logger } from '../logger';
import { validateStructure } from '../agents/structure-validator';
import { runEvaluation } from '../agents/evaluator';
import type { RuleWithTerms } from '../agents/evaluator/types';
import { Rule } from '../db/models/rule';
import { RuleTerm } from '../db/models/rule-term';
import { ValidationRun } from '../db/models/validation-run';
import { Verdict } from '../db/models/verdict';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function emitProgress(io: SocketServer, runId: string, pct: number): void {
  io.emit('progress', { runId, percentage: pct });
}

export function createUploadsRouter(io: SocketServer): Router {
  const router = Router();

  router.post(
    '/evaluate',
    upload.array('files'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const tenantId = req.headers['x-tenant-id'];
        if (typeof tenantId !== 'string' || !tenantId) {
          res.status(400).json({ error: 'x-tenant-id header is required' });
          return;
        }

        const files = req.files as Express.Multer.File[] | undefined;
        if (!files || files.length === 0) {
          res.status(400).json({ error: 'At least one XML file is required' });
          return;
        }

        // Structure validation
        const structureErrors: Array<{ file: string; errors: unknown[] }> = [];
        const xmlFiles = new Map<string, string>();

        for (const file of files) {
          const content = file.buffer.toString('utf-8');
          const result = validateStructure(content);
          if (!result.valid) {
            structureErrors.push({ file: file.originalname, errors: result.errors });
          } else {
            xmlFiles.set(file.originalname, content);
          }
        }

        if (structureErrors.length > 0) {
          res.status(422).json({ error: 'Structure validation failed', details: structureErrors });
          return;
        }

        // Load active rules for tenant
        const dbRules = await Rule.findAll({
          where: { tenant_id: tenantId, is_active: true },
          include: [{ model: RuleTerm, as: 'terms' }],
        });

        const rules: RuleWithTerms[] = dbRules.map((r) => ({
          id: r.id,
          tenant_id: r.tenant_id,
          annexe_code: r.annexe_code,
          num_regle: r.num_regle,
          oper_regle: r.oper_regle,
          type_ctrl: r.type_ctrl,
          zone_texte: r.zone_texte,
          is_active: r.is_active,
          terms: (r as unknown as { terms: RuleTerm[] }).terms ?? [],
        }));

        emitProgress(io, 'pending', 25);

        const evalResult = await runEvaluation(xmlFiles, rules, tenantId);

        emitProgress(io, evalResult.runId, 50);

        // Persist run
        const run = await ValidationRun.create({
          id: evalResult.runId,
          tenant_id: tenantId,
          bank_code: 'unknown',
          date_annexe: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
          status: 'done',
          pass_count: evalResult.pass,
          fail_count: evalResult.fail,
          skip_count: evalResult.skip,
        });

        emitProgress(io, run.id, 75);

        // Persist verdicts
        const verdictRows = evalResult.verdicts.map((v) => ({
          run_id: run.id,
          rule_id: v.ruleId,
          annexe_code: v.annexeCode,
          num_regle: v.numRegle,
          oper_regle: v.operRegle,
          status: v.status,
          lhs: v.lhs,
          rhs: v.rhs,
          gap: v.gap,
          skip_reason: v.skipReason,
        }));

        await Verdict.bulkCreate(verdictRows);

        // Emit FAIL verdicts via socket
        for (const v of evalResult.verdicts) {
          if (v.status === 'FAIL') {
            io.emit('verdict', v);
          }
        }

        emitProgress(io, run.id, 100);

        logger.info({ runId: run.id, pass: evalResult.pass, fail: evalResult.fail }, 'evaluation complete');
        res.status(200).json(evalResult);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
