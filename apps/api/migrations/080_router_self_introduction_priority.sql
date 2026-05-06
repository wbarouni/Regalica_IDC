-- Migration 080_router_self_introduction_priority.sql
-- Object: lift the `self_introduction` routing rule into a hard
--         priority clause at the top of the router prompt body so
--         Gemini stops defaulting identity / capability questions
--         ("qui es-tu", "présente-toi", "who are you", "que fais-tu",
--         "what can you do") to `general_help`. Migration 079 added
--         the intent line in the enum block, but Gemini's LLM bias
--         toward generic-help routing kept overriding it without an
--         explicit priority hint.
--
--         The new clause sits ABOVE the launch_validation priority
--         (which is already a "PRIORITÉ FORTE" rule) and demands a
--         confidence floor of 0.85, mirroring the launch_validation
--         pattern. The intent line itself stays unchanged in the
--         enum block; this migration only injects the priority
--         scaffolding and reaffirms the canonical names.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-06
-- Depends on: 079_router_add_self_introduction.sql.
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
    RAISE NOTICE 'migration 080: GUCs not set - skipping update';
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
Ton rôle : classifier l'intention en exactement un des 13 types ci-dessous.
La valeur retournée doit correspondre EXACTEMENT au libellé canonique de l'intention (même casse, mêmes underscores, sans variation lexicale).

PRIORITÉ ABSOLUE — IDENTITÉ / CAPACITÉS :
Si le message est une question portant sur l'identité, le rôle, le mode de fonctionnement ou les capacités de Regalica (« qui es-tu », « qui êtes-vous », « who are you », « présente-toi », « présentez-vous », « que fais-tu », « what can you do », « comment fonctionnes-tu », « comment ça marche », « explique ton rôle », « tes capacités », « parle-moi de toi », « what are you », « tell me about yourself »), ALORS classe en self_introduction avec confidence >= 0.85. Cette règle prime sur tous les autres choix. NE retourne JAMAIS general_help pour une question d'identité ou de capacité.

PRIORITÉ FORTE — LANCEMENT DE VALIDATION :
Si le contexte indique un run en cours (status='running' avec primary_annexe_code non null) ET que le message contient un verbe d'action de validation (« lance », « démarre », « valide », « run », « vérifie »), ALORS classe en launch_validation avec confidence >= 0.85.

TYPES D'INTENTION (libellés canoniques) :
- self_introduction : présentation de Regalica, ses capacités, son architecture multi-agents, son périmètre fonctionnel. Voir PRIORITÉ ABSOLUE ci-dessus pour les phrases déclencheuses.
- launch_validation : déclenchement de la validation BCT T1 sur le run courant. Voir PRIORITÉ FORTE ci-dessus.
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
- general_help : aide générale sur REGFlow ou la conformité BCT — UNIQUEMENT si aucune autre catégorie ne s'applique. Ne JAMAIS choisir general_help pour une question d'identité, de capacité, de présentation ou de fonctionnement de Regalica (utiliser self_introduction).

RÈGLES ABSOLUES :
1. Répondre UNIQUEMENT en JSON valide, aucun texte avant ou après.
2. Format exact : {{"intent": "<valeur canonique>", "confidence": <0.0-1.0>, "reasoning": "<1 phrase fr>"}}
3. La valeur de "intent" DOIT être l'un des 13 libellés canoniques ci-dessus, copié verbatim (zoom et non zoom_fail, cluster et non grappe_cause_racine, etc.).
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
  RAISE NOTICE 'migration 080: regalica/router v2 self_introduction promoted to PRIORITÉ ABSOLUE (% rows)', v_updated;
END $$;
