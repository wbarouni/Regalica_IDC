// APPEND-ONLY table — immutable record of every prompt stage promotion.
// No UPDATE and no DELETE must be enforced:
//   1. RLS policy: deny UPDATE and DELETE for all roles on this table.
//   2. Database trigger: BEFORE UPDATE OR DELETE RAISE EXCEPTION 'prompts_history is immutable'.
//
// RLS policy: authorized prompt managers may INSERT; all authenticated users may SELECT
// promotion history for prompts visible to their tenant.

import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { promptsRegistry } from './prompts-registry';
import { usersProfile } from './users-profile';

export const promptsHistory = pgTable('prompts_history', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  promptId: uuid('prompt_id')
    .notNull()
    .references(() => promptsRegistry.id, { onDelete: 'restrict' }),
  // Full snapshot of the prompt_registry row at the time of promotion.
  snapshot: jsonb('snapshot').notNull(),
  // The stage the prompt was promoted TO, e.g. 'canary', 'prod', 'archived'.
  promotedTo: text('promoted_to'),
  // The user who performed the promotion (second approver in 4-yeux flow).
  promotedBy: uuid('promoted_by').references(() => usersProfile.id, {
    onDelete: 'set null',
  }),
  promotedAt: timestamp('promoted_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

export const promptsHistoryRelations = relations(promptsHistory, ({ one }) => ({
  prompt: one(promptsRegistry, {
    fields: [promptsHistory.promptId],
    references: [promptsRegistry.id],
  }),
  promotedByUser: one(usersProfile, {
    fields: [promptsHistory.promotedBy],
    references: [usersProfile.id],
  }),
}));

export type PromptHistory = typeof promptsHistory.$inferSelect;
export type NewPromptHistory = typeof promptsHistory.$inferInsert;
