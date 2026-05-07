-- Migration 104_phase1_foundation.sql
-- Object: schema foundation for Phase 1 launch-sequence corrections.
--         Strictly ADDITIVE + IDEMPOTENT — every statement uses
--         IF NOT EXISTS / ON CONFLICT DO NOTHING / DEFAULT clauses
--         so existing rows are never invalidated.
--
--         Bugs covered (per user's selection 2026-05-08):
--           B7 — messages.linked_run_id column for cross-conversation
--                run hydration (rejeu d'historique)
--           B2 — intent_specialists.requires_run_uniqueness column
--                so the orchestrator's T1 short-circuit reads from
--                DB rather than hardcoded `if intent ==
--                'launch_validation'`. Seeds launch_validation row
--                with TRUE.
--           F  — runs_idempotency table for HTTP-level dedup of
--                POST /api/runs (Idempotency-Key header pattern).
--           B3 — platform_config.t1_run_eta_p50_seconds key used
--                by the frontend to render the ack message ETA
--                instead of a hardcoded "~30 secondes".
--           B6 — prompt_bank seed entry
--                regalica/run_finalized_companion_offer for the
--                proactive Regalica bubble that fires after
--                /finalize when companion_suggestions is non-empty.
--                The text is 100% prompt_bank, the action buttons
--                payload sits in messages.content_json.
--
-- Author: ALGORIA Factory
-- Date: 2026-05-08
-- Depends on: 032_messages.sql, 064_intent_specialists.sql,
--             051_platform_config.sql, 023_prompt_bank.sql.

-- =====================================================================
-- B7 — messages.linked_run_id
-- =====================================================================
-- Nullable FK so existing rows (millions in prod) stay valid.
-- chatbot-py persist_message will populate it when run context is
-- known; legacy rows keep NULL. The conversations /messages route
-- will surface it so the frontend can rebind lastRunInChat on
-- conversation hydration.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS linked_run_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'messages_fk_linked_run'
      AND table_name = 'messages'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_fk_linked_run
      FOREIGN KEY (linked_run_id) REFERENCES validation_runs(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS messages_idx_linked_run
  ON messages (linked_run_id)
  WHERE linked_run_id IS NOT NULL;

-- =====================================================================
-- B2 — intent_specialists.requires_run_uniqueness
-- =====================================================================
-- DB-driven flag. Default FALSE so existing rows (zoom, cluster,
-- citation, …) keep their unchanged behaviour. Migration body below
-- flips launch_validation to TRUE once the column exists.

ALTER TABLE intent_specialists
  ADD COLUMN IF NOT EXISTS requires_run_uniqueness BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = '' THEN
    RAISE NOTICE 'migration 104: GUCs not set - skipping launch_validation flag flip';
  ELSE
    v_tenant_id := current_setting('app.seed_tenant_id')::UUID;
    -- Set to TRUE only on the active row(s). Idempotent.
    UPDATE intent_specialists
       SET requires_run_uniqueness = TRUE,
           updated_at = NOW()
     WHERE intent_type = 'launch_validation'
       AND status = 'active'
       AND deleted_at IS NULL
       AND requires_run_uniqueness = FALSE;
  END IF;
END $$;

-- =====================================================================
-- F — runs_idempotency table
-- =====================================================================
-- Per-tenant HTTP idempotency: when the frontend retries POST /runs
-- with the same Idempotency-Key, the API short-circuits to the
-- previously-created run_id rather than spawning a duplicate row.
-- TTL is enforced by the API (24h reasonable) — no scheduled cleanup
-- here yet (Phase 2 if the table grows).

CREATE TABLE IF NOT EXISTS runs_idempotency (
  idempotency_key   TEXT NOT NULL,
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  run_id            UUID NOT NULL REFERENCES validation_runs(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Per-tenant dedup: same key in two different tenants stays distinct.
  PRIMARY KEY (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS runs_idempotency_idx_run
  ON runs_idempotency (run_id);

CREATE INDEX IF NOT EXISTS runs_idempotency_idx_created
  ON runs_idempotency (created_at);

-- RLS: read-only for the tenant's own keys, no direct INSERT (the
-- /api/runs route handles dedup with elevated session).
ALTER TABLE runs_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs_idempotency FORCE ROW LEVEL SECURITY;

CREATE POLICY runs_idempotency_select ON runs_idempotency
  FOR SELECT
  USING (tenant_id = current_app_tenant_id());

REVOKE INSERT, UPDATE, DELETE ON runs_idempotency FROM regflow_app;
GRANT INSERT, SELECT ON runs_idempotency TO regflow_app;

-- =====================================================================
-- B3 — platform_config.t1_run_eta_p50_seconds seed
-- =====================================================================
-- Bootstrap value used when the historical p50 cannot yet be computed
-- (cold start tenant). The frontend renders "le contrôle prend
-- environ X secondes" reading this key. Operators can update via
-- regular platform_config UPDATE (gated by platform_owner role).

INSERT INTO platform_config (config_key, config_value, description)
VALUES (
  't1_run_eta_p50_seconds',
  '30'::JSONB,
  'Estimated p50 latency (seconds) of a complete T1 validation. ' ||
  'Seeded at 30s; future migrations or operator UPDATE can refresh ' ||
  'from validation_runs (completed_at - started_at) percentile.'
)
ON CONFLICT (config_key) DO NOTHING;

-- =====================================================================
-- B6 — regalica/run_finalized_companion_offer prompt seed
-- =====================================================================
-- Auto-fires from chatbot-py /upload after T1 /finalize success when
-- _load_run_dependency_state surfaces missing_companions. The prompt
-- composes a short banker-readable message + a structured
-- payload_data block (JSON) that the frontend renders as inline
-- action buttons. Zero regex / zero hardcoded text on the frontend.
--
-- Status='draft' to mirror the prompt_bank 4-eyes pattern; promotion
-- to 'active' happens in a follow-up migration once the operator
-- approves the wording.

DO $$
DECLARE
  v_tenant_id  UUID;
  v_author_id  UUID;
  v_valid_from TIMESTAMPTZ;
BEGIN
  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_valid_from', true) IS NULL
  OR current_setting('app.seed_valid_from', true) = '' THEN
    RAISE NOTICE 'migration 104: GUCs not set - skipping run_finalized_companion_offer seed';
    RETURN;
  END IF;

  v_tenant_id  := current_setting('app.seed_tenant_id')::UUID;
  v_author_id  := current_setting('app.seed_author_user_id')::UUID;
  v_valid_from := current_setting('app.seed_valid_from')::TIMESTAMPTZ;

  PERFORM set_config('app.current_user_id', v_author_id::text, true);
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  INSERT INTO prompt_bank (
    tenant_id, agent_type, function_name, version,
    template, input_schema, output_schema,
    temperature, max_tokens, thinking_enabled, target_model,
    output_contract, status, valid_from, author_user_id
  )
  VALUES (
    v_tenant_id,
    'regalica',
    'run_finalized_companion_offer',
    1,
    $TMPL$Vous composez UNE bulle Regalica auto-poussée APRÈS la finalisation du run T1, lorsque le moteur a détecté qu'au moins une annexe sœur déclarée par le référentiel et présente dans la grappe inter-annexes du RDG est manquante du dépôt.

────────────────────────────────────────
INPUT REÇU (dans le user prompt, JSON sérialisé)
────────────────────────────────────────
primary_annexe         : str — code annexe principal du run
arrete_date            : str — JJ/MM/AAAA
missing_companions     : list[str] — codes annexes manquantes
parasitic_fail_count   : int — nombre de règles inter-annexes parasitées
companion_suggestions  : dict[str, list[{upload_id, file_name, uploaded_at, ...}]]
                         (les uploads existants matchant code+période)

────────────────────────────────────────
SORTIE — JSON STRICT
────────────────────────────────────────
{
  "markdown": "<bulle Regalica en prose, vouvoiement bancaire, 1-2 phrases>",
  "buttons": [
    {
      "kind": "use_existing",
      "annexe_code": "<code>",
      "upload_id": "<uuid>",
      "label_fr": "<texte court bouton FR>",
      "label_en": "<texte court bouton EN>",
      "label_ar": "<texte court bouton AR>"
    },
    {
      "kind": "upload_new",
      "annexe_code": "<code>",
      "label_fr": "<texte court bouton FR>",
      "label_en": "<texte court bouton EN>",
      "label_ar": "<texte court bouton AR>"
    }
  ]
}

────────────────────────────────────────
RÈGLES
────────────────────────────────────────
1. La prose markdown nomme l'annexe principale entre backticks, liste les manquantes en monospace, et cite parasitic_fail_count.
2. Pour chaque annexe manquante : si companion_suggestions[annexe_code] non vide, rendre UN bouton kind="use_existing" avec le upload_id le plus récent (premier de la liste). PUIS rendre UN bouton kind="upload_new" pour permettre un dépôt frais.
3. Si companion_suggestions[annexe_code] vide : un seul bouton kind="upload_new".
4. Vouvoiement, registre bancaire, pas d'emoji, pas de superlatif.
5. Réponds UNIQUEMENT par le JSON ci-dessus, aucun préambule.$TMPL$,
    $INPUT_SCHEMA${
      "type": "object",
      "required": ["primary_annexe", "arrete_date", "missing_companions",
                   "parasitic_fail_count", "companion_suggestions"],
      "properties": {
        "primary_annexe":         {"type": "string"},
        "arrete_date":            {"type": "string"},
        "missing_companions":     {"type": "array", "items": {"type": "string"}},
        "parasitic_fail_count":   {"type": "integer", "minimum": 0},
        "companion_suggestions":  {"type": "object"}
      },
      "additionalProperties": false
    }$INPUT_SCHEMA$::JSONB,
    $OUTPUT_SCHEMA${
      "type": "object",
      "required": ["markdown", "buttons"],
      "additionalProperties": false,
      "properties": {
        "markdown": {"type": "string", "minLength": 20, "maxLength": 1000},
        "buttons": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["kind", "annexe_code", "label_fr", "label_en", "label_ar"],
            "additionalProperties": false,
            "properties": {
              "kind":        {"type": "string", "enum": ["use_existing", "upload_new"]},
              "annexe_code": {"type": "string"},
              "upload_id":   {"type": "string"},
              "label_fr":    {"type": "string", "minLength": 1, "maxLength": 80},
              "label_en":    {"type": "string", "minLength": 1, "maxLength": 80},
              "label_ar":    {"type": "string", "minLength": 1, "maxLength": 80}
            }
          }
        }
      }
    }$OUTPUT_SCHEMA$::JSONB,
    0.5, 1024, FALSE, 'gemini-2.5-flash',
    'json', 'draft', v_valid_from, v_author_id
  )
  ON CONFLICT (tenant_id, agent_type, function_name, version) DO NOTHING;

  RAISE NOTICE 'migration 104: run_finalized_companion_offer prompt seeded (draft)';
END $$;
