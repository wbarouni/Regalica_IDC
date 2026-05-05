-- Migration 078_seed_intent_self_introduction.sql
-- Object: 2A — wire a new `self_introduction` intent that routes
--         identity / capability questions ("qui es-tu ?", "que fais-tu ?",
--         "comment fonctionnes-tu ?", "présente-toi", "what can you do")
--         to a dedicated Regalica aggregator with a static_response so
--         the answer is deterministic, verbose, and never depends on
--         an LLM round-trip. Rationale: the existing
--         regalica/aggregate_general_help relies on the LLM to compose
--         a presentation from a free-form template; the user requested
--         an answer that is "garantie en plein régime, sans cinéma" —
--         static_response delivers that bullet-proof guarantee.
--
--         Three new rows land in the catalogue (mirroring the K2 / 076
--         pattern):
--           - intent_specialists.self_introduction (specialist_ids=[])
--           - prompt_bank.regalica/aggregate_self_introduction with a
--             rich markdown static_response describing Regalica's role,
--             the orchestration she leads (router → planner → 13
--             specialists → aggregator), the 4 BCT validation phases
--             (T0 → T1 → T2 → T3), the RDG rule library, and how to
--             interact via the chips or the dock.
--           - 4-eyes promote so the new intent is reachable in prod.
--
--         The router prompt picks up the new intent via the canonical
--         enum surfaced by IntentGrammar.intent_types; the matching
--         routing keywords are documented in migration 079 (router
--         template extension).
--
-- Author: ALGORIA Factory
-- Date: 2026-05-06
-- Depends on: 064_intent_specialists.sql (table schema),
--             065_seed_intent_specialists.sql (canonical seed pattern),
--             076_seed_intent_download_report.sql (mirrored 3-block
--             pattern with static_response).
--
-- Required session vars for 078-A: app.seed_author_user_id
-- Required session vars for 078-C: app.seed_tenant_id +
--                                  app.seed_author_user_id +
--                                  app.seed_valid_from
-- Required session vars for 078-B: app.seed_author_user_id +
--                                  app.seed_validator_user_id
--
-- All three blocks self-skip with RAISE NOTICE when their GUCs are
-- absent so the CI migrate-smoke job (which sets none) succeeds as a
-- no-op.

-- ─────────────────────────────────────────────────────────────────────────────
-- 078-A — seed intent (no specialist bearer needed: aggregator only)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_author_id UUID;
BEGIN

  IF current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = '' THEN
    RAISE NOTICE 'migration 078-A: app.seed_author_user_id not set - skipping seed';
    RETURN;
  END IF;

  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  INSERT INTO intent_specialists (
    intent_type,
    aggregator_agent_type,
    aggregator_function_name,
    specialist_ids,
    ordinal,
    description,
    status,
    author_user_id
  )
  SELECT
    'self_introduction',
    'regalica',
    'aggregate_self_introduction',
    '[]'::jsonb,
    COALESCE((SELECT MAX(ordinal) + 1 FROM intent_specialists), 1),
    'Présentation de Regalica, ses capacités, son architecture multi-agents, ' ||
    'et le périmètre fonctionnel REGFlow. Réponse statique verbeuse et ' ||
    'déterministe (aucun appel LLM côté aggregator).',
    'draft',
    v_author_id
  WHERE NOT EXISTS (
    SELECT 1 FROM intent_specialists WHERE intent_type = 'self_introduction'
  );

  RAISE NOTICE 'migration 078-A: self_introduction intent seeded (no bearer)';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 078-C — seed regalica/aggregate_self_introduction with static_response
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tenant_id  UUID;
  v_author_id  UUID;
  v_valid_from TIMESTAMPTZ;
  v_template   TEXT;
  v_static     TEXT;
  v_input      JSONB;
  v_output     JSONB;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_valid_from', true) IS NULL
  OR current_setting('app.seed_valid_from', true) = '' THEN
    RAISE NOTICE 'migration 078-C: prompt_bank seed GUCs not set - skipping';
    RETURN;
  END IF;

  v_tenant_id  := current_setting('app.seed_tenant_id')::UUID;
  v_author_id  := current_setting('app.seed_author_user_id')::UUID;
  v_valid_from := current_setting('app.seed_valid_from')::TIMESTAMPTZ;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  -- Template kept as a documentation block: the static_response below
  -- is what the orchestrator surfaces verbatim. If a future operator
  -- wants Regalica to compose the introduction dynamically from
  -- runtime context (e.g., counting active rules, listing agents),
  -- setting static_response = NULL flips the flow back to LLM
  -- composition using this template.
  v_template := $TPL$Tu es Regalica, assistante de conformité réglementaire BCT
pour les banques tunisiennes opérant sur la plateforme REGFlow.

Ta tâche : présenter qui tu es, ce que tu sais faire, et l'architecture
multi-agents qui te porte. Ton professionnel, vouvoiement, aucun emoji,
aucun superlatif. Reprend strictement le périmètre des capacités V1
documentées (T0/T1/T2/T3, 13 spécialistes, prompt_bank).$TPL$;

  -- Static response surfaced verbatim by _invoke_aggregator. Markdown
  -- rendered by react-markdown in Workspace.tsx — sections, lists, and
  -- inline code are all valid. Tone: formal banking French, no
  -- superlative, no emoji, vouvoiement, aucune promesse temporelle.
  v_static := '**Je suis Regalica**, assistante de conformité réglementaire IA pour les banques tunisiennes opérant sur la plateforme REGFlow, éditée par ALGORIA Factory.

### Ce que je fais

J''accompagne les Compliance Officers tout au long du cycle de validation BCT de leurs reportings réglementaires. Mon périmètre fonctionnel actif couvre quatre phases :

- **T0 — Vérifications structurelles** : ingestion XML, vérification des dépendances inter-annexes et cohérence temporelle des dates d''arrêté.
- **T1 — Validation BCT** : contrôle XSD, contrôle embarqué (annexes compagnes, totaux), évaluation des règles RDG (verdicts conformes / FAIL sévères / écarts d''arrondi).
- **T2 — Investigation conversationnelle** : analyse de la cause racine d''un FAIL, regroupement par grappe, citation de la circulaire BCT source, comparaison à l''historique, plan de correction priorisé.
- **T3 — Signature et dépôt** : déverrouillage conditionné à zéro FAIL sévère.

### Comment je travaille

Mon orchestration s''appuie sur treize spécialistes IA dont les sorties JSON typées ne sont jamais affichées brutes — je suis la seule voix qui s''adresse à vous. Mon routeur d''intention classifie votre demande, un planner conditionnel construit un plan d''exécution lorsque la question est complexe, les spécialistes pertinents s''exécutent en parallèle, puis l''agrégateur compose la réponse finale en français professionnel bancaire.

Mes prompts sont versionnés dans `prompt_bank` avec promotion 4-yeux ; aucune règle, aucun seuil, aucun barème de sanction n''est codé en dur — tout est lu depuis la base au démarrage.

### Comment interagir

Vous pouvez me solliciter de trois façons :

- **Les chips au-dessus du dock** : Zoom sur un FAIL, Détail grappe, Historique rubrique, Citer la circulaire BCT, Simuler la correction, Estimer la sanction BCT, Plan de correction optimal.
- **Le dock conversationnel** : posez votre question en langage naturel ; je classifierai l''intention et orienterai vers le bon spécialiste.
- **L''upload XML** : déposez un fichier d''annexe BCT et je déclencherai automatiquement T0 puis T1 sur demande.

Sur quel point souhaitez-vous commencer ?';

  v_input := $INPUT$
{
  "type": "object",
  "required": ["user_message", "intent_type", "specialist_outputs"],
  "additionalProperties": false,
  "properties": {
    "user_message":       { "type": "string" },
    "intent_type":        { "type": "string", "const": "self_introduction" },
    "specialist_outputs": {
      "type": "array",
      "items": { "type": "object" }
    }
  }
}
$INPUT$::JSONB;

  v_output := $OUTPUT$
{
  "type": "string",
  "description": "Présentation Regalica en markdown français professionnel bancaire."
}
$OUTPUT$::JSONB;

  INSERT INTO prompt_bank (
    tenant_id, agent_type, function_name, version,
    template, input_schema, output_schema,
    temperature, max_tokens, thinking_enabled, target_model,
    output_contract, static_response, status, valid_from, author_user_id
  )
  VALUES (
    v_tenant_id, 'regalica', 'aggregate_self_introduction', 1,
    v_template, v_input, v_output,
    0.0, 1024, FALSE, 'gemini-2.5-flash',
    'string', v_static, 'draft', v_valid_from, v_author_id
  )
  ON CONFLICT (tenant_id, agent_type, function_name, version) DO NOTHING;

  RAISE NOTICE 'migration 078-C: aggregate_self_introduction prompt seeded (draft) with static_response';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 078-B — promote draft → active (4-eyes: validator must differ from author)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_author_id    UUID;
  v_validator_id UUID;
BEGIN

  IF current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_validator_user_id', true) IS NULL
  OR current_setting('app.seed_validator_user_id', true) = '' THEN
    RAISE NOTICE 'migration 078-B: GUCs not set - skipping promotion';
    RETURN;
  END IF;

  v_author_id    := current_setting('app.seed_author_user_id')::UUID;
  v_validator_id := current_setting('app.seed_validator_user_id')::UUID;

  IF v_author_id = v_validator_id THEN
    RAISE EXCEPTION
      '4-eyes violation: validator (%) must differ from author (%)',
      v_validator_id, v_author_id;
  END IF;

  UPDATE intent_specialists
     SET status            = 'active',
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE intent_type = 'self_introduction'
     AND status      = 'draft'
     AND author_user_id = v_author_id;

  UPDATE prompt_bank
     SET status            = 'active',
         valid_from        = NOW(),
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE agent_type     = 'regalica'
     AND function_name  = 'aggregate_self_introduction'
     AND status         = 'draft'
     AND deleted_at IS NULL
     AND author_user_id = v_author_id;

  RAISE NOTICE 'migration 078-B: self_introduction + aggregate_self_introduction promoted to active';
END $$;
