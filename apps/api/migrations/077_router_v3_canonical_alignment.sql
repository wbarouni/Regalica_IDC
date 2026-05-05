-- Migration 077_router_v3_canonical_alignment.sql
-- Object: align the active `regalica/router` v2 template with the
--         canonical intent_specialists.intent_type values. Migration
--         074b inserted display-name variants in the prompt body
--         (zoom_fail, grappe_cause_racine, historique_recurrence,
--         citation_reglementaire, simulation_impact, estimation_sanction,
--         plan_optimal) that DO NOT match the canonical enum loaded
--         from intent_specialists by IntentGrammar.intent_types — so
--         the router LLM kept emitting unrecognised values that the
--         orchestrator silently discarded back to FALLBACK_INTENT
--         ('general_help'). The launch_validation, download_report,
--         general_help, out_of_scope, and ambiguous intents already
--         used canonical names; only the 7 chip intents were broken.
--
--         This migration replaces the v2 template body so that EVERY
--         declared intent name maps 1:1 onto an intent_specialists row
--         (canonical seed from migration 065 + extensions 072/076).
--         The template otherwise preserves 074b's contract: the same
--         {message}/{run_context} placeholders, the same anti-injection
--         clauses, the same JSON output format, and the same
--         launch_validation priority rule for active runs.
--
--         The download_report intent (added by 076) is also surfaced
--         here for the first time in the router prompt so an explicit
--         "télécharge le rapport" message routes correctly instead of
--         falling back to general_help.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-06
-- Depends on: 074b_router_v2_renderer_aligned.sql (v2 active row exists),
--             065_seed_intent_specialists.sql (canonical enum), 072
--             (launch_validation), 076 (download_report).
--
-- Required session vars:
--   app.seed_tenant_id       - target tenant UUID
--   app.seed_author_user_id  - platform_owner UUID (RLS context)
--
-- Idempotent: same (tenant, agent, function, version=2, status='active')
-- guard. Re-runs converge to the same template body.

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
    RAISE NOTICE 'migration 077: GUCs not set - skipping update';
    RETURN;
  END IF;

  v_tenant_id := current_setting('app.seed_tenant_id')::UUID;
  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE prompt_bank
  SET template = $TMPL$Tu es le routeur d'intention de REGFlow, plateforme de conformité BCT.

CONTEXTE DU RUN COURANT (JSON, vide si aucun run actif) :
{run_context}

Tu reçois le message ci-dessous d'un Compliance Officer.
Ton rôle : classifier l'intention en exactement un des 12 types ci-dessous.
La valeur retournée doit correspondre EXACTEMENT au libellé canonique de l'intention (même casse, mêmes underscores, sans variation lexicale).

TYPES D'INTENTION (libellés canoniques) :
- launch_validation : déclenchement de la validation BCT T1 sur le run courant. Phrases typiques : « lance la validation », « démarre le contrôle », « valide ce dépôt », « run T1 », « va vérifier », « fais le contrôle ». Toute phrase impérative courte exprimant le déclenchement d'une validation appartient à cette catégorie.
- zoom : analyse d'un ou plusieurs FAIL spécifiques (règle, rubrique, écart). Phrases typiques : « regarde ce FAIL », « pourquoi la règle X échoue », « explique l'écart ».
- cluster : plusieurs FAIL liés à une même cause racine probable. Phrases typiques : « grappe », « cause commune », « pourquoi tous ces FAIL ensemble ».
- historical : comparaison avec des runs précédents, tendance temporelle. Phrases typiques : « compare avec le mois dernier », « historique », « tendance ».
- citation : référence à une circulaire BCT, article, texte réglementaire. Phrases typiques : « cite la circulaire », « quel article », « source réglementaire ».
- simulation : simulation d'une correction avant re-validation. Phrases typiques : « si je corrige X », « simule l'impact », « avant-après ».
- sanction : estimation des sanctions BCT encourues. Phrases typiques : « risque de sanction », « pénalité », « amende potentielle ».
- plan : plan de correction complet et priorisé. Phrases typiques : « plan optimal », « par quoi commencer », « priorise les corrections ».
- download_report : génération du rapport PDF de validation. Phrases typiques : « télécharge le rapport », « exporte le PDF », « rapport de validation ».
- ambiguous : message ambigu nécessitant une clarification.
- out_of_scope : hors périmètre REGFlow/BCT (vie privée, conseil juridique général, autre banque, etc.).
- general_help : aide générale sur REGFlow, salutation, présentation de Regalica, ou message conversationnel non couvert par les catégories ci-dessus (UNIQUEMENT si aucune autre catégorie ne s'applique).

PRIORITÉ FORTE :
Si le contexte indique un run en cours (status='running' avec primary_annexe_code non null) ET que le message contient un verbe d'action de validation (« lance », « démarre », « valide », « run », « vérifie »), ALORS classe en launch_validation avec confidence >= 0.85.

RÈGLES ABSOLUES :
1. Répondre UNIQUEMENT en JSON valide, aucun texte avant ou après.
2. Format exact : {{"intent": "<valeur canonique>", "confidence": <0.0-1.0>, "reasoning": "<1 phrase fr>"}}
3. La valeur de "intent" DOIT être l'un des 12 libellés canoniques ci-dessus, copié verbatim (zoom et non zoom_fail, cluster et non grappe_cause_racine, etc.).
4. confidence = certitude de la classification (1.0 = certitude absolue).
5. reasoning = une phrase courte en français expliquant le choix.

MESSAGE À CLASSIFIER :
{message}$TMPL$,
      updated_at = NOW()
  WHERE tenant_id     = v_tenant_id
    AND agent_type    = 'regalica'
    AND function_name = 'router'
    AND version       = 2
    AND status        = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 077: regalica/router v2 template aligned with canonical intent enum (% rows)', v_updated;
END $$;
