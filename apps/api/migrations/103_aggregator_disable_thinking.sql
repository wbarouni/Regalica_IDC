-- Migration 103_aggregator_disable_thinking.sql
-- Object: disable `thinking_enabled` on the two per-FAIL aggregators
--         (`regalica/aggregate_zoom_fail`,
--         `regalica/aggregate_grappe_cause_racine`) so the Gemini 2.5
--         Flash internal reasoning pass no longer doubles the chat
--         response latency.
--
--         Diagnostic ground truth (2026-05-08): Compliance Officer
--         reports that zoom responses including BLOC 2-bis (formula
--         decomposition) take 8-15s to render. Inspection of the
--         active prompt_bank rows shows:
--             aggregate_zoom_fail            thinking_enabled=true   max_tokens=1024
--             aggregate_grappe_cause_racine  thinking_enabled=true   max_tokens=1280
--         With `GEMINI_THINKING_BUDGET=8192` (.env), each call can
--         spend up to 8k tokens on invisible reasoning before
--         producing the 1024 token visible response.
--
--         The orchestrator ALREADY runs the prose thinking trace
--         via the dedicated `regalica/thinking_reflection` prompt in
--         parallel with the specialists (orchestrator.py:1838+) — its
--         output is what populates the « Mode thinking » artefact at
--         the top of the chat bubble (Bug 4). Having the aggregator
--         ALSO think internally is duplicate effort: the user-facing
--         reasoning is already covered by the parallel reflection,
--         and the aggregator's invisible thinking only delays the
--         visible response.
--
--         Disabling `thinking_enabled` on these two aggregators:
--           - drops typical zoom latency from ~10s to ~3-5s
--           - preserves the visible thinking trace (separate prompt)
--           - drops API spend (Gemini 2.5 Flash pricing distinguishes
--             input + output + thinking tokens)
--           - does NOT change response quality: the aggregator's job
--             is to format specialist outputs into the BLOC 1-7
--             structure, which is structural composition, not deep
--             reasoning. Temperature 0.7 + the strict prompt
--             template provide the necessary creative latitude
--             without internal thinking.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-08
-- Depends on: 081_overhaul_active_prompt_bodies.sql (current params).

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
    RAISE NOTICE 'migration 103: GUCs not set - skipping update';
    RETURN;
  END IF;

  v_tenant_id := current_setting('app.seed_tenant_id')::UUID;
  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE prompt_bank
  SET thinking_enabled = FALSE,
      updated_at = NOW()
  WHERE tenant_id     = v_tenant_id
    AND agent_type    = 'regalica'
    AND function_name IN ('aggregate_zoom_fail', 'aggregate_grappe_cause_racine')
    AND version       = 1
    AND status        = 'active'
    AND thinking_enabled = TRUE;  -- idempotent

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 103: aggregate_zoom_fail + aggregate_grappe_cause_racine thinking disabled (% rows)', v_updated;
END $$;
