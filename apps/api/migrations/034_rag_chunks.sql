-- Migration 034_rag_chunks.sql
-- Object: rag_chunks table + HNSW index + GIN trigram index + tenant RLS
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 001_extensions.sql (vector, pg_trgm), 033_rag_documents.sql
-- References: Document 6 §21 (table), §22 (tenant isolation invariant)
--
-- TODO(@wbarouni): §22 does not spell out RLS for rag_chunks. The
-- SELECT policy below extrapolates the tenant_id guard for consistency
-- with the multi-tenant invariant (Document 3 §21). Revise §22 to make
-- this explicit.

CREATE TABLE IF NOT EXISTS rag_chunks (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  document_id               UUID NOT NULL REFERENCES rag_documents(id),

  -- Position in the document
  chunk_index               INTEGER NOT NULL,
  page_number               INTEGER,
  section_title             TEXT,
  article_reference         VARCHAR(50),

  -- Content
  content                   TEXT NOT NULL,
  content_tokens            INTEGER NOT NULL,
  embedding                 VECTOR(768) NOT NULL,

  -- Systemic audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT rag_chunks_uk_index UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS rag_chunks_idx_embedding
  ON rag_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS rag_chunks_idx_document
  ON rag_chunks (document_id, chunk_index);

CREATE INDEX IF NOT EXISTS rag_chunks_idx_content_trgm
  ON rag_chunks USING GIN (content gin_trgm_ops);

ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_chunks FORCE ROW LEVEL SECURITY;

CREATE POLICY rag_chunks_select ON rag_chunks
  FOR SELECT
  USING (tenant_id = current_app_tenant_id());
