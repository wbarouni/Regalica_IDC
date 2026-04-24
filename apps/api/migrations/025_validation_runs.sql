-- Migration 025_validation_runs.sql
-- Object: validation_runs + validation_run_uploads + immutability trigger with revocation escape hatch + RLS
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 004_users_roles.sql, 024_xml_uploads.sql
-- References: Document 6 §11 (table), §22.3 (RLS), §23.1 (immutability);
--             PRD §5.4 and Document 4 §18 (controlled signature revocation)

CREATE TABLE IF NOT EXISTS validation_runs (
  id                            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                     UUID NOT NULL REFERENCES tenants(id),

  -- Run context
  batch_label                   TEXT,
  primary_annexe_code           VARCHAR(10) NOT NULL,
  arrete_date                   DATE NOT NULL,
  primary_upload_id             UUID NOT NULL REFERENCES xml_uploads(id),

  -- Initiator and timing
  initiated_by_user_id          UUID NOT NULL REFERENCES users(id),
  initiated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at                  TIMESTAMPTZ,

  -- Version snapshots for replayability
  rules_version_snapshot        JSONB NOT NULL,
  referentials_version_snapshot JSONB NOT NULL,
  engine_version                VARCHAR(20) NOT NULL,

  -- Aggregate results
  status                        VARCHAR(20) NOT NULL DEFAULT 'running',
  total_rules_evaluated         INTEGER,
  total_pass                    INTEGER,
  total_fail_severe             INTEGER,
  total_fail_rounding           INTEGER,
  conformity_rate               NUMERIC(5, 4),
  execution_time_ms             INTEGER,

  -- BCT three-step sub-status
  step1_xsd_status              VARCHAR(20),
  step1_xsd_duration_ms         INTEGER,
  step2_embedded_status         VARCHAR(20),
  step2_embedded_duration_ms    INTEGER,
  step3_rdg_status              VARCHAR(20),
  step3_rdg_duration_ms         INTEGER,

  -- Produced artefacts
  synthesis_artifact            JSONB,
  deliverable_c_artifact        JSONB,

  -- Conversation link (FK deferred, see TODO below)
  conversation_id               UUID,

  -- Signature mode
  is_signed                     BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at                     TIMESTAMPTZ,
  signed_by_user_id             UUID REFERENCES users(id),
  signed_xml_hash               VARCHAR(64),

  -- Systemic audit (immutable)
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT validation_runs_ck_status CHECK (status IN ('running', 'completed', 'failed', 'aborted')),
  CONSTRAINT validation_runs_ck_signed_coherence CHECK (
    (is_signed = FALSE AND signed_at IS NULL AND signed_by_user_id IS NULL)
    OR
    (is_signed = TRUE AND signed_at IS NOT NULL AND signed_by_user_id IS NOT NULL AND total_fail_severe = 0)
  ),
  CONSTRAINT validation_runs_ck_completion CHECK (
    (status = 'running' AND completed_at IS NULL)
    OR
    (status IN ('completed', 'failed', 'aborted') AND completed_at IS NOT NULL)
  )
);

-- TODO(@wbarouni): conversation_id REFERENCES conversations(id) is deferred
-- because conversations is created in migration 031. A dedicated migration
-- 031a_validation_runs_conversation_fk.sql must add:
--   ALTER TABLE validation_runs ADD CONSTRAINT validation_runs_fk_conversation
--     FOREIGN KEY (conversation_id) REFERENCES conversations(id);

CREATE INDEX IF NOT EXISTS validation_runs_idx_tenant_date
  ON validation_runs (tenant_id, arrete_date DESC);

CREATE INDEX IF NOT EXISTS validation_runs_idx_user
  ON validation_runs (tenant_id, initiated_by_user_id, initiated_at DESC);

CREATE INDEX IF NOT EXISTS validation_runs_idx_annexe
  ON validation_runs (tenant_id, primary_annexe_code, arrete_date DESC);

CREATE INDEX IF NOT EXISTS validation_runs_idx_status
  ON validation_runs (tenant_id, status)
  WHERE status = 'running';

-- Join table for primary + companion uploads in a run.
CREATE TABLE IF NOT EXISTS validation_run_uploads (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  validation_run_id         UUID NOT NULL REFERENCES validation_runs(id),
  xml_upload_id             UUID NOT NULL REFERENCES xml_uploads(id),
  role                      VARCHAR(20) NOT NULL,

  CONSTRAINT vru_uk UNIQUE (validation_run_id, xml_upload_id),
  CONSTRAINT vru_ck_role CHECK (role IN ('primary', 'companion'))
);

CREATE INDEX IF NOT EXISTS vru_idx_run ON validation_run_uploads (validation_run_id);

-- Immutability trigger.
--
-- TODO(@wbarouni): Document 6 §23.1 literally forbids any TRUE -> FALSE
-- transition on is_signed, but PRD §5.4 and Document 4 §18 require a
-- controlled revocation via sp_revoke_signature. The trigger below
-- reconciles by allowing the revocation only when the session variable
-- `app.revoke_signature_authorized` is set to 'true'. Revise §23.1 in
-- the docs to match this session-variable-based escape hatch when the
-- sp_revoke_signature procedure is added in Phase 3.
CREATE OR REPLACE FUNCTION prevent_validation_runs_modification() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'validation_runs is insert-only; DELETE is forbidden on run %', OLD.id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id != OLD.id
       OR NEW.tenant_id != OLD.tenant_id
       OR NEW.primary_annexe_code != OLD.primary_annexe_code
       OR NEW.arrete_date != OLD.arrete_date
       OR NEW.primary_upload_id != OLD.primary_upload_id
       OR NEW.initiated_by_user_id != OLD.initiated_by_user_id
       OR NEW.initiated_at != OLD.initiated_at
       OR NEW.created_at != OLD.created_at
       OR (NEW.completed_at IS DISTINCT FROM OLD.completed_at AND OLD.completed_at IS NOT NULL)
       OR (NEW.rules_version_snapshot::TEXT != OLD.rules_version_snapshot::TEXT)
       OR (NEW.referentials_version_snapshot::TEXT != OLD.referentials_version_snapshot::TEXT)
    THEN
      RAISE EXCEPTION 'validation_runs immutable fields cannot be modified';
    END IF;

    IF OLD.is_signed = TRUE AND NEW.is_signed = FALSE THEN
      IF COALESCE(current_setting('app.revoke_signature_authorized', true), '') != 'true' THEN
        RAISE EXCEPTION 'validation_runs signature revocation requires app.revoke_signature_authorized = true in the session';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validation_runs_immutability ON validation_runs;
CREATE TRIGGER validation_runs_immutability
  BEFORE UPDATE OR DELETE ON validation_runs
  FOR EACH ROW EXECUTE FUNCTION prevent_validation_runs_modification();

-- REVOKE UPDATE/DELETE on PUBLIC as a belt-and-suspenders complement to
-- the trigger. TODO(@wbarouni): the REVOKE from regflow_app and the
-- partial GRANT UPDATE on regflow_engine specified in §23.1 arrive in
-- migration 036 together with the role creations:
--   REVOKE UPDATE, DELETE ON validation_runs FROM regflow_app;
--   GRANT UPDATE (is_signed, signed_at, signed_by_user_id, signed_xml_hash,
--                 completed_at, total_rules_evaluated, total_pass,
--                 total_fail_severe, total_fail_rounding, conformity_rate,
--                 execution_time_ms, status, step1_xsd_status,
--                 step1_xsd_duration_ms, step2_embedded_status,
--                 step2_embedded_duration_ms, step3_rdg_status,
--                 step3_rdg_duration_ms, synthesis_artifact,
--                 deliverable_c_artifact, conversation_id)
--     ON validation_runs TO regflow_engine;
REVOKE UPDATE, DELETE ON validation_runs FROM PUBLIC;

-- Row-Level Security (Document 6 §22.3).
ALTER TABLE validation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY validation_runs_select ON validation_runs
  FOR SELECT
  USING (tenant_id = current_app_tenant_id());

CREATE POLICY validation_runs_insert ON validation_runs
  FOR INSERT
  WITH CHECK (
    tenant_id = current_app_tenant_id()
    AND initiated_by_user_id = current_app_user_id()
  );

-- No UPDATE / DELETE policies: the immutability trigger governs writes.
