// Pilier 2: Versioned LLM prompts — no hardcoded prompt strings in application code.
// Stage promotion path: research -> canary -> prod requires 4-yeux (two-person) signature.
// Archiving a prod prompt also requires 4-yeux authorization.
//
// RLS policy: users may read active prod prompts for their tenant (or global prompts where tenant_id is null).
// Write access restricted to authorized prompt managers; stage changes require two distinct user approvals.

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { usersProfile } from './users-profile';

export const promptsRegistry = pgTable(
  'prompts_registry',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Null means this prompt applies globally to all tenants.
    tenantId: uuid('tenant_id').references(() => tenants.id, {
      onDelete: 'cascade',
    }),
    // Stable logical identifier, e.g. 'analyse_annexe_132' — version tracked separately.
    promptKey: text('prompt_key').notNull(),
    version: integer('version').notNull().default(1),
    contentFr: text('content_fr').notNull(),
    contentAr: text('content_ar'),
    contentEn: text('content_en'),
    // Target model identifier, e.g. 'claude-opus-4-7' or 'claude-sonnet-4-6'.
    modelTarget: text('model_target').notNull(),
    // Allowed values: research | canary | prod | archived
    stage: text('stage').notNull().default('research'),
    isActive: boolean('is_active').notNull().default(false),
    effectiveDate: timestamp('effective_date', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    createdBy: uuid('created_by').references(() => usersProfile.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // One record per (tenant, prompt_key, version) — a new version creates a new row.
    tenantKeyVersionUniq: unique('prompts_registry_tenant_key_version_uniq').on(
      t.tenantId,
      t.promptKey,
      t.version
    ),
    stageCheck: check(
      'prompts_registry_stage_check',
      sql`${t.stage} IN ('research','canary','prod','archived')`
    ),
  })
);

export const promptsRegistryRelations = relations(
  promptsRegistry,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [promptsRegistry.tenantId],
      references: [tenants.id],
    }),
    createdByUser: one(usersProfile, {
      fields: [promptsRegistry.createdBy],
      references: [usersProfile.id],
    }),
  })
);

export type PromptRegistry = typeof promptsRegistry.$inferSelect;
export type NewPromptRegistry = typeof promptsRegistry.$inferInsert;
