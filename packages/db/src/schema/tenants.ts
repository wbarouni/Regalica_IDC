// RLS policy: users see only their own tenant and its children (descendant tenants).
// Enforce via Supabase RLS: auth.uid() must belong to tenant or an ancestor tenant.

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const tenants = pgTable('tenants', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  // Self-referential: null means this is a maison-mere (root tenant).
  parentId: uuid('parent_id').references((): ReturnType<typeof uuid> => tenants.id, {
    onDelete: 'restrict',
  }),
  // plan values: free | starter | pro | enterprise
  plan: text('plan').notNull().default('free'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  parent: one(tenants, {
    fields: [tenants.parentId],
    references: [tenants.id],
    relationName: 'tenant_children',
  }),
  children: many(tenants, {
    relationName: 'tenant_children',
  }),
}));

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
