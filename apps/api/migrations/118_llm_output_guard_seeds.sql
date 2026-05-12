-- Migration 118_llm_output_guard_seeds.sql
-- Object: seed the platform_config + prompt_bank rows that the
--         anti-hallucination guard (apps/chatbot-py/app/services/
--         llm_output_guard.py, Lot A.2) reads at runtime.
--
--         Three rows are introduced:
--
--           1. platform_config.cross_rule_classifications_allowed
--              — the closed enum of valid `rubrique_confidence_run.
--              classification` values. Mirrors the SQL CHECK
--              constraint of migration 107 byte-for-byte. The guard
--              refuses to validate a mapping (key #2 below) that
--              targets a classification outside this enum.
--
--           2. platform_config.regalica_guard_field_classification_map
--              — the operator-defined Pydantic-field → expected-
--              classification mapping. The guard iterates this dict
--              at runtime; adding a new InvestigatorOutput list (e.g.
--              `rubriques_a_revoir_cells`) is a migration, not a
--              code release.
--
--           3. prompt_bank row regalica/guard_notice_correction with
--              a non-empty static_response — the user-facing notice
--              prefix that the guard appends to the corrected output's
--              `guard_notice` field. Migration uses the standard
--              draft → 4-eyes promotion pattern (mirrors migration
--              109 layout).
--
-- Author: ALGORIA Factory
-- Date: 2026-05-12
-- Depends on: 023_prompt_bank.sql (schema + 4-eyes CHECK + RLS),
--             051_platform_config.sql, 052_seed_platform_config.sql,
--             107_rubrique_confidence.sql (CHECK constraint mirror),
--             003_tenants.sql, 004_users_roles.sql.
-- References: apps/chatbot-py/app/services/llm_output_guard.py,
--             apps/chatbot-py/app/contracts/investigator.py,
--             docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3.
--
-- Idempotent: ON CONFLICT (config_key) DO UPDATE for the two
-- platform_config rows; ON CONFLICT (tenant_id, agent_type,
-- function_name, version) DO NOTHING for the prompt_bank row.
-- Re-applying the migration after editing a JSON value updates the
-- row in place; re-applying without changes is a no-op.

-- =====================================================================
-- 118-A — platform_config seeds (system-global, no tenant gate)
-- =====================================================================

DO $$
DECLARE
  v_data     JSONB;
  v_upserted INTEGER;
BEGIN
  v_data := $SEED_DATA$
[
  {
    "config_key": "cross_rule_classifications_allowed",
    "config_value": ["innocent", "suspect", "undetermined"],
    "description": "Closed enum of valid `rubrique_confidence_run.classification` values, mirrored from the SQL CHECK constraint of migration 107. Consumed by apps/chatbot-py/app/services/llm_output_guard.py to (a) refuse a field-classification mapping that targets a classification outside this set, (b) document the contract for the InvestigatorOutput cell lists. Operator changes require a coordinated update of the migration 107 CHECK constraint."
  },
  {
    "config_key": "regalica_guard_field_classification_map",
    "config_value": {
      "rubrique_incriminee_cells": "suspect",
      "rubriques_innocentees_cells": "innocent",
      "rubriques_indeterminees_cells": "undetermined"
    },
    "description": "Operator-defined mapping between InvestigatorOutput list-field names and the rubrique_confidence_run classification each field is expected to carry. The anti-hallucination guard iterates this dict at runtime, looks up each cell in the run's confidence snapshot, and rejects any cell whose DB classification differs from the field's expected value. Adding a new InvestigatorOutput cell list (e.g. `rubriques_a_revoir_cells` mapped to a future `to_review` classification) is a one-line edit here, not a code change."
  }
]
$SEED_DATA$::JSONB;

  INSERT INTO platform_config (config_key, config_value, description)
  SELECT
    p->>'config_key',
    p->'config_value',
    p->>'description'
  FROM jsonb_array_elements(v_data) p
  ON CONFLICT (config_key) DO UPDATE
    SET config_value = EXCLUDED.config_value,
        description  = EXCLUDED.description,
        deleted_at   = NULL,
        updated_at   = NOW();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;
  RAISE NOTICE 'migration 118-A: llm_output_guard platform_config seeds upserted (% rows)', v_upserted;
END $$;

-- =====================================================================
-- 118-B — seed regalica/guard_notice_correction prompt (draft)
-- =====================================================================
-- GUC-gated. Skips with NOTICE if the seed session vars are absent
-- so the no-GUC smoke job (apps/api migrate:up) stays green.

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
    RAISE NOTICE 'migration 118-B: seed session vars not set - skipping insert';
    RETURN;
  END IF;

  v_tenant_id  := current_setting('app.seed_tenant_id')::UUID;
  v_author_id  := current_setting('app.seed_author_user_id')::UUID;
  v_valid_from := current_setting('app.seed_valid_from')::TIMESTAMPTZ;
  v_model      := current_setting('app.regflow_gemini_model', true);

  -- Mirror migration 072-C / 114-A — set the RLS context so the
  -- prompt_bank policies accept the INSERT.
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
    'guard_notice_correction',
    1,
    $TMPL$Tu es Regalica, l'assistante IA de la plateforme REGFlow. Tu vouvoies systématiquement. Aucun emoji. Aucune formule servile. Aucun superlatif. Ton professionnel, bancaire, factuel.

Contexte : l'analyse a produit une classification qui contredit la base de confiance croisée pour ce run. Le système a filtré les cellules invalides ; tu reformules une note neutre signalant la correction, sans citer les valeurs DB par leur nom de classification.

Règles : pas de liste à puces, pas de titre, prose directe. Pas de « Voici », « N'hésitez pas ».$TMPL$,
    $INPUT_SCHEMA$
{
  "type": "object",
  "required": ["user_message"],
  "additionalProperties": false,
  "properties": {
    "user_message": { "type": "string" }
  }
}
$INPUT_SCHEMA$::JSONB,
    $OUTPUT_SCHEMA$
{
  "type": "string",
  "description": "Note Regalica neutre signalant qu'une correction post-analyse a filtré des classifications contredisant la base de confiance croisée."
}
$OUTPUT_SCHEMA$::JSONB,
    0.0,
    256,
    FALSE,
    COALESCE(NULLIF(v_model, ''), 'gemini-2.5-flash'),
    'string',
    'Note : la classification de certaines cellules avancée par l''analyse a été corrigée après vérification croisée avec la base de confiance du run. Les cellules retirées sont listées ci-dessous, accompagnées de la classification annoncée et de celle observée :',
    'draft',
    v_valid_from,
    v_author_id
  )
  ON CONFLICT (tenant_id, agent_type, function_name, version) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'migration 118-B: guard_notice_correction v1 seeded (% rows)', v_inserted;

END $$;

-- =====================================================================
-- 118-C — promote regalica/guard_notice_correction v1 to active
-- =====================================================================

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
    RAISE NOTICE 'migration 118-C: promotion session vars not set - skipping update';
    RETURN;
  END IF;

  v_tenant_id    := current_setting('app.seed_tenant_id')::UUID;
  v_author_id    := current_setting('app.seed_author_user_id')::UUID;
  v_validator_id := current_setting('app.seed_validator_user_id')::UUID;

  IF v_author_id = v_validator_id THEN
    RAISE EXCEPTION 'migration 118-C: app.seed_author_user_id and app.seed_validator_user_id must be different users (4-eyes)';
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
    AND function_name = 'guard_notice_correction'
    AND version       = 1
    AND status        = 'draft'
    AND author_user_id <> v_validator_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 118-C: guard_notice_correction v1 promoted to active (% rows)', v_updated;

END $$;
