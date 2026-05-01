-- Migration 053_xml_uploads_status.sql
-- Object: add `status` column to xml_uploads to track the application-
--         level lifecycle of an upload (post-receipt, pre-validation).
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 024_xml_uploads.sql
-- References: commits 41a-c (XML T0 pipeline), docs/04-WORKFLOW-
--             UTILISATEUR-COMPLET.md §T0
--
-- xml_uploads already carries `xsd_validation_status` (pending|passed|
-- failed) which describes the outcome of an XSD validation step. The
-- new `status` column tracks a different concern: what the upload is
-- doing in the application's own lifecycle.
--   pending   — just received, header parsed, awaiting orchestration
--   parsed    — T0 agents have walked the body, structure is known
--   archived  — soft-archived, not used by any active run anymore
--
-- Defaults to 'pending' so existing rows are valid without backfill.
-- The CHECK is permissive on the enum values; future statuses land
-- via a follow-up migration adding to the IN-list.

ALTER TABLE xml_uploads
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'xml_uploads_ck_status'
  ) THEN
    ALTER TABLE xml_uploads
      ADD CONSTRAINT xml_uploads_ck_status
      CHECK (status IN ('pending', 'parsed', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS xml_uploads_idx_status
  ON xml_uploads (tenant_id, status)
  WHERE deleted_at IS NULL;
