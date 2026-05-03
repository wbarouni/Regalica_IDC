-- Migration 070_promote_prompts_v1_and_static_response.sql
-- Object: Add static_response + model_tier columns to prompt_bank,
--         optionally promote 22 v1 prompts from 'draft' to 'active'
--         when the operator-controlled GUCs are set, backfill
--         static_response for the out_of_scope aggregator.
-- Author: ALGORIA Factory
-- Date: 2026-05-03
-- Depends on: 023_prompt_bank.sql (table + RLS),
--             043_seed_prompt_bank.sql (seeds 22 entries in 'draft'),
--             069_add_prompt_bank_output_contract.sql
-- References: docs/05-AGENTS-ET-PROMPTS-BANK.md §174 (4-eyes promotion)
--
-- Required session vars for the UPDATE block (070-B) ONLY:
--   app.seed_author_user_id     - UUID of the prompt's author (must match 043)
--   app.seed_validator_user_id  - UUID of the validator (must differ from author)
-- The DDL block (070-A) and the backfill block (070-C) run unconditionally.

-- ─────────────────────────────────────────────────────────────────────────────
-- 070-A — Schema additions (DDL, runs unconditionally)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE prompt_bank
  ADD COLUMN IF NOT EXISTS static_response TEXT,
  ADD COLUMN IF NOT EXISTS model_tier VARCHAR(10) NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'prompt_bank_ck_model_tier'
  ) THEN
    ALTER TABLE prompt_bank
      ADD CONSTRAINT prompt_bank_ck_model_tier
        CHECK (model_tier IN ('lite', 'standard', 'pro'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 070-B — Promote 22 v1 prompts draft → active (conditional on GUCs)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_author_id    UUID;
  v_validator_id UUID;
  v_updated      INTEGER;
BEGIN

  IF current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_validator_user_id', true) IS NULL
  OR current_setting('app.seed_validator_user_id', true) = '' THEN
    RAISE NOTICE 'migration 070-B: GUCs not set - skipping prompts promotion';
    RETURN;
  END IF;

  v_author_id    := current_setting('app.seed_author_user_id')::UUID;
  v_validator_id := current_setting('app.seed_validator_user_id')::UUID;

  IF v_author_id = v_validator_id THEN
    RAISE EXCEPTION
      '4-eyes violation: validator (%) must differ from author (%)',
      v_validator_id, v_author_id;
  END IF;

  -- Set the RLS context locally so the prompt_bank policies (gated on
  -- platform_owner) accept the UPDATE. Same prerequisite as 043:
  -- the caller must have already granted platform_owner to v_author_id.
  PERFORM set_config('app.current_user_id', v_author_id::text, true);

  UPDATE prompt_bank
     SET status            = 'active',
         valid_from        = NOW(),
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE status = 'draft'
     AND deleted_at IS NULL
     AND author_user_id = v_author_id
     AND agent_type IN (
       'regalica',
       'rule_excel_assist',
       'rule_form_assist',
       'referential_ingestor',
       'investigator',
       'historical',
       'reporter',
       'visualizer',
       'citation',
       'diff'
     );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 070-B: promoted % prompts to active', v_updated;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 070-C — Backfill static_response for out_of_scope (DML, unconditional)
-- ─────────────────────────────────────────────────────────────────────────────
-- Note: aggregate_ambiguous is intentionally NOT backfilled here. The
-- aggregator bifurcates on the `clarification_reason` payload field
-- (router_low_confidence vs planner_clarification, see commit 56060ab)
-- and a single canned static_response would erase that bifurcation.
-- Phase 4 may add per-clarification-reason rows if needed.

UPDATE prompt_bank
   SET static_response = 'Cette demande sort du périmètre de REGFlow. ' ||
                         'REGFlow est dédié à la conformité réglementaire BCT. ' ||
                         'Puis-je vous aider sur un sujet de validation ou ' ||
                         'de règle RDG ?',
       updated_at      = NOW()
 WHERE agent_type     = 'regalica'
   AND function_name  = 'aggregate_out_of_scope'
   AND deleted_at IS NULL
   AND static_response IS NULL;
