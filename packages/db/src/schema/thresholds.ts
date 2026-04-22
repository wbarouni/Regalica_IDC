// RLS policy: users may read thresholds for their tenant.
// Write access restricted to tenant admins; changes should also write to rules_history.
//
// value_decimal is stored as text to preserve Decimal 38 precision without floating-point loss.

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants';

export const thresholds = pgTable(
  'thresholds',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    // Human-readable key identifying the threshold, e.g. 'RATIO_SOLVABILITE_MIN'.
    thresholdKey: text('threshold_key').notNull(),
    // Stored as text to preserve Decimal 38 precision (e.g. '0.08000000000000000000000000000000000000').
    valueDecimal: text('value_decimal').notNull(),
    // Unit of measure, e.g. 'percent', 'TND', 'ratio'.
    unit: text('unit'),
    effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
    // Null means the threshold is currently in effect with no scheduled expiry.
    expiryDate: date('expiry_date', { mode: 'string' }),
    // BCT regulatory reference, e.g. 'Circulaire BCT 2023-08 Art.12'.
    regulatoryRef: text('regulatory_ref'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Only one value per (tenant, key, effective date) — new versions get a new effective_date.
    tenantKeyDateUniq: unique('thresholds_tenant_key_date_uniq').on(
      t.tenantId,
      t.thresholdKey,
      t.effectiveDate
    ),
  })
);

export const thresholdsRelations = relations(thresholds, ({ one }) => ({
  tenant: one(tenants, {
    fields: [thresholds.tenantId],
    references: [tenants.id],
  }),
}));

export type Threshold = typeof thresholds.$inferSelect;
export type NewThreshold = typeof thresholds.$inferInsert;
