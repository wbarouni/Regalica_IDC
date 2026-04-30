-- Migration 050_seed_question_types.sql
-- Object: seed the 7 T2 investigation question types (Workspace
--         suggestion chips).
-- Author: ALGORIA Factory
-- Date: 2026-04-30
-- Depends on: 049_question_types.sql
-- References: docs/04-WORKFLOW-UTILISATEUR-COMPLET.md §T2,
--             apps/api/seeds/question_types.json
--
-- Source: apps/api/seeds/question_types.json. The JSON is embedded
-- verbatim below — keep both in lockstep. Changing one without the
-- other is a drift the deploy pipeline will not catch.
--
-- Required session vars: none. question_types has no tenant_id and
-- the migration runs as a superuser session (RLS is bypassed); the
-- catalogue is system-global.
--
-- Idempotent: ON CONFLICT (fn_name) DO UPDATE keeps the row id stable
-- across re-runs while letting label and ordinal evolve when the JSON
-- source changes.

DO $$
DECLARE
  v_data    JSONB;
  v_inserted INTEGER;
BEGIN

  v_data := $SEED_DATA$
[
  { "fn_name": "zoom",       "label_i18n_key": "chip.zoom",       "ordinal": 1 },
  { "fn_name": "cluster",    "label_i18n_key": "chip.cluster",    "ordinal": 2 },
  { "fn_name": "historical", "label_i18n_key": "chip.historical", "ordinal": 3 },
  { "fn_name": "citation",   "label_i18n_key": "chip.citation",   "ordinal": 4 },
  { "fn_name": "simulation", "label_i18n_key": "chip.simulation", "ordinal": 5 },
  { "fn_name": "sanction",   "label_i18n_key": "chip.sanction",   "ordinal": 6 },
  { "fn_name": "plan",       "label_i18n_key": "chip.plan",       "ordinal": 7 }
]
$SEED_DATA$::JSONB;

  INSERT INTO question_types (fn_name, label_i18n_key, ordinal, is_active)
  SELECT
    p->>'fn_name',
    p->>'label_i18n_key',
    (p->>'ordinal')::SMALLINT,
    TRUE
  FROM jsonb_array_elements(v_data) p
  ON CONFLICT (fn_name) DO UPDATE
    SET label_i18n_key = EXCLUDED.label_i18n_key,
        ordinal        = EXCLUDED.ordinal,
        is_active      = TRUE,
        deleted_at     = NULL,
        updated_at     = NOW();

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'migration 050: question_types upserted (% rows)', v_inserted;

END $$;
