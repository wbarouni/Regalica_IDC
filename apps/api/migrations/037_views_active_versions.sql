-- Migration 037_views_active_versions.sql
-- Object: active-version views over bitemporal tables (rules,
--         prompt_bank, 14 referentials_*)
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 008-021 (referentials), 022 (rules), 023 (prompt_bank)
-- References: Document 6 §26 entry 037
--
-- Sixteen read-only convenience views, one per versioned table. Each
-- view filters to the active snapshot at query time:
--   * status = 'active'                  — promoted version
--   * valid_to IS NULL OR valid_to > NOW() — currently in effect
--   * deleted_at IS NULL                  — not soft-deleted
--
-- The three predicates are uniform across all 16 source tables — see
-- migrations 008-023 for the bitemporal column contract (valid_from,
-- valid_to, status, deleted_at). Queries against the view at time T
-- return the rows that were the effective canonical configuration at
-- T, masking drafts, deprecated versions, and archived rows.

-- Rules -----------------------------------------------------------------
CREATE OR REPLACE VIEW rules_active AS
  SELECT * FROM rules
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

-- Prompt bank -----------------------------------------------------------
CREATE OR REPLACE VIEW prompt_bank_active AS
  SELECT * FROM prompt_bank
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

-- Referentials (14 tables) ---------------------------------------------
CREATE OR REPLACE VIEW referentials_annexes_active AS
  SELECT * FROM referentials_annexes
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

CREATE OR REPLACE VIEW referentials_rubriques_active AS
  SELECT * FROM referentials_rubriques
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

CREATE OR REPLACE VIEW referentials_colonnes_active AS
  SELECT * FROM referentials_colonnes
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

CREATE OR REPLACE VIEW referentials_xml_structures_active AS
  SELECT * FROM referentials_xml_structures
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

CREATE OR REPLACE VIEW referentials_sentinels_active AS
  SELECT * FROM referentials_sentinels
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

CREATE OR REPLACE VIEW referentials_banks_active AS
  SELECT * FROM referentials_banks
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

CREATE OR REPLACE VIEW referentials_currencies_active AS
  SELECT * FROM referentials_currencies
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

CREATE OR REPLACE VIEW referentials_sectors_active AS
  SELECT * FROM referentials_sectors
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

CREATE OR REPLACE VIEW referentials_identifier_types_active AS
  SELECT * FROM referentials_identifier_types
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

CREATE OR REPLACE VIEW referentials_consolidation_methods_active AS
  SELECT * FROM referentials_consolidation_methods
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

CREATE OR REPLACE VIEW referentials_instruments_active AS
  SELECT * FROM referentials_instruments
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

CREATE OR REPLACE VIEW referentials_contract_types_active AS
  SELECT * FROM referentials_contract_types
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

CREATE OR REPLACE VIEW referentials_error_codes_active AS
  SELECT * FROM referentials_error_codes
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;

CREATE OR REPLACE VIEW referentials_annexe_dependencies_active AS
  SELECT * FROM referentials_annexe_dependencies
   WHERE status = 'active'
     AND (valid_to IS NULL OR valid_to > NOW())
     AND deleted_at IS NULL;
