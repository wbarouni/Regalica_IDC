-- Migration 028_four_eyes_approvals.sql
-- Object: four_eyes_approvals generic approval queue + indexes + tenant RLS
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 003_tenants.sql, 004_users_roles.sql
-- References: Document 6 §16 (table), §22 (tenant isolation invariant)
--
-- TODO(@wbarouni): §22 does not spell out RLS for four_eyes_approvals. The
-- SELECT policy below extrapolates the tenant_id guard for consistency
-- with the multi-tenant invariant (Document 3 §21). Revise §22 to make
-- this explicit.

CREATE TABLE IF NOT EXISTS four_eyes_approvals (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),

  -- Approval object
  entity_type               VARCHAR(50) NOT NULL,
  entity_id                 UUID NOT NULL,
  entity_version            INTEGER NOT NULL,

  -- Request
  requested_by_user_id      UUID NOT NULL REFERENCES users(id),
  requested_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_reason            TEXT,
  requested_change          JSONB NOT NULL,

  -- Decision
  decision                  VARCHAR(20) NOT NULL DEFAULT 'pending',
  decided_by_user_id        UUID REFERENCES users(id),
  decided_at                TIMESTAMPTZ,
  decision_reason           TEXT,

  -- Systemic audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fea_ck_entity_type CHECK (entity_type IN (
    'rule', 'referential_annexe', 'referential_rubrique', 'referential_colonne',
    'referential_xml_structure', 'referential_sentinel', 'referential_bank',
    'referential_currency', 'referential_sector', 'referential_identifier_type',
    'referential_consolidation_method', 'referential_instrument',
    'referential_contract_type', 'referential_error_code',
    'referential_annexe_dependency', 'prompt'
  )),
  CONSTRAINT fea_ck_decision CHECK (decision IN ('pending', 'approved', 'rejected')),
  CONSTRAINT fea_ck_distinct_users CHECK (
    decided_by_user_id IS NULL OR decided_by_user_id != requested_by_user_id
  ),
  CONSTRAINT fea_ck_decision_coherence CHECK (
    (decision = 'pending' AND decided_by_user_id IS NULL AND decided_at IS NULL)
    OR
    (decision IN ('approved', 'rejected') AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS fea_idx_entity
  ON four_eyes_approvals (tenant_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS fea_idx_pending
  ON four_eyes_approvals (tenant_id, decision, requested_at)
  WHERE decision = 'pending';

CREATE INDEX IF NOT EXISTS fea_idx_requester
  ON four_eyes_approvals (tenant_id, requested_by_user_id, requested_at DESC);

ALTER TABLE four_eyes_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE four_eyes_approvals FORCE ROW LEVEL SECURITY;

CREATE POLICY fea_select ON four_eyes_approvals
  FOR SELECT
  USING (tenant_id = current_app_tenant_id());
