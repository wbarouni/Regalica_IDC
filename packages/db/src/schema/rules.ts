// RLS policy: users may only access rules belonging to their tenant.
// Hierarchical override: a child tenant's rule with inherited_from set shadows the parent rule.

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { tenants } from './tenants';

export const rules = pgTable(
  'rules',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    // BCT annexe code that owns this rule, e.g. '132'.
    annexeCode: text('annexe_code').notNull(),
    // Sequential rule number within the annexe.
    numRegle: integer('num_regle').notNull(),
    // Operator: = | >= | <= | SUM | etc.
    operRegle: text('oper_regle').notNull(),
    typeCtrl: text('type_ctrl'),
    isActive: boolean('is_active').notNull().default(true),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    // Points to the parent tenant's rule this record overrides. Null for original rules.
    inheritedFrom: uuid('inherited_from').references(
      (): ReturnType<typeof uuid> => rules.id,
      { onDelete: 'set null' }
    ),
  },
  (t) => ({
    // Partial index for fast active-rule lookup by tenant + annexe + rule number.
    activeRulesIdx: index('rules_active_idx')
      .on(t.tenantId, t.annexeCode, t.numRegle)
      .where(sql`${t.isActive} = true`),
  })
);

export const rulesRelations = relations(rules, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [rules.tenantId],
    references: [tenants.id],
  }),
  inheritedFromRule: one(rules, {
    fields: [rules.inheritedFrom],
    references: [rules.id],
    relationName: 'rule_overrides',
  }),
  overriddenBy: many(rules, {
    relationName: 'rule_overrides',
  }),
}));

export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;
