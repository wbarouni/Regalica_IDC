-- Migration 008a_widen_annexe_domain.sql
-- Object: widen referentials_annexes.domain from VARCHAR(50) to TEXT
-- Author: ALGORIA Factory
-- Date: 2026-04-26
-- Depends on: 008_referentials_annexes.sql
-- References: Document 6 §9.1, §9.2 (annexes specific columns)
--
-- 008_referentials_annexes.sql declared domain as VARCHAR(50). The
-- official BCT source (rdg.xlsx LIB_DOMAINE) contains values up to
-- 55 characters — VARCHAR(50) truncates real regulator data. TEXT is
-- consistent with the `label TEXT` already declared on the same
-- table (008 line 13) and avoids arbitrary length constraints on
-- regulator-controlled vocabulary that may grow over time.
--
-- 008 is immutable — this amendment widens in place.

ALTER TABLE referentials_annexes ALTER COLUMN domain TYPE TEXT;
