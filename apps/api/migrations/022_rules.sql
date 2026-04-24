-- Migration 022_rules.sql
-- Object: rules table (RDG rules catalogue, target capacity 4 611 entries) + audit trigger
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 004_users_roles.sql (author/validator FKs), 006_audit_trigger_function.sql
-- References: Document 6 §7
--
-- TODO(@wbarouni): source_rag_chunk_id REFERENCES rag_chunks(id) is deferred
-- because rag_chunks is created in migration 034. A dedicated migration
-- 034a_rules_rag_chunk_fk.sql must add:
--   ALTER TABLE rules ADD CONSTRAINT rules_fk_rag_chunk
--     FOREIGN KEY (source_rag_chunk_id) REFERENCES rag_chunks(id);
-- For now the column is declared nullable without FK so rows may still
-- carry the chunk UUID, but referential integrity is not yet enforced.

CREATE TABLE IF NOT EXISTS rules (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),

  -- Natural business key
  ax_term                   VARCHAR(10) NOT NULL,
  num_regle                 INTEGER NOT NULL,
  version                   INTEGER NOT NULL DEFAULT 1,

  -- Rule content
  type_ctrl_declared        VARCHAR(20),
  type_ctrl_computed        VARCHAR(20) NOT NULL,
  operator                  VARCHAR(10) NOT NULL,
  condition_expression      TEXT,
  zone_texte                TEXT,
  natural_language          TEXT NOT NULL,

  -- Structured terms
  terms                     JSONB NOT NULL,
  terms_count               INTEGER NOT NULL,
  is_inter_annexe           BOOLEAN NOT NULL,
  involved_annexes          TEXT[] NOT NULL,

  -- Documentary source (FK to rag_chunks deferred, see TODO above)
  source_circulaire         VARCHAR(50),
  source_article            VARCHAR(50),
  source_page               INTEGER,
  source_rag_chunk_id       UUID,

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

  CONSTRAINT rules_uk_natural UNIQUE (tenant_id, ax_term, num_regle, valid_from),
  CONSTRAINT rules_ck_valid_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT rules_ck_status CHECK (status IN ('draft', 'pending_review', 'active', 'deprecated', 'rejected')),
  CONSTRAINT rules_ck_type_ctrl CHECK (type_ctrl_computed IN ('intra_ax', 'inter_ax')),
  CONSTRAINT rules_ck_operator CHECK (operator IN ('=', '>=', '<=', '>', '<', 'MAX', 'MIN')),
  CONSTRAINT rules_ck_four_eyes CHECK (
    (status IN ('draft', 'pending_review', 'rejected') AND validator_user_id IS NULL)
    OR
    (status IN ('active', 'deprecated')
      AND validator_user_id IS NOT NULL
      AND validator_user_id != author_user_id)
  )
);

CREATE INDEX IF NOT EXISTS rules_idx_tenant_active
  ON rules (tenant_id)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS rules_idx_ax_term
  ON rules (tenant_id, ax_term)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS rules_idx_involved_annexes
  ON rules USING GIN (involved_annexes);

CREATE INDEX IF NOT EXISTS rules_idx_terms_gin
  ON rules USING GIN (terms);

CREATE INDEX IF NOT EXISTS rules_idx_valid_from
  ON rules (tenant_id, valid_from);

CREATE INDEX IF NOT EXISTS rules_idx_status
  ON rules (tenant_id, status)
  WHERE deleted_at IS NULL;

CREATE TRIGGER rules_audit
  AFTER INSERT OR UPDATE OR DELETE ON rules
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
