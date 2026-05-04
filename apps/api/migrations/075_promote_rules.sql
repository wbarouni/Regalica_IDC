-- Migration 075_promote_rules.sql
-- Object: 4-eyes promotion of every draft rule seeded by 042 to
--         status='active' so the engine /evaluate route picks them up
--         (the active set used by RuleSelector is gated on
--         status='active' AND deleted_at IS NULL).
-- Author: ALGORIA Factory
-- Date: 2026-05-04
-- Depends on: 042_seed_rules.sql (creates the draft rows under 4-eyes
--             author_user_id; this migration adds the validator and
--             flips status).
--
-- Required session vars:
--   app.seed_author_user_id     - UUID of the original seed author
--                                 (must match rules.author_user_id; only
--                                 rules authored by this user are
--                                 promoted, so re-running with a
--                                 different author is a strict no-op
--                                 instead of a cross-author override).
--   app.seed_validator_user_id  - distinct UUID of the validator
--                                 (4-eyes constraint: must differ from
--                                 the author).
--   app.seed_tenant_id          - tenant UUID (also used to set the
--                                 RLS context).
--
-- Idempotent: filters on status='draft', so re-runs after promotion
-- skip every row. The audit_trigger captures the status transition.

DO $$
DECLARE
  v_author_id    UUID;
  v_validator_id UUID;
  v_tenant_id    UUID;
  v_promoted     INTEGER;
BEGIN

  IF current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_validator_user_id', true) IS NULL
  OR current_setting('app.seed_validator_user_id', true) = ''
  OR current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = '' THEN
    RAISE NOTICE 'migration 075: GUCs not set - skipping promotion';
    RETURN;
  END IF;

  v_author_id    := current_setting('app.seed_author_user_id')::UUID;
  v_validator_id := current_setting('app.seed_validator_user_id')::UUID;
  v_tenant_id    := current_setting('app.seed_tenant_id')::UUID;

  IF v_author_id = v_validator_id THEN
    RAISE EXCEPTION
      '4-eyes violation: validator (%) must differ from author (%)',
      v_validator_id, v_author_id;
  END IF;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE rules
     SET status            = 'active',
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE tenant_id      = v_tenant_id
     AND author_user_id = v_author_id
     AND status         = 'draft'
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_promoted = ROW_COUNT;
  RAISE NOTICE 'migration 075: % rules promoted draft -> active', v_promoted;
END $$;
