-- Migration 074a_router_v2_format_safe.sql
-- Object: replace regalica/router v2 template (created in 074) with a
--         Python str.format()-safe version. The intent_router.py code
--         path passes the template through `.format(user_message=…)`
--         (default behaviour when system_prompt contains a {placeholder}).
--         The v2 template inserted by 074 contains literal `{` / `}`
--         characters inside the JSON output example, which Python's
--         format() parser reads as format specifiers and rejects with
--         `Invalid format specifier ' "<valeur>", …'`.
--
--         The fix is purely textual: every literal `{` becomes `{{`
--         and every literal `}` becomes `}}`, EXCEPT the genuine
--         `{user_message}` placeholder which must keep its single
--         braces. The fixed template is otherwise identical (line for
--         line) to the v2 template, including the `launch_validation`
--         intent and the priority rule.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-04
-- Depends on: 074_router_v2_with_launch_validation.sql (v2 row exists).
--
-- Required session vars:
--   app.seed_tenant_id       - target tenant UUID
--   app.seed_author_user_id  - platform_owner UUID (RLS context)
--
-- Idempotent: the UPDATE filters on the exact (tenant, agent, function,
-- version=2, status='active') tuple. Re-running converges to the same
-- text. The audit_trigger of prompt_bank captures the textual diff.

DO $$
DECLARE
  v_tenant_id UUID;
  v_author_id UUID;
  v_updated   INTEGER;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = '' THEN
    RAISE NOTICE 'migration 074a: GUCs not set - skipping update';
    RETURN;
  END IF;

  v_tenant_id := current_setting('app.seed_tenant_id')::UUID;
  v_author_id := current_setting('app.seed_author_user_id')::UUID;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  UPDATE prompt_bank
  SET template = $TMPL$Tu es le routeur d'intention de REGFlow, plateforme de conformité BCT.

Tu reçois un message d'un Compliance Officer d'une banque tunisienne.
Ton rôle : classifier l'intention en exactement un des 11 types ci-dessous.

TYPES D'INTENTION :
- launch_validation : déclenchement de la validation BCT T1 sur le run courant. Phrases typiques : « lance la validation », « démarre le contrôle », « valide ce dépôt », « run T1 », « va vérifier »
- zoom_fail : analyse d'un ou plusieurs FAIL spécifiques (règle, rubrique, écart)
- grappe_cause_racine : plusieurs FAIL liés à une même cause racine probable
- historique_recurrence : comparaison avec des runs précédents, tendance temporelle
- citation_reglementaire : référence à une circulaire BCT, article, texte réglementaire
- simulation_impact : simulation d'une correction avant re-validation
- estimation_sanction : estimation des sanctions BCT encourues
- plan_optimal : plan de correction complet et priorisé
- ambiguous : message ambigu nécessitant une clarification
- out_of_scope : hors périmètre REGFlow/BCT
- general_help : aide générale sur REGFlow ou la conformité BCT

RÈGLES ABSOLUES :
1. Répondre UNIQUEMENT en JSON valide, aucun texte avant ou après.
2. Format exact : {{"intent": "<valeur>", "confidence": <0.0-1.0>, "reasoning": "<1 phrase fr>"}}
3. intent doit être exactement l'une des 11 valeurs ci-dessus.
4. confidence = certitude de la classification (1.0 = certitude absolue).
5. reasoning = une phrase courte en français expliquant le choix.
6. Si l'utilisateur a un run en cours et écrit une phrase d'ordre («lance», «démarre», «valide», «run»), privilégie launch_validation avec confidence ≥ 0.85.

MESSAGE À CLASSIFIER :
{user_message}$TMPL$,
      updated_at = NOW()
  WHERE tenant_id     = v_tenant_id
    AND agent_type    = 'regalica'
    AND function_name = 'router'
    AND version       = 2
    AND status        = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'migration 074a: regalica/router v2 template format-safed (% rows)', v_updated;
END $$;
