-- Migration 051_platform_config.sql
-- Object: system-global key/value catalogue for runtime tunables that
--         must NOT live as numeric/string literals in applicative code
--         (Guard D-006 + zero-hardcoding doctrine).
-- Author: ALGORIA Factory
-- Date: 2026-04-30
-- Depends on: 001_extensions.sql (uuidv7), 036_grants_regflow_app.sql
-- References: docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3 (no magic
--             literals in TS/Python applicative source — move to
--             platform_config or seeds/), Guard D rule D-006.
--
-- One row per tunable. Values are JSONB so the same table holds
-- numbers, strings, durations, feature thresholds, etc. The loader
-- (apps/api/src/lib/platformConfig.ts) deserialises the JSONB into
-- the calling site's expected JS type.
--
-- No tenant_id: the catalogue is process-wide. Per-tenant overrides
-- belong in feature_flags (migration 029); platform_config holds
-- baseline values.
--
-- Writes are gated by GRANT/REVOKE — only the migration runner
-- (superuser bypassing RLS) and the platform_owner-elevated session
-- can mutate.

CREATE TABLE IF NOT EXISTS platform_config (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  config_key      VARCHAR(64) NOT NULL UNIQUE,
  config_value    JSONB       NOT NULL,
  description     TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT platform_config_ck_key_format
    CHECK (config_key ~ '^[a-z][a-z0-9_]*$')
);

-- Hot-path index: every loader call filters on (config_key, deleted IS
-- NULL) and the cache populates on first hit.
CREATE INDEX IF NOT EXISTS platform_config_idx_key_active
  ON platform_config (config_key)
  WHERE deleted_at IS NULL;

-- Catalogue reads are open; writes are locked at the GRANT layer.
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_config FORCE ROW LEVEL SECURITY;

CREATE POLICY platform_config_select ON platform_config
  FOR SELECT
  USING (TRUE);

REVOKE INSERT, UPDATE, DELETE ON platform_config FROM regflow_app;
REVOKE INSERT, UPDATE, DELETE ON platform_config FROM regflow_engine;
