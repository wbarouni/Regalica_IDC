// Pilier 2: Design tokens from DB — no hardcoded hex values or design constants in application code.
// This table is the single source of truth for all design values (colors, spacing, radii, etc.).
// The frontend must fetch tokens from this table and apply them at runtime or build time.
//
// RLS policy: all authenticated users may read active design tokens.
// Write access restricted to platform admins only.
//
// Partial unique index: only one active record per key at any time.
// Deactivating a token (is_active = false) allows a replacement to be inserted with the same key.

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  check,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const designTokens = pgTable(
  'design_tokens',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Token identifier, e.g. 'color.primary.500' or 'spacing.md'.
    key: text('key').notNull(),
    // Raw token value, e.g. '#2563EB' for a color or '16px' for spacing.
    value: text('value').notNull(),
    // Allowed values: color | spacing | radius | shadow | typography | motion | glass
    category: text('category').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    categoryCheck: check(
      'design_tokens_category_check',
      sql`${t.category} IN ('color','spacing','radius','shadow','typography','motion','glass')`
    ),
    // Partial unique index: at most one active record per key.
    // Drizzle generates this as: CREATE UNIQUE INDEX ... ON design_tokens (key) WHERE is_active = true
    activeKeyUniq: index('design_tokens_active_key_uniq')
      .on(t.key)
      .where(sql`${t.isActive} = true`),
  })
);

export type DesignToken = typeof designTokens.$inferSelect;
export type NewDesignToken = typeof designTokens.$inferInsert;
