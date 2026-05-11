-- Migration 114_seed_aggregate_no_active_run_prompt.sql
-- Object: seed `regalica/aggregate_no_active_run` v1 prompt with a
--         static_response that asks the user to upload an XML BCT
--         file before continuing. The orchestrator's no-active-run
--         short-circuit invokes this prompt when the matched intent
--         has `requires_active_run = TRUE` (migration 113) and
--         `current_run_id is None`. Uses the static_response pattern
--         (column added by migration before 070, surfaced verbatim
--         by orchestrator's is_static_response branch), so the LLM
--         is NEVER called for this path — zero token cost.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-11
-- Depends on: 023_prompt_bank.sql, 069_add_prompt_bank_output_contract.sql,
--             076_seed_intent_download_report.sql (static_response pattern reference),
--             113_intent_specialists_requires_active_run.sql.
-- References: apps/api/seeds/prompts/aggregate_no_active_run_v1.json
--
-- Two-block structure (mirrors 109+076 layouts):
--   114-A — INSERT row at status='draft' (GUC-gated)
--   114-B — promote draft → active (GUC-gated, 4-eyes enforced)
--
-- Both blocks self-skip with NOTICE if the GUCs are absent so the
-- migrate-smoke job (no GUCs set) succeeds as a no-op.

-- ─────────────────────────────────────────────────────────────────────────────
-- 114-A — seed regalica/aggregate_no_active_run v1 (draft)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tenant_id  UUID;
  v_author_id  UUID;
  v_valid_from TIMESTAMPTZ;
  v_model      TEXT;
  v_inserted   INTEGER;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_valid_from', true) IS NULL
  OR current_setting('app.seed_valid_from', true) = '' THEN
    RAISE NOTICE 'migration 114-A: seed session vars not set - skipping insert';
    RETURN;
  END IF;

  v_tenant_id  := current_setting('app.seed_tenant_id')::UUID;
  v_author_id  := current_setting('app.seed_author_user_id')::UUID;
  v_valid_from := current_setting('app.seed_valid_from')::TIMESTAMPTZ;
  v_model      := current_setting('app.regflow_gemini_model', true);

  -- Mirror migration 072-C — set the RLS context locally so the
  -- prompt_bank policies (gated on platform_owner) accept the INSERT.
  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  INSERT INTO prompt_bank (
    tenant_id, agent_type, function_name, version,
    template, input_schema, output_schema,
    temperature, max_tokens, thinking_enabled,
    target_model, output_contract, static_response,
    status, valid_from, author_user_id
  )
  VALUES (
    v_tenant_id,
    'regalica',
    'aggregate_no_active_run',
    1,
    $TMPL$Tu es Regalica, l'assistante IA de la plateforme REGFlow. Tu vouvoies systématiquement. Aucun emoji. Aucune formule servile. Aucun superlatif. Ton professionnel, bancaire, factuel.

Contexte : l'utilisateur a posé une question d'intent `{intent_type}` qui nécessite une validation BCT en cours, mais aucune validation n'est active sur ce chat.

Message utilisateur : {user_message}

Formule une réponse sobre en 2 phrases :
- Indique que la question ne peut pas être traitée sans validation active.
- Invite explicitement à déposer un fichier XML BCT pour lancer la validation T1.

Règles : pas de liste à puces, pas de titre, prose directe. Pas de « Voici », « N'hésitez pas ».$TMPL$,
    $INPUT_SCHEMA$
{
  "type": "object",
  "required": ["user_message", "intent_type"],
  "additionalProperties": false,
  "properties": {
    "user_message": { "type": "string" },
    "intent_type":  { "type": "string" }
  }
}
$INPUT_SCHEMA$::JSONB,
    $OUTPUT_SCHEMA$
{
  "type": "string",
  "description": "Réponse Regalica en français professionnel bancaire demandant le dépôt d'un XML BCT avant toute action sur des résultats de validation."
}
$OUTPUT_SCHEMA$::JSONB,
    0.0,
    256,
    FALSE,
    COALESCE(NULLIF(v_model, ''), 'gemini-2.5-flash'),
    'string',
    'Pour vous répondre, j''ai besoin d''une validation BCT active. Veuillez déposer vos rapports réglementaires (fichiers XML BCT) via la zone de dépôt, puis je lancerai la validation T1 et reprendrai votre demande sur les résultats produits.',
    'draft',
    v_valid_from,
    v_author_id
  )
  ON CONFLICT (tenant_id, agent_type, function_name, version) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'migration 114-A: aggregate_no_active_run v1 seeded (% rows)', v_inserted;

END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 114-B — 4-eyes promotion of aggregate_no_active_run v1 to active
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tenant_id    UUID;
  v_author_id    UUID;
  v_validator_id UUID;
  v_updated      INTEGER;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_validator_user_id', true) IS NULL
  OR current_setting('app.seed_validator_user_id', true) = '' THEN
    RAISE NOTICE 'migration 114-B: promotion session vars not set - skipping update';
    RETURN;
  END IF;

  v_tenant_id    := current_setting('app.seed_tenant_id')::UUID;
  v_author_id    := current_setting('app.seed_author_user_id')::UUID;
  v_validator_id := current_setting('app.seed_validator_user_id')::UUID;

  IF v_author_id = v_validator_id THEN
    RAISE EXCEPTION 'migration 114-B: app.seed_author_user_id and app.seed_validator_user_id must be different users (4-eyes)';
  END IF;

  PERFORM set_config('app.current_user_id', v_validator_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE prompt_bank
  SET
    status            = 'active',
    validator_user_id = v_validator_id,
    validated_at      = NOW(),
    updated_at        = NOW()
  WHERE tenant_id     = v_tenant_id
    AND agent_type    = 'regalica'
    AND function_name = 'aggregate_no_active_run'
    AND version       = 1
    AND status        = 'draft'
    AND author_user_id <> v_validator_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 114-B: aggregate_no_active_run v1 promoted to active (% rows)', v_updated;

END $$;
