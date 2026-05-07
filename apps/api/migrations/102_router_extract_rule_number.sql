-- Migration 102_router_extract_rule_number.sql
-- Object: extend the active `regalica/router` v2 template so the LLM
--         ALSO emits a `target_rule_number` field carrying the numeric
--         rule identifier the user named in free-form prose, or null
--         if no specific rule was mentioned.
--
--         Correction A (docs/analysis/regalica-intent-reading-vs-claude.md
--         §4): the deterministic regex extractor
--         (`_extract_rule_number_from_message`) covers the canonical
--         anchor vocabulary (règle, regle, rule, fail, n°, contrôle,
--         ligne, item, point). It misses production-realistic free-form
--         phrasing such as:
--           - « le 102, c'est quoi ? » (numéro nu sans ancre canonique)
--           - « explique-moi le quatrième » (ordinal reference)
--           - « ax 630 numéro 12 » (composite ax_term/num_regle)
--           - « parle-moi de cette règle X » (deictic reference)
--
--         Asking the router LLM to extract `target_rule_number` in the
--         same forward pass costs ZERO additional latency (the router
--         is already invoked on every message) and brings Claude-level
--         NLU to the rule-name detection without breaking the strict
--         JSON contract: the field is OPTIONAL (null when no rule is
--         named) and the orchestrator falls back to None silently when
--         absent or malformed.
--
--         Doctrine compliance: the regex stays as a deterministic
--         backstop for the canonical anchor vocabulary (no LLM cost on
--         simple messages), the LLM extraction handles the long tail.
--         Zero hardcoding — the rule-number set is unbounded, the
--         prompt instructs the LLM to extract whatever digit run the
--         user named without enumerating a list.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-08
-- Depends on: 099_router_inter_annex_phrases.sql (active template).

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
    RAISE NOTICE 'migration 102: GUCs not set - skipping update';
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
Ton rôle : classifier l'intention en exactement un des 12 types ci-dessous, ET extraire le numéro de règle nommée par l'utilisateur (ou null si aucune règle précise n'est nommée).
La valeur retournée doit correspondre EXACTEMENT au libellé canonique de l'intention (même casse, mêmes underscores, sans variation lexicale).

TYPES D'INTENTION (libellés canoniques) :
- launch_validation : déclenchement de la validation BCT T1 sur le run courant. Phrases typiques : « lance la validation », « démarre le contrôle », « valide ce dépôt », « run T1 », « va vérifier », « fais le contrôle ». Toute phrase impérative courte exprimant le déclenchement d'une validation appartient à cette catégorie.
- zoom : analyse d'UN FAIL spécifique nommément désigné (règle, rubrique, écart précis). Phrases typiques : « regarde ce FAIL », « pourquoi la règle X échoue », « explique l'écart sur la rubrique Y », « regarde la règle 102 », « explique le FAIL 380 ». L'utilisateur cite UN identifiant concret (numéro de règle, code rubrique, ax_term).
- cluster : analyse collective de plusieurs FAIL — vue d'ensemble, regroupement par cause racine probable, demande explicite portant sur l'intégralité des écarts, OU questions sur les inter-annexes / annexes sœurs / dépendances de dépôt. Phrases typiques : « grappe », « cause commune », « pourquoi tous ces FAIL ensemble », « explique-moi tous les écarts », « explique tous les FAIL », « tous les FAIL », « ensemble des écarts », « globalement », « vue d'ensemble », « tour d'horizon », « synthèse des écarts », « que penses-tu de ce run », « inter-annexe », « inter annexe », « annexe sœur », « annexes sœurs », « dépendance », « dépendances », « annexe manquante », « annexes manquantes », « quelle annexe manque », « y a-t-il des annexes sœurs », « contrôles inter-annexes », « impact des dépendances ». L'utilisateur ne cite AUCUN identifiant de règle précis ; il demande une lecture transversale ou un point sur les dépôts compagnons.
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
3. Si le message porte sur les inter-annexes, annexes sœurs, ou dépendances de dépôt (« inter-annexe », « annexe sœur », « dépendance », « annexe manquante »), classe en cluster — la grappe inter-annexes est traitée par l'agrégateur cluster qui rend automatiquement le BLOC 7 lorsque le run carries des annexes manquantes.
4. En cas d'ambiguïté résiduelle (le message nomme un identifiant ET demande une lecture collective dans la même phrase, par exemple « explique la règle 102 et toutes les autres »), priorise zoom : l'identifiant nommé est l'ancrage le plus fort.

EXTRACTION DU NUMÉRO DE RÈGLE (target_rule_number) :
Lis le message en entier et extrait le numéro entier de la règle que l'utilisateur veut analyser, si présent. Sinon retourne null.

Cas où target_rule_number est un INTEGER :
  - Toute phrase nommant explicitement un numéro de règle, FAIL, contrôle, ligne, item, point :
    « regarde la règle 102 » → 102
    « FAIL 380 » → 380
    « le contrôle 27 » → 27
    « l'item 1023 » → 1023
  - Phrases sans ancre canonique mais sémantiquement claires :
    « le 102, c'est quoi ? » → 102
    « parle-moi du 380 » → 380
    « pourquoi cette 27 échoue ? » → 27
  - Compositions ax_term / num_regle :
    « ax 630 règle 102 » → 102
    « 630/102 » → 102
    « 102 sur l'annexe 630 » → 102
  - Mention par numéro de circulaire OU date OU montant : ne PAS extraire ces nombres comme target_rule_number, ils ne sont pas des identifiants de règle.
    « la circulaire 2017-06 » → null (c'est un numéro de circulaire, pas une règle)
    « l'arrêté 2024-12-31 » → null
    « 30 000 KTND » → null

Cas où target_rule_number est NULL :
  - Le message ne nomme aucun numéro entier identifiable comme règle.
  - Le message demande une vue d'ensemble (« tous les écarts », « globalement »).
  - Le message porte sur les annexes (« annexe 630 », « annexe sœur ») sans citer de règle.
  - Le message est ambigu, hors-scope, ou pure conversation.
  - L'utilisateur cite plusieurs numéros de règles (« compare 102 et 380 ») : retourne le PREMIER mentionné (102) — l'utilisateur veut focus sur le premier, et la règle de désambiguation #4 ci-dessus prévaut.

Ne JAMAIS inventer un target_rule_number qui n'est pas littéralement présent dans le message.

RÈGLES ABSOLUES :
1. Répondre UNIQUEMENT en JSON valide, aucun texte avant ou après.
2. Format exact : {{"intent": "<valeur canonique>", "confidence": <0.0-1.0>, "target_rule_number": <integer ou null>}}
3. La valeur de "intent" DOIT être l'un des 12 libellés canoniques ci-dessus, copié verbatim (zoom et non zoom_fail, cluster et non grappe_cause_racine, etc.).
4. confidence = certitude de la classification (1.0 = certitude absolue).
5. target_rule_number = INTEGER (jamais string, jamais float) si une règle précise est nommée ; sinon null. Pas de borne supérieure sur la valeur — un repo BCT peut exposer des règles à 6-7 chiffres.

MESSAGE À CLASSIFIER :
{message}$TMPL$,
      updated_at = NOW()
  WHERE tenant_id     = v_tenant_id
    AND agent_type    = 'regalica'
    AND function_name = 'router'
    AND version       = 2
    AND status        = 'active';

  -- Update the JSON Schema output_schema so the strict mode of the
  -- LLM provider knows about the new field.
  UPDATE prompt_bank
  SET output_schema = $SCHEMA$
{
  "type": "object",
  "additionalProperties": false,
  "required": ["intent", "confidence"],
  "properties": {
    "intent": {
      "type": "string"
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "target_rule_number": {
      "type": ["integer", "null"],
      "minimum": 0
    }
  }
}
$SCHEMA$::jsonb,
      updated_at = NOW()
  WHERE tenant_id     = v_tenant_id
    AND agent_type    = 'regalica'
    AND function_name = 'router'
    AND version       = 2
    AND status        = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 102: regalica/router v2 emits target_rule_number field (% rows)', v_updated;
END $$;
