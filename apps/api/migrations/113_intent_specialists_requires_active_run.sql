-- Migration 113_intent_specialists_requires_active_run.sql
-- Object: add `requires_active_run` boolean to intent_specialists and
--         flip it to TRUE for the intents that need a validation_run
--         + FAIL context to answer meaningfully (zoom, cluster,
--         historical, plan). Replaces the hardcoded
--         `_INTENTS_NEEDING_FAILS = frozenset({"zoom", "cluster",
--         "historical", "plan"})` in
--         apps/chatbot-py/app/services/orchestrator.py (CLAUDE.md
--         zero-hardcoding doctrine).
--
--         When TRUE, the orchestrator short-circuits the chat turn
--         with an "upload XML first" response (via the
--         `regalica/aggregate_no_active_run` prompt seeded by
--         migration 114) instead of letting the specialist run with
--         an empty fail_context (which currently makes Gemini
--         hallucinate or refuse with "je n'ai pas détecté X fails").
--
--         Strictly ADDITIVE + IDEMPOTENT. Default FALSE preserves
--         the legacy behaviour for every row (general_help,
--         out_of_scope, ambiguous, launch_validation, citation,
--         simulation, sanction, self_introduction, download_report).
--         The GUC-gated UPDATE flips only the four "needs FAILs"
--         intents seeded by migration 065.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-11
-- Depends on: 064_intent_specialists.sql, 065_seed_intent_specialists.sql,
--             066_promote_intent_specialists.sql.
-- References: CLAUDE.md §3 (zero-hardcoding), Cas N°1 audit 2026-05-11.

-- =====================================================================
-- 113-A — column add
-- =====================================================================

ALTER TABLE intent_specialists
  ADD COLUMN IF NOT EXISTS requires_active_run BOOLEAN NOT NULL DEFAULT FALSE;

-- =====================================================================
-- 113-B — flip the four "needs FAILs" intents
-- =====================================================================
-- GUC-gated like migration 104: the UPDATE runs only when the
-- operator session has set `app.seed_tenant_id`. The `migrate up`
-- (no GUCs) path leaves every row at FALSE, identical to the legacy
-- behaviour, so the no-GUC smoke job stays green.

DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = '' THEN
    RAISE NOTICE 'migration 113-B: GUCs not set - skipping requires_active_run flip';
    RETURN;
  END IF;

  -- Set to TRUE only on the four intents that read fail_context in
  -- the orchestrator. Idempotent (the `= FALSE` clause means re-runs
  -- on already-flipped rows are no-ops).
  UPDATE intent_specialists
     SET requires_active_run = TRUE,
         updated_at          = NOW()
   WHERE intent_type IN ('zoom', 'cluster', 'historical', 'plan')
     AND status = 'active'
     AND deleted_at IS NULL
     AND requires_active_run = FALSE;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 113-B: requires_active_run flipped to TRUE for % row(s)', v_updated;
END $$;
