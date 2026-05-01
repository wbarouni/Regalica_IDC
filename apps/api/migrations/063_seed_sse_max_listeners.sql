-- Migration 063_seed_sse_max_listeners.sql
-- Object: seed `sse_max_listeners` into platform_config so the
--         in-process runEventBus reads its EventEmitter listener cap
--         from operator-controlled DB instead of carrying a frozen
--         literal.
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 051_platform_config.sql, 052_seed_platform_config.sql
-- References: docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3,
--             apps/api/src/lib/runEventBus.ts
--
-- Doctrine
--   Per "rien n'est doctrinalement exempt", even Node's EventEmitter
--   listener cap (`bus.setMaxListeners(N)`) qualifies as a tunable
--   the operator owns — analyst headcount per tenant grows over
--   time, and a small / large deployment may legitimately tighten
--   or extend the per-bus listener ceiling without a code edit.
--
-- Value
--   100 is the canonical baseline (one subscriber per active SSE
--   connection per run, plus internal emitters; ≤ a handful of
--   analysts per tenant, single-run focus per analyst).
--
-- Idempotent: ON CONFLICT (config_key) DO UPDATE so a re-apply
-- after editing the JSON value updates the row in place.

DO $$
DECLARE
  v_data    JSONB;
  v_upserted INTEGER;
BEGIN
  v_data := $SEED_DATA$
[
  {
    "config_key": "sse_max_listeners",
    "config_value": 100,
    "description": "Maximum number of concurrent EventEmitter listeners on the in-process run event bus (apps/api/src/lib/runEventBus.ts). Each active SSE connection per run consumes one listener; the cap protects against memory growth from leaked subscriptions. Bump for high-analyst tenants; lower for sandbox/test deployments."
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
  RAISE NOTICE 'migration 063: sse_max_listeners upserted (% rows)', v_upserted;
END $$;
