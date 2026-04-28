-- Migration 044_update_router_prompt.sql
-- Object: replace placeholder template for regalica/router with the
--         production-ready intent classification prompt.
-- Author: ALGORIA Factory
-- Date: 2026-04-28
-- Depends on: 023_prompt_bank.sql (table + RLS), 043_seed_prompt_bank.sql
--             (initial draft seed with [REGALICA_ROUTER_V1] placeholder)
-- References: docs/05-AGENTS-ET-PROMPTS-BANK.md sect.7 (router doctrine),
--             docs/10-ORCHESTRATION-REGALICA.md sect.3 (10-value enum)
--
-- Migration 043 inserts the regalica/router prompt as draft with the
-- placeholder text [REGALICA_ROUTER_V1]. Phase 3-bis replaces that
-- placeholder with the real classification prompt that instructs
-- Gemini to emit the JSON envelope consumed by
-- app.services.intent_router.detect_intent.
--
-- Required session vars (matches 043 conventions):
--   app.seed_tenant_id        - UUID of the target tenant
--   app.seed_author_user_id   - UUID of the seeding user (must hold
--                               platform_owner role); used to set
--                               app.current_user_id so the prompt_bank
--                               RLS policies allow the UPDATE
--   app.seed_valid_from       - TIMESTAMPTZ kept for parity with 043
--                               even though 044 does not modify
--                               valid_from (defensive consistency)
--
-- Idempotent: the WHERE clause restricts to status='draft' and the
-- exact (tenant, agent_type, function_name, version) tuple. Re-runs
-- against an already-updated row are no-ops; runs against a row that
-- has been promoted to 'active' are also no-ops (active prompts must
-- not be silently mutated; a new version is the doctrinal path).

DO $$
DECLARE
  v_tenant_id UUID;
  v_author_id UUID;
  v_updated   INTEGER;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_valid_from', true) IS NULL
  OR current_setting('app.seed_valid_from', true) = '' THEN
    RAISE NOTICE 'migration 044: session vars not set - skipping update';
    RETURN;
  END IF;

  v_tenant_id := current_setting('app.seed_tenant_id')::UUID;
  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  -- Set the RLS context so the prompt_bank UPDATE policy
  -- (gated on current_user_has_role('platform_owner')) accepts the
  -- write. The caller must have already granted platform_owner to
  -- v_author_id, same precondition as migration 043.
  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE prompt_bank
  SET
    template   = $TMPL$Tu es le routeur d'intention de REGFlow, plateforme de conformité BCT.

Tu reçois un message d'un Compliance Officer d'une banque tunisienne.
Ton rôle : classifier l'intention en exactement un des 10 types ci-dessous.

TYPES D'INTENTION :
- zoom_fail : analyse d'un ou plusieurs FAIL spécifiques (règle, rubrique, écart)
- grappe_cause_racine : plusieurs FAIL liés à une même cause racine probable
- historique_recurrence : comparaison avec des runs précédents, tendance
- citation_reglementaire : référence à une circulaire BCT, article, texte réglementaire
- simulation_impact : simulation d'une correction avant re-validation
- estimation_sanction : estimation des sanctions BCT encourues
- plan_optimal : plan de correction complet et priorisé
- ambiguous : message ambigu nécessitant une clarification
- out_of_scope : hors périmètre REGFlow/BCT
- general_help : aide générale sur REGFlow ou la conformité BCT

RÈGLES ABSOLUES :
1. Répondre UNIQUEMENT en JSON valide, aucun texte avant ou après.
2. Format exact : {"intent_type": "<valeur>", "confidence": <0.0-1.0>, "reasoning": "<1 phrase fr>"}
3. intent_type doit être exactement l'une des 10 valeurs ci-dessus.
4. confidence = certitude de la classification (1.0 = certitude absolue).
5. reasoning = une phrase courte en français expliquant le choix.

MESSAGE À CLASSIFIER :
{user_message}$TMPL$,
    updated_at = NOW()
  WHERE agent_type    = 'regalica'
    AND function_name = 'router'
    AND version       = 1
    AND status        = 'draft'
    AND tenant_id     = v_tenant_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 044: regalica/router template updated (% rows)', v_updated;

END $$;
