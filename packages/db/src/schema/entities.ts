// RLS policy: users may only access entities belonging to their tenant.
// Enforce via Supabase RLS: tenant_id must match the user's active tenant claim.

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

export const entities = pgTable(
  'entities',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    // BCT code banque assigned to this filiale/entity.
    code: text('code').notNull(),
    // Self-referential: null means top-level entity within the tenant.
    parentEntityId: uuid('parent_entity_id').references(
      (): ReturnType<typeof uuid> => entities.id,
      { onDelete: 'restrict' }
    ),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // A BCT code must be unique within a tenant.
    tenantCodeUniq: unique('entities_tenant_code_uniq').on(t.tenantId, t.code),
  })
);

export const entitiesRelations = relations(entities, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [entities.tenantId],
    references: [tenants.id],
  }),
  parentEntity: one(entities, {
    fields: [entities.parentEntityId],
    references: [entities.id],
    relationName: 'entity_children',
  }),
  childEntities: many(entities, {
    relationName: 'entity_children',
  }),
}));

export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
