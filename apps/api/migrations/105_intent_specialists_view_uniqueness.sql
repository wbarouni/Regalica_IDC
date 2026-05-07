-- Migration 105_intent_specialists_view_uniqueness.sql
-- Object: recreate `v_intent_specialists_active` to surface the new
--         `requires_run_uniqueness` column added by migration 104.
--         The chatbot-py `intent_grammar` loader reads this view to
--         build IntentSpec dataclasses; without the column in the
--         view, the orchestrator's B2 T1 short-circuit cannot read
--         the flag at runtime.
--
--         CREATE OR REPLACE VIEW is idempotent — re-running this
--         migration on an already-updated view is a no-op.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-08
-- Depends on: 064_intent_specialists.sql, 104_phase1_foundation.sql.

CREATE OR REPLACE VIEW v_intent_specialists_active AS
SELECT
  intent_type,
  aggregator_agent_type,
  aggregator_function_name,
  specialist_ids,
  ordinal,
  description,
  requires_run_uniqueness
FROM intent_specialists
WHERE status = 'active'
  AND is_active = TRUE
  AND deleted_at IS NULL
  AND (valid_to IS NULL OR valid_to > NOW())
ORDER BY ordinal;
