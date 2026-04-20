import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { sequelize } from '../db/sequelize';
import { logger } from '../logger';

const router: IRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromptRow {
  key: string;
  content: string;
  variables: string[];
  locale: string;
  version: number;
}

// ─── GET /api/prompts/:key ────────────────────────────────────────────────────
// Returns the active prompt for a given key + locale.
// Falls back to 'fr' if the requested locale is not found.
// Query params: ?locale=fr (default: 'fr')
// Headers: x-tenant-id (optional; falls back to global default when absent)

router.get(
  '/:key',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { key } = req.params as { key: string };
      const locale = typeof req.query['locale'] === 'string' ? req.query['locale'] : 'fr';
      const tenantId =
        typeof req.headers['x-tenant-id'] === 'string'
          ? req.headers['x-tenant-id']
          : null;

      logger.debug({ key, locale, tenantId }, 'prompts: fetching prompt');

      // Prefer tenant-specific prompt, then global (tenant_id IS NULL).
      // Within each tier prefer the requested locale, then 'fr' as fallback.
      // Take the highest active version.
      const rows = await sequelize.query<PromptRow>(
        `
        SELECT key, content, variables, locale, version
        FROM prompts_registry
        WHERE key = :key
          AND is_active = TRUE
          AND (
            (tenant_id = :tenantId AND locale = :locale)
            OR (tenant_id = :tenantId AND locale = 'fr')
            OR (tenant_id IS NULL AND locale = :locale)
            OR (tenant_id IS NULL AND locale = 'fr')
          )
        ORDER BY
          CASE WHEN tenant_id = :tenantId THEN 0 ELSE 1 END ASC,
          CASE WHEN locale = :locale THEN 0 ELSE 1 END ASC,
          version DESC
        LIMIT 1;
        `,
        {
          replacements: { key, locale, tenantId: tenantId ?? null },
          type: 'SELECT' as any,
        },
      );

      if (rows.length === 0) {
        logger.warn({ key, locale }, 'prompts: key not found');
        res.status(404).json({ error: `Prompt key '${key}' not found` });
        return;
      }

      const prompt = rows[0]!;
      res.json({
        key: prompt.key,
        content: prompt.content,
        variables: prompt.variables,
        locale: prompt.locale,
        version: prompt.version,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/prompts ─────────────────────────────────────────────────────────
// Lists all active prompts visible to the tenant (tenant-specific + global).
// Returns the highest active version per (key, locale), tenant-override wins.
// Headers: x-tenant-id (optional)

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId =
        typeof req.headers['x-tenant-id'] === 'string'
          ? req.headers['x-tenant-id']
          : null;

      logger.debug({ tenantId }, 'prompts: listing all active prompts');

      // For each (key, locale) pair, pick the tenant-specific row if it exists,
      // otherwise the global row. Within each tier take the highest version.
      const rows = await sequelize.query<PromptRow>(
        `
        SELECT DISTINCT ON (key, locale)
          key, content, variables, locale, version
        FROM prompts_registry
        WHERE is_active = TRUE
          AND (tenant_id = :tenantId OR tenant_id IS NULL)
        ORDER BY
          key ASC,
          locale ASC,
          CASE WHEN tenant_id = :tenantId THEN 0 ELSE 1 END ASC,
          version DESC;
        `,
        {
          replacements: { tenantId: tenantId ?? null },
          type: 'SELECT' as any,
        },
      );

      res.json({ prompts: rows });
    } catch (err) {
      next(err);
    }
  },
);

export { router as promptsRouter };
