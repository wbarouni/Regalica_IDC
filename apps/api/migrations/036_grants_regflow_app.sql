-- Migration 036_grants_regflow_app.sql
-- Object: PostgreSQL cluster login roles regflow_app / regflow_engine /
--         regflow_readonly + per-role GRANT / REVOKE matrix
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: all prior migrations that create tables referenced by the
--             REVOKE / GRANT statements (validation_runs, audit_log,
--             messages in particular)
-- References: Document 6 §23.1 (validation_runs column grants),
--             §23.2 (audit_log REVOKE), §23.3 (messages REVOKE),
--             §26 entry 036
--
-- Three cluster-global login roles:
--   regflow_app       — default application role for apps/api and
--                       apps/chatbot-py. Full R/W on business tables,
--                       but REVOKEd from UPDATE/DELETE on
--                       validation_runs (engine-only), audit_log
--                       (insert-only by trigger), and messages
--                       (insert-only per §23.3).
--   regflow_engine    — role used by the validation pipeline to
--                       write status transitions and produced
--                       artefacts on validation_runs. Granted the
--                       verbatim 22-column UPDATE list from §23.1.
--   regflow_readonly  — cluster login role for support / audit
--                       personas. SELECT-only across the schema.
--
-- Schema scoping
--   The "ALL TABLES / SEQUENCES IN SCHEMA" grants target
--   current_schema(): in production this is public (the migrator's
--   default search_path), in the test harness it is the throwaway
--   schema set by _setup.ts. The schema-qualified form is built
--   dynamically so the migration works in both contexts.
--
-- Role idempotency
--   CREATE ROLE is wrapped in a DO / IF NOT EXISTS guard. Cluster-
--   global roles persist across schema teardowns in the test harness,
--   so re-running the migration must not fail.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'regflow_app') THEN
    CREATE ROLE regflow_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'regflow_engine') THEN
    CREATE ROLE regflow_engine LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'regflow_readonly') THEN
    CREATE ROLE regflow_readonly LOGIN;
  END IF;
END $$;

DO $$
DECLARE
  s TEXT := current_schema();
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO regflow_app, regflow_engine, regflow_readonly', s);

  -- regflow_app: full R/W base grants, default privileges for future tables.
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO regflow_app', s);
  EXECUTE format(
    'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO regflow_app', s);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO regflow_app', s);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO regflow_app', s);

  -- regflow_engine: same base grants (specific column-level refinements
  -- on validation_runs follow below).
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO regflow_engine', s);
  EXECUTE format(
    'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO regflow_engine', s);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO regflow_engine', s);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO regflow_engine', s);

  -- regflow_readonly: SELECT only, plus default privileges for future tables.
  EXECUTE format(
    'GRANT SELECT ON ALL TABLES IN SCHEMA %I TO regflow_readonly', s);
  EXECUTE format(
    'GRANT SELECT ON ALL SEQUENCES IN SCHEMA %I TO regflow_readonly', s);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT ON TABLES TO regflow_readonly', s);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT ON SEQUENCES TO regflow_readonly', s);
END $$;

-- §23.1 — validation_runs: strip UPDATE/DELETE from regflow_app, then
-- grant the specific 22-column UPDATE to regflow_engine. Column list
-- is verbatim from §23.1; changing it requires a doc update + a new
-- amendment migration. Table names below are unqualified and resolve
-- via search_path, so they work in both production (public schema)
-- and the test harness (throwaway schema).
REVOKE UPDATE, DELETE ON validation_runs FROM regflow_app;
GRANT UPDATE (
  is_signed,
  signed_at,
  signed_by_user_id,
  signed_xml_hash,
  completed_at,
  total_rules_evaluated,
  total_pass,
  total_fail_severe,
  total_fail_rounding,
  conformity_rate,
  execution_time_ms,
  status,
  step1_xsd_status,
  step1_xsd_duration_ms,
  step2_embedded_status,
  step2_embedded_duration_ms,
  step3_rdg_status,
  step3_rdg_duration_ms,
  synthesis_artifact,
  deliverable_c_artifact,
  conversation_id
) ON validation_runs TO regflow_engine;

-- §23.2 — audit_log: insert-only by audit_trigger_function. UPDATE /
-- DELETE are rejected at trigger level anyway, but revoking the table
-- privilege is belt-and-suspenders against bypass attempts.
REVOKE UPDATE, DELETE ON audit_log FROM regflow_app;
REVOKE UPDATE, DELETE ON audit_log FROM regflow_engine;

-- §23.3 — messages: insert-only per the immutability trigger in 032.
REVOKE UPDATE, DELETE ON messages FROM regflow_app;
REVOKE UPDATE, DELETE ON messages FROM regflow_engine;
