-- Migration 031_conversations.sql
-- Object: conversations table + indexes + RLS (§22.4) + backfill FK on
--         validation_runs.conversation_id
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 025_validation_runs.sql
-- References: Document 6 §20 (table), §22.4 (RLS)
--
-- The backfill DO block at the bottom satisfies the deferred FK noted in
-- migration 025 (validation_runs.conversation_id -> conversations(id)).
-- This mirrors the 027 pattern for validation_fail_details.cluster_id,
-- keeps the canonical numbering of Document 6 §26, and obsoletes the
-- "migration 031a" idea suggested in 025's TODO.

CREATE TABLE IF NOT EXISTS conversations (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  user_id                   UUID NOT NULL REFERENCES users(id),

  -- Context
  title                     TEXT,
  linked_validation_run_id  UUID REFERENCES validation_runs(id),
  language                  VARCHAR(5) NOT NULL DEFAULT 'fr',

  -- Context compression
  context_summary           TEXT,
  summary_updated_at        TIMESTAMPTZ,
  messages_count            INTEGER NOT NULL DEFAULT 0,
  tokens_total              INTEGER NOT NULL DEFAULT 0,

  -- Lifecycle
  is_archived               BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at               TIMESTAMPTZ,

  -- Systemic audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ,

  CONSTRAINT conv_ck_language CHECK (language IN ('fr', 'en', 'ar'))
);

CREATE INDEX IF NOT EXISTS conv_idx_user_recent
  ON conversations (tenant_id, user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS conv_idx_run
  ON conversations (linked_validation_run_id)
  WHERE linked_validation_run_id IS NOT NULL;

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;

CREATE POLICY conversations_select ON conversations
  FOR SELECT
  USING (
    tenant_id = current_app_tenant_id()
    AND (
      user_id = current_app_user_id()
      OR current_user_has_role('compliance_director')
      OR current_user_has_role('support_readonly')
    )
  );

CREATE POLICY conversations_insert ON conversations
  FOR INSERT
  WITH CHECK (
    tenant_id = current_app_tenant_id()
    AND user_id = current_app_user_id()
  );

CREATE POLICY conversations_update ON conversations
  FOR UPDATE
  USING (
    tenant_id = current_app_tenant_id()
    AND user_id = current_app_user_id()
  );

-- Backfill the FK on validation_runs.conversation_id now that
-- conversations exists. Guarded by information_schema so the migration
-- stays idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'validation_runs_fk_conversation'
      AND table_name = 'validation_runs'
  ) THEN
    ALTER TABLE validation_runs
      ADD CONSTRAINT validation_runs_fk_conversation
      FOREIGN KEY (conversation_id) REFERENCES conversations(id);
  END IF;
END $$;
