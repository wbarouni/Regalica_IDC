// Stub reference table for Supabase auth.users profiles.
// RLS policy: users may only read/write their own profile row.
// This table mirrors auth.users and is referenced as FK by other tables.

import {
  pgTable,
  uuid,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const usersProfile = pgTable('users_profile', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: uuid('tenant_id').notNull(),
  email: text('email').notNull(),
  fullName: text('full_name'),
  role: text('role').notNull().default('viewer'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
});

export type UserProfile = typeof usersProfile.$inferSelect;
export type NewUserProfile = typeof usersProfile.$inferInsert;
