-- Migration 052_seed_platform_config.sql
-- Object: seed baseline tunables into platform_config (zero-hardcoding
--         doctrine — values that previously sat as TS/Python literals
--         and triggered Guard D-006).
-- Author: ALGORIA Factory
-- Date: 2026-04-30
-- Depends on: 051_platform_config.sql
-- References: docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3,
--             apps/api/seeds/platform_config.json
--
-- Source: apps/api/seeds/platform_config.json. The JSON is embedded
-- verbatim in this file — keep both in lockstep.
--
-- Required session vars: none. platform_config has no tenant_id and
-- the migration runs as a superuser session (RLS bypass); the
-- catalogue is system-global.
--
-- Idempotent: ON CONFLICT (config_key) DO UPDATE so re-applying after
-- a JSON edit propagates the new value/description without breaking
-- the row id stability that the audit trail depends on.

DO $$
DECLARE
  v_data    JSONB;
  v_upserted INTEGER;
BEGIN

  v_data := $SEED_DATA$
[
  {
    "config_key": "sse_heartbeat_ms",
    "config_value": 15000,
    "description": "Heartbeat interval (ms) for the /runs/:runId/stream SSE relay. Sent as an SSE comment line every N ms to keep proxies and browsers from timing out idle connections."
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
  RAISE NOTICE 'migration 052: platform_config upserted (% rows)', v_upserted;

END $$;
