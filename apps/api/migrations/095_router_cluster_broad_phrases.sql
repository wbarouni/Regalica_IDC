-- Migration 095_router_cluster_broad_phrases.sql
-- Object: broaden the active `regalica/router` v2 cluster trigger
--         phrases AND add an explicit zoom-vs-cluster disambiguation
--         rule. Diagnostic ground truth: a Compliance Officer typing
--         « explique-moi tous les écarts » currently routes to zoom
--         (single-fail focus) or general_help (FALLBACK_INTENT).
--         Migration 077 declared cluster with three trigger phrases
--         (« grappe », « cause commune », « pourquoi tous ces FAIL
--         ensemble ») — none of them match the natural-language
--         framing the user actually employs when asking for a
--         holistic view.
--
--         The orchestrator already wires cluster correctly: the
--         intent_specialists row (migration 065 ordinal 2) maps
--         intent='cluster' onto aggregator_function_name=
--         'aggregate_grappe_cause_racine' with specialist_ids=
--         ['investigator']. Once the router emits intent='cluster',
--         every top FAIL goes through the investigator and the
--         aggregator synthesises a multi-fail prose digest. The
--         only missing piece is the router classifier.
--
--         This migration:
--           - extends the cluster line with seven new trigger phrases
--             covering the natural-language shapes operators use
--             (« tous les écarts », « tous les FAIL », « explique
--             tous », « ensemble des écarts », « globalement »,
--             « vue d'ensemble », « tour d'horizon »);
--           - adds a disambiguation block (« RÈGLE DE DÉSAMBIGUATION
--             zoom vs cluster ») so the LLM has explicit guidance:
--             a named rule/rubrique → zoom, a collective framing
--             without specific identifier → cluster. This block
--             complements (does not replace) the launch_validation
--             priority rule already in 077.
--
--         Behaviour for messages that DO name a specific rule
--         (« regarde la règle 102 ») is unchanged: zoom remains the
--         classification, and the chatbot-py orchestrator's
--         `_extract_rule_number_from_message` + `_narrow_fail_context_to_rule`
--         (commit 5475264) keeps the investigator focused on the
--         named row.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-07
-- Depends on: 077_router_v3_canonical_alignment.sql (active v2 row).

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
    RAISE NOTICE 'migration 095: GUCs not set - skipping update';
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
- zoom : analyse d'UN FAIL spécifique nommément désigné (règle, rubrique, écart précis). Phrases typiques : « regarde ce FAIL », « pourquoi la règle X échoue », « explique l'écart sur la rubrique Y », « regarde la règle 102 », « explique le FAIL 380 ». L'utilisateur cite UN identifiant concret (numéro de règle, code rubrique, ax_term).
- cluster : analyse collective de plusieurs FAIL — vue d'ensemble, regroupement par cause racine probable, ou demande explicite portant sur l'intégralité des écarts. Phrases typiques : « grappe », « cause commune », « pourquoi tous ces FAIL ensemble », « explique-moi tous les écarts », « explique tous les FAIL », « tous les FAIL », « ensemble des écarts », « globalement », « vue d'ensemble », « tour d'horizon », « synthèse des écarts », « que penses-tu de ce run ». L'utilisateur ne cite AUCUN identifiant précis ; il demande une lecture transversale.
- historical : comparaison avec des runs précédents, tendance temporelle. Phrases typiques : « compare avec le mois dernier », « historique », « tendance ».
- citation : référence à une circulaire BCT, article, texte réglementaire. Phrases typiques : « cite la circulaire », « quel article », « source réglementaire ».
- simulation : simulation d'une correction avant re-validation. Phrases typiques : « si je corrige X », « simule l'impact », « avant-après ».
- sanction : estimation des sanctions BCT encourues. Phrases typiques : « risque de sanction », « pénalité », « amende potentielle ».
- plan : plan de correction complet et priorisé. Phrases typiques : « plan optimal », « par quoi commencer », « priorise les corrections ».
- download_report : génération du rapport PDF de validation. Phrases typiques : « télécharge le rapport », « exporte le PDF », « rapport de validation ».
- ambiguous : message ambigu nécessitant une clarification.
- out_of_scope : hors périmètre REGFlow/BCT (vie privée, conseil juridique général, autre banque, etc.).
- general_help : aide générale sur REGFlow, salutation, présentation de Regalica, ou message conversationnel non couvert par les catégories ci-dessus (UNIQUEMENT si aucune autre catégorie ne s'applique).

PRIORITÉ FORTE — déclenchement validation :
Si le contexte indique un run en cours (status='running' avec primary_annexe_code non null) ET que le message contient un verbe d'action de validation (« lance », « démarre », « valide », « run », « vérifie »), ALORS classe en launch_validation avec confidence >= 0.85.

RÈGLE DE DÉSAMBIGUATION zoom vs cluster :
1. Si le message nomme UN identifiant précis (numéro de règle comme « règle 102 », « FAIL 380 », code rubrique comme « AC010000000000 », libellé ax_term comme « 630 »), classe en zoom — l'utilisateur veut une analyse ciblée sur cet élément.
2. Si le message ne nomme AUCUN identifiant précis ET demande une lecture collective (« tous », « tous les », « ensemble », « globalement », « en général », « vue d'ensemble », « synthèse », « ce run », « les écarts »), classe en cluster — l'utilisateur veut une lecture transversale.
3. En cas d'ambiguïté résiduelle (le message nomme un identifiant ET demande une lecture collective dans la même phrase, par exemple « explique la règle 102 et toutes les autres »), priorise zoom : l'identifiant nommé est l'ancrage le plus fort.

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
  RAISE NOTICE 'migration 095: regalica/router v2 cluster phrases broadened + zoom-vs-cluster disambiguation (% rows)', v_updated;
END $$;
