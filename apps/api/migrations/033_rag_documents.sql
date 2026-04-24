-- Migration 033_rag_documents.sql
-- Object: rag_documents table + indexes + tenant RLS
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 003_tenants.sql, 004_users_roles.sql
-- References: Document 6 §21 (table), §22 (tenant isolation invariant)
--
-- TODO(@wbarouni): §22 does not spell out RLS for rag_documents. The
-- SELECT policy below extrapolates the tenant_id guard for consistency
-- with the multi-tenant invariant (Document 3 §21). Revise §22 to make
-- this explicit.

CREATE TABLE IF NOT EXISTS rag_documents (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),

  -- Identification
  document_type             VARCHAR(50) NOT NULL,
  title                     TEXT NOT NULL,
  source_reference          VARCHAR(100),
  publication_date          DATE,
  effective_date            DATE,

  -- Source file
  file_name                 TEXT NOT NULL,
  file_hash_sha256          VARCHAR(64) NOT NULL,
  file_size_bytes           BIGINT NOT NULL,
  content_compressed        BYTEA,

  -- Ingestion
  ingested_by_user_id       UUID NOT NULL REFERENCES users(id),
  ingested_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chunks_count              INTEGER NOT NULL DEFAULT 0,
  ingestion_status          VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Systemic audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ,

  CONSTRAINT rag_doc_ck_type CHECK (document_type IN (
    'circulaire_bct', 'cc_tech', 'maquette_bct', 'rdg_excel', 'internal_note'
  )),
  CONSTRAINT rag_doc_ck_status CHECK (ingestion_status IN (
    'pending', 'processing', 'completed', 'failed'
  ))
);

CREATE INDEX IF NOT EXISTS rag_doc_idx_type
  ON rag_documents (tenant_id, document_type, publication_date DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rag_doc_uk_hash
  ON rag_documents (tenant_id, file_hash_sha256)
  WHERE deleted_at IS NULL;

ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY rag_doc_select ON rag_documents
  FOR SELECT
  USING (tenant_id = current_app_tenant_id());
