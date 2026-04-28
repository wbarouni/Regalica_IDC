-- Migration 046_update_citation_prompt.sql
-- Object: replace placeholder template for citation/find_regulatory_source
--         with the production-ready regulatory citation prompt.
-- Author: ALGORIA Factory
-- Date: 2026-04-28
-- Depends on: 023_prompt_bank.sql (table + RLS), 043_seed_prompt_bank.sql
--             (initial draft seed with [CITATION_FIND_REGULATORY_SOURCE_V1])
-- References: docs/05-AGENTS-ET-PROMPTS-BANK.md sect.10.4 (Citation
--             contract), docs/09-CONTRATS-JSON-AGENTS.md sect.17
--             (find_regulatory_source JSON output schema),
--             docs/05 sect.24 (citation format
--             [Circulaire BCT YYYY-NN article N §P])
--
-- Migration 043 inserts the citation/find_regulatory_source prompt as
-- draft with the placeholder text [CITATION_FIND_REGULATORY_SOURCE_V1].
-- Phase 3-bis replaces that placeholder with the real regulatory
-- citation prompt that instructs Gemini to emit the structured JSON
-- envelope consumed by app.agents.t2.citation.CitationAgent.
--
-- Required session vars (matches 043/044/045 conventions):
--   app.seed_tenant_id        - UUID of the target tenant
--   app.seed_author_user_id   - UUID of the seeding user (must hold
--                               platform_owner role); used to set
--                               app.current_user_id so the prompt_bank
--                               RLS policies allow the UPDATE
--   app.seed_valid_from       - TIMESTAMPTZ kept for parity with 043
--                               even though 046 does not modify
--                               valid_from (defensive consistency)
--
-- Idempotent: WHERE clause restricts to status='draft' and the exact
-- (tenant, agent_type, function_name, version) tuple. Re-runs against
-- already-updated rows are no-ops; runs against rows promoted to
-- 'active' are also no-ops (active prompts must not be silently
-- mutated; a new version is the doctrinal path).

DO $$
DECLARE
  v_tenant_id UUID;
  v_author_id UUID;
  v_updated   INTEGER;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_valid_from', true) IS NULL
  OR current_setting('app.seed_valid_from', true) = '' THEN
    RAISE NOTICE 'migration 046: session vars not set - skipping update';
    RETURN;
  END IF;

  v_tenant_id := current_setting('app.seed_tenant_id')::UUID;
  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE prompt_bank
  SET
    template   = $TMPL$Tu es CitationAgent, expert en réglementation BCT pour REGFlow.

Tu reçois la définition d'une règle RDG et tu dois identifier sa source réglementaire officielle.

DÉFINITION DE LA RÈGLE :
{rule_data}

MÉTHODE :
1. Analyser le natural_language et la zone_texte de la règle.
2. Identifier la circulaire BCT, l'article et le paragraphe pertinents.
3. Si la zone_texte contient une référence explicite, la prioriser.
4. Évaluer la confiance selon la précision de la source trouvée.

FORMAT DE SORTIE (JSON strict, aucun texte avant ou après) :
{
  "circulaire": "<ex: Circulaire BCT 2018-04 ou null>",
  "article": "<ex: Article 12 ou null>",
  "paragraphe": "<ex: §3 ou null>",
  "reference_complete": "<[Circulaire BCT YYYY-NN article N §P] ou null>",
  "texte_pertinent": "<extrait ou paraphrase du texte réglementaire>",
  "confidence": "high|medium|low",
  "justification": "<1 phrase expliquant le niveau de confiance>"
}$TMPL$,
    updated_at = NOW()
  WHERE agent_type    = 'citation'
    AND function_name = 'find_regulatory_source'
    AND version       = 1
    AND status        = 'draft'
    AND tenant_id     = v_tenant_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 046: citation/find_regulatory_source template updated (% rows)', v_updated;

END $$;
