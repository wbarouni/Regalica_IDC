-- Migration 015_referentials_sectors.sql
-- Object: referentials_sectors table (economic sector taxonomy) + audit trigger
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 004_users_roles.sql, 006_audit_trigger_function.sql
-- References: Document 6 §9.1 (skeleton), §9.2 (specific columns)
--
-- Note: `sector_label` is kept in addition to the common `label` per the
-- doc's literal reading (§9.1 + §9.2). `label` holds the short display
-- name; `sector_label` may hold a richer localised label.

CREATE TABLE IF NOT EXISTS referentials_sectors (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),

  code                      VARCHAR(20) NOT NULL,
  label                     TEXT NOT NULL,

  -- Specific business columns (§9.2)
  sector_code               VARCHAR(20),
  sector_label              TEXT,
  hierarchy_level           INTEGER,
  parent_sector_code        VARCHAR(20),

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

  CONSTRAINT ref_sectors_uk_natural UNIQUE (tenant_id, code, valid_from),
  CONSTRAINT ref_sectors_ck_valid_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT ref_sectors_ck_status CHECK (status IN ('draft', 'pending_review', 'active', 'deprecated')),
  CONSTRAINT ref_sectors_ck_four_eyes CHECK (
    (status IN ('draft', 'pending_review') AND validator_user_id IS NULL)
    OR
    (status IN ('active', 'deprecated')
      AND validator_user_id IS NOT NULL
      AND validator_user_id != author_user_id)
  )
);

CREATE INDEX IF NOT EXISTS ref_sectors_idx_active
  ON referentials_sectors (tenant_id, code)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ref_sectors_idx_parent
  ON referentials_sectors (tenant_id, parent_sector_code)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE TRIGGER referentials_sectors_audit
  AFTER INSERT OR UPDATE OR DELETE ON referentials_sectors
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
