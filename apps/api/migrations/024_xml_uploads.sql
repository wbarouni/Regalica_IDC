-- Migration 024_xml_uploads.sql
-- Object: xml_uploads table + RLS by tenant_id
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 004_users_roles.sql (uploaded_by_user_id FK)
-- References: Document 6 §10 (table), §22 (multi-tenant RLS invariant)

CREATE TABLE IF NOT EXISTS xml_uploads (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),

  -- Parsed metadata
  code_banque               VARCHAR(10) NOT NULL,
  code_annexe               VARCHAR(10) NOT NULL,
  date_annexe               DATE NOT NULL,
  xml_structure_type        INTEGER,

  -- Binary content (compressed)
  file_name                 TEXT NOT NULL,
  file_size_bytes           BIGINT NOT NULL,
  file_hash_sha256          VARCHAR(64) NOT NULL,
  content_compressed        BYTEA NOT NULL,
  compression_algo          VARCHAR(20) NOT NULL DEFAULT 'zstd',
  encoding_detected         VARCHAR(20) NOT NULL DEFAULT 'utf-8',

  -- User context
  uploaded_by_user_id       UUID NOT NULL REFERENCES users(id),
  uploaded_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- BCT step 1 — XSD validation
  xsd_validation_status     VARCHAR(20),
  xsd_validation_errors     JSONB,

  -- Systemic audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ,

  CONSTRAINT xml_uploads_ck_xsd_status CHECK (
    xsd_validation_status IS NULL OR xsd_validation_status IN ('pending', 'passed', 'failed')
  ),
  CONSTRAINT xml_uploads_ck_size CHECK (
    file_size_bytes > 0 AND file_size_bytes <= 104857600
  )
);

CREATE INDEX IF NOT EXISTS xml_uploads_idx_tenant_annexe
  ON xml_uploads (tenant_id, code_annexe, date_annexe);

CREATE INDEX IF NOT EXISTS xml_uploads_idx_user
  ON xml_uploads (tenant_id, uploaded_by_user_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS xml_uploads_idx_hash
  ON xml_uploads (tenant_id, file_hash_sha256);

-- Multi-tenant RLS (Document 6 §22 invariant, not explicitly spelled out
-- in §22.3 for xml_uploads but required by the tenant isolation rule).
ALTER TABLE xml_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE xml_uploads FORCE ROW LEVEL SECURITY;

CREATE POLICY xml_uploads_select ON xml_uploads
  FOR SELECT
  USING (tenant_id = current_app_tenant_id());

CREATE POLICY xml_uploads_insert ON xml_uploads
  FOR INSERT
  WITH CHECK (
    tenant_id = current_app_tenant_id()
    AND uploaded_by_user_id = current_app_user_id()
  );
