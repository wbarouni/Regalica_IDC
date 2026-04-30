-- Migration 049_question_types.sql
-- Object: system-global catalogue of T2 investigation question types
--         (the 7 user-facing suggestion chips on Workspace).
-- Author: ALGORIA Factory
-- Date: 2026-04-30
-- Depends on: 001_extensions.sql (uuidv7), 036_grants_regflow_app.sql
-- References: docs/04-WORKFLOW-UTILISATEUR-COMPLET.md §T2 (7 question
--             types), docs/PHASE-B-PLAN.md (chips depuis DB)
--
-- Catalogue table — no tenant_id. The 7 question types are the same
-- across all tenants (zoom, cluster, historical, citation, simulation,
-- sanction, plan). The mapping fn_name -> regalica.aggregate_<fn>
-- prompt is performed in chatbot-py (not in this table) so that
-- adding an 8th type is a (migration + seed) change here without
-- touching the frontend wiring.
--
-- RLS: SELECT open to every authenticated role; writes are revoked
-- from regflow_app and regflow_engine — only the migration runner
-- (superuser) and platform_owner-elevated sessions can mutate the
-- catalogue.

CREATE TABLE IF NOT EXISTS question_types (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  fn_name         VARCHAR(64)  NOT NULL UNIQUE,
  label_i18n_key  VARCHAR(128) NOT NULL,
  ordinal         SMALLINT     NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT question_types_ck_ordinal_range
    CHECK (ordinal BETWEEN 1 AND 7),

  CONSTRAINT question_types_ck_fn_name_format
    CHECK (fn_name ~ '^[a-z][a-z0-9_]*$'),

  CONSTRAINT question_types_ck_label_key_format
    CHECK (label_i18n_key ~ '^[a-z][a-zA-Z0-9_.]*$')
);

-- Partial index on the live catalogue. Almost every query is
-- "ordered active rows" — this index is the workload's hot path.
CREATE INDEX IF NOT EXISTS question_types_idx_active_ordinal
  ON question_types (ordinal)
  WHERE is_active = TRUE AND deleted_at IS NULL;

-- RLS: open SELECT, no INSERT/UPDATE/DELETE policy (so writes are
-- gated by table-level GRANT/REVOKE only). The migration runner
-- ships as superuser and bypasses RLS — seed migrations work.
ALTER TABLE question_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_types FORCE ROW LEVEL SECURITY;

CREATE POLICY question_types_select ON question_types
  FOR SELECT
  USING (TRUE);

-- Catalogue is read-only for application roles. regflow_app +
-- regflow_engine inherit base SELECT/INSERT/UPDATE/DELETE from the
-- schema-wide grant in 036; the REVOKE below strips writes back.
REVOKE INSERT, UPDATE, DELETE ON question_types FROM regflow_app;
REVOKE INSERT, UPDATE, DELETE ON question_types FROM regflow_engine;
