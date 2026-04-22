// APPEND-ONLY table — Pilier 6: Immutable Audit History.
// No UPDATE and no DELETE must be enforced:
//   1. RLS policy: deny UPDATE and DELETE for all roles on this table.
//   2. Database trigger: BEFORE UPDATE OR DELETE RAISE EXCEPTION 'rules_history is immutable'.
//
// RLS policy: users may INSERT and SELECT only for their tenant_id.
// SELECT is restricted to rows where tenant_id matches the user's active tenant claim.

import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { rules } from './rules';
import { tenants } from './tenants';
import { usersProfile } from './users-profile';

export const rulesHistory = pgTable('rules_history', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  ruleId: uuid('rule_id')
    .notNull()
    .references(() => rules.id, { onDelete: 'restrict' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  // Full denormalized snapshot of the rule and all its terms at the moment of change.
  snapshot: jsonb('snapshot').notNull(),
  effectiveFrom: timestamp('effective_from', {
    withTimezone: true,
    mode: 'string',
  }).notNull(),
  // Null means this snapshot is still the current version.
  effectiveTo: timestamp('effective_to', {
    withTimezone: true,
    mode: 'string',
  }),
  changedBy: uuid('changed_by')
    .notNull()
    .references(() => usersProfile.id, { onDelete: 'restrict' }),
  changeReason: text('change_reason'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

export const rulesHistoryRelations = relations(rulesHistory, ({ one }) => ({
  rule: one(rules, {
    fields: [rulesHistory.ruleId],
    references: [rules.id],
  }),
  tenant: one(tenants, {
    fields: [rulesHistory.tenantId],
    references: [tenants.id],
  }),
  changedByUser: one(usersProfile, {
    fields: [rulesHistory.changedBy],
    references: [usersProfile.id],
  }),
}));

export type RulesHistory = typeof rulesHistory.$inferSelect;
export type NewRulesHistory = typeof rulesHistory.$inferInsert;
