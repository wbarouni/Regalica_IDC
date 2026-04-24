-- Migration 020_referentials_error_codes.sql
-- Object: referentials_error_codes table (BCT error codes catalogue) + audit trigger
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 004_users_roles.sql, 006_audit_trigger_function.sql
-- References: Document 6 §9.1 (skeleton), §9.2 (specific columns)

CREATE TABLE IF NOT EXISTS referentials_error_codes (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),

  code                      VARCHAR(20) NOT NULL,
  label                     TEXT NOT NULL,

  -- Specific business columns (§9.2)
  error_code                VARCHAR(20),
  severity                  VARCHAR(20),
  description_fr            TEXT,
  description_en            TEXT,
  description_ar            TEXT,

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

  CONSTRAINT ref_error_codes_uk_natural UNIQUE (tenant_id, code, valid_from),
  CONSTRAINT ref_error_codes_ck_valid_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT ref_error_codes_ck_status CHECK (status IN ('draft', 'pending_review', 'active', 'deprecated')),
  CONSTRAINT ref_error_codes_ck_four_eyes CHECK (
    (status IN ('draft', 'pending_review') AND validator_user_id IS NULL)
    OR
    (status IN ('active', 'deprecated')
      AND validator_user_id IS NOT NULL
      AND validator_user_id != author_user_id)
  ),
  CONSTRAINT ref_error_codes_ck_severity CHECK (
    severity IS NULL OR severity IN ('severe', 'warning', 'info')
  )
);

CREATE INDEX IF NOT EXISTS ref_error_codes_idx_active
  ON referentials_error_codes (tenant_id, code)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ref_error_codes_idx_severity
  ON referentials_error_codes (tenant_id, severity)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE TRIGGER referentials_error_codes_audit
  AFTER INSERT OR UPDATE OR DELETE ON referentials_error_codes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
