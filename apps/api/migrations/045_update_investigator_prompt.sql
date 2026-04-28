-- Migration 045_update_investigator_prompt.sql
-- Object: replace placeholder template for investigator/analyze_fail
--         with the production-ready root-cause analysis prompt.
-- Author: ALGORIA Factory
-- Date: 2026-04-28
-- Depends on: 023_prompt_bank.sql (table + RLS), 043_seed_prompt_bank.sql
--             (initial draft seed with [INVESTIGATOR_ANALYZE_FAIL_V1])
-- References: docs/05-AGENTS-ET-PROMPTS-BANK.md sect.10.1 (Investigator
--             contract), docs/09-CONTRATS-JSON-AGENTS.md sect.13
--             (analyze_fail JSON output schema)
--
-- Migration 043 inserts the investigator/analyze_fail prompt as draft
-- with the placeholder text [INVESTIGATOR_ANALYZE_FAIL_V1]. Phase 3-bis
-- replaces that placeholder with the real RCA prompt that instructs
-- Gemini to emit the structured JSON envelope consumed by
-- app.agents.t2.investigator.InvestigatorAgent.
--
-- Required session vars (matches 043/044 conventions):
--   app.seed_tenant_id        - UUID of the target tenant
--   app.seed_author_user_id   - UUID of the seeding user (must hold
--                               platform_owner role); used to set
--                               app.current_user_id so the prompt_bank
--                               RLS policies allow the UPDATE
--   app.seed_valid_from       - TIMESTAMPTZ kept for parity with 043
--                               even though 045 does not modify
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
    RAISE NOTICE 'migration 045: session vars not set - skipping update';
    RETURN;
  END IF;

  v_tenant_id := current_setting('app.seed_tenant_id')::UUID;
  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE prompt_bank
  SET
    template   = $TMPL$Tu es InvestigatorAgent, expert en analyse de conformité BCT pour REGFlow.

Tu reçois un verdict FAIL d'une règle RDG et sa définition complète.
Ton rôle : identifier la cause racine et formuler une hypothèse métier actionnable.

DONNÉES DU FAIL :
{fail_data}

DÉFINITION DE LA RÈGLE :
{rule_data}

MÉTHODE D'ANALYSE :
1. Identifier la rubrique portant l'écart le plus important.
2. Vérifier si plusieurs règles partagent cette rubrique (cause racine commune).
3. Formuler une hypothèse métier en français bancaire professionnel.
4. Évaluer le niveau de confiance (high/medium/low).
5. Citer la circulaire BCT pertinente si identifiable depuis la zone_texte.

FORMAT DE SORTIE (JSON strict, aucun texte avant ou après) :
{
  "cause_racine": "<hypothèse métier en français, 2-3 phrases, vouvoiement si mention de l'utilisateur>",
  "rubrique_incriminee": "<code rubrique BCT 14 chars>",
  "colonne_incriminee": "<numéro colonne ou null>",
  "suggestion_correction": "<action concrète à entreprendre dans le SI bancaire>",
  "circulaire_reference": "<[Circulaire BCT YYYY-NN article N §P] ou null>",
  "niveau_confiance": "high|medium|low",
  "regles_liees": ["<ax_term/num_regle>"],
  "explication_ecart": "<décomposition term par term de l'écart LHS vs RHS>"
}$TMPL$,
    updated_at = NOW()
  WHERE agent_type    = 'investigator'
    AND function_name = 'analyze_fail'
    AND version       = 1
    AND status        = 'draft'
    AND tenant_id     = v_tenant_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 045: investigator/analyze_fail template updated (% rows)', v_updated;

END $$;
