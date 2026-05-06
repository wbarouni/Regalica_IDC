-- Migration 085_specialist_token_budget_bump.sql
-- Object: bump `max_tokens` and disable `thinking_enabled` on the four
--         T2 specialist prompts (investigator, citation, historical,
--         diff) so Gemini 2.5 Flash stops truncating their structured
--         JSON output mid-content.
--
--         The model silently consumes part of `max_output_tokens` on
--         internal "thinking" passes even when no thinking_config is
--         requested. With the seed budget of 4096 tokens, the
--         investigator's verbose JSON envelope (explanation_fr +
--         suggested_actions[] + rubriques[] + citations[]) was getting
--         cut mid-sentence — the `extract_first_json` helper then
--         saw "```json\n{...}\n" without a closing brace and reported
--         "LLM returned no parseable JSON object", forcing the
--         aggregator into the conditional fallback ("Diagnostic
--         préliminaire — analyse en cours de consolidation"), exactly
--         the symptom the user reported when the rubrique code never
--         made it into the cause-racine prose.
--
--         Two changes per row:
--           * max_tokens 4096 → 8192 (investigator, historical) and
--             4096 → 4096 unchanged for citation / diff which never
--             showed truncation in production logs but get
--             thinking_enabled=false for the latency win.
--           * thinking_enabled true → false on all four. Their
--             prompts encode the reasoning explicitly via the
--             METHOD/PROCEDURE blocks; removing the implicit thinking
--             pass releases the full max_tokens budget for the visible
--             JSON output and cuts ~1-2s of latency per call.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-06
-- Depends on: 081_overhaul_active_prompt_bodies.sql (real prompt bodies
--             active so the parameter bump is meaningful).
--
-- Required session vars:
--   app.seed_tenant_id       - target tenant UUID
--   app.seed_author_user_id  - platform_owner UUID (RLS context)
--
-- Idempotent: scoped on (tenant, agent, function, version=1, status='active').

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
    RAISE NOTICE 'migration 085: GUCs not set - skipping update';
    RETURN;
  END IF;

  v_tenant_id := current_setting('app.seed_tenant_id')::UUID;
  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  -- Investigator + historical: long structured envelopes — bump budget.
  UPDATE prompt_bank
  SET max_tokens       = 8192,
      thinking_enabled = FALSE,
      updated_at       = NOW()
  WHERE tenant_id    = v_tenant_id
    AND status       = 'active'
    AND version      = 1
    AND (
      (agent_type = 'investigator' AND function_name = 'analyze_fail')
      OR
      (agent_type = 'historical' AND function_name = 'compare_runs_history')
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 085: investigator/historical max_tokens=8192 thinking_enabled=false (% rows)', v_updated;

  -- Citation + diff: shorter envelopes — keep budget but still drop
  -- thinking for latency.
  UPDATE prompt_bank
  SET thinking_enabled = FALSE,
      updated_at       = NOW()
  WHERE tenant_id    = v_tenant_id
    AND status       = 'active'
    AND version      = 1
    AND (
      (agent_type = 'citation' AND function_name = 'find_regulatory_source')
      OR
      (agent_type = 'diff' AND function_name = 'narrate_diff')
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 085: citation/diff thinking_enabled=false (% rows)', v_updated;
END $$;
