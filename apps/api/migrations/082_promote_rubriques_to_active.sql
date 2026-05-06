-- Migration 082_promote_rubriques_to_active.sql
-- Object: Sprint B — promote the 1103 rubrique rows seeded by 039 from
--         status='draft' to status='active' so they appear in the
--         `referentials_rubriques_active` view consumed by the chat
--         orchestrator (router_context.build_run_context) and by the
--         Library /rubriques drill-down. The seed migration intentionally
--         leaves them as draft pending 4-yeux validation; this migration
--         performs that validation in the dev / pilot context where the
--         operator GUC trio (author + validator + tenant) is provided.
--
--         The 4-yeux constraint (009 §41-47) requires
--         validator_user_id != author_user_id, so the migration refuses
--         to run when the two GUCs are equal — the same defence used by
--         the prompt promotion migrations (072-B / 076-B / 078-B).
--
-- Author: ALGORIA Factory
-- Date: 2026-05-06
-- Depends on: 009_referentials_rubriques.sql (table + 4-yeux check),
--             039_seed_rubriques.sql (1103 draft rows for tenant pilot).
--
-- Required session vars:
--   app.seed_tenant_id        - target tenant UUID
--   app.seed_author_user_id   - the user that authored the seed rows
--   app.seed_validator_user_id - a DIFFERENT user that signs them off
--
-- Idempotent: scoped on status='draft', so re-runs are no-ops.

DO $$
DECLARE
  v_tenant_id    UUID;
  v_author_id    UUID;
  v_validator_id UUID;
  v_promoted     INTEGER;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_validator_user_id', true) IS NULL
  OR current_setting('app.seed_validator_user_id', true) = '' THEN
    RAISE NOTICE 'migration 082: GUC trio not set - skipping promotion';
    RETURN;
  END IF;

  v_tenant_id    := current_setting('app.seed_tenant_id')::UUID;
  v_author_id    := current_setting('app.seed_author_user_id')::UUID;
  v_validator_id := current_setting('app.seed_validator_user_id')::UUID;

  IF v_author_id = v_validator_id THEN
    RAISE EXCEPTION
      '4-eyes violation: validator (%) must differ from author (%)',
      v_validator_id, v_author_id;
  END IF;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE referentials_rubriques
     SET status            = 'active',
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE tenant_id     = v_tenant_id
     AND status        = 'draft'
     AND deleted_at IS NULL
     AND author_user_id = v_author_id;

  GET DIAGNOSTICS v_promoted = ROW_COUNT;
  RAISE NOTICE 'migration 082: % rubrique rows promoted to active', v_promoted;
END $$;
