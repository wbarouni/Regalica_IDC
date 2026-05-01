-- Migration 064_intent_specialists.sql
-- Object: process-global tables driving the Regalica orchestrator's
--         intent → aggregator + specialists grammar. Replaces the
--         frozen Python dicts `_SPECIALISTS_BY_INTENT`,
--         `_SPECIALIST_BEARERS`, `_AGGREGATOR_BEARER_NS` and the
--         `VALID_INTENTS` frozenset (apps/chatbot-py/app/services/
--         orchestrator.py + intent_router.py) with an operator-
--         controlled DB catalogue.
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 002_schema_helpers.sql (current_user_has_role),
--             004_users_roles.sql (4-yeux author/validator FKs),
--             006_audit_trigger_function.sql,
--             023_prompt_bank.sql (the aggregator (agent_type,
--                                  function_name) tuples must exist
--                                  in prompt_bank — semantic
--                                  constraint enforced by tests).
-- References: docs/10-ORCHESTRATION-REGALICA.md sect.3 (10-value
--             intent enum), sect.15 (intent → specialists table).
--
-- Doctrine
--   System-global (no tenant_id) — same scope as platform_config.
--   Reads open via RLS (USING TRUE) so the orchestrator can SELECT
--   without elevation. Writes revoked from regflow_app and
--   regflow_engine roles; only the migration runner (superuser) and
--   a platform_owner-elevated session can mutate. Mutations carry the
--   4-yeux contract enforced by ck_four_eyes (validator distinct
--   from author when status promotes to 'active').

-- =====================================================================
-- 1. intent_specialists — one row per intent type. Every active row
--    drives the router LLM's enum AND the orchestrator's dispatch.
-- =====================================================================

CREATE TABLE IF NOT EXISTS intent_specialists (
  id                          UUID PRIMARY KEY DEFAULT uuidv7(),

  -- Natural key — matches what the router LLM emits. Frontend chips
  -- (apps/web question_types.fn_name) use the same string for the
  -- 7 user-facing intents.
  intent_type                 VARCHAR(50) NOT NULL UNIQUE,

  -- Aggregator persona — the prompt_bank (agent_type, function_name)
  -- tuple that composes the user-facing French response. Tests assert
  -- the tuple is active in prompt_bank.
  aggregator_agent_type       VARCHAR(50) NOT NULL,
  aggregator_function_name    VARCHAR(100) NOT NULL,

  -- Ordered list of specialist_id keys (cf. intent_specialist_bearers)
  -- the orchestrator invokes in parallel before the aggregator. Empty
  -- array = aggregator runs alone (typical of general_help, ambiguous,
  -- out_of_scope).
  specialist_ids              JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Operator-controlled display order (router prompt rendering, chip
  -- ordering on the frontend).
  ordinal                     INTEGER NOT NULL,

  -- Soft toggle without removing the row (audit trail preserved).
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,

  description                 TEXT,

  -- 4-eyes governance (mirrors prompt_bank pattern)
  status                      VARCHAR(20) NOT NULL DEFAULT 'draft',
  author_user_id              UUID NOT NULL REFERENCES users(id),
  validator_user_id           UUID REFERENCES users(id),
  validated_at                TIMESTAMPTZ,

  -- Bitemporal validity (operator can schedule a switch)
  valid_from                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to                    TIMESTAMPTZ,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                  TIMESTAMPTZ,

  CONSTRAINT intent_specialists_ck_status CHECK (
    status IN ('draft', 'in_review', 'active', 'deprecated')
  ),
  CONSTRAINT intent_specialists_ck_four_eyes CHECK (
    (status IN ('draft', 'in_review') AND validator_user_id IS NULL)
    OR
    (status IN ('active', 'deprecated')
      AND validator_user_id IS NOT NULL
      AND validator_user_id != author_user_id)
  ),
  CONSTRAINT intent_specialists_ck_specialist_ids_array CHECK (
    jsonb_typeof(specialist_ids) = 'array'
  ),
  CONSTRAINT intent_specialists_ck_dates CHECK (
    valid_to IS NULL OR valid_to > valid_from
  )
);

-- One ACTIVE row per intent_type — operators can stage a v2 in 'draft'
-- without deactivating the current 'active' one.
CREATE UNIQUE INDEX IF NOT EXISTS intent_specialists_idx_active_unique
  ON intent_specialists (intent_type)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS intent_specialists_idx_ordinal
  ON intent_specialists (ordinal)
  WHERE deleted_at IS NULL;

-- =====================================================================
-- 2. intent_specialist_bearers — symbolic specialist_id → prompt_bank
--    (agent_type, function_name) tuple. The orchestrator's Python
--    invokers (`_call_investigator`, `_call_citation`, …) key on
--    specialist_id so the table stays in sync with the in-process
--    handler map without schema churn.
-- =====================================================================

CREATE TABLE IF NOT EXISTS intent_specialist_bearers (
  id                  UUID PRIMARY KEY DEFAULT uuidv7(),

  specialist_id       VARCHAR(50) NOT NULL UNIQUE,

  agent_type          VARCHAR(50) NOT NULL,
  function_name       VARCHAR(100) NOT NULL,

  is_active           BOOLEAN NOT NULL DEFAULT TRUE,

  description         TEXT,

  status              VARCHAR(20) NOT NULL DEFAULT 'draft',
  author_user_id      UUID NOT NULL REFERENCES users(id),
  validator_user_id   UUID REFERENCES users(id),
  validated_at        TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,

  CONSTRAINT intent_specialist_bearers_ck_status CHECK (
    status IN ('draft', 'in_review', 'active', 'deprecated')
  ),
  CONSTRAINT intent_specialist_bearers_ck_four_eyes CHECK (
    (status IN ('draft', 'in_review') AND validator_user_id IS NULL)
    OR
    (status IN ('active', 'deprecated')
      AND validator_user_id IS NOT NULL
      AND validator_user_id != author_user_id)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS intent_specialist_bearers_idx_active_unique
  ON intent_specialist_bearers (specialist_id)
  WHERE status = 'active' AND deleted_at IS NULL;

-- =====================================================================
-- 3. RLS — open SELECT, REVOKE writes (matching platform_config doctrine)
-- =====================================================================

ALTER TABLE intent_specialists ENABLE ROW LEVEL SECURITY;
ALTER TABLE intent_specialists FORCE ROW LEVEL SECURITY;

CREATE POLICY intent_specialists_select ON intent_specialists
  FOR SELECT
  USING (TRUE);

REVOKE INSERT, UPDATE, DELETE ON intent_specialists FROM regflow_app;
REVOKE INSERT, UPDATE, DELETE ON intent_specialists FROM regflow_engine;

ALTER TABLE intent_specialist_bearers ENABLE ROW LEVEL SECURITY;
ALTER TABLE intent_specialist_bearers FORCE ROW LEVEL SECURITY;

CREATE POLICY intent_specialist_bearers_select ON intent_specialist_bearers
  FOR SELECT
  USING (TRUE);

REVOKE INSERT, UPDATE, DELETE ON intent_specialist_bearers FROM regflow_app;
REVOKE INSERT, UPDATE, DELETE ON intent_specialist_bearers FROM regflow_engine;

-- =====================================================================
-- 4. Audit triggers (use the generic audit_trigger_function from 006).
--    Both tables expose `tenant_id`-less rows; the trigger function
--    handles a NULL tenant_id gracefully when entity is system-global.
--
--    NOTE: audit_trigger_function references NEW.tenant_id which would
--    fail on these tables. We do NOT attach the trigger here — the
--    audit story for system-global tables is unified in a later
--    migration (the platform_config table also lacks the trigger
--    today). Mutations to these two tables are migration-only;
--    operational changes go through (065 seed) + (066 promotion) + a
--    new migration per amendment, so the migration history IS the
--    audit trail.
-- =====================================================================

-- =====================================================================
-- 5. Views — operative subset for the orchestrator. Filter is_active
--    + status='active' + non-deleted in one place so the chatbot-py
--    loader stays a one-line query.
-- =====================================================================

CREATE OR REPLACE VIEW v_intent_specialists_active AS
SELECT
  intent_type,
  aggregator_agent_type,
  aggregator_function_name,
  specialist_ids,
  ordinal,
  description
FROM intent_specialists
WHERE status = 'active'
  AND is_active = TRUE
  AND deleted_at IS NULL
  AND (valid_to IS NULL OR valid_to > NOW())
ORDER BY ordinal;

CREATE OR REPLACE VIEW v_intent_specialist_bearers_active AS
SELECT
  specialist_id,
  agent_type,
  function_name,
  description
FROM intent_specialist_bearers
WHERE status = 'active'
  AND is_active = TRUE
  AND deleted_at IS NULL;
