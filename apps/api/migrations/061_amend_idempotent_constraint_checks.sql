-- Migration 061_amend_idempotent_constraint_checks.sql
-- Object: amend the cross-schema-bleed in three earlier migrations whose
--         "constraint already exists?" guards used unfiltered
--         information_schema / pg_constraint lookups. The bug is silent
--         in production (constraints get created exactly once) but
--         breaks every test schema started from a database that
--         already has the constraints in another schema (typically
--         `public` from a prior dev `pnpm migrate:up`): the broad
--         existence check sees the public-schema row, the migration
--         skips creation in the test schema, and the constraint is
--         missing where the test expects it.
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 027_clusters.sql (vfd_fk_cluster on validation_fail_details),
--             031_conversations.sql (validation_runs_fk_conversation),
--             053_xml_uploads_status.sql (xml_uploads_ck_status)
-- References: docs/06-SCHEMA-SQL-COMPLET.md sect.21 (idempotency rules).
--
-- Doctrine
--   Existing applied migrations are immutable (their sha256 is recorded
--   in schema_migrations). Fixing the bug therefore requires a NEW
--   migration that re-checks each constraint with a properly schema-
--   filtered pg_constraint join and adds it when missing in the
--   current_schema(). On any environment where the original migration
--   already created the constraint (CI fresh, dev/prod after first
--   apply), this migration is a no-op.
--
-- Idempotency
--   Each block is guarded by a pg_constraint lookup joined to pg_class
--   + pg_namespace and filtered to current_schema(). The ALTER TABLE
--   only runs when the constraint is genuinely missing in this
--   particular schema. Re-applying this migration mutates nothing.

-- 1. validation_fail_details.cluster_id -> clusters(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE c.conname = 'vfd_fk_cluster'
       AND t.relname = 'validation_fail_details'
       AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE validation_fail_details
      ADD CONSTRAINT vfd_fk_cluster
      FOREIGN KEY (cluster_id) REFERENCES clusters(id);
  END IF;
END $$;

-- 2. validation_runs.conversation_id -> conversations(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE c.conname = 'validation_runs_fk_conversation'
       AND t.relname = 'validation_runs'
       AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE validation_runs
      ADD CONSTRAINT validation_runs_fk_conversation
      FOREIGN KEY (conversation_id) REFERENCES conversations(id);
  END IF;
END $$;

-- 3. xml_uploads.status CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE c.conname = 'xml_uploads_ck_status'
       AND t.relname = 'xml_uploads'
       AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE xml_uploads
      ADD CONSTRAINT xml_uploads_ck_status
      CHECK (status IN ('pending', 'parsed', 'archived'));
  END IF;
END $$;
