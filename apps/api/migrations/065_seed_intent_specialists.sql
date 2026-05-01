-- Migration 065_seed_intent_specialists.sql
-- Object: seed the 10 canonical intents + 3 specialist bearers used by
--         the Regalica orchestrator. Insert rows in `status='draft'` —
--         migration 066 promotes them to active via the 4-yeux
--         contract.
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 064_intent_specialists.sql, 003_tenants.sql,
--             004_users_roles.sql, 023_prompt_bank.sql
-- References: docs/10-ORCHESTRATION-REGALICA.md sect.3, sect.15.
--
-- Required session vars (matches 043/044/058 conventions):
--   app.seed_author_user_id  - UUID of the seeding user (must hold
--                              platform_owner role on at least one
--                              tenant — RLS isn't checked on this
--                              table since writes are migration-only).
--
-- Idempotent: ON CONFLICT (intent_type) / (specialist_id) DO NOTHING.
-- The natural key uniqueness lets a re-apply skip cleanly without
-- touching rows already promoted to 'active' by migration 066.
--
-- Aggregator references — every (aggregator_agent_type,
-- aggregator_function_name) tuple below corresponds to a row that
-- exists active in prompt_bank (verified at audit time). Specialist
-- ids likewise correspond to bearer rows seeded in the second block.

DO $$
DECLARE
  v_author_id UUID;
  v_intents   JSONB;
  v_bearers   JSONB;
  v_inserted  INTEGER;
BEGIN

  IF current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = '' THEN
    RAISE NOTICE 'migration 065: app.seed_author_user_id not set - skipping seed';
    RETURN;
  END IF;

  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  -- ---------------------------------------------------------------
  -- intent_specialists — 10 entries, ordinal 1..10. The 7 user-
  -- facing intents follow question_types.fn_name ordering; the 3
  -- ambient intents (general_help, out_of_scope, ambiguous) close
  -- the list.
  -- ---------------------------------------------------------------
  v_intents := $INTENTS$
[
  {
    "intent_type": "zoom",
    "aggregator_agent_type": "regalica",
    "aggregator_function_name": "aggregate_zoom_fail",
    "specialist_ids": ["investigator", "citation"],
    "ordinal": 1,
    "description": "Zoom analyst on one or more specific FAILs (rule, rubrique, gap)."
  },
  {
    "intent_type": "cluster",
    "aggregator_agent_type": "regalica",
    "aggregator_function_name": "aggregate_grappe_cause_racine",
    "specialist_ids": ["investigator"],
    "ordinal": 2,
    "description": "Several FAILs grouped by likely shared root cause."
  },
  {
    "intent_type": "historical",
    "aggregator_agent_type": "regalica",
    "aggregator_function_name": "aggregate_historique_recurrence",
    "specialist_ids": ["historical"],
    "ordinal": 3,
    "description": "Comparison with prior runs, recurrence trend over arrete dates."
  },
  {
    "intent_type": "citation",
    "aggregator_agent_type": "regalica",
    "aggregator_function_name": "aggregate_citation_reglementaire",
    "specialist_ids": ["citation"],
    "ordinal": 4,
    "description": "Reference to a BCT circular or article that backs the rule."
  },
  {
    "intent_type": "simulation",
    "aggregator_agent_type": "regalica",
    "aggregator_function_name": "aggregate_simulation_impact",
    "specialist_ids": [],
    "ordinal": 5,
    "description": "Simulate a correction before re-validation."
  },
  {
    "intent_type": "sanction",
    "aggregator_agent_type": "regalica",
    "aggregator_function_name": "aggregate_estimation_sanction",
    "specialist_ids": [],
    "ordinal": 6,
    "description": "Estimate the BCT sanction risk for the current run."
  },
  {
    "intent_type": "plan",
    "aggregator_agent_type": "regalica",
    "aggregator_function_name": "aggregate_plan_optimal",
    "specialist_ids": ["investigator", "historical"],
    "ordinal": 7,
    "description": "Optimal prioritised correction plan covering every open FAIL."
  },
  {
    "intent_type": "general_help",
    "aggregator_agent_type": "regalica",
    "aggregator_function_name": "aggregate_general_help",
    "specialist_ids": [],
    "ordinal": 8,
    "description": "General help on REGFlow or BCT compliance topics outside the chips."
  },
  {
    "intent_type": "out_of_scope",
    "aggregator_agent_type": "regalica",
    "aggregator_function_name": "aggregate_out_of_scope",
    "specialist_ids": [],
    "ordinal": 9,
    "description": "Message outside the REGFlow / BCT compliance scope."
  },
  {
    "intent_type": "ambiguous",
    "aggregator_agent_type": "regalica",
    "aggregator_function_name": "aggregate_ambiguous",
    "specialist_ids": [],
    "ordinal": 10,
    "description": "Message that requires a clarification before any specialist runs."
  }
]
$INTENTS$::JSONB;

  INSERT INTO intent_specialists (
    intent_type,
    aggregator_agent_type,
    aggregator_function_name,
    specialist_ids,
    ordinal,
    description,
    author_user_id,
    status
  )
  SELECT
    e->>'intent_type',
    e->>'aggregator_agent_type',
    e->>'aggregator_function_name',
    e->'specialist_ids',
    (e->>'ordinal')::INTEGER,
    e->>'description',
    v_author_id,
    'draft'
  FROM jsonb_array_elements(v_intents) e
  ON CONFLICT (intent_type) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'migration 065: intent_specialists seeded (% rows)', v_inserted;

  -- ---------------------------------------------------------------
  -- intent_specialist_bearers — 3 entries matching the in-process
  -- _SPECIALIST_INVOKERS handler map (orchestrator.py). Each pair
  -- (agent_type, function_name) corresponds to an active prompt_bank
  -- row.
  -- ---------------------------------------------------------------
  v_bearers := $BEARERS$
[
  {
    "specialist_id": "investigator",
    "agent_type": "investigator",
    "function_name": "analyze_fail",
    "description": "Analyses one fail row and returns a structured root-cause hypothesis."
  },
  {
    "specialist_id": "citation",
    "agent_type": "citation",
    "function_name": "find_regulatory_source",
    "description": "Returns the BCT circular / article that backs the rule's expectation."
  },
  {
    "specialist_id": "historical",
    "agent_type": "historical",
    "function_name": "compare_runs_history",
    "description": "Compares the current run's fails with prior runs of the same annexe."
  }
]
$BEARERS$::JSONB;

  INSERT INTO intent_specialist_bearers (
    specialist_id,
    agent_type,
    function_name,
    description,
    author_user_id,
    status
  )
  SELECT
    e->>'specialist_id',
    e->>'agent_type',
    e->>'function_name',
    e->>'description',
    v_author_id,
    'draft'
  FROM jsonb_array_elements(v_bearers) e
  ON CONFLICT (specialist_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'migration 065: intent_specialist_bearers seeded (% rows)', v_inserted;

END $$;
