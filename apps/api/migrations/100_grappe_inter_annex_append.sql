-- Migration 100_grappe_inter_annex_append.sql
-- Object: append an explicit inter-annex acknowledgment instruction to
--         the active `regalica/aggregate_grappe_cause_racine` prompt
--         template. Mirror of migration 096 (BLOC 7 in
--         `aggregate_zoom_fail`) for the cluster aggregator — without
--         this append, the LLM may silently ignore the synthetic
--         `dependency/check_companions` specialist outcome the
--         orchestrator appends for cluster intent (Bug 7 closure).
--
--         Strategy: rather than rewrite the full multi-page template
--         body (large surface, high risk of regression on the existing
--         prose), this migration uses `template = template || $extra$`
--         to APPEND a final block at the end of the existing template.
--         The append is idempotent: re-running detects the marker
--         string and skips the append when it is already present.
--
--         Concretely, the appended block tells the cluster aggregator
--         that when specialist_outputs contains an entry with
--         bearer = "dependency/check_companions" and output has a
--         non-empty missing_companions array, it MUST close the
--         response with a single inter-annex note paragraph naming
--         the primary annexe, the missing companions, and the
--         parasitic_fail_count. The format mirrors zoom's BLOC 7
--         verbatim so a reader sees identical inter-annex language
--         across zoom and cluster responses.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-08
-- Depends on: 081_overhaul_active_prompt_bodies.sql (active cluster
--             template), 095_router_cluster_broad_phrases.sql,
--             096_zoom_fail_inter_annex_block.sql,
--             099_router_inter_annex_phrases.sql.

DO $$
DECLARE
  v_tenant_id UUID;
  v_author_id UUID;
  v_updated   INTEGER;
  v_marker    CONSTANT TEXT := 'INTER-ANNEXE — NOTE FINALE OBLIGATOIRE';
  v_append    CONSTANT TEXT := E'\n\n────────────────────────────────────────\nINTER-ANNEXE — NOTE FINALE OBLIGATOIRE\n────────────────────────────────────────\nSi specialist_outputs contient une entrée bearer = "dependency/check_companions"\navec success = true ET output.missing_companions non vide, vous devez clore\nla réponse par UNE phrase finale isolée par une ligne vide, en prose,\nvouvoiement, exactement de la forme :\n\n    « Note inter-annexe : l''annexe `PRIMARY` dépend de `M1`, `M2`\n      (non transmises sur ce dépôt). N règles inter-annexes restent\n      parasitées tant que ces dépôts ne sont pas constitués. »\n\nSubstitutions :\n  - PRIMARY     ← output.primary_annexe (entre backticks)\n  - M1, M2, ... ← output.missing_companions[] (entre backticks,\n                  séparés par « , »)\n  - N           ← output.parasitic_fail_count (entier ≥ 0). Si\n                  parasitic_fail_count = 0, omettez la deuxième moitié\n                  de la phrase et arrêtez après les codes d''annexes.\n\nSi l''entrée dependency/check_companions est absente, ou success = false,\nou output.missing_companions est vide, n''affichez AUCUNE note inter-annexe,\naucune phrase d''absence, aucun tag autonome.';
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = '' THEN
    RAISE NOTICE 'migration 100: GUCs not set - skipping update';
    RETURN;
  END IF;

  v_tenant_id := current_setting('app.seed_tenant_id')::UUID;
  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE prompt_bank
  SET template = template || v_append,
      updated_at = NOW()
  WHERE tenant_id     = v_tenant_id
    AND agent_type    = 'regalica'
    AND function_name = 'aggregate_grappe_cause_racine'
    AND version       = 1
    AND status        = 'active'
    AND POSITION(v_marker IN template) = 0;  -- idempotence: skip if marker already present

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 100: aggregate_grappe_cause_racine inter-annex note appended (% rows)', v_updated;
END $$;
