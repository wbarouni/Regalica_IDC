-- Migration 101_aggregate_t1_result_tokens.sql
-- Object: bump `regalica/aggregate_t1_result` max_tokens 512 → 2048
--         so the synthesis sentence after a T1 validation finishes
--         instead of getting clipped mid-clause.
--
--         Diagnostic ground truth (2026-05-08): Compliance Officer
--         saw "La validation BCT T1 a été exécutée avec succès. Elle
--         a identifié 8 FAILs sévères, 0 FAIL d'" — the response
--         truncated mid-word ("FAIL d'arrondi"). The aggregator was
--         seeded with max_tokens=512 in migration 072 which was OK
--         for the original 1-2 sentence template but became too tight
--         once the prompt evolved to surface the full KPI block +
--         next-step guidance.
--
--         512 budget is consumed by:
--           - the JSON envelope of input (~200 tokens for a typical
--             EvaluateRunResult.totals dict)
--           - the rendered KPI block (~120 tokens for the FR labels)
--           - any thinking trace bleed-through
--         Leaving ~150-200 tokens for the actual prose, which is why
--         a 200-character response gets cut.
--
--         New budget 2048 mirrors `regalica/thinking_reflection`
--         which carries similar prose composition load (migration
--         092). 2048 is well within the gemini-2.5-flash 8192 max
--         output, no cost concern.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-08
-- Depends on: 072_seed_intent_launch_validation.sql (active row).

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
    RAISE NOTICE 'migration 101: GUCs not set - skipping update';
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
    AND function_name = 'aggregate_t1_result'
    AND version       = 1
    AND status        = 'active'
    AND max_tokens    < 2048;  -- idempotent

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 101: aggregate_t1_result max_tokens bumped to 2048 (% rows)', v_updated;
END $$;
