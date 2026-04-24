-- Migration 027_clusters.sql
-- Object: clusters table + indexes + tenant RLS + backfill FK on validation_fail_details.cluster_id
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 023_prompt_bank.sql, 025_validation_runs.sql, 026_validation_fail_details.sql
-- References: Document 6 §13 (table), §22.3 (RLS title covers clusters)
--
-- TODO(@wbarouni): same §22.3 extrapolation note as migration 026.

CREATE TABLE IF NOT EXISTS clusters (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  validation_run_id         UUID NOT NULL REFERENCES validation_runs(id),

  -- Identification
  cluster_label             VARCHAR(20) NOT NULL,
  priority                  VARCHAR(10) NOT NULL,
  impact_level              VARCHAR(10) NOT NULL,

  -- Root cause narrative
  root_cause_hypothesis     TEXT NOT NULL,
  business_explanation      TEXT NOT NULL,
  recommended_action        TEXT NOT NULL,
  pointed_sector_si         TEXT,

  -- Detected correlations
  correlation_type          VARCHAR(30) NOT NULL,
  correlation_evidence      JSONB,

  -- Metrics
  fail_count                INTEGER NOT NULL,
  confidence_level          VARCHAR(20) NOT NULL,
  confidence_score          NUMERIC(3, 2),

  -- Source agent
  produced_by_agent         VARCHAR(50) NOT NULL DEFAULT 'InvestigatorAgent',
  prompt_version_used       UUID REFERENCES prompt_bank(id),

  -- Systemic audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT clusters_uk_label_run UNIQUE (validation_run_id, cluster_label),
  CONSTRAINT clusters_ck_priority CHECK (priority IN ('P1', 'P2', 'P3')),
  CONSTRAINT clusters_ck_impact CHECK (impact_level IN ('high', 'medium', 'low')),
  CONSTRAINT clusters_ck_confidence CHECK (
    confidence_level IN ('high', 'medium', 'low', 'insufficient_data')
  )
);

CREATE INDEX IF NOT EXISTS clusters_idx_run
  ON clusters (validation_run_id);

CREATE INDEX IF NOT EXISTS clusters_idx_priority
  ON clusters (validation_run_id, priority);

ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters FORCE ROW LEVEL SECURITY;

CREATE POLICY clusters_select ON clusters
  FOR SELECT
  USING (tenant_id = current_app_tenant_id());

-- Backfill the FK on validation_fail_details.cluster_id now that clusters
-- exists. Guarded by information_schema so the migration stays idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'vfd_fk_cluster'
      AND table_name = 'validation_fail_details'
  ) THEN
    ALTER TABLE validation_fail_details
      ADD CONSTRAINT vfd_fk_cluster
      FOREIGN KEY (cluster_id) REFERENCES clusters(id);
  END IF;
END $$;
