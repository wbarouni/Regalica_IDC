// Pilier 3: ZERO HALLUCINATION — every AI response must have all 4 mandatory metadata fields:
//   1. citations     — array of kb_chunk ids sourcing the response
//   2. confidence_score — model confidence in [0, 1]
//   3. response_timestamp — exact UTC moment of generation
//   4. model_version — exact model identifier used
//
// Guardrail violations are captured in guardrail_violations jsonb for audit and improvement.
//
// RLS policy: rows are readable only by the tenant whose tenant_id matches the user's claim.
// The AI worker writes via service role; no user can INSERT directly.

import {
  pgTable,
  uuid,
  text,
  boolean,
  numeric,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants';
import { usersProfile } from './users-profile';

export const regalicaResponsesAudit = pgTable('regalica_responses_audit', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').references(() => usersProfile.id, {
    onDelete: 'set null',
  }),
  // Client-generated session identifier for grouping a conversation.
  sessionId: text('session_id'),
  // The prompt_key from prompts_registry that generated this response.
  promptKey: text('prompt_key').notNull(),
  // Exact model identifier, e.g. 'claude-sonnet-4-6-20251120'.
  modelVersion: text('model_version').notNull(),
  responseText: text('response_text').notNull(),
  // Model self-reported confidence in [0.0000, 1.0000].
  confidenceScore: numeric('confidence_score', {
    precision: 6,
    scale: 5,
  }).notNull(),
  // Array of kb_chunk.id UUIDs that were cited to produce this response.
  citations: jsonb('citations').notNull(),
  // Snapshot version of the knowledge base used at the time of generation.
  kbSnapshotVersion: text('kb_snapshot_version'),
  // UTC timestamp of when the model generated the response.
  responseTimestamp: timestamp('response_timestamp', {
    withTimezone: true,
    mode: 'string',
  }).notNull(),
  passedGuardrails: boolean('passed_guardrails').notNull(),
  // Structured list of guardrail checks that failed, if any. Null when all passed.
  guardrailViolations: jsonb('guardrail_violations'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

export const regalicaResponsesAuditRelations = relations(
  regalicaResponsesAudit,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [regalicaResponsesAudit.tenantId],
      references: [tenants.id],
    }),
    user: one(usersProfile, {
      fields: [regalicaResponsesAudit.userId],
      references: [usersProfile.id],
    }),
  })
);

export type RegalicaResponseAudit = typeof regalicaResponsesAudit.$inferSelect;
export type NewRegalicaResponseAudit =
  typeof regalicaResponsesAudit.$inferInsert;
