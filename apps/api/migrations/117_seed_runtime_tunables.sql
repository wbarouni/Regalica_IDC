-- Migration 117_seed_runtime_tunables.sql
-- Object: move three operator-tunable runtime knobs from hardcoded
--         literals to platform_config so Guard D
--         (D-006-magic-number-assignment) no longer flags them. The
--         values were already documented in source as
--         "Operator-tuneable in a follow-up tranche" / "would go to
--         platform_config" — this migration is that follow-up.
--
--           * regalica_router_max_tokens        — token budget for the
--             regalica/router LLM call. Was Final[int] = 1024 in
--             apps/chatbot-py/app/services/intent_router.py.
--           * regalica_thinking_preview_max_chars — display cap on the
--             specialist-output preview line in the thinking trace.
--             Was max_chars=180 in apps/chatbot-py/app/services/
--             orchestrator.py:_build_thinking_trace.
--           * web_error_toast_seconds          — auto-dismiss timer
--             for the upload error toast. Was 4_000 ms in
--             apps/web/src/components/UploadDropZone.tsx.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-11
-- Depends on: 051_platform_config.sql, 052_seed_platform_config.sql,
--             063_seed_sse_max_listeners.sql (mirror pattern).
-- References: docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3,
--             tools/check-no-hardcoding.sh / .semgrep/no-hardcoding.yml.
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
    "config_key": "regalica_router_max_tokens",
    "config_value": 1024,
    "description": "Maximum number of output tokens the regalica/router LLM may emit (intent classification JSON). Consumed by apps/chatbot-py/app/services/intent_router.py via load_router_max_tokens(). 1024 covers the JSON payload plus thinking_trace; bump for verbose router prompts."
  },
  {
    "config_key": "regalica_thinking_preview_max_chars",
    "config_value": 180,
    "description": "Display cap on the specialist-output preview line surfaced in the deterministic thinking trace. Consumed by apps/chatbot-py/app/services/orchestrator.py _build_thinking_trace. 180 keeps the trace human-scannable; longer previews push the operator into scroll territory."
  },
  {
    "config_key": "web_error_toast_seconds",
    "config_value": 4,
    "description": "Auto-dismiss timer for the upload error toast in apps/web/src/components/UploadDropZone.tsx. Value is in SECONDS (the component multiplies by 1000 for the setTimeout). 4 seconds covers the read of a one-line error without trapping focus."
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
  RAISE NOTICE 'migration 117: runtime tunables upserted (% rows)', v_upserted;
END $$;
