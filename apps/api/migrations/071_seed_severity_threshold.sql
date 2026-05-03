-- Migration 071_seed_severity_threshold.sql
-- Object: seed platform_config with the severity classification threshold
--         consumed by apps/api/src/routes/engine.ts mapSeverity() helper.
-- Author: ALGORIA Factory
-- Date: 2026-05-03
-- Depends on: 051_platform_config.sql
-- References: docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3 (no magic
--             numeric literals in TS source — every threshold lives in
--             platform_config or a versioned referential).
--
-- The evaluator engine emits Verdict.severity in {'severe','rounding',null}
-- (cf. packages/evaluator/src/types.ts). The HTTP route POST /api/engine/
-- runs/:runId/evaluate maps that 3-value enum to the REGFlow front-facing
-- {'BLOQUANT','MAJEUR','MINEUR',null} taxonomy with the rule:
--   severity=null              -> null
--   severity='rounding'        -> 'MINEUR'
--   severity='severe' AND
--     |gap_relative| > T       -> 'BLOQUANT'
--   severity='severe' AND
--     |gap_relative| <= T      -> 'MAJEUR'
-- where T = severity_gap_relative_threshold (this row).
--
-- Default T = 0.10 (10%). A future operator can ALTER this value via a
-- new migration without touching application code.

INSERT INTO platform_config (config_key, config_value, description)
VALUES (
  'severity_gap_relative_threshold',
  '0.10'::jsonb,
  'Seuil gap_relative absolu (0.0-1.0) au-delà duquel un FAIL ' ||
  'severity=severe est classifié BLOQUANT. En dessous ou égal : MAJEUR. ' ||
  'Utilisé par apps/api/src/routes/engine.ts mapSeverity(). ' ||
  'Doctrine : moteur retourne severe/rounding, la route mappe vers ' ||
  'BLOQUANT/MAJEUR/MINEUR pour le contrat HTTP REGFlow.'
)
ON CONFLICT (config_key) DO NOTHING;
