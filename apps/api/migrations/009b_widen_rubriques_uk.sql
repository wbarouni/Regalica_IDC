-- Migration 009b_widen_rubriques_uk.sql
-- Object: include annexe_code in UNIQUE on referentials_rubriques
-- Author: ALGORIA Factory
-- Date: 2026-04-26
-- Depends on: 009_referentials_rubriques.sql, 009a_nullable_label_rubriques.sql
-- References: Document 6 §9.1 (rubriques referential)
--
-- BCT reality: the same rubrique code is reused across N annexes
-- (e.g. AC030000000000 appears in 8 annexes — 00, 510, 520, 530,
-- 560, 640, 730, 910). 009's UK (tenant_id, code, valid_from)
-- silently dropped 310/1141 real BCT entries via ON CONFLICT in the
-- 039 seed loader, because two distinct (annexe, code) pairs
-- collapsed onto the same UK. The natural key is in fact
-- (tenant_id, annexe_code, code, valid_from): a rubrique entry is
-- a (annexe, code) pair, not a code alone.
--
-- 009 is immutable; this amendment widens the UK in place. NULL
-- annexe_code remains safe: NULL is treated as "distinct" by SQL
-- UNIQUE constraints (NULL ≠ NULL), so existing test inserts that
-- omit annexe_code (008-021 test) are unaffected.

ALTER TABLE referentials_rubriques
  DROP CONSTRAINT ref_rubriques_uk_natural;

ALTER TABLE referentials_rubriques
  ADD CONSTRAINT ref_rubriques_uk_natural
  UNIQUE (tenant_id, annexe_code, code, valid_from);
