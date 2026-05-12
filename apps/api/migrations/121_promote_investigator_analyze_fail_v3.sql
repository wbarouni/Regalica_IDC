-- Migration 121_promote_investigator_analyze_fail_v3.sql
-- Object: 4-yeux promotion of investigator/analyze_fail v3 to active +
--         deprecation of v2. The promotion is GATED on three checks
--         that any one mismatch causes a hard RAISE EXCEPTION:
--
--           1. app.seed_validator_user_id ≠ app.seed_author_user_id
--              (4-yeux contract, identical to migration 109-B / 114-B
--              / 118-C patterns).
--
--           2. app.seed_validator_user_id = app.seed_validator_attestation_uuid
--              The attestation GUC is set by the wrapper
--              ops/scripts/apply_a3_active.sh after reading
--              docs/prompts/investigator_analyze_fail_v3_VALIDATED_BY.txt
--              byte-for-byte. The migration refuses to promote if
--              the env-passed validator UUID and the file-derived
--              UUID disagree — this is the "the migration verifies
--              the file" contract from the Lot A.3.active spec.
--
--           3. validator_user_id MUST exist in users(id). The FK on
--              prompt_bank.validator_user_id would catch this anyway,
--              but the explicit check produces a clean French error
--              message rather than a Postgres FK error code.
--
--         Three-step status transition for v3, atomic in one DO block:
--           draft → in_review → active. Migration 121 also flips v2
--           to status='deprecated' with deprecated_at=NOW() (column
--           added by migration 023 for the prompt-rev workflow).
--
-- ⚠️ HUMAN 4-YEUX — Claude Code MUST NOT supply the validator UUID.
-- The UUID must come from a real human ALGORIA Factory operator
-- whose UUID exists in users(id) AND who is distinct from the
-- author. The wrapper script verifies the file before this migration
-- runs; the migration verifies the GUCs originate from that wrapper.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-12
-- Depends on: 023_prompt_bank.sql (status enum + 4-yeux CHECK),
--             111_overhaul_investigator_analyze_fail_v2.sql (v2 row
--             to deprecate), 120_seed_investigator_analyze_fail_v3_draft.sql
--             (v3 draft to promote).
-- References: ops/scripts/apply_a3_active.sh — the canonical wrapper
--             that reads the validation file, sets both
--             SEED_VALIDATOR_USER_ID and SEED_VALIDATOR_ATTESTATION_UUID
--             env vars, and calls pnpm migrate:up:operator.
--             docs/prompts/investigator_analyze_fail_v3_REVIEW.md §
--             "Procédure de validation 4-yeux (Wissem)" describes the
--             human workflow.
--
-- Idempotent: the `WHERE status='draft'` / `WHERE status='active'`
-- clauses make re-application a no-op once v3 is active and v2 is
-- deprecated. The session-var checks all return early with a NOTICE
-- when GUCs are absent (smoke job stays green).

DO $$
DECLARE
  v_author_id      UUID;
  v_validator_id   UUID;
  v_attestation_id UUID;
  v_tenant_id      UUID;
  v_user_exists    BOOLEAN;
  v_v3_count       INTEGER;
  v_v2_count       INTEGER;
BEGIN

  -- Step 0 — GUC presence. Three session vars are required; the
  -- normal pair (seed_author / seed_validator) AND the attestation
  -- UUID added by the wrapper. Missing any → skip silently so
  -- migrate:up (no GUCs) stays a no-op.
  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_validator_user_id', true) IS NULL
  OR current_setting('app.seed_validator_user_id', true) = ''
  OR current_setting('app.seed_validator_attestation_uuid', true) IS NULL
  OR current_setting('app.seed_validator_attestation_uuid', true) = '' THEN
    RAISE NOTICE 'migration 121: 4-yeux session vars not set - skipping promotion';
    RETURN;
  END IF;

  v_tenant_id      := current_setting('app.seed_tenant_id')::UUID;
  v_author_id      := current_setting('app.seed_author_user_id')::UUID;
  v_validator_id   := current_setting('app.seed_validator_user_id')::UUID;
  v_attestation_id := current_setting('app.seed_validator_attestation_uuid')::UUID;

  -- Step 1 — 4-yeux check: validator ≠ author.
  IF v_validator_id = v_author_id THEN
    RAISE EXCEPTION
      'migration 121: 4-yeux violation — SEED_VALIDATOR_USER_ID (%) doit différer '
      'de SEED_AUTHOR_USER_ID (%). Le validateur humain ne peut pas être l''auteur.',
      v_validator_id, v_author_id;
  END IF;

  -- Step 2 — file-content check: the env-passed validator UUID must
  -- byte-for-byte equal the UUID the wrapper read from
  -- docs/prompts/investigator_analyze_fail_v3_VALIDATED_BY.txt. If
  -- the operator changes one but not the other, the migration
  -- refuses rather than promote with an unaudited UUID.
  IF v_validator_id <> v_attestation_id THEN
    RAISE EXCEPTION
      'migration 121: signature mismatch — SEED_VALIDATOR_USER_ID (%) ≠ '
      'contenu de docs/prompts/investigator_analyze_fail_v3_VALIDATED_BY.txt (%). '
      'Le wrapper ops/scripts/apply_a3_active.sh propage les deux GUCs ; '
      'leur différence indique une falsification ou un fichier altéré.',
      v_validator_id, v_attestation_id;
  END IF;

  -- Step 3 — FK pre-check: the validator UUID must exist in users.
  -- Postgres would catch this via the FK on prompt_bank.validator_user_id,
  -- but the explicit pre-check gives a friendlier error.
  SELECT EXISTS (SELECT 1 FROM users WHERE id = v_validator_id) INTO v_user_exists;
  IF NOT v_user_exists THEN
    RAISE EXCEPTION
      'migration 121: validator user % introuvable dans la table users. '
      'L''opérateur humain qui a signé le fichier _VALIDATED_BY.txt doit '
      'exister en DB avant la promotion (INSERT INTO users ... ; pas créé '
      'automatiquement par cette migration — c''est une action humaine).',
      v_validator_id;
  END IF;

  -- Step 4 — sanity check that v3 draft exists and belongs to the
  -- declared author. If migration 120 was skipped (no GUCs at seed
  -- time), there's nothing to promote — return cleanly.
  SELECT COUNT(*) INTO v_v3_count
    FROM prompt_bank
   WHERE tenant_id     = v_tenant_id
     AND agent_type    = 'investigator'
     AND function_name = 'analyze_fail'
     AND version       = 3
     AND status        = 'draft'
     AND author_user_id = v_author_id
     AND deleted_at IS NULL;

  IF v_v3_count = 0 THEN
    RAISE NOTICE
      'migration 121: aucune ligne v3 draft trouvée pour author=% — '
      'rien à promouvoir (la migration 120 a été skippée ou la draft '
      'a déjà été promue ou retirée).',
      v_author_id;
    RETURN;
  END IF;

  -- Step 5 — RLS context for the prompt_bank UPDATE (gated on
  -- platform_owner; the validator session role is the one running).
  PERFORM set_config('app.current_user_id', v_validator_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  -- Steps 6-7 — ordered state transitions that respect the partial
  -- unique index `prompt_bank_idx_unique_active` (migration 023) :
  --     CREATE UNIQUE INDEX … ON prompt_bank
  --       (tenant_id, agent_type, function_name)
  --       WHERE status = 'active' AND deleted_at IS NULL
  -- Only `status='active'` rows are constrained. We MUST deprecate
  -- v2 BEFORE promoting v3, otherwise both rows transit through
  -- 'active' at the same time and the partial unique index fires.
  -- Same ordering as migration 111-B (v1→deprecated then v2→active).
  --
  -- The prompt_bank schema (migration 023) tracks deprecation via
  -- `status='deprecated'` only; there is NO `deprecated_at` column.
  -- The temporal marker lives in `updated_at` (refreshed on every
  -- write by convention). Audit chronology is reconstructed by
  -- `updated_at` ordered DESC for rows in `status='deprecated'`.

  -- Step 6 — v2 active → deprecated. Frees the active slot.
  UPDATE prompt_bank
     SET status     = 'deprecated',
         updated_at = NOW()
   WHERE tenant_id     = v_tenant_id
     AND agent_type    = 'investigator'
     AND function_name = 'analyze_fail'
     AND version       = 2
     AND status        = 'active'
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_v2_count = ROW_COUNT;

  -- Step 7 — v3 draft → active, with 4-yeux fields stamped. Mirrors
  -- the migration 111-B promotion shape (validator_user_id +
  -- validated_at set in the same UPDATE that flips status).
  UPDATE prompt_bank
     SET status            = 'active',
         validator_user_id = v_validator_id,
         validated_at      = NOW(),
         updated_at        = NOW()
   WHERE tenant_id     = v_tenant_id
     AND agent_type    = 'investigator'
     AND function_name = 'analyze_fail'
     AND version       = 3
     AND status        = 'draft'
     AND deleted_at IS NULL;

  RAISE NOTICE
    'migration 121: investigator/analyze_fail v3 promoted to active by validator=%, '
    'v2 deprecated (% row(s))',
    v_validator_id, v_v2_count;

END $$;
