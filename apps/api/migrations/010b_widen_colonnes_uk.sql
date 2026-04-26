-- Migration 010b_widen_colonnes_uk.sql
-- Object: include annexe_code in UNIQUE on referentials_colonnes
-- Author: ALGORIA Factory
-- Date: 2026-04-26
-- Depends on: 010_referentials_colonnes.sql, 010a_nullable_label_colonnes.sql
-- References: Document 6 §9.1 (colonnes referential)
--
-- BCT reality: column codes C001..C044 are reused across all 52
-- annexes (e.g. C001 appears in 42 annexes). 010's UK
-- (tenant_id, code, valid_from) would silently drop 371/415 real
-- BCT entries via the upcoming 040 ON CONFLICT clause — every
-- (annexe, column_number) pair after the first collapses onto the
-- same UK. The natural key is in fact
-- (tenant_id, annexe_code, code, valid_from): a colonne entry is
-- a (annexe, column_number) pair, not a column number alone.
--
-- 010 is immutable; this amendment widens the UK in place. NULL
-- annexe_code remains safe — NULL ≠ NULL in SQL UNIQUE — so the
-- existing test 008-021 inserts (which omit annexe_code) keep
-- working without change.

ALTER TABLE referentials_colonnes
  DROP CONSTRAINT ref_colonnes_uk_natural;

ALTER TABLE referentials_colonnes
  ADD CONSTRAINT ref_colonnes_uk_natural
  UNIQUE (tenant_id, annexe_code, code, valid_from);
