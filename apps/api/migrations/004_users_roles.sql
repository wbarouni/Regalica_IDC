-- Migration 004_users_roles.sql
-- Object: identity and authorisation tables (users, roles, user_roles, sessions)
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 003_tenants.sql
-- References: Document 6 §15

CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),

  -- Identity
  external_sso_id       TEXT NOT NULL,
  email                 CITEXT NOT NULL,
  full_name             TEXT NOT NULL,
  preferred_language    VARCHAR(5),
  timezone              VARCHAR(50),

  -- Lifecycle
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at         TIMESTAMPTZ,
  disabled_at           TIMESTAMPTZ,
  disabled_reason       TEXT,

  -- Systemic audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,

  CONSTRAINT users_uk_sso   UNIQUE (tenant_id, external_sso_id),
  CONSTRAINT users_uk_email UNIQUE (tenant_id, email),
  CONSTRAINT users_ck_language CHECK (
    preferred_language IS NULL OR preferred_language IN ('fr', 'en', 'ar')
  )
);

CREATE INDEX IF NOT EXISTS users_idx_active
  ON users (tenant_id)
  WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS roles (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  code                  VARCHAR(50) NOT NULL,
  label_fr              TEXT NOT NULL,
  label_en              TEXT NOT NULL,
  label_ar              TEXT NOT NULL,
  permissions           JSONB NOT NULL,
  is_system_role        BOOLEAN NOT NULL DEFAULT FALSE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT roles_uk UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  user_id               UUID NOT NULL REFERENCES users(id),
  role_id               UUID NOT NULL REFERENCES roles(id),
  assigned_by_user_id   UUID REFERENCES users(id),
  assigned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at            TIMESTAMPTZ,

  CONSTRAINT user_roles_uk UNIQUE (user_id, role_id, assigned_at)
);

CREATE INDEX IF NOT EXISTS user_roles_idx_active
  ON user_roles (user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  user_id               UUID NOT NULL REFERENCES users(id),
  token_hash            VARCHAR(64) NOT NULL,
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL,
  revoked_at            TIMESTAMPTZ,
  ip_address            INET,
  user_agent            TEXT,

  CONSTRAINT sessions_uk_token UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS sessions_idx_user_active
  ON sessions (user_id)
  WHERE revoked_at IS NULL AND expires_at > NOW();
