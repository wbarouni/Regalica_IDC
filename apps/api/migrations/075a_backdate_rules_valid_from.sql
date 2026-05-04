-- Migration 075a_backdate_rules_valid_from.sql
-- Object: backdate the valid_from of the rules seeded by 042 to a date
--         that strictly precedes the earliest arrete_date present in
--         tests/fixtures/golden/tenant-001/ (2021-12-31 per the 8-batch
--         layout documented in docs/07). The 042 seed used the
--         operator-supplied app.seed_valid_from GUC, which in any
--         realistic local-dev session lands at the day the operator
--         ran the script. That value is naturally > the historical
--         arrete dates in the golden corpus, so the engine RuleSelector
--         (filter: valid_from <= arrete_date) excludes every rule and
--         /evaluate returns total_rules_evaluated=0 — the regression
--         the operator hit.
--
-- The fix is purely textual: rewrite valid_from to 2020-01-01 UTC for
-- the seed cohort. The 4-eyes audit trail is preserved (author /
-- validator UUIDs, validated_at) and the audit_trigger captures the
-- bitemporal mutation.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-04
-- Depends on: 042_seed_rules.sql (rows exist),
--             075_promote_rules.sql (rows are status='active' so the
--             backdate visibly affects what RuleSelector returns).
--
-- Required session vars:
--   app.seed_tenant_id         - tenant UUID (RLS context)
--   app.seed_author_user_id    - cohort author (only their rows are
--                                touched, so the operation is a strict
--                                no-op on rules authored by anyone else).
--
-- Idempotent: subsequent runs are no-ops thanks to the
-- valid_from > '2020-01-01' filter on the WHERE clause.

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
    RAISE NOTICE 'migration 075a: GUCs not set - skipping backdate';
    RETURN;
  END IF;

  v_tenant_id := current_setting('app.seed_tenant_id')::UUID;
  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE rules
     SET valid_from = '2020-01-01T00:00:00Z'::timestamptz,
         updated_at = NOW()
   WHERE tenant_id      = v_tenant_id
     AND author_user_id = v_author_id
     AND status         = 'active'
     AND deleted_at IS NULL
     AND valid_from     > '2020-01-01T00:00:00Z'::timestamptz;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 075a: % rules valid_from backdated to 2020-01-01', v_updated;
END $$;
