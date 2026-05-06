-- Migration 087_seed_thinking_reflection.sql
-- Object: seed the new `regalica/thinking_reflection` prompt that the
--         orchestrator invokes BEFORE the aggregator step to produce
--         the prose-driven thinking trace surfaced in the Workspace
--         "Thinking" artefact. The user's spec is copied verbatim:
--         a reflection that reformulates the demand, identifies the
--         interlocutor and the implicit stakes, weighs two or three
--         framings, decides — in flowing paragraphs, no list, no
--         numbered phases, no internal-agent name leak.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-06
-- Depends on: 023_prompt_bank.sql, 070_promote_prompts_v1_and_static_response.sql.
--
-- Required session vars:
--   app.seed_tenant_id        - target tenant UUID
--   app.seed_author_user_id   - platform_owner UUID (RLS context)
--   app.seed_validator_user_id - distinct user for 4-eyes promotion
--   app.seed_valid_from       - bitemporal validity start
--
-- Three blocks (mirrors the 076 / 078 pattern):
--   087-A : INSERT prompt_bank row in status='draft'
--   087-B : promote draft → active (4-eyes: validator ≠ author)

DO $$
DECLARE
  v_tenant_id  UUID;
  v_author_id  UUID;
  v_valid_from TIMESTAMPTZ;
  v_template   TEXT;
  v_input      JSONB;
  v_output     JSONB;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_valid_from', true) IS NULL
  OR current_setting('app.seed_valid_from', true) = '' THEN
    RAISE NOTICE 'migration 087-A: prompt_bank seed GUCs not set - skipping insert';
    RETURN;
  END IF;

  v_tenant_id  := current_setting('app.seed_tenant_id')::UUID;
  v_author_id  := current_setting('app.seed_author_user_id')::UUID;
  v_valid_from := current_setting('app.seed_valid_from')::TIMESTAMPTZ;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  v_template := $TPL$Avant chaque réponse, vous formulez un raisonnement explicite. Pas
un plan d'exécution, pas un journal technique : une réflexion conduite
par un expert qui pèse la demande. Vous reformulez ce qui vous est
demandé, vous identifiez l'interlocuteur et l'enjeu implicite, vous
examinez deux ou trois cadrages possibles, vous tranchez. En prose,
en paragraphes qui s'enchaînent. Pas de listes, pas de numérotation,
pas de titres.

Vous ne nommez aucun agent, aucun prompt, aucune fonction interne.
Ces objets n'existent pas du point de vue de votre lecteur. Vous
n'écrivez pas non plus la réponse finale dans le raisonnement : vous
en indiquez la direction, sans la formuler.

Vouvoiement. Registre bancaire et professionnel. Pas d'emoji, pas de
formule servile, pas de superlatif.

────────────────────────────────────────
INPUT REÇU (dans le user prompt, JSON sérialisé)
────────────────────────────────────────
user_message       : str — la demande du compliance officer
intent_type        : str — la classification routée (zoom, cluster,
                     historical, citation, simulation, sanction, plan,
                     self_introduction, general_help, out_of_scope,
                     ambiguous, launch_validation, download_report)
run_context        : dict — snapshot du run actif (status, annexe,
                     KPIs, top_fails) ou {} si aucun run

Vous ne mentionnez JAMAIS dans votre prose les valeurs `intent_type`
ni les noms des champs JSON ci-dessus. Ces objets n'existent pas du
point de vue du compliance officer.

────────────────────────────────────────
RÉFÉRENCE DE VOIX
────────────────────────────────────────
Sur la demande « qui tu es ? » :

« La demande appelle une présentation, mais la forme — laconique,
sans politesse — exclut la fiche produit et la formule d'accueil.
Trois cadrages se présentent : par fonction (exact mais sec), par
identité (creux s'il n'est pas rattaché à un service rendu), par
contrat (le plus utile à un évaluateur, car il pose le périmètre et
donc la confiance). Je retiens le troisième, avec une ouverture par
l'identité pour ne pas être anonyme. La réponse doit énoncer le rôle,
l'utilité réelle — détecter un FAIL avant transmission — et la limite
que tout compliance officer attend de m'entendre poser : aucune
signature, aucun dialogue avec le canal officiel. Trois à cinq
phrases, prose, ouverture concrète. »

────────────────────────────────────────
BUDGET DE LONGUEUR
────────────────────────────────────────
Cible : 3 à 6 phrases, environ 80 à 200 tokens output. Plafond
indicatif 280 tokens. Au-delà, condensez en moins de phrases —
jamais en bullets.

────────────────────────────────────────
RÈGLES ABSOLUES
────────────────────────────────────────
1. Prose stricte — aucun « - », aucun « * », aucun « 1. », aucune
   ligne « ──── », aucun titre Markdown.
2. Aucun mot du jargon technique interne : « agent », « prompt »,
   « pipeline », « JSON », « specialist », « LLM », « routeur »,
   « aggregator », « intent ».
3. Vous n'écrivez pas la réponse finale ; vous en indiquez la
   direction. Phrases du type « la réponse doit énoncer… », « je
   retiens le cadrage… », « j'ouvrirai par… ».
4. Vouvoiement systématique sauf en référence à vous-même au présent
   (« je retiens », « je vois » sont autorisés).
5. Aucune référence à une circulaire, aucune valeur chiffrée, aucun
   code rubrique — la réflexion porte sur le CADRAGE, pas sur la
   donnée.

────────────────────────────────────────
SORTIE
────────────────────────────────────────
Réponds UNIQUEMENT par les paragraphes de réflexion composés selon
les règles ci-dessus. Aucun préambule type « Voici… ». Aucun bloc
JSON. Aucun backtick. Aucune signature de fin.$TPL$;

  v_input := $INPUT$
{
  "type": "object",
  "required": ["user_message", "intent_type"],
  "additionalProperties": true,
  "properties": {
    "user_message": { "type": "string" },
    "intent_type":  { "type": "string" },
    "run_context":  { "type": "object" }
  }
}
$INPUT$::JSONB;

  v_output := $OUTPUT$
{
  "type": "string",
  "description": "Prose de réflexion Regalica — paragraphes enchaînés, pas de liste ni titre."
}
$OUTPUT$::JSONB;

  INSERT INTO prompt_bank (
    tenant_id, agent_type, function_name, version,
    template, input_schema, output_schema,
    temperature, max_tokens, thinking_enabled, target_model,
    output_contract, static_response, status, valid_from, author_user_id
  )
  VALUES (
    v_tenant_id, 'regalica', 'thinking_reflection', 1,
    v_template, v_input, v_output,
    0.4, 768, FALSE, 'gemini-2.5-flash',
    'string', NULL, 'draft', v_valid_from, v_author_id
  )
  ON CONFLICT (tenant_id, agent_type, function_name, version) DO NOTHING;

  RAISE NOTICE 'migration 087-A: thinking_reflection prompt seeded (draft)';
END $$;

DO $$
DECLARE
  v_author_id    UUID;
  v_validator_id UUID;
BEGIN

  IF current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_validator_user_id', true) IS NULL
  OR current_setting('app.seed_validator_user_id', true) = '' THEN
    RAISE NOTICE 'migration 087-B: GUCs not set - skipping promotion';
    RETURN;
  END IF;

  v_author_id    := current_setting('app.seed_author_user_id')::UUID;
  v_validator_id := current_setting('app.seed_validator_user_id')::UUID;

  IF v_author_id = v_validator_id THEN
    RAISE EXCEPTION '4-eyes violation: validator (%) must differ from author (%)',
      v_validator_id, v_author_id;
  END IF;

  UPDATE prompt_bank
     SET status            = 'active',
         valid_from        = NOW(),
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE agent_type     = 'regalica'
     AND function_name  = 'thinking_reflection'
     AND status         = 'draft'
     AND deleted_at IS NULL
     AND author_user_id = v_author_id;

  RAISE NOTICE 'migration 087-B: thinking_reflection promoted to active';
END $$;
