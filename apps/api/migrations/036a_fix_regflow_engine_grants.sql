-- Migration 036a_fix_regflow_engine_grants.sql
-- Object: revoke table-level UPDATE on validation_runs from regflow_engine,
--         then re-grant the §23.1 column-level UPDATE list.
-- Author: ALGORIA Factory
-- Date: 2026-04-26
-- Depends on: 036_grants_regflow_app.sql
-- References: Document 6 §23.1
--
-- 036 grants table-level UPDATE on ALL TABLES to regflow_engine
-- (line 71), then grants column-level UPDATE on the 22 §23.1 columns
-- of validation_runs (lines 97-119). It does NOT revoke the table-
-- level UPDATE — so the column-level GRANT is shadowed by the broader
-- table-level GRANT and `has_column_privilege('regflow_engine', ...,
-- 'UPDATE')` returns TRUE for every column, including immutable ones
-- (primary_annexe_code, arrete_date, primary_upload_id) that test 036
-- expects to be FALSE.
--
-- Postgres treats `REVOKE UPDATE ON table FROM role` as revoking BOTH
-- table-level and column-level UPDATE. To restrict regflow_engine to
-- the §23.1 column subset, we therefore:
--   1. REVOKE UPDATE ON validation_runs (drops table + column grants)
--   2. GRANT UPDATE (col, …) — re-emit the §23.1 list
-- Column list verbatim from 036 lines 97-119.
--
-- 036 is immutable; this amendment closes the gap. Table name is
-- unqualified and resolves via search_path, mirroring 036's existing
-- REVOKE pattern.

REVOKE UPDATE ON validation_runs FROM regflow_engine;

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
