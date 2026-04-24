-- Migration 012_referentials_sentinels.sql
-- Object: referentials_sentinels table (RDG sentinels C, D1-D6 iteration markers) + audit trigger
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 004_users_roles.sql, 006_audit_trigger_function.sql
-- References: Document 6 §9.1 (skeleton), §9.2 (specific columns), docs/PRD §6 (sentinel semantics)

CREATE TABLE IF NOT EXISTS referentials_sentinels (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),

  code                      VARCHAR(20) NOT NULL,
  label                     TEXT NOT NULL,

  -- Specific business columns (§9.2)
  sentinel_code             VARCHAR(5),
  semantic                  TEXT,
  iteration_element_xpath   TEXT,
  applicable_annexes        TEXT[],

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

  CONSTRAINT ref_sentinels_uk_natural UNIQUE (tenant_id, code, valid_from),
  CONSTRAINT ref_sentinels_ck_valid_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT ref_sentinels_ck_status CHECK (status IN ('draft', 'pending_review', 'active', 'deprecated')),
  CONSTRAINT ref_sentinels_ck_four_eyes CHECK (
    (status IN ('draft', 'pending_review') AND validator_user_id IS NULL)
    OR
    (status IN ('active', 'deprecated')
      AND validator_user_id IS NOT NULL
      AND validator_user_id != author_user_id)
  ),
  CONSTRAINT ref_sentinels_ck_sentinel_code CHECK (
    sentinel_code IS NULL OR sentinel_code IN ('C', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6')
  )
);

CREATE INDEX IF NOT EXISTS ref_sentinels_idx_active
  ON referentials_sentinels (tenant_id, code)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ref_sentinels_idx_sentinel_code
  ON referentials_sentinels (tenant_id, sentinel_code)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE TRIGGER referentials_sentinels_audit
  AFTER INSERT OR UPDATE OR DELETE ON referentials_sentinels
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
