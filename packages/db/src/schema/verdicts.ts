// 5-type verdict results produced by the RDG validation engine.
// gap_decimal is stored as text to preserve Decimal 38 precision without floating-point loss.
//
// RLS policy: users may read verdicts for validation runs in their tenant.
// Only the validation worker service role may INSERT rows.

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { validationRuns } from './validation-runs';
import { tenants } from './tenants';
import { rules } from './rules';

export const verdicts = pgTable(
  'verdicts',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    runId: uuid('run_id')
      .notNull()
      .references(() => validationRuns.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => rules.id, { onDelete: 'restrict' }),
    annexeCode: text('annexe_code').notNull(),
    numRegle: integer('num_regle').notNull(),
    // Allowed values: PASS | FAIL | SKIPPED_MISSING_RUBRIQUE | SKIPPED_MISSING_ANNEXE |
    //                 SKIPPED_CONDITIONAL | SKIPPED_UNSUPPORTED_OP
    status: text('status').notNull(),
    lhsValue: text('lhs_value'),
    rhsValue: text('rhs_value'),
    // Absolute gap between LHS and RHS — stored as text for Decimal 38 precision.
    gapDecimal: text('gap_decimal'),
    skipReason: text('skip_reason'),
    // Rubrique code involved in the verdict, for display and filtering.
    rubrique: text('rubrique'),
    domaine: text('domaine'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusCheck: check(
      'verdicts_status_check',
      sql`${t.status} IN ('PASS','FAIL','SKIPPED_MISSING_RUBRIQUE','SKIPPED_MISSING_ANNEXE','SKIPPED_CONDITIONAL','SKIPPED_UNSUPPORTED_OP')`
    ),
  })
);

export const verdictsRelations = relations(verdicts, ({ one }) => ({
  run: one(validationRuns, {
    fields: [verdicts.runId],
    references: [validationRuns.id],
  }),
  tenant: one(tenants, {
    fields: [verdicts.tenantId],
    references: [tenants.id],
  }),
  rule: one(rules, {
    fields: [verdicts.ruleId],
    references: [rules.id],
  }),
}));

export type Verdict = typeof verdicts.$inferSelect;
export type NewVerdict = typeof verdicts.$inferInsert;
