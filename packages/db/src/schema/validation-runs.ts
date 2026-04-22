// Batch validation tracking for RDG rule execution.
// Subscribe to this table via Supabase Realtime to stream live progress to the frontend.
//
// RLS policy: users may read validation runs for reports in their tenant.
// Only the validation worker service role may INSERT and UPDATE rows.

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { reports } from './reports';

export const validationRuns = pgTable(
  'validation_runs',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    // Allowed values: queued | running | completed | failed
    status: text('status').notNull().default('queued'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    passCount: integer('pass_count').notNull().default(0),
    failCount: integer('fail_count').notNull().default(0),
    skipCount: integer('skip_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusCheck: check(
      'validation_runs_status_check',
      sql`${t.status} IN ('queued','running','completed','failed')`
    ),
  })
);

export const validationRunsRelations = relations(validationRuns, ({ one }) => ({
  tenant: one(tenants, {
    fields: [validationRuns.tenantId],
    references: [tenants.id],
  }),
  report: one(reports, {
    fields: [validationRuns.reportId],
    references: [reports.id],
  }),
}));

export type ValidationRun = typeof validationRuns.$inferSelect;
export type NewValidationRun = typeof validationRuns.$inferInsert;
