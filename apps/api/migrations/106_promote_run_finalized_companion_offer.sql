-- Migration 106_promote_run_finalized_companion_offer.sql
-- Object: 4-eyes promotion of `regalica/run_finalized_companion_offer`
--         (seeded as 'draft' by migration 104) to 'active' so the
--         chatbot-py /upload route can load it via `load_active_prompt`
--         after a successful /finalize. Without promotion, the loader
--         returns None and B6 silently no-ops — the user never sees
--         the companion-offer bubble.
--
--         The `intent_specialists_ck_four_eyes` constraint enforces
--         validator_user_id != author_user_id and validator non-null
--         for status='active'. The dev seed populates both ids
--         (SEED_AUTHOR_USER_ID + SEED_VALIDATOR_USER_ID env vars).
--
-- Author: ALGORIA Factory
-- Date: 2026-05-08
-- Depends on: 104_phase1_foundation.sql.

DO $$
DECLARE
  v_tenant_id    UUID;
  v_validator_id UUID;
  v_updated      INTEGER;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_validator_user_id', true) IS NULL
  OR current_setting('app.seed_validator_user_id', true) = '' THEN
    RAISE NOTICE 'migration 106: GUCs not set - skipping promotion';
    RETURN;
  END IF;

  v_tenant_id    := current_setting('app.seed_tenant_id')::UUID;
  v_validator_id := current_setting('app.seed_validator_user_id')::UUID;

  PERFORM set_config('app.current_user_id', v_validator_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE prompt_bank
     SET status            = 'active',
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE tenant_id     = v_tenant_id
     AND agent_type    = 'regalica'
     AND function_name = 'run_finalized_companion_offer'
     AND version       = 1
     AND status        = 'draft'
     AND author_user_id <> v_validator_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 106: run_finalized_companion_offer promoted to active (% rows)', v_updated;
END $$;
