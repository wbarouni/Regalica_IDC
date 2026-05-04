-- Migration 074b_router_v2_renderer_aligned.sql
-- Object: align regalica/router v2 template placeholders with the
--         actual renderer in chatbot-py (apps/chatbot-py/app/services/
--         router_context.py:render_router_template). The renderer
--         exposes three slots: {message}, {run_context},
--         {question_types_list}. The template inserted by 074 (and
--         the source 044) used {user_message} which the defensive
--         format_map silently drops to "" — so the LLM never received
--         the user's message inside the system prompt and consistently
--         fell back to general_help. Mirror the actual renderer keys
--         so the run_context block (active validation_run snapshot)
--         signals "lance la validation" → launch_validation.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-04
-- Depends on: 074a_router_v2_format_safe.sql (v2 row exists, format-safed).
--
-- Required session vars:
--   app.seed_tenant_id       - target tenant UUID
--   app.seed_author_user_id  - platform_owner UUID (RLS context)
--
-- Idempotent: same (tenant, agent, function, version=2, status='active')
-- guard. Re-runs converge.

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
    RAISE NOTICE 'migration 074b: GUCs not set - skipping update';
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
Ton rôle : classifier l'intention en exactement un des 11 types ci-dessous.

TYPES D'INTENTION :
- launch_validation : déclenchement de la validation BCT T1 sur le run courant. Phrases typiques : « lance la validation », « démarre le contrôle », « valide ce dépôt », « run T1 », « va vérifier », « fais le contrôle ». Toute phrase impérative courte exprimant le déclenchement d'une validation appartient à cette catégorie.
- zoom_fail : analyse d'un ou plusieurs FAIL spécifiques (règle, rubrique, écart)
- grappe_cause_racine : plusieurs FAIL liés à une même cause racine probable
- historique_recurrence : comparaison avec des runs précédents, tendance temporelle
- citation_reglementaire : référence à une circulaire BCT, article, texte réglementaire
- simulation_impact : simulation d'une correction avant re-validation
- estimation_sanction : estimation des sanctions BCT encourues
- plan_optimal : plan de correction complet et priorisé
- ambiguous : message ambigu nécessitant une clarification
- out_of_scope : hors périmètre REGFlow/BCT
- general_help : aide générale sur REGFlow ou la conformité BCT (UNIQUEMENT si aucune autre catégorie ne s'applique)

PRIORITÉ FORTE :
Si le contexte indique un run en cours (status='running' avec primary_annexe_code non null) ET que le message contient un verbe d'action de validation (« lance », « démarre », « valide », « run », « vérifie »), ALORS classe en launch_validation avec confidence >= 0.85.

RÈGLES ABSOLUES :
1. Répondre UNIQUEMENT en JSON valide, aucun texte avant ou après.
2. Format exact : {{"intent": "<valeur>", "confidence": <0.0-1.0>, "reasoning": "<1 phrase fr>"}}
3. intent doit être exactement l'une des 11 valeurs ci-dessus.
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
  RAISE NOTICE 'migration 074b: regalica/router v2 template aligned with renderer (% rows)', v_updated;
END $$;
