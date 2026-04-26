-- Migration 010a_nullable_label_colonnes.sql
-- Object: make label nullable on referentials_colonnes
-- Author: ALGORIA Factory
-- Date: 2026-04-26
-- Depends on: 010_referentials_colonnes.sql
-- References: Document 6 §9.1 (skeleton)
--
-- The official BCT source (rdg.xlsx) does not contain colonne
-- labels — only column numbers per (annexe, rubrique). NULL is
-- correct and honest at the seed step; placeholder values would
-- create false confidence in the data. Labels will be enriched
-- from the official BCT source via the 4-eyes governance flow
-- once available.

ALTER TABLE referentials_colonnes ALTER COLUMN label DROP NOT NULL;
