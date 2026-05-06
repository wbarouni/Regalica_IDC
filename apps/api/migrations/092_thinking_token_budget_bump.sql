-- Migration 092_thinking_token_budget_bump.sql
-- Object: bump `max_tokens` of the `regalica/thinking_reflection`
--         prompt from 768 to 2048 so the holistic reflection produced
--         on a verdict with N≥5 fails (P2 use case) does not get
--         truncated mid-paragraph. Gemini 2.5 Flash silently consumes
--         part of the output budget on internal "thinking" even when
--         `thinking_enabled=false` — the 768-token cap left ~150
--         visible tokens of prose, which collapsed the second/third
--         paragraph of the holistic reflection.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-06
-- Depends on: 087_seed_thinking_reflection.sql, 090_thinking_reflection_holistic.sql.

DO $$
DECLARE
  v_tenant_id UUID;
  v_author_id UUID;
  v_updated   INTEGER;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = '' THEN
    RAISE NOTICE 'migration 092: GUCs not set - skipping update';
    RETURN;
  END IF;

  v_tenant_id := current_setting('app.seed_tenant_id')::UUID;
  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE prompt_bank
     SET max_tokens = 2048,
         updated_at = NOW()
   WHERE tenant_id     = v_tenant_id
     AND agent_type    = 'regalica'
     AND function_name = 'thinking_reflection'
     AND version       = 1
     AND status        = 'active'
     AND max_tokens    < 2048;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 092: thinking_reflection max_tokens lifted to 2048 (% rows)', v_updated;
END $$;
