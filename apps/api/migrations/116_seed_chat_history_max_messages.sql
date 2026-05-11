-- Migration 116_seed_chat_history_max_messages.sql
-- Object: seed `chat_history_max_messages` into platform_config so the
--         chatbot-py orchestrator reads the cap on the number of prior
--         conversation turns injected into the planner / specialists
--         from operator-controlled DB instead of carrying a frozen
--         literal in source.
-- Author: ALGORIA Factory
-- Date: 2026-05-11
-- Depends on: 051_platform_config.sql, 052_seed_platform_config.sql,
--             063_seed_sse_max_listeners.sql (mirror pattern).
-- References: docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3,
--             apps/chatbot-py/app/services/chat_history.py,
--             apps/chatbot-py/app/routes/chat.py (Cas N°2 wiring).
--
-- Doctrine
--   Per "rien n'est doctrinalement exempt", even a conversational
--   memory cap is a tunable the operator owns. 20 turns is the
--   canonical baseline: enough for a Compliance Officer to ask
--   "et celui-là ?" with referent disambiguation across a typical
--   T1+zoom+citation dialogue, low enough to keep router/planner
--   prompts well below the Gemini context window even with thick
--   FAIL context blocks attached.
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
    "config_key": "chat_history_max_messages",
    "config_value": 20,
    "description": "Maximum number of prior conversation turns (user + regalica_response rows combined, ordered by sequence_number) loaded from the messages table by chatbot-py's chat route and forwarded into orchestrate() as session_history. Caps the planner/specialist prompt size. Each row contributes one `[role]: content` line — the cap is row-count, not token-count. Bump for analysts who run long zoom dialogues; lower for token-tight tenants."
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
  RAISE NOTICE 'migration 116: chat_history_max_messages upserted (% rows)', v_upserted;
END $$;
