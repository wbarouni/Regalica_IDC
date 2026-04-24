-- Migration 029_feature_flags.sql
-- Object: feature_flags table (no RLS per §22.6) + unique constraint + rollout CHECK
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 003_tenants.sql, 004_users_roles.sql
-- References: Document 6 §18 (table), §22.6 (no RLS: application-level
--             tenant_id filtering instead)

CREATE TABLE IF NOT EXISTS feature_flags (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),

  -- Identification
  flag_key                  VARCHAR(100) NOT NULL,
  description               TEXT,

  -- Configuration
  is_enabled                BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_for_user_ids      UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  enabled_for_roles         VARCHAR(50)[] NOT NULL DEFAULT ARRAY[]::VARCHAR[],
  rollout_percentage        INTEGER NOT NULL DEFAULT 0,

  -- Lifecycle
  created_by_user_id        UUID NOT NULL REFERENCES users(id),
  activated_at              TIMESTAMPTZ,
  deactivated_at            TIMESTAMPTZ,

  -- Systemic audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT feature_flags_uk UNIQUE (tenant_id, flag_key),
  CONSTRAINT feature_flags_ck_rollout CHECK (rollout_percentage BETWEEN 0 AND 100)
);
