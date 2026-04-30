-- Migration 048_run_agent_steps.sql
-- Object: per-run agent execution timeline + RLS + audit trigger.
-- Author: ALGORIA Factory
-- Date: 2026-04-30
-- Depends on: 001_extensions.sql (uuidv7), 002_schema_helpers.sql
--             (current_app_tenant_id, current_app_user_id),
--             003_tenants.sql, 006_audit_trigger_function.sql,
--             025_validation_runs.sql, 036_grants_regflow_app.sql
-- References: Document 10 §15 (canonical pipeline), docs/PHASE-B-PLAN.md
--             (ribbon connecté API)
--
-- Drives the Workspace ribbon. One row per (run, agent_type,
-- function_name) tuple. The validation engine inserts rows with
-- status='pending' at run creation, transitions them to 'current' /
-- 'done' / 'error' as it advances, and the SSE relay (apps/api/src/lib/
-- runEventBus.ts) republishes each transition to subscribers.
--
-- Soft-delete via deleted_at: rows are never physically removed; the
-- API's GET /runs/:runId/agents filters WHERE deleted_at IS NULL so
-- a defensive purge does not break replay.
--
-- duration_ms is GENERATED STORED — no application-side arithmetic.

CREATE TABLE IF NOT EXISTS run_agent_steps (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  run_id          UUID NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id),

  agent_type      VARCHAR(64)  NOT NULL,
  function_name   VARCHAR(128) NOT NULL,
  ordinal         SMALLINT     NOT NULL,

  status          VARCHAR(16)  NOT NULL DEFAULT 'pending',
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
      THEN ((EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000))::INTEGER
      ELSE NULL
    END
  ) STORED,
  error_message   TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT run_agent_steps_uk_natural
    UNIQUE (run_id, agent_type, function_name),

  CONSTRAINT run_agent_steps_ck_status
    CHECK (status IN ('pending', 'current', 'done', 'error')),

  CONSTRAINT run_agent_steps_ck_timing
    CHECK (
      (started_at IS NULL AND completed_at IS NULL)
      OR (started_at IS NOT NULL AND completed_at IS NULL)
      OR (started_at IS NOT NULL AND completed_at IS NOT NULL
          AND completed_at >= started_at)
    ),

  CONSTRAINT run_agent_steps_ck_status_timing
    CHECK (
      (status = 'pending'  AND started_at IS NULL  AND completed_at IS NULL)
      OR (status = 'current' AND started_at IS NOT NULL AND completed_at IS NULL)
      OR (status IN ('done', 'error') AND started_at IS NOT NULL AND completed_at IS NOT NULL)
    ),

  CONSTRAINT run_agent_steps_ck_error_message
    CHECK ((status = 'error') = (error_message IS NOT NULL))
);

-- Filtering indexes — frequent queries are by run_id (ribbon, SSE) and
-- by tenant_id (cross-run analytics).
CREATE INDEX IF NOT EXISTS run_agent_steps_idx_run
  ON run_agent_steps (run_id, ordinal)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS run_agent_steps_idx_tenant
  ON run_agent_steps (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS run_agent_steps_idx_status_current
  ON run_agent_steps (run_id)
  WHERE status = 'current' AND deleted_at IS NULL;

-- Row-Level Security per Document 6 §22.3 doctrine. The same tenant_id
-- equality test as validation_runs / messages / clusters.
ALTER TABLE run_agent_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_agent_steps FORCE ROW LEVEL SECURITY;

CREATE POLICY run_agent_steps_select ON run_agent_steps
  FOR SELECT
  USING (tenant_id = current_app_tenant_id());

CREATE POLICY run_agent_steps_insert ON run_agent_steps
  FOR INSERT
  WITH CHECK (tenant_id = current_app_tenant_id());

CREATE POLICY run_agent_steps_update ON run_agent_steps
  FOR UPDATE
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());

-- Audit trail (Document 6 §24): the generic audit_trigger_function
-- records INSERT / UPDATE / DELETE in audit_log, capturing actor +
-- old/new JSONB snapshots.
DROP TRIGGER IF EXISTS run_agent_steps_audit ON run_agent_steps;
CREATE TRIGGER run_agent_steps_audit
  AFTER INSERT OR UPDATE OR DELETE ON run_agent_steps
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
