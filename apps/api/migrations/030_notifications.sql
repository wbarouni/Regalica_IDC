-- Migration 030_notifications.sql
-- Object: notifications table + indexes + tenant RLS
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 003_tenants.sql, 004_users_roles.sql
-- References: Document 6 §19 (table), §22 (tenant isolation invariant)
--
-- TODO(@wbarouni): §22 does not spell out RLS for notifications. The
-- SELECT policy below extrapolates the tenant_id guard for consistency
-- with the multi-tenant invariant (Document 3 §21). Revise §22 to make
-- this explicit.

CREATE TABLE IF NOT EXISTS notifications (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  user_id                   UUID NOT NULL REFERENCES users(id),

  -- Content
  event_type                VARCHAR(50) NOT NULL,
  urgency_level             VARCHAR(20) NOT NULL,
  title                     TEXT NOT NULL,
  body                      TEXT NOT NULL,
  suggested_action          TEXT,
  resource_link             TEXT,

  -- Source agent
  produced_by_agent         VARCHAR(50) NOT NULL DEFAULT 'NotificationAgent',

  -- Lifecycle
  is_read                   BOOLEAN NOT NULL DEFAULT FALSE,
  read_at                   TIMESTAMPTZ,
  dismissed_at              TIMESTAMPTZ,

  -- Temporality
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at                TIMESTAMPTZ,

  CONSTRAINT notif_ck_urgency CHECK (urgency_level IN ('info', 'attention', 'action_required')),
  CONSTRAINT notif_ck_event CHECK (event_type IN (
    'new_circular_detected',
    'referential_updated',
    'rules_pending_validation',
    'deadline_approaching',
    'retention_expiring',
    'conversation_pending'
  ))
);

CREATE INDEX IF NOT EXISTS notifications_idx_user_unread
  ON notifications (tenant_id, user_id, created_at DESC)
  WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS notifications_idx_user_all
  ON notifications (tenant_id, user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY notifications_select ON notifications
  FOR SELECT
  USING (tenant_id = current_app_tenant_id());
