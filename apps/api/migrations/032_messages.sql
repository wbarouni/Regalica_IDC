-- Migration 032_messages.sql
-- Object: messages table + indexes + RLS (§22.4) + immutability trigger (§23.3)
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 023_prompt_bank.sql, 031_conversations.sql
-- References: Document 6 §20 (table), §22.4 (RLS), §23.3 (immutability)

CREATE TABLE IF NOT EXISTS messages (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  conversation_id           UUID NOT NULL REFERENCES conversations(id),

  -- Order and role
  sequence_number           INTEGER NOT NULL,
  role                      VARCHAR(30) NOT NULL,

  -- Content
  content_markdown          TEXT NOT NULL,
  content_json              JSONB,
  attachments               JSONB,

  -- AI metadata
  produced_by_agent         VARCHAR(50),
  prompt_version_used       UUID REFERENCES prompt_bank(id),
  thinking_trace            JSONB,
  citations                 JSONB,
  confidence_level          VARCHAR(20),

  -- Cost and performance
  tokens_input              INTEGER,
  tokens_output             INTEGER,
  tokens_thinking           INTEGER,
  latency_ms                INTEGER,

  -- Temporality
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT msg_uk_sequence UNIQUE (conversation_id, sequence_number),
  CONSTRAINT msg_ck_role CHECK (role IN (
    'user',
    'regalica_response',
    'regalica_thinking',
    'agent_internal',
    'system_notification'
  )),
  CONSTRAINT msg_ck_confidence CHECK (
    confidence_level IS NULL
    OR confidence_level IN ('high', 'medium', 'low', 'insufficient_data')
  )
);

CREATE INDEX IF NOT EXISTS msg_idx_conv_seq
  ON messages (conversation_id, sequence_number);

CREATE INDEX IF NOT EXISTS msg_idx_tenant_created
  ON messages (tenant_id, created_at DESC);

-- Immutability trigger (Document 6 §23.3).
CREATE OR REPLACE FUNCTION prevent_messages_modification() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'messages is insert-only; % is forbidden', TG_OP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_immutability ON messages;
CREATE TRIGGER messages_immutability
  BEFORE UPDATE OR DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION prevent_messages_modification();

-- Belt-and-suspenders REVOKE complement to the trigger. TODO(@wbarouni):
-- the REVOKE from regflow_app arrives in migration 036 together with
-- the role creations; §23.3 does not spell it out explicitly but the
-- §23.2 / §23.1 pattern applies by analogy:
--   REVOKE UPDATE, DELETE ON messages FROM regflow_app;
REVOKE UPDATE, DELETE ON messages FROM PUBLIC;

-- Row-Level Security (Document 6 §22.4).
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

CREATE POLICY messages_select ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.tenant_id = current_app_tenant_id()
        AND (
          c.user_id = current_app_user_id()
          OR current_user_has_role('compliance_director')
          OR current_user_has_role('support_readonly')
        )
    )
  );
