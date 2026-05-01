-- Migration 059_promote_prompt_xml_received.sql
-- Object: 4-yeux promotion of regalica/xml_received from status='draft'
--         to status='active' so chatbot-py /upload can render the T0
--         briefing via load_active_prompt(). Without this promotion
--         the prompt loaded by app.services.prompt_loader returns NULL
--         and the briefing is silently skipped.
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 023_prompt_bank.sql (prompt_bank table + 4-yeux CHECK +
--             unique_active partial index + RLS on platform_owner),
--             058_seed_prompt_xml_received.sql (draft row inserted by
--             the seeding pass)
-- References: docs/05-AGENTS-ET-PROMPTS-BANK.md sect.6 (4-yeux gate),
--             docs/06-SCHEMA-SQL-COMPLET.md sect.8 (prompt_bank
--             prompt_bank_ck_four_eyes constraint).
--
-- Required session vars (extends 058 conventions with a separate
-- validator GUC — author and validator MUST be distinct users to
-- satisfy prompt_bank_ck_four_eyes):
--   app.seed_tenant_id          - UUID of the target tenant
--   app.seed_author_user_id     - UUID of the user who originally
--                                 authored the draft (used only to
--                                 set app.current_user_id for RLS;
--                                 the row's author_user_id column is
--                                 NOT modified by this migration)
--   app.seed_validator_user_id  - UUID of a DIFFERENT user holding the
--                                 platform_owner role; written into
--                                 prompt_bank.validator_user_id
--
-- Idempotent: the WHERE clause restricts to status='draft', so re-runs
-- against an already-promoted row are no-ops. If the GUCs are unset
-- the migration logs a NOTICE and returns — same pattern as 043/058,
-- which keeps the test schema bootstrap clean.
--
-- The CHECK constraint prompt_bank_ck_four_eyes (migration 023 line 58)
-- enforces validator_user_id != author_user_id at the row level, so a
-- mistakenly-equal pair is rejected by Postgres rather than silently
-- promoted.

DO $$
DECLARE
  v_tenant_id    UUID;
  v_author_id    UUID;
  v_validator_id UUID;
  v_updated      INTEGER;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_validator_user_id', true) IS NULL
  OR current_setting('app.seed_validator_user_id', true) = '' THEN
    RAISE NOTICE 'migration 059: promotion session vars not set - skipping update';
    RETURN;
  END IF;

  v_tenant_id    := current_setting('app.seed_tenant_id')::UUID;
  v_author_id    := current_setting('app.seed_author_user_id')::UUID;
  v_validator_id := current_setting('app.seed_validator_user_id')::UUID;

  -- Defensive guard: the CHECK already rejects equality, but raising a
  -- clearer error here helps the operator diagnose a bad GUC pair fast.
  IF v_author_id = v_validator_id THEN
    RAISE EXCEPTION 'migration 059: app.seed_author_user_id and app.seed_validator_user_id must be different users (4-yeux)';
  END IF;

  -- RLS context: the prompt_bank UPDATE policy is gated on
  -- current_user_has_role('platform_owner'). Use the validator as the
  -- acting principal — they are the one performing the promotion.
  PERFORM set_config('app.current_user_id', v_validator_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE prompt_bank
  SET
    status            = 'active',
    validator_user_id = v_validator_id,
    validated_at      = NOW(),
    updated_at        = NOW()
  WHERE tenant_id     = v_tenant_id
    AND agent_type    = 'regalica'
    AND function_name = 'xml_received'
    AND version       = 1
    AND status        = 'draft'
    AND author_user_id <> v_validator_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 059: regalica/xml_received promoted to active (% rows)', v_updated;

END $$;
