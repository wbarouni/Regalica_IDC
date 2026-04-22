// RLS policy: users may read annexe column definitions for annexes belonging to their tenant.
// Write access restricted to tenant admins only.

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { annexes } from './annexes';

export const annexeColumns = pgTable(
  'annexe_columns',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    annexeId: uuid('annexe_id')
      .notNull()
      .references(() => annexes.id, { onDelete: 'cascade' }),
    // BCT rubrique code for this column definition.
    rubriquCode: text('rubrique_code').notNull(),
    colonne: text('colonne').notNull(),
    // Allowed values: decimal | text | date | boolean
    dataType: text('data_type').notNull(),
    isRequired: boolean('is_required').notNull().default(true),
    // Optional PCRE regex used for server-side validation of cell values.
    validationRegex: text('validation_regex'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dataTypeCheck: check(
      'annexe_columns_data_type_check',
      sql`${t.dataType} IN ('decimal','text','date','boolean')`
    ),
  })
);

export const annexeColumnsRelations = relations(annexeColumns, ({ one }) => ({
  annexe: one(annexes, {
    fields: [annexeColumns.annexeId],
    references: [annexes.id],
  }),
}));

export type AnnexeColumn = typeof annexeColumns.$inferSelect;
export type NewAnnexeColumn = typeof annexeColumns.$inferInsert;
