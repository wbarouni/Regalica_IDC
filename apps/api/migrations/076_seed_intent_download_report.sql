-- Migration 076_seed_intent_download_report.sql
-- Object: K2 — wire the orphan reporter_pdf specialist to a new
--         download_report intent + a static-response aggregator. The
--         reporter_pdf class has been registered in
--         apps/chatbot-py/app/services/orchestrator.py:713
--         (_SPECIALIST_INVOKERS) since commit c4e3d78 and the
--         reporter/generate_pdf prompt has been seeded since 043 +
--         promoted by 070, but no `intent_specialists` row pointed at
--         it — making the agent reachable only through direct test
--         invocation. K2 lights it up via the chat path.
--
--         Three new rows land in the catalogue:
--           - intent_specialists.download_report (specialist t1=reporter_pdf)
--           - intent_specialist_bearers.reporter_pdf (agent_type/function_name)
--           - prompt_bank.regalica/aggregate_download_report (with
--             a static_response so the aggregator step never burns a
--             Gemini call — the user-facing markdown is canned and
--             surfaced verbatim by `_invoke_aggregator` (orchestrator.py:1125
--             is_static_response short-circuit).
--
--         The static_response strategy is the K2 hard fallback: even
--         if Gemini is unreachable, the chat reply ships immediately
--         with the canned markdown describing the deliverable PDF
--         envelope. Reporter_pdf still runs as a specialist (its
--         output is the structured PDF envelope ready for Phase 5
--         WeasyPrint rendering) but the aggregator does not depend
--         on it for the user reply.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-05
-- Depends on: 064_intent_specialists.sql (table schema),
--             065_seed_intent_specialists.sql (canonical seed pattern),
--             072_seed_intent_launch_validation.sql (mirrored pattern),
--             070_promote_prompts_v1_and_static_response.sql (static_response col).
-- References: docs/05 (reporter agent), Section K K2 of the audit
--             tuyauterie 2026-05-05.
--
-- Required session vars for 076-A: app.seed_author_user_id
-- Required session vars for 076-C: app.seed_tenant_id +
--                                  app.seed_author_user_id +
--                                  app.seed_valid_from
-- Required session vars for 076-B: app.seed_author_user_id +
--                                  app.seed_validator_user_id
--
-- All blocks self-skip with RAISE NOTICE when their GUCs are absent so
-- the CI migrate-smoke job (which sets none) succeeds as a no-op.

-- ─────────────────────────────────────────────────────────────────────────────
-- 076-A — seed intent + bearer (conditional on author GUC)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_author_id UUID;
BEGIN

  IF current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = '' THEN
    RAISE NOTICE 'migration 076-A: app.seed_author_user_id not set - skipping seed';
    RETURN;
  END IF;

  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  -- The new intent — aggregator points at regalica/aggregate_download_report
  -- seeded in 076-C below. specialist_ids carries the lone reporter_pdf
  -- id which is dispatched via _SPECIALIST_INVOKERS["reporter_pdf"].
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
    'download_report',
    'regalica',
    'aggregate_download_report',
    '["reporter_pdf"]'::jsonb,
    COALESCE((SELECT MAX(ordinal) + 1 FROM intent_specialists), 1),
    'Génération du rapport PDF de validation BCT pour le run courant. ' ||
    'Le specialist reporter_pdf produit l''envelope structuré ; ' ||
    'l''aggregator confirme la disponibilité au Compliance Officer.',
    'draft',
    v_author_id
  WHERE NOT EXISTS (
    SELECT 1 FROM intent_specialists WHERE intent_type = 'download_report'
  );

  -- Bearer reporter_pdf — the agent_type/function_name pair points at
  -- the existing reporter/generate_pdf prompt (seed 043, promoted 070).
  -- _invoke_specialist will load it and invoke ReporterPdfAgent.execute
  -- via the _SPECIALIST_INVOKERS table.
  INSERT INTO intent_specialist_bearers (
    specialist_id,
    agent_type,
    function_name,
    description,
    status,
    author_user_id
  )
  VALUES (
    'reporter_pdf',
    'reporter',
    'generate_pdf',
    'PDF report producer — invokes ReporterPdfAgent which renders the ' ||
    'WeasyPrint envelope from the run summary. The aggregator response ' ||
    'is canned (static_response) so this bearer''s output is consumed ' ||
    'as a side artefact in the Phase 5 storage path, not as the user ' ||
    'reply text.',
    'draft',
    v_author_id
  )
  ON CONFLICT (specialist_id) DO NOTHING;

  RAISE NOTICE 'migration 076-A: download_report intent + reporter_pdf bearer seeded';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 076-C — seed regalica/aggregate_download_report prompt with static_response
--         (conditional on the prompt_bank seed GUC trio)
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
    RAISE NOTICE 'migration 076-C: prompt_bank seed GUCs not set - skipping';
    RETURN;
  END IF;

  v_tenant_id  := current_setting('app.seed_tenant_id')::UUID;
  v_author_id  := current_setting('app.seed_author_user_id')::UUID;
  v_valid_from := current_setting('app.seed_valid_from')::TIMESTAMPTZ;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  -- Template is a brief instruction kept for Phase 5 when WeasyPrint
  -- rendering replaces the static_response. Today the static_response
  -- short-circuit (orchestrator.py:1125) makes this template inert at
  -- runtime — it is preserved so a future operator can flip the
  -- behaviour by setting static_response = NULL.
  v_template := $TPL$Tu es Regalica. Confirme la disponibilité du rapport PDF en
2 phrases sobres en français professionnel bancaire.
Aucun emoji. Vouvoiement. Pas de superlatif.$TPL$;

  -- Static response surfaced verbatim by _invoke_aggregator. Markdown
  -- because the chat thread renders it via react-markdown (see
  -- Workspace.tsx). Two sentences, banking tone, no superlative.
  v_static := 'Le rapport PDF de validation BCT a été préparé pour le run courant. ' ||
              'Sa structure complète est disponible dans le Livrable C ; le téléchargement ' ||
              'est un artefact technique du specialist `reporter_pdf` câblé pour la démo.';

  v_input := $INPUT$
{
  "type": "object",
  "required": ["user_message", "intent_type", "specialist_outputs"],
  "additionalProperties": false,
  "properties": {
    "user_message":       { "type": "string" },
    "intent_type":        { "type": "string", "const": "download_report" },
    "specialist_outputs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["bearer", "success"],
        "additionalProperties": true,
        "properties": {
          "bearer":  { "type": "string" },
          "success": { "type": "boolean" }
        }
      }
    }
  }
}
$INPUT$::JSONB;

  v_output := $OUTPUT$
{
  "type": "string",
  "description": "Confirmation Regalica en français professionnel bancaire."
}
$OUTPUT$::JSONB;

  INSERT INTO prompt_bank (
    tenant_id, agent_type, function_name, version,
    template, input_schema, output_schema,
    temperature, max_tokens, thinking_enabled, target_model,
    output_contract, static_response, status, valid_from, author_user_id
  )
  VALUES (
    v_tenant_id, 'regalica', 'aggregate_download_report', 1,
    v_template, v_input, v_output,
    0.0, 256, FALSE, 'gemini-2.5-flash',
    'string', v_static, 'draft', v_valid_from, v_author_id
  )
  ON CONFLICT (tenant_id, agent_type, function_name, version) DO NOTHING;

  RAISE NOTICE 'migration 076-C: aggregate_download_report prompt seeded (draft) with static_response';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 076-B — promote draft → active (conditional on author + validator GUCs)
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
    RAISE NOTICE 'migration 076-B: GUCs not set - skipping promotion';
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
   WHERE intent_type = 'download_report'
     AND status      = 'draft'
     AND author_user_id = v_author_id;

  UPDATE intent_specialist_bearers
     SET status            = 'active',
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE specialist_id = 'reporter_pdf'
     AND status        = 'draft'
     AND author_user_id = v_author_id;

  UPDATE prompt_bank
     SET status            = 'active',
         valid_from        = NOW(),
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE agent_type     = 'regalica'
     AND function_name  = 'aggregate_download_report'
     AND status         = 'draft'
     AND deleted_at IS NULL
     AND author_user_id = v_author_id;

  RAISE NOTICE 'migration 076-B: download_report + reporter_pdf + aggregate_download_report promoted to active';
END $$;
