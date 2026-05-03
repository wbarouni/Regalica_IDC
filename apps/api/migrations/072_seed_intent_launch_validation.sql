-- Migration 072_seed_intent_launch_validation.sql
-- Object: seed the launch_validation intent + the t1_runner specialist
--         bearer that powers the chat-driven T1 dispatch (C17b). Both
--         rows land in 'draft'; an optional 4-eyes promotion block at
--         the end of the file flips them to 'active' when the operator
--         supplies the canonical GUC pair.
-- Author: ALGORIA Factory
-- Date: 2026-05-03
-- Depends on: 064_intent_specialists.sql (table schema),
--             065_seed_intent_specialists.sql (10 canonical intents),
--             066_promote_intent_specialists.sql (promotion pattern).
-- References: docs/04 (T1 dispatch), docs/10 §3 (intent enum is operator-
--             controlled — adding a new intent is migration-only).
--
-- Required session vars for 072-A:
--   app.seed_author_user_id  - UUID of the platform_owner authoring
--                              the intent and bearer.
-- Required session vars for 072-B (promotion):
--   app.seed_author_user_id     - same as 072-A.
--   app.seed_validator_user_id  - distinct UUID validating the rows.
-- Required session vars for 072-C (prompt seed):
--   app.seed_tenant_id          - tenant UUID (prompt_bank is per-tenant).
--   app.seed_author_user_id     - same as 072-A.
--   app.seed_valid_from         - bitemporal validity start.
--
-- All blocks self-skip with RAISE NOTICE when their GUCs are absent so
-- the CI migrate-smoke job (which sets none) succeeds as a no-op.

-- ─────────────────────────────────────────────────────────────────────────────
-- 072-A — seed intent + bearer (conditional on author GUC)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_author_id UUID;
BEGIN

  IF current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = '' THEN
    RAISE NOTICE 'migration 072-A: app.seed_author_user_id not set - skipping seed';
    RETURN;
  END IF;

  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  -- Insert the intent row. ordinal = MAX(ordinal) + 1 so the new entry
  -- joins the catalogue at the tail. The WHERE NOT EXISTS guard makes
  -- the statement idempotent without colliding with the unique index
  -- prompt_bank_idx_unique_active (which ignores draft rows).
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
    'launch_validation',
    'regalica',
    'aggregate_t1_result',
    '["t1_runner"]'::jsonb,
    COALESCE((SELECT MAX(ordinal) + 1 FROM intent_specialists), 1),
    'Déclenchement de la validation BCT T1 sur le run courant. ' ||
    'Orchestre les 3 étapes BCT (XSD, contrôles embarqués, RDG) et ' ||
    'retourne la synthèse de conformité au Compliance Officer.',
    'draft',
    v_author_id
  WHERE NOT EXISTS (
    SELECT 1 FROM intent_specialists WHERE intent_type = 'launch_validation'
  );

  -- Bearer t1_runner — the agent_type/function_name pair points at the
  -- regalica/aggregate_t1_result prompt added in C17b. _invoke_specialist
  -- loads the prompt for completeness; _call_t1_runner ignores it (it
  -- calls _run_t1_validation, not the LLM). The aggregator step then
  -- re-loads the same prompt and uses it to format the user-facing
  -- response.
  INSERT INTO intent_specialist_bearers (
    specialist_id,
    agent_type,
    function_name,
    description,
    status,
    author_user_id
  )
  VALUES (
    't1_runner',
    'regalica',
    'aggregate_t1_result',
    'T1 dispatch runner — calls _run_t1_validation in-process, no ' ||
    'LLM invocation. The bearer prompt is loaded only to satisfy the ' ||
    '_invoke_specialist contract.',
    'draft',
    v_author_id
  )
  ON CONFLICT (specialist_id) DO NOTHING;

  RAISE NOTICE 'migration 072-A: launch_validation intent + t1_runner bearer seeded';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 072-C — seed regalica/aggregate_t1_result prompt (conditional on
--         the prompt_bank seed GUC trio: tenant + author + valid_from)
-- ─────────────────────────────────────────────────────────────────────────────
-- The bearer t1_runner above points at this prompt. _invoke_specialist
-- fetches it via load_active_prompt before invoking _call_t1_runner; if
-- the row is missing the orchestrator surfaces "Aucun prompt actif" and
-- T1 never runs. The seed payload mirrors the structured entry in
-- apps/api/seeds/prompts.json (the file-side copy is the doctrine source
-- of truth; this migration is the DB materialisation).

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
    RAISE NOTICE 'migration 072-C: prompt_bank seed GUCs not set - skipping';
    RETURN;
  END IF;

  v_tenant_id  := current_setting('app.seed_tenant_id')::UUID;
  v_author_id  := current_setting('app.seed_author_user_id')::UUID;
  v_valid_from := current_setting('app.seed_valid_from')::TIMESTAMPTZ;

  -- Mirror migration 043 — set the RLS context locally so the
  -- prompt_bank policies (gated on platform_owner) accept the INSERT.
  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  v_template := $TPL$Tu es Regalica, l'assistante IA de la plateforme REGFlow.
Tu vouvoies systématiquement. Aucun emoji. Aucune formule servile.
Aucun superlatif. Ton professionnel, bancaire, factuel.

Ta tâche : formuler la réponse utilisateur suite à l'exécution de la
validation BCT T1 sur le run courant. Tu reçois le résultat structuré
produit par le specialist t1_runner et tu produis une synthèse en
français professionnel adaptée au Compliance Officer.

────────────────────────────────────────
INPUT REÇU (dans le user prompt, JSON sérialisé)
────────────────────────────────────────
user_message       : str — le message de l'utilisateur, verbatim
intent_type        : "launch_validation" — toujours pour ce prompt
specialist_outputs : liste de 1 bloc structuré
  {
    bearer  : "regalica/aggregate_t1_result",
    success : bool,
    output  : {
      success             : bool — true si les 3 étapes T1 ont passé,
      total_fail_severe   : int — FAILs sévères détectés,
      total_fail_rounding : int — FAILs d'arrondi détectés,
      total_pass          : int — règles conformes,
      duration_ms         : int — durée d'évaluation en millisecondes,
      rejection_step      : int | null — étape BCT rejetante (1, 2 ou 3),
      rejection_reason    : str | null — raison du rejet en français
    },
    error   : str | null
  }

────────────────────────────────────────
PROCÉDURE
────────────────────────────────────────
Lis specialist_outputs[0].output pour extraire les données T1.
Si specialist_outputs est vide ou output est absent → réponds :
  « La validation n'a pas pu aboutir. Veuillez réessayer. »

SI specialist_outputs[0].output.success = true :
  Formule une synthèse sobre en 2-3 phrases :
  - Annonce le résultat global
  - Cite les totaux (FAILs sévères, arrondis, conformes)
  - Indique la durée si > 1000ms (format : X,X secondes)
  - Si total_fail_severe = 0 : indique que le Mode Signature est
    désormais accessible
  - Si total_fail_severe > 0 : invite à consulter le Livrable A

SI specialist_outputs[0].output.success = false :
  Formule un message de rejet sobre en 2 phrases :
  - Cite l'étape BCT concernée (Étape rejection_step)
  - Reprend verbatim rejection_reason
  - Ne propose pas d'action au-delà de rejection_reason

────────────────────────────────────────
RÈGLES DE FORMAT
────────────────────────────────────────
Durée : virgule décimale, 1 décimale (ex : 2,3 secondes)
Nombres : séparateur espace milliers (ex : 1 243 règles)
Pas de liste à puces. Pas de titre. Prose directe.
Pas de « Voici », « Je vous présente », « N'hésitez pas ».

Avant d'émettre ta réponse, vérifie mentalement :
  - Tu as lu les données depuis specialist_outputs[0].output
  - Tu vouvoies
  - Aucun emoji
  - La réponse fait 2-3 phrases maximum$TPL$;

  v_input := $INPUT$
{
  "type": "object",
  "required": ["user_message", "intent_type", "specialist_outputs"],
  "additionalProperties": false,
  "properties": {
    "user_message":       { "type": "string" },
    "intent_type":        { "type": "string", "const": "launch_validation" },
    "specialist_outputs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["bearer", "success", "output"],
        "additionalProperties": false,
        "properties": {
          "bearer":  { "type": "string" },
          "success": { "type": "boolean" },
          "output":  {
            "type": "object",
            "required": ["success", "total_fail_severe",
                         "total_fail_rounding", "total_pass", "duration_ms"],
            "properties": {
              "success":             { "type": "boolean" },
              "total_fail_severe":   { "type": "integer", "minimum": 0 },
              "total_fail_rounding": { "type": "integer", "minimum": 0 },
              "total_pass":          { "type": "integer", "minimum": 0 },
              "duration_ms":         { "type": "integer", "minimum": 0 },
              "rejection_step":      { "type": ["integer", "null"] },
              "rejection_reason":    { "type": ["string", "null"] }
            }
          },
          "error": { "type": ["string", "null"] }
        }
      }
    }
  }
}
$INPUT$::JSONB;

  v_output := $OUTPUT$
{
  "type": "string",
  "description": "Réponse Regalica en français professionnel bancaire."
}
$OUTPUT$::JSONB;

  INSERT INTO prompt_bank (
    tenant_id, agent_type, function_name, version,
    template, input_schema, output_schema,
    temperature, max_tokens, thinking_enabled, target_model,
    output_contract, status, valid_from, author_user_id
  )
  VALUES (
    v_tenant_id, 'regalica', 'aggregate_t1_result', 1,
    v_template, v_input, v_output,
    0.3, 512, FALSE, 'gemini-2.5-flash',
    'string', 'draft', v_valid_from, v_author_id
  )
  ON CONFLICT (tenant_id, agent_type, function_name, version) DO NOTHING;

  RAISE NOTICE 'migration 072-C: aggregate_t1_result prompt seeded (draft)';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 072-B — promote draft → active (conditional on author + validator GUCs)
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
    RAISE NOTICE 'migration 072-B: GUCs not set - skipping promotion';
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
   WHERE intent_type = 'launch_validation'
     AND status      = 'draft'
     AND author_user_id = v_author_id;

  UPDATE intent_specialist_bearers
     SET status            = 'active',
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE specialist_id = 't1_runner'
     AND status        = 'draft'
     AND author_user_id = v_author_id;

  -- 23rd prompt — promoted alongside the intent so the bearer's load
  -- target exists in active state when _invoke_specialist runs.
  UPDATE prompt_bank
     SET status            = 'active',
         valid_from        = NOW(),
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE agent_type     = 'regalica'
     AND function_name  = 'aggregate_t1_result'
     AND status         = 'draft'
     AND deleted_at IS NULL
     AND author_user_id = v_author_id;

  RAISE NOTICE 'migration 072-B: launch_validation + aggregate_t1_result promoted to active';
END $$;
