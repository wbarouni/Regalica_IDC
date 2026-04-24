-- Migration 021_referentials_annexe_dependencies.sql
-- Object: referentials_annexe_dependencies table (CC-tech §9.5 inter-annexe dependency matrix) + audit trigger
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 004_users_roles.sql, 006_audit_trigger_function.sql
-- References: Document 6 §9.1 (skeleton), §9.2 (specific columns), CC-tech §9.5 (dependency source of truth)

CREATE TABLE IF NOT EXISTS referentials_annexe_dependencies (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),

  code                      VARCHAR(20) NOT NULL,
  label                     TEXT NOT NULL,

  -- Specific business columns (§9.2)
  source_annexe_code        VARCHAR(20),
  target_annexe_code        VARCHAR(20),
  dependency_type           VARCHAR(20),
  condition_expression      TEXT,
  source_reference          TEXT,

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

  CONSTRAINT ref_annexe_dependencies_uk_natural UNIQUE (tenant_id, code, valid_from),
  CONSTRAINT ref_annexe_dependencies_ck_valid_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT ref_annexe_dependencies_ck_status CHECK (status IN ('draft', 'pending_review', 'active', 'deprecated')),
  CONSTRAINT ref_annexe_dependencies_ck_four_eyes CHECK (
    (status IN ('draft', 'pending_review') AND validator_user_id IS NULL)
    OR
    (status IN ('active', 'deprecated')
      AND validator_user_id IS NOT NULL
      AND validator_user_id != author_user_id)
  ),
  CONSTRAINT ref_annexe_dependencies_ck_dependency_type CHECK (
    dependency_type IS NULL OR dependency_type IN ('structural', 'temporal', 'conditional')
  )
);

CREATE INDEX IF NOT EXISTS ref_annexe_dependencies_idx_active
  ON referentials_annexe_dependencies (tenant_id, code)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ref_annexe_dependencies_idx_source
  ON referentials_annexe_dependencies (tenant_id, source_annexe_code)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ref_annexe_dependencies_idx_target
  ON referentials_annexe_dependencies (tenant_id, target_annexe_code)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE TRIGGER referentials_annexe_dependencies_audit
  AFTER INSERT OR UPDATE OR DELETE ON referentials_annexe_dependencies
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
