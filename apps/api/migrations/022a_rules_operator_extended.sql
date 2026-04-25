-- Migration 022a_rules_operator_extended.sql
-- Object: extend rules.rules_ck_operator CHECK to accept SUM and VA
-- Author: ALGORIA Factory
-- Date: 2026-04-25
-- Depends on: 022_rules.sql
-- References: Document 6 §7
--
-- The base 022_rules.sql declares
--   CONSTRAINT rules_ck_operator CHECK (operator IN
--     ('=', '>=', '<=', '>', '<', 'MAX', 'MIN'))
-- but the source RDG.xlsx (4 611 BCT rules) uses two additional
-- operators not anticipated when the base migration was written:
--   SUM  (405 rules) — sommation sur périmètre consolidé
--   VA   ( 26 rules) — comparaison en valeur absolue
-- This amendment widens the constraint so the upcoming RDG seed
-- loader (commit 19) does not reject those 431 rows at INSERT.
--
-- Implemented as a Flyway-style amendment per
-- apps/api/migrations/README.md §"When to use an amendment id" —
-- the base 022_rules.sql is left untouched to preserve its
-- checksum and avoid a `migrate:verify` drift.
--
-- Idempotent: DROP … IF EXISTS then ADD reapplies cleanly on
-- re-run. Wrapped in BEGIN/COMMIT by the migrator (default).

ALTER TABLE rules DROP CONSTRAINT IF EXISTS rules_ck_operator;

ALTER TABLE rules
  ADD CONSTRAINT rules_ck_operator
  CHECK (operator IN ('=', '>=', '<=', '>', '<', 'MAX', 'MIN', 'SUM', 'VA'));
