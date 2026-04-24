-- Migration 014_referentials_currencies.sql
-- Object: referentials_currencies table (ISO 4217 currency directory) + audit trigger
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 004_users_roles.sql, 006_audit_trigger_function.sql
-- References: Document 6 §9.1 (skeleton), §9.2 (specific columns)

CREATE TABLE IF NOT EXISTS referentials_currencies (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),

  code                      VARCHAR(20) NOT NULL,
  label                     TEXT NOT NULL,

  -- Specific business columns (§9.2)
  iso_code                  VARCHAR(3),
  iso_numeric_code          VARCHAR(3),
  name_fr                   TEXT,
  name_en                   TEXT,
  name_ar                   TEXT,
  symbol                    VARCHAR(10),

  source_circulaire         VARCHAR(50),
  source_article            VARCHAR(50),
  source_page               INTEGER,

  valid_from                TIMESTAMPTZ NOT NULL,
  valid_to                  TIMESTAMPTZ,

  author_user_id            UUID NOT NULL REFERENCES users(id),
  validator_user_id         UUID REFERENCES users(id),
  validated_at              TIMESTAMPTZ,
  status                    VARCHAR(20) NOT NULL DEFAULT 'draft',

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ,

  CONSTRAINT ref_currencies_uk_natural UNIQUE (tenant_id, code, valid_from),
  CONSTRAINT ref_currencies_ck_valid_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT ref_currencies_ck_status CHECK (status IN ('draft', 'pending_review', 'active', 'deprecated')),
  CONSTRAINT ref_currencies_ck_four_eyes CHECK (
    (status IN ('draft', 'pending_review') AND validator_user_id IS NULL)
    OR
    (status IN ('active', 'deprecated')
      AND validator_user_id IS NOT NULL
      AND validator_user_id != author_user_id)
  )
);

CREATE INDEX IF NOT EXISTS ref_currencies_idx_active
  ON referentials_currencies (tenant_id, code)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ref_currencies_idx_iso_code
  ON referentials_currencies (tenant_id, iso_code)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE TRIGGER referentials_currencies_audit
  AFTER INSERT OR UPDATE OR DELETE ON referentials_currencies
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
