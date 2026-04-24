-- Migration 003_tenants.sql
-- Object: tenants table (root of multi-tenant isolation)
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 001_extensions.sql (uuidv7)
-- References: Document 6 §14

CREATE TABLE IF NOT EXISTS tenants (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),

  -- Identification
  slug                  VARCHAR(50) NOT NULL UNIQUE,
  legal_name            TEXT NOT NULL,
  bct_bank_code         VARCHAR(10),

  -- Configuration
  default_language      VARCHAR(5) NOT NULL DEFAULT 'fr',
  timezone              VARCHAR(50) NOT NULL DEFAULT 'Africa/Tunis',
  deployment_mode       VARCHAR(20) NOT NULL DEFAULT 'on_premises',

  -- SSO
  sso_provider          VARCHAR(50),
  sso_config            JSONB,

  -- Lifecycle
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  activated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  suspended_at          TIMESTAMPTZ,

  -- Systemic audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT tenants_ck_language   CHECK (default_language IN ('fr', 'en', 'ar')),
  CONSTRAINT tenants_ck_deployment CHECK (deployment_mode IN ('on_premises', 'cloud_dedicated', 'cloud_shared'))
);
