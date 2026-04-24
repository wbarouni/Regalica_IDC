-- Migration 005_audit_log.sql
-- Object: partitioned audit_log table + current-month bootstrap partition + immutability trigger
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 001_extensions.sql (uuidv7)
-- References: Document 6 §17 (table), §23.2 (immutability)

CREATE TABLE IF NOT EXISTS audit_log (
  id                    UUID NOT NULL DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL,

  -- Who
  actor_user_id         UUID,
  actor_session_id      UUID,
  actor_ip_address      INET,
  actor_user_agent      TEXT,

  -- What
  action                VARCHAR(50) NOT NULL,
  entity_type           VARCHAR(50) NOT NULL,
  entity_id             UUID NOT NULL,

  -- How
  old_value             JSONB,
  new_value             JSONB,
  change_summary        TEXT,

  -- Technical context
  request_id            UUID,
  transaction_id        BIGINT,

  -- Temporality
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS audit_log_idx_tenant_entity
  ON audit_log (tenant_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_idx_actor
  ON audit_log (tenant_id, actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_idx_action
  ON audit_log (tenant_id, action, created_at DESC);

-- Bootstrap partition covering the current month. Future months arrive
-- through the pg_cron job deployed in migration 035. Until then, the
-- operator creates additional partitions manually as needed.
DO $$
DECLARE
  start_of_month DATE := date_trunc('month', NOW())::DATE;
  start_of_next  DATE := (date_trunc('month', NOW()) + INTERVAL '1 month')::DATE;
  part_name      TEXT := 'audit_log_' || to_char(start_of_month, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
    part_name, start_of_month, start_of_next
  );
END $$;

-- Immutability: audit_log accepts INSERT only. UPDATE and DELETE are
-- rejected at trigger level so even privileged applicative roles cannot
-- rewrite history. Partition DROP remains possible via the pg_cron
-- archival job (migration 035) which operates at partition level, not
-- row level, and therefore is not blocked by this BEFORE trigger.
CREATE OR REPLACE FUNCTION prevent_audit_log_modification() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'audit_log is insert-only; % is forbidden', TG_OP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_immutability ON audit_log;
CREATE TRIGGER audit_log_immutability
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
