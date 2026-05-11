-- Migration 115_intent_specialists_view_requires_active_run.sql
-- Object: recreate `v_intent_specialists_active` to surface the
--         `requires_active_run` column added by migration 113. The
--         chatbot-py `intent_grammar` loader reads this view to
--         build IntentSpec dataclasses; without the column in the
--         view, the orchestrator's no-active-run short-circuit (Cas
--         N°1) cannot read the flag at runtime.
--
--         CREATE OR REPLACE VIEW is idempotent — re-running this
--         migration on an already-updated view is a no-op. Same
--         pattern as migration 105 (view refresh after migration 104).
--
-- Author: ALGORIA Factory
-- Date: 2026-05-11
-- Depends on: 064_intent_specialists.sql, 105_intent_specialists_view_uniqueness.sql,
--             113_intent_specialists_requires_active_run.sql.

CREATE OR REPLACE VIEW v_intent_specialists_active AS
SELECT
  intent_type,
  aggregator_agent_type,
  aggregator_function_name,
  specialist_ids,
  ordinal,
  description,
  requires_run_uniqueness,
  requires_active_run
FROM intent_specialists
WHERE status = 'active'
  AND is_active = TRUE
  AND deleted_at IS NULL
  AND (valid_to IS NULL OR valid_to > NOW())
ORDER BY ordinal;
