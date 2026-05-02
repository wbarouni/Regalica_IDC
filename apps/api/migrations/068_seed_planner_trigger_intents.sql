-- Migration 068_seed_planner_trigger_intents.sql
-- Object: seed `regalica_planner_trigger_intents` and
--         `regalica_planner_max_plan_steps` into platform_config so the
--         chatbot-py orchestrator reads its planner-trigger and
--         depth-cap from operator-controlled DB instead of carrying
--         frozen literals.
-- Author: ALGORIA Factory
-- Date: 2026-05-02
-- Depends on: 051_platform_config.sql, 052_seed_platform_config.sql
-- References: docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3,
--             docs/10-ORCHESTRATION-REGALICA.md §16,
--             apps/chatbot-py/app/services/planner_config.py,
--             apps/chatbot-py/app/services/orchestrator.py
--
-- Doctrine
--   The Regalica planner LLM is invoked conditionally — only on the
--   intents whose dispatch is non-trivial enough to benefit from a
--   refinement pass over the candidate set produced by the table
--   dispatch (intent_grammar.py). The trigger list and the depth cap
--   are operator-controlled tunables, NOT classifier outputs, so they
--   live alongside `sse_max_listeners` (migration 063) in the
--   platform_config catalogue rather than inside prompt_bank rows.
--
-- Values
--   regalica_planner_trigger_intents = ["simulation", "sanction", "plan"]
--     The three intents whose canonical specialist sets benefit
--     from LLM refinement: simulation requires choosing which what-if
--     specialists to invoke; sanction needs scoping by run context;
--     plan composes multiple specialists with parallel/sequential
--     ordering. The list mirrors the `trigger_intents_metadata.trigger_intents`
--     block in apps/api/seeds/prompts.json (regalica/planner entry) —
--     the seed file is the documentary contract, this migration is
--     the runtime source.
--
--   regalica_planner_max_plan_steps = 4
--     Depth cap on the LLM-produced plan. 4 covers the heaviest
--     canonical configuration (plan intent: investigator + historical
--     + citation + visualizer per docs/10 §17). Wider values would
--     allow the LLM to invent dependency graphs the orchestrator
--     can't reason about; narrower would force truncation on the
--     plan intent.
--
-- Idempotent: ON CONFLICT (config_key) DO UPDATE so a re-apply
-- after editing either JSON value updates the row in place.

DO $$
DECLARE
  v_data    JSONB;
  v_upserted INTEGER;
BEGIN
  v_data := $SEED_DATA$
[
  {
    "config_key": "regalica_planner_trigger_intents",
    "config_value": ["simulation", "sanction", "plan"],
    "description": "Closed list of intent_type values for which the Regalica orchestrator invokes the regalica/planner LLM after the router. For all other intents the orchestrator dispatches directly via the intent_grammar table (intent_specialists.specialist_ids). Mirror of apps/api/seeds/prompts.json regalica/planner trigger_intents_metadata block. Edit both together; tests assert mirror equality."
  },
  {
    "config_key": "regalica_planner_max_plan_steps",
    "config_value": 4,
    "description": "Maximum number of steps the regalica/planner LLM may emit in an execution plan. The planner prompt receives this as the {max_plan_steps} placeholder; the parser truncates over-long plans to this cap. Bumping requires a planner-prompt review (the prompt declares the contract to the LLM)."
  }
]
$SEED_DATA$::JSONB;

  INSERT INTO platform_config (config_key, config_value, description)
  SELECT
    p->>'config_key',
    p->'config_value',
    p->>'description'
  FROM jsonb_array_elements(v_data) p
  ON CONFLICT (config_key) DO UPDATE
    SET config_value = EXCLUDED.config_value,
        description  = EXCLUDED.description,
        deleted_at   = NULL,
        updated_at   = NOW();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;
  RAISE NOTICE 'migration 068: planner tunables upserted (% rows)', v_upserted;
END $$;
