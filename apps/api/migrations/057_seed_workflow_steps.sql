-- Migration 057_seed_workflow_steps.sql
-- Object: seed the T0 + T1 phases of the workflow grammar.
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 056_workflow_steps.sql
-- References: apps/api/seeds/workflow_steps.json
--
-- Source: apps/api/seeds/workflow_steps.json (embedded verbatim).
-- T2/T3 phases land in a follow-up — chatbot-py only consumes T0
-- in commit 41c.
--
-- Required session vars: none. workflow_steps has no tenant_id; the
-- migration runs as the superuser session and bypasses RLS.
--
-- Idempotent: ON CONFLICT (phase, step_order) DO UPDATE so re-applying
-- after a JSON edit propagates new values without breaking row id
-- stability the audit trail depends on.

DO $$
DECLARE
  v_data    JSONB;
  v_upserted INTEGER;
BEGIN

  v_data := $SEED_DATA$
[
  { "phase": "T0", "step_order": 1, "agent_type": "ingestor_xml", "function_name": "parse_xml" },
  { "phase": "T0", "step_order": 2, "agent_type": "dependency",   "function_name": "check_companions" },
  { "phase": "T0", "step_order": 3, "agent_type": "temporal",     "function_name": "check_dates" },
  { "phase": "T1", "step_order": 1, "agent_type": "investigator", "function_name": "analyze_fail" },
  { "phase": "T1", "step_order": 2, "agent_type": "citation",     "function_name": "find_regulatory_source" },
  { "phase": "T1", "step_order": 3, "agent_type": "historical",   "function_name": "compare_runs_history" },
  { "phase": "T1", "step_order": 4, "agent_type": "reporter",     "function_name": "generate_pdf" }
]
$SEED_DATA$::JSONB;

  INSERT INTO workflow_steps (phase, step_order, agent_type, function_name, is_active)
  SELECT
    p->>'phase',
    (p->>'step_order')::SMALLINT,
    p->>'agent_type',
    p->>'function_name',
    TRUE
  FROM jsonb_array_elements(v_data) p
  ON CONFLICT (phase, step_order) DO UPDATE
    SET agent_type    = EXCLUDED.agent_type,
        function_name = EXCLUDED.function_name,
        is_active     = TRUE,
        deleted_at    = NULL,
        updated_at    = NOW();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;
  RAISE NOTICE 'migration 057: workflow_steps upserted (% rows)', v_upserted;

END $$;
