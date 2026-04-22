// CRITICAL: This table is the single source of truth for the 52 BCT annexes.
// NEVER hardcode the annexe list anywhere in the application — always SELECT FROM annexes.
//
// RLS policy: authenticated users may read annexes for their tenant.
// Write access restricted to tenant admins (validated_by must be set by an authorized user).

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  date,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { usersProfile } from './users-profile';

export const annexes = pgTable(
  'annexes',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    // BCT annexe code, e.g. 00, 51, 132, 630.
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    // Allowed values: daily | weekly | monthly | quarterly | semiannual | annual | on_demand
    frequency: text('frequency').notNull(),
    domain: text('domain'),
    subDomain: text('sub_domain'),
    effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
    deprecationDate: date('deprecation_date', { mode: 'string' }),
    isActive: boolean('is_active').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    // Four-eyes validation: a second authorized user must confirm the annexe definition.
    validatedBy: uuid('validated_by').references(() => usersProfile.id, {
      onDelete: 'set null',
    }),
    validatedAt: timestamp('validated_at', {
      withTimezone: true,
      mode: 'string',
    }),
  },
  (t) => ({
    // Versioned uniqueness: one record per (tenant, code, version) combination.
    tenantCodeVersionUniq: unique('annexes_tenant_code_version_uniq').on(
      t.tenantId,
      t.code,
      t.version
    ),
    frequencyCheck: check(
      'annexes_frequency_check',
      sql`${t.frequency} IN ('daily','weekly','monthly','quarterly','semiannual','annual','on_demand')`
    ),
  })
);

export const annexesRelations = relations(annexes, ({ one }) => ({
  tenant: one(tenants, {
    fields: [annexes.tenantId],
    references: [tenants.id],
  }),
  validatedByUser: one(usersProfile, {
    fields: [annexes.validatedBy],
    references: [usersProfile.id],
  }),
}));

export type Annexe = typeof annexes.$inferSelect;
export type NewAnnexe = typeof annexes.$inferInsert;
