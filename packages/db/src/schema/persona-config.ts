// Persona Regalica configuration — controls tone, language, and confidence thresholds
// for AI-generated responses.
//
// RLS policy: users may read persona config for their tenant (or global config where tenant_id is null).
// Write access restricted to tenant admins.

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants';

export const personaConfig = pgTable(
  'persona_config',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Null means this config is the global default; a non-null value overrides per tenant.
    tenantId: uuid('tenant_id').references(() => tenants.id, {
      onDelete: 'cascade',
    }),
    // Stable key identifying which persona aspect this row configures, e.g. 'default_assistant'.
    configKey: text('config_key').notNull(),
    // Tone descriptor, e.g. 'formal', 'neutral', 'pedagogique'.
    tone: text('tone'),
    // Suggested maximum response length in words.
    targetLengthWords: integer('target_length_words'),
    // Minimum model confidence required before surfacing a response (0.00–1.00).
    confidenceThreshold: numeric('confidence_threshold', {
      precision: 5,
      scale: 4,
    })
      .notNull()
      .default('0.9500'),
    // Primary language for responses: 'fr' | 'ar' | 'en'.
    language: text('language').notNull().default('fr'),
    isActive: boolean('is_active').notNull().default(true),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({
    // One active config per (tenant, config_key).
    tenantConfigKeyUniq: unique('persona_config_tenant_key_uniq').on(
      t.tenantId,
      t.configKey
    ),
  })
);

export const personaConfigRelations = relations(personaConfig, ({ one }) => ({
  tenant: one(tenants, {
    fields: [personaConfig.tenantId],
    references: [tenants.id],
  }),
}));

export type PersonaConfig = typeof personaConfig.$inferSelect;
export type NewPersonaConfig = typeof personaConfig.$inferInsert;
