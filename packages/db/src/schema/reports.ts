// RLS policy: users may only access reports belonging to their tenant.
// Composite business key D2.5: no two active reports may share (tenant, entity, annexe, period)
// outside of an explicit new version bump.
//
// Status lifecycle: uploaded -> structure_ok | structure_failed -> validated -> signed -> archived

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  date,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { entities } from './entities';
import { annexes } from './annexes';
import { usersProfile } from './users-profile';

export const reports = pgTable(
  'reports',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    annexeId: uuid('annexe_id')
      .notNull()
      .references(() => annexes.id, { onDelete: 'restrict' }),
    // Reporting period start date, e.g. '2024-03-31' for monthly March 2024.
    period: date('period', { mode: 'string' }).notNull(),
    // Matches annexe.frequency for the relevant period.
    periodFrequency: text('period_frequency').notNull(),
    version: integer('version').notNull().default(1),
    // Path in Supabase Storage bucket, e.g. 'tenants/{id}/reports/{id}.xml'.
    xmlStoragePath: text('xml_storage_path'),
    // SHA-256 hex digest of the uploaded XML for integrity verification.
    xmlSha256: text('xml_sha256'),
    // Allowed values: uploaded | structure_ok | structure_failed | validated | signed | archived
    status: text('status').notNull().default('uploaded'),
    uploadedBy: uuid('uploaded_by').references(() => usersProfile.id, {
      onDelete: 'set null',
    }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    validatedAt: timestamp('validated_at', {
      withTimezone: true,
      mode: 'string',
    }),
    signedAt: timestamp('signed_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({
    // Composite key D2.5: unique per (tenant, entity, annexe, period, version).
    tenantEntityAnnexePeriodVersionUniq: unique(
      'reports_tenant_entity_annexe_period_version_uniq'
    ).on(t.tenantId, t.entityId, t.annexeId, t.period, t.version),
    statusCheck: check(
      'reports_status_check',
      sql`${t.status} IN ('uploaded','structure_ok','structure_failed','validated','signed','archived')`
    ),
  })
);

export const reportsRelations = relations(reports, ({ one }) => ({
  tenant: one(tenants, {
    fields: [reports.tenantId],
    references: [tenants.id],
  }),
  entity: one(entities, {
    fields: [reports.entityId],
    references: [entities.id],
  }),
  annexe: one(annexes, {
    fields: [reports.annexeId],
    references: [annexes.id],
  }),
  uploadedByUser: one(usersProfile, {
    fields: [reports.uploadedBy],
    references: [usersProfile.id],
  }),
}));

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
