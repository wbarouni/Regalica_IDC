-- Migration 008_referentials_annexes.sql
-- Object: referentials_annexes table (RDG annexes directory) + audit trigger
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 004_users_roles.sql, 006_audit_trigger_function.sql
-- References: Document 6 §9.1 (skeleton), §9.2 (specific columns)

CREATE TABLE IF NOT EXISTS referentials_annexes (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),

  code                      VARCHAR(20) NOT NULL,
  label                     TEXT NOT NULL,

  -- Specific business columns (§9.2)
  domain                    VARCHAR(50),
  periodicity               VARCHAR(20),
  reporting_deadline_days   INTEGER,
  xml_structure_type        INTEGER,
  has_detail_sentinel       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Documentary source
  source_circulaire         VARCHAR(50),
  source_article            VARCHAR(50),
  source_page               INTEGER,

  -- Bitemporal validity
  valid_from                TIMESTAMPTZ NOT NULL,
  valid_to                  TIMESTAMPTZ,

  -- 4-eyes governance
  author_user_id            UUID NOT NULL REFERENCES users(id),
  validator_user_id         UUID REFERENCES users(id),
  validated_at              TIMESTAMPTZ,
  status                    VARCHAR(20) NOT NULL DEFAULT 'draft',

  -- Systemic audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ,

  CONSTRAINT ref_annexes_uk_natural UNIQUE (tenant_id, code, valid_from),
  CONSTRAINT ref_annexes_ck_valid_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT ref_annexes_ck_status CHECK (status IN ('draft', 'pending_review', 'active', 'deprecated')),
  CONSTRAINT ref_annexes_ck_four_eyes CHECK (
    (status IN ('draft', 'pending_review') AND validator_user_id IS NULL)
    OR
    (status IN ('active', 'deprecated')
      AND validator_user_id IS NOT NULL
      AND validator_user_id != author_user_id)
  ),
  CONSTRAINT ref_annexes_ck_periodicity CHECK (
    periodicity IS NULL OR periodicity IN ('monthly', 'quarterly', 'semi_annual', 'annual', 'ad_hoc')
  ),
  CONSTRAINT ref_annexes_ck_xml_type CHECK (
    xml_structure_type IS NULL OR xml_structure_type BETWEEN 1 AND 10
  )
);

CREATE INDEX IF NOT EXISTS ref_annexes_idx_active
  ON referentials_annexes (tenant_id, code)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ref_annexes_idx_domain
  ON referentials_annexes (tenant_id, domain)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE TRIGGER referentials_annexes_audit
  AFTER INSERT OR UPDATE OR DELETE ON referentials_annexes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
