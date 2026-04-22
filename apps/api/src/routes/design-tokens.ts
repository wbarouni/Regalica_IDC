import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { sequelize } from '../db/sequelize';
import { logger } from '../logger';

const router: IRouter = Router();

interface DesignTokenRow {
  id: string;
  key: string;
  value: string;
  category: string;
  description: string | null;
}

// ─── GET /api/design-tokens ───────────────────────────────────────────────────
// Returns all active design tokens, optionally filtered by category.
// Query params: ?category=color (optional)

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const category =
        typeof req.query['category'] === 'string' ? req.query['category'] : null;

      logger.debug({ category }, 'design-tokens: listing tokens');

      const rows = await sequelize.query<DesignTokenRow>(
        `
        SELECT id, key, value, category, description
        FROM design_tokens
        WHERE is_active = TRUE
          ${category ? 'AND category = :category' : ''}
        ORDER BY category ASC, key ASC;
        `,
        {
          replacements: category ? { category } : {},
          type: 'SELECT' as any,
        },
      );

      // Group by category for convenient frontend consumption
      const grouped = rows.reduce<Record<string, DesignTokenRow[]>>((acc, row) => {
        if (!acc[row.category]) acc[row.category] = [];
        acc[row.category]!.push(row);
        return acc;
      }, {});

      res.json({ tokens: rows, grouped });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/design-tokens/:key ─────────────────────────────────────────────
// Returns a single active token by key.

router.get(
  '/:key',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { key } = req.params as { key: string };

      const rows = await sequelize.query<DesignTokenRow>(
        `
        SELECT id, key, value, category, description
        FROM design_tokens
        WHERE key = :key AND is_active = TRUE
        LIMIT 1;
        `,
        {
          replacements: { key },
          type: 'SELECT' as any,
        },
      );

      if (rows.length === 0) {
        res.status(404).json({ error: `Design token '${key}' not found` });
        return;
      }

      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

export { router as designTokensRouter };
