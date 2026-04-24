-- Migration 026_validation_fail_details.sql
-- Object: validation_fail_details table + indexes + tenant RLS
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 022_rules.sql, 025_validation_runs.sql
-- References: Document 6 §12 (table), §22.3 (RLS title covers vfd, body only details validation_runs)
--
-- TODO(@wbarouni): §22.3 title lists validation_fail_details but its code
-- block only covers validation_runs. The SELECT policy below extrapolates
-- the same tenant_id guard to vfd for consistency with the multi-tenant
-- invariant (Document 3 §21). Revise §22.3 in docs to make this explicit.

CREATE TABLE IF NOT EXISTS validation_fail_details (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  validation_run_id         UUID NOT NULL REFERENCES validation_runs(id),

  -- Rule identification
  rule_id                   UUID NOT NULL REFERENCES rules(id),
  ax_term                   VARCHAR(10) NOT NULL,
  num_regle                 INTEGER NOT NULL,

  -- Sentinel-D iteration (when applicable)
  is_sentinel_iteration     BOOLEAN NOT NULL DEFAULT FALSE,
  iteration_index           INTEGER,
  iteration_xpath           TEXT,
  iteration_label           TEXT,

  -- Detailed verdict
  severity                  VARCHAR(20) NOT NULL,
  expected_value            NUMERIC(20, 3),
  computed_value            NUMERIC(20, 3),
  gap_absolute              NUMERIC(20, 3),
  gap_relative              NUMERIC(10, 6),

  -- Calculation decomposition
  calculation_trace         JSONB NOT NULL,

  -- Cluster assignment (FK added in migration 027 once clusters exists)
  cluster_id                UUID,

  -- Systemic audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vfd_ck_severity CHECK (severity IN ('severe', 'rounding')),
  CONSTRAINT vfd_ck_sentinel_coherence CHECK (
    (is_sentinel_iteration = FALSE AND iteration_index IS NULL)
    OR
    (is_sentinel_iteration = TRUE AND iteration_index IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS vfd_idx_run
  ON validation_fail_details (validation_run_id);

CREATE INDEX IF NOT EXISTS vfd_idx_rule
  ON validation_fail_details (tenant_id, rule_id);

CREATE INDEX IF NOT EXISTS vfd_idx_cluster
  ON validation_fail_details (cluster_id)
  WHERE cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS vfd_idx_severity
  ON validation_fail_details (validation_run_id, severity);

ALTER TABLE validation_fail_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_fail_details FORCE ROW LEVEL SECURITY;

CREATE POLICY vfd_select ON validation_fail_details
  FOR SELECT
  USING (tenant_id = current_app_tenant_id());
