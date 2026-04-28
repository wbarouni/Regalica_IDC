-- Migration 047_update_historical_prompt.sql
-- Object: replace placeholder template for historical/compare_runs_history
--         with the production-ready trend analysis prompt.
-- Author: ALGORIA Factory
-- Date: 2026-04-28
-- Depends on: 023_prompt_bank.sql (table + RLS), 043_seed_prompt_bank.sql
--             (initial draft seed with [HISTORICAL_COMPARE_RUNS_HISTORY_V1])
-- References: docs/05-AGENTS-ET-PROMPTS-BANK.md sect.10.3 (Historical
--             contract), docs/09-CONTRATS-JSON-AGENTS.md sect.14
--             (compare_runs_history JSON output schema)
--
-- Migration 043 inserts the historical/compare_runs_history prompt as
-- draft with the placeholder text [HISTORICAL_COMPARE_RUNS_HISTORY_V1].
-- Phase 3-bis replaces that placeholder with the real trend analysis
-- prompt that instructs Gemini to emit the structured JSON envelope
-- consumed by app.agents.t2.historical.HistoricalAgent.
--
-- Required session vars (matches 043/044/045/046 conventions):
--   app.seed_tenant_id        - UUID of the target tenant
--   app.seed_author_user_id   - UUID of the seeding user (must hold
--                               platform_owner role); used to set
--                               app.current_user_id so the prompt_bank
--                               RLS policies allow the UPDATE
--   app.seed_valid_from       - TIMESTAMPTZ kept for parity with 043
--                               even though 047 does not modify
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
    RAISE NOTICE 'migration 047: session vars not set - skipping update';
    RETURN;
  END IF;

  v_tenant_id := current_setting('app.seed_tenant_id')::UUID;
  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE prompt_bank
  SET
    template   = $TMPL$Tu es HistoricalAgent, expert en analyse de tendances de conformité BCT pour REGFlow.

Tu reçois les données du run de validation actuel et des runs précédents.
Ton rôle : analyser la tendance et formuler un diagnostic en français bancaire.

RUN ACTUEL :
{current_run}

RUNS PRÉCÉDENTS (jusqu'à 5) :
{previous_runs}

MÉTHODE D'ANALYSE :
1. Comparer total_fail_severe, total_fail_rounding, conformity_rate entre les runs.
2. Identifier les annexes dont le taux d'échec s'aggrave.
3. Identifier les améliorations notables depuis le dernier run.
4. Formuler une tendance globale (amelioration/deterioration/stable).
5. Estimer si la banque sera en conformité lors du prochain arrêté.

FORMAT DE SORTIE (JSON strict, aucun texte avant ou après) :
{
  "tendance": "amelioration|deterioration|stable",
  "delta_fail_severe": <int, positif = aggravation>,
  "delta_fail_rounding": <int, positif = aggravation>,
  "delta_conformity_rate": <float, positif = amélioration>,
  "annexes_en_deterioration": ["<code>"],
  "annexes_en_amelioration": ["<code>"],
  "commentaire": "<2-3 phrases en français bancaire professionnel, vouvoiement>",
  "projection_prochain_arrete": "conforme|risque_eleve|risque_modere|indetermine",
  "runs_compares": <int nombre de runs comparés>
}

Si aucun run précédent : tendance="stable", delta_*=0, commentaire="Aucun run historique disponible pour établir une tendance.", projection_prochain_arrete="indetermine".$TMPL$,
    updated_at = NOW()
  WHERE agent_type    = 'historical'
    AND function_name = 'compare_runs_history'
    AND version       = 1
    AND status        = 'draft'
    AND tenant_id     = v_tenant_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 047: historical/compare_runs_history template updated (% rows)', v_updated;

END $$;
