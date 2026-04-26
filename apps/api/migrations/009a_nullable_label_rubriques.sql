-- Migration 009a_nullable_label_rubriques.sql
-- Object: make label nullable on referentials_rubriques
-- Author: ALGORIA Factory
-- Date: 2026-04-26
-- Depends on: 009_referentials_rubriques.sql
-- References: Document 6 §9.1 (skeleton)
--
-- The official BCT source (rdg.xlsx) does not contain rubrique
-- labels — only structural codes. NULL is correct and honest at
-- the seed step; placeholder values would create false confidence
-- in the data. Labels will be enriched from the official BCT
-- source (circulaires, maquettes, regulator clarifications) via
-- the 4-eyes governance flow once available.

ALTER TABLE referentials_rubriques ALTER COLUMN label DROP NOT NULL;
