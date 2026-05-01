-- Migration 058_seed_prompt_xml_received.sql
-- Object: seed the regalica/xml_received prompt that composes the
--         T0 briefing returned by chatbot-py /upload.
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 023_prompt_bank.sql, 003_tenants.sql, 004_users_roles.sql,
--             007_seed_system_roles.sql (platform_owner role auto-seeded
--             by tenants trigger)
-- References: docs/05-AGENTS-ET-PROMPTS-BANK.md §Regalica T0,
--             apps/api/seeds/prompts/xml_received_v1.json
--
-- Required session vars (matches 043/044/045/046/047 conventions):
--   app.seed_tenant_id        - UUID of the target tenant
--   app.seed_author_user_id   - UUID of the seeding user (must hold
--                               platform_owner role); used to set
--                               app.current_user_id so the prompt_bank
--                               RLS policies allow the INSERT
--   app.seed_valid_from       - TIMESTAMPTZ of bitemporal validity start
--
-- target_model is read from the GEMINI_MODEL env var at SQL time via
-- current_setting('app.regflow_gemini_model', true). The migration
-- runner exports this value before running the seed pass — the env
-- var stays the operator-controlled source of truth (zero literal).
-- If the GUC is unset, the prompt is skipped (status NOTICE) so the
-- migration stays idempotent across environments.
--
-- ON CONFLICT (tenant_id, agent_type, function_name, version)
-- DO NOTHING — promotion to status='active' is gated by the 4-yeux
-- process (separate UPDATE, validator != author).

DO $$
DECLARE
  v_tenant_id   UUID;
  v_author_id   UUID;
  v_valid_from  TIMESTAMPTZ;
  v_model       TEXT;
  v_inserted    INTEGER;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_valid_from', true) IS NULL
  OR current_setting('app.seed_valid_from', true) = '' THEN
    RAISE NOTICE 'migration 058: seed session vars not set - skipping insert';
    RETURN;
  END IF;

  v_tenant_id  := current_setting('app.seed_tenant_id')::UUID;
  v_author_id  := current_setting('app.seed_author_user_id')::UUID;
  v_valid_from := current_setting('app.seed_valid_from')::TIMESTAMPTZ;

  -- target_model from a session GUC fed from $GEMINI_MODEL by the
  -- runner. Falls back to NULL if absent — the prompt then carries
  -- 'gemini-2.5-flash' (the prompt_bank column default) so the seed
  -- still produces a row even in dev environments without the GUC.
  v_model := current_setting('app.regflow_gemini_model', true);

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  INSERT INTO prompt_bank (
    tenant_id, agent_type, function_name, version,
    template, input_schema, output_schema,
    temperature, max_tokens, thinking_enabled,
    target_model, status, valid_from, author_user_id
  )
  VALUES (
    v_tenant_id,
    'regalica',
    'xml_received',
    1,
    $TMPL$Tu es Regalica, orchestratrice IA de la conformité réglementaire BCT pour REGFlow. Un dépôt XML vient d'être reçu et a passé l'ingestion T0. Confirme la réception en français bancaire professionnel, vouvoie l'utilisateur, sans formule servile, sans emoji.

DONNÉES :
upload_id={upload_id}
filename={filename}
annexe_code={annexe_code}
arrete_date={arrete_date}

MÉTHODE :
1. Confirme la réception en une phrase sobre (mention le code annexe et la date d'arrêté).
2. Indique que l'analyse réglementaire est en cours.
3. Liste les agents post-T0 qui vont être déclenchés (depuis workflow_steps T1).

FORMAT DE SORTIE (JSON strict, aucun texte avant ou après) :
{
  "message": "<2 phrases maximum en français bancaire>",
  "agents_triggered": ["<agent_type1>", "<agent_type2>", ...]
}$TMPL$,
    $INPUT_SCHEMA$
{
  "type": "object",
  "required": ["upload_id", "filename", "annexe_code"],
  "properties": {
    "upload_id":   { "type": "string" },
    "filename":    { "type": "string" },
    "annexe_code": { "type": "string" },
    "arrete_date": { "type": "string" }
  }
}
$INPUT_SCHEMA$::JSONB,
    $OUTPUT_SCHEMA$
{
  "type": "object",
  "required": ["message", "agents_triggered"],
  "properties": {
    "message":          { "type": "string" },
    "agents_triggered": { "type": "array", "items": { "type": "string" } }
  }
}
$OUTPUT_SCHEMA$::JSONB,
    0.7,
    1024,
    FALSE,
    COALESCE(NULLIF(v_model, ''), 'gemini-2.5-flash'),
    'draft',
    v_valid_from,
    v_author_id
  )
  ON CONFLICT (tenant_id, agent_type, function_name, version) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'migration 058: regalica/xml_received seeded (% rows)', v_inserted;

END $$;
