-- Migration 055_seed_engine_version.sql
-- Object: register the validation engine version + per-run snapshot
--         placeholders in platform_config so the runs route does not
--         carry a string literal in source (D-004 hygiene).
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 051_platform_config.sql, 054_seed_platform_config_uploads.sql
-- References: validation_runs.engine_version (NOT NULL),
--             validation_runs.rules_version_snapshot,
--             validation_runs.referentials_version_snapshot

DO $$
DECLARE
  v_data    JSONB;
  v_upserted INTEGER;
BEGIN

  v_data := $SEED_DATA$
[
  {
    "config_key": "engine_version",
    "config_value": "0.1.0",
    "description": "Semver tag of the deterministic validation engine binary (chatbot-py + JS evaluator). Stamped on every validation_runs row at creation time so a replay can reproduce the exact engine behaviour. Bump on every breaking change to BCT 3-step semantics."
  },
  {
    "config_key": "rules_version_snapshot_default",
    "config_value": { "rules": [] },
    "description": "Placeholder JSONB stored in validation_runs.rules_version_snapshot when a run is created before the rules ingestion has rendered a real snapshot (Phase B/41b). Replaced by the engine on the first INSERT in run_agent_steps."
  },
  {
    "config_key": "referentials_version_snapshot_default",
    "config_value": { "refs": [] },
    "description": "Placeholder JSONB stored in validation_runs.referentials_version_snapshot at run creation time. Replaced by the engine once it has resolved the active referential set."
  }
]
$SEED_DATA$::JSONB;

  INSERT INTO platform_config (config_key, config_value, description)
  SELECT
    p->>'config_key',
    p->'config_value',
    p->>'description'
  FROM jsonb_array_elements(v_data) p
  ON CONFLICT (config_key) DO UPDATE
    SET config_value = EXCLUDED.config_value,
        description  = EXCLUDED.description,
        deleted_at   = NULL,
        updated_at   = NOW();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;
  RAISE NOTICE 'migration 055: engine_version + snapshot placeholders upserted (% rows)', v_upserted;

END $$;
