// Pilier 4: SUGGEST DON'T REPAIR.
// Each upload attempt is recorded here. The system produces repair_suggestions but never
// auto-modifies the user's XML. The human must correct and re-upload.
//
// RLS policy: users may INSERT and SELECT upload versions for reports in their tenant.

import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { reports } from './reports';
import { tenants } from './tenants';
import { usersProfile } from './users-profile';

export const uploadVersions = pgTable('upload_versions', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  reportId: uuid('report_id')
    .notNull()
    .references(() => reports.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  // Monotonically increasing upload attempt counter per report.
  versionNum: integer('version_num').notNull(),
  // Path in Supabase Storage for this specific upload.
  xmlPath: text('xml_path'),
  // SHA-256 hex digest for integrity verification.
  xmlSha256: text('xml_sha256'),
  // Structured list of structure/schema validation errors found in the uploaded XML.
  structureErrors: jsonb('structure_errors'),
  uploadedBy: uuid('uploaded_by').references(() => usersProfile.id, {
    onDelete: 'set null',
  }),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
  // Non-destructive suggestions only — the human applies or ignores them.
  repairSuggestions: jsonb('repair_suggestions'),
});

export const uploadVersionsRelations = relations(uploadVersions, ({ one }) => ({
  report: one(reports, {
    fields: [uploadVersions.reportId],
    references: [reports.id],
  }),
  tenant: one(tenants, {
    fields: [uploadVersions.tenantId],
    references: [tenants.id],
  }),
  uploadedByUser: one(usersProfile, {
    fields: [uploadVersions.uploadedBy],
    references: [usersProfile.id],
  }),
}));

export type UploadVersion = typeof uploadVersions.$inferSelect;
export type NewUploadVersion = typeof uploadVersions.$inferInsert;
