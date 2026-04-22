// CRITICAL: This table is the single source of truth for the 1247 BCT rubriques.
// NEVER hardcode the rubrique list anywhere in the application — always SELECT FROM bct_rubriques.
//
// RLS policy: authenticated users may read rubriques for their tenant.
// Write access restricted to tenant admins.

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants';

export const bctRubriques = pgTable(
  'bct_rubriques',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    labelFr: text('label_fr'),
    labelAr: text('label_ar'),
    labelEn: text('label_en'),
    // BCT annexe code this rubrique primarily belongs to.
    annexeCode: text('annexe_code'),
    domain: text('domain'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // A rubrique code must be unique within a tenant.
    tenantCodeUniq: unique('bct_rubriques_tenant_code_uniq').on(
      t.tenantId,
      t.code
    ),
  })
);

export const bctRubriquesRelations = relations(bctRubriques, ({ one }) => ({
  tenant: one(tenants, {
    fields: [bctRubriques.tenantId],
    references: [tenants.id],
  }),
}));

export type BctRubrique = typeof bctRubriques.$inferSelect;
export type NewBctRubrique = typeof bctRubriques.$inferInsert;
