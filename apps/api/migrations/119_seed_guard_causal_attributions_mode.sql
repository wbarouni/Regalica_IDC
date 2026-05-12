-- Migration 119_seed_guard_causal_attributions_mode.sql
-- Object: seed `regalica_guard_causal_attributions_mode` into
--         platform_config so the anti-hallucination guard's causal
--         dimension (Lot A.2.2) operates from operator-controlled
--         configuration rather than a hardcoded mode.
--
--         The guard reads this key to decide how strict it is when
--         the LLM emits a `causal_attributions` list whose entries
--         reference rules absent from
--         `rubrique_confidence_run.contributing_rule_ids` for the
--         targeted cell:
--
--           * "strict_when_present" (default) — when the list is
--             present (non-None), every entry must be valid; invalid
--             entries become violations and are filtered. A missing
--             list (None) skips the causal pass entirely.
--
--           * "lax" — log warnings but do not block. Filter no
--             entries. Reserved for the soak period after a prompt
--             revision lands, before flipping back to strict.
--
--         A future "mandatory" mode (not seeded today) will additionally
--         require at least one CausalAttribution per cell present in
--         `rubrique_incriminee_cells`. That mode lands when the
--         investigator prompt v3 (Lot A.3) is promoted to active.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-12
-- Depends on: 051_platform_config.sql, 052_seed_platform_config.sql,
--             118_llm_output_guard_seeds.sql (sister seeds), the
--             contracts/investigator.py CausalAttribution model
--             added by Lot A.2.1.
-- References: apps/chatbot-py/app/services/llm_output_guard.py,
--             docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3.
--
-- Idempotent: ON CONFLICT (config_key) DO UPDATE so a re-apply
-- after editing the value updates the row in place.

DO $$
DECLARE
  v_data     JSONB;
  v_upserted INTEGER;
BEGIN
  v_data := $SEED_DATA$
[
  {
    "config_key": "regalica_guard_causal_attributions_mode",
    "config_value": "strict_when_present",
    "description": "Operator-controlled strictness of the anti-hallucination guard's causal dimension (Lot A.2.2). Allowed values: 'strict_when_present' (default, every non-None attribution must match contributing_rule_ids), 'lax' (warn but do not filter, used during prompt-revision soak periods). Consumed by apps/chatbot-py/app/services/llm_output_guard.verify_causal_attributions_against_db."
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
  RAISE NOTICE 'migration 119: regalica_guard_causal_attributions_mode upserted (% rows)', v_upserted;
END $$;
