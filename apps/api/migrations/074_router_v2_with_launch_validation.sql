-- Migration 074_router_v2_with_launch_validation.sql
-- Object: insert regalica/router v2 (draft) with the production
--         classification prompt + the launch_validation intent added
--         to the enum. Migration 044 inserted v1 with a 10-intent
--         enum that predates the launch_validation intent seeded by
--         migration 072. Without v2, the router LLM cannot classify
--         the operator phrase "lance la validation" → t1_runner is
--         never dispatched → status='completed' is never reached.
-- Author: ALGORIA Factory
-- Date: 2026-05-04
-- Depends on: 023_prompt_bank.sql (table + RLS),
--             043_seed_prompt_bank.sql (initial v1 draft),
--             044_update_router_prompt.sql (v1 production template),
--             072_seed_intent_launch_validation.sql (intent + bearer
--                                                    + aggregator prompt).
-- References: docs/05 §7 (router doctrine), docs/10 §3 (intent enum
--             grammar — must mirror intent_specialists.intent_type).
--
-- Required session vars for 074-A (insert + ALTER TABLE):
--   app.seed_tenant_id      - target tenant UUID
--   app.seed_author_user_id - platform_owner UUID
--   app.seed_valid_from     - bitemporal validity start
-- Required session vars for 074-B (4-eyes promotion v1→deprecated,
-- v2→active):
--   app.seed_author_user_id     - same as 074-A
--   app.seed_validator_user_id  - distinct UUID (4-eyes constraint)
--
-- Idempotent: 074-A uses ON CONFLICT (tenant, agent, function, version)
-- DO NOTHING. 074-B is a no-op when the v1 is already deprecated and
-- v2 is already active. Re-running with the same GUCs converges.

DO $$
DECLARE
  v_tenant_id  UUID;
  v_author_id  UUID;
  v_valid_from TIMESTAMPTZ;
  v_v1_input   JSONB;
  v_v1_output  JSONB;
  v_v1_target  TEXT;
  v_v1_temp    NUMERIC;
  v_v1_max     INTEGER;
  v_v1_think   BOOLEAN;
  v_v1_oc      TEXT;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_valid_from', true) IS NULL
  OR current_setting('app.seed_valid_from', true) = '' THEN
    RAISE NOTICE 'migration 074-A: GUCs not set - skipping insert';
    RETURN;
  END IF;

  v_tenant_id  := current_setting('app.seed_tenant_id')::UUID;
  v_author_id  := current_setting('app.seed_author_user_id')::UUID;
  v_valid_from := current_setting('app.seed_valid_from')::TIMESTAMPTZ;

  -- Mirror migration 044 — set RLS context locally so the
  -- prompt_bank UPDATE/INSERT policies (gated on platform_owner)
  -- accept the writes.
  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  -- Reuse v1 schema configuration so v2 stays compatible with the
  -- intent_router.py contract (input_schema = {user_message},
  -- output_schema = {intent, confidence, reasoning?}).
  SELECT input_schema, output_schema, target_model, temperature,
         max_tokens, thinking_enabled, output_contract
    INTO v_v1_input, v_v1_output, v_v1_target, v_v1_temp,
         v_v1_max, v_v1_think, v_v1_oc
    FROM prompt_bank
   WHERE tenant_id     = v_tenant_id
     AND agent_type    = 'regalica'
     AND function_name = 'router'
     AND status        = 'active'
   ORDER BY version DESC
   LIMIT 1;

  IF v_v1_input IS NULL THEN
    RAISE EXCEPTION 'migration 074-A: no active router v1 found - '
                    'apply migration 044 with GUCs first';
  END IF;

  INSERT INTO prompt_bank (
    tenant_id, agent_type, function_name, version,
    template, input_schema, output_schema,
    temperature, max_tokens, thinking_enabled, target_model,
    output_contract, status, valid_from, author_user_id
  )
  VALUES (
    v_tenant_id, 'regalica', 'router', 2,
    $TMPL$Tu es le routeur d'intention de REGFlow, plateforme de conformité BCT.

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
2. Format exact : {"intent": "<valeur>", "confidence": <0.0-1.0>, "reasoning": "<1 phrase fr>"}
3. intent doit être exactement l'une des 11 valeurs ci-dessus.
4. confidence = certitude de la classification (1.0 = certitude absolue).
5. reasoning = une phrase courte en français expliquant le choix.
6. Si l'utilisateur a un run en cours et écrit une phrase d'ordre («lance», «démarre», «valide», «run»), privilégie launch_validation avec confidence ≥ 0.85.

MESSAGE À CLASSIFIER :
{user_message}$TMPL$,
    v_v1_input, v_v1_output,
    v_v1_temp, v_v1_max, v_v1_think, v_v1_target,
    v_v1_oc, 'draft', v_valid_from, v_author_id
  )
  ON CONFLICT (tenant_id, agent_type, function_name, version)
  DO NOTHING;

  RAISE NOTICE 'migration 074-A: regalica/router v2 inserted (draft)';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 074-B — 4-eyes promotion: deprecate v1, activate v2
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tenant_id    UUID;
  v_author_id    UUID;
  v_validator_id UUID;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_validator_user_id', true) IS NULL
  OR current_setting('app.seed_validator_user_id', true) = '' THEN
    RAISE NOTICE 'migration 074-B: GUCs not set - skipping promotion';
    RETURN;
  END IF;

  v_tenant_id    := current_setting('app.seed_tenant_id')::UUID;
  v_author_id    := current_setting('app.seed_author_user_id')::UUID;
  v_validator_id := current_setting('app.seed_validator_user_id')::UUID;

  IF v_author_id = v_validator_id THEN
    RAISE EXCEPTION
      '4-eyes violation: validator (%) must differ from author (%)',
      v_validator_id, v_author_id;
  END IF;

  -- Set RLS context for the UPDATE
  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  -- Deprecate v1 (so the unique-active partial index frees the slot
  -- before v2 is promoted)
  UPDATE prompt_bank
     SET status            = 'deprecated',
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE tenant_id     = v_tenant_id
     AND agent_type    = 'regalica'
     AND function_name = 'router'
     AND version       = 1
     AND status        = 'active';

  -- Activate v2
  UPDATE prompt_bank
     SET status            = 'active',
         valid_from        = NOW(),
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE tenant_id     = v_tenant_id
     AND agent_type    = 'regalica'
     AND function_name = 'router'
     AND version       = 2
     AND status        = 'draft';

  RAISE NOTICE 'migration 074-B: regalica/router v1 deprecated, v2 promoted to active';
END $$;
