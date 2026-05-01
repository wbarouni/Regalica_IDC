-- Migration 066_promote_intent_specialists.sql
-- Object: 4-yeux promotion of every draft row in intent_specialists +
--         intent_specialist_bearers seeded by migration 065 to
--         status='active', so the chatbot-py orchestrator's loader
--         (commit C8) finds them in v_intent_specialists_active /
--         v_intent_specialist_bearers_active.
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 064_intent_specialists.sql,
--             065_seed_intent_specialists.sql
-- References: docs/05-AGENTS-ET-PROMPTS-BANK.md sect.6 (4-yeux gate),
--             apps/api/migrations/059_promote_prompt_xml_received.sql
--             (mirrors the same promotion pattern).
--
-- Required session vars (matches 059 conventions):
--   app.seed_author_user_id     - UUID of the original author
--                                 (used only to read the author of
--                                 the rows in question — the column
--                                 is NOT modified by this migration)
--   app.seed_validator_user_id  - UUID of a DIFFERENT user who
--                                 performs the validation; written
--                                 into validator_user_id
--
-- Defensive: RAISE EXCEPTION when author == validator (the CHECK
-- constraint also rejects this — duplicating the test gives a
-- clearer operator-facing error).
--
-- Idempotent: WHERE status='draft' restricts to unpromoted rows; a
-- re-apply against rows already promoted to 'active' is a no-op.

DO $$
DECLARE
  v_author_id    UUID;
  v_validator_id UUID;
  v_promoted     INTEGER;
BEGIN

  IF current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_validator_user_id', true) IS NULL
  OR current_setting('app.seed_validator_user_id', true) = '' THEN
    RAISE NOTICE 'migration 066: promotion session vars not set - skipping update';
    RETURN;
  END IF;

  v_author_id    := current_setting('app.seed_author_user_id')::UUID;
  v_validator_id := current_setting('app.seed_validator_user_id')::UUID;

  IF v_author_id = v_validator_id THEN
    RAISE EXCEPTION
      'migration 066: app.seed_author_user_id and app.seed_validator_user_id must be different (4-yeux)';
  END IF;

  -- intent_specialists: every draft row authored by this user, when
  -- the validator differs.
  UPDATE intent_specialists
     SET status            = 'active',
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE status = 'draft'
     AND author_user_id = v_author_id
     AND author_user_id <> v_validator_id;

  GET DIAGNOSTICS v_promoted = ROW_COUNT;
  RAISE NOTICE 'migration 066: intent_specialists promoted to active (% rows)', v_promoted;

  -- intent_specialist_bearers: same gate.
  UPDATE intent_specialist_bearers
     SET status            = 'active',
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE status = 'draft'
     AND author_user_id = v_author_id
     AND author_user_id <> v_validator_id;

  GET DIAGNOSTICS v_promoted = ROW_COUNT;
  RAISE NOTICE 'migration 066: intent_specialist_bearers promoted to active (% rows)', v_promoted;

END $$;
