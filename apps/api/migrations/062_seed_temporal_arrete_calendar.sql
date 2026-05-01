-- Migration 062_seed_temporal_arrete_calendar.sql
-- Object: seed `temporal_arrete_calendar` into platform_config so the
--         chatbot-py TemporalAgent reads its calendar (quarter ends,
--         annual end) from the operator-controlled DB instead of
--         carrying a frozen Python literal.
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 051_platform_config.sql, 052_seed_platform_config.sql
-- References: docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3,
--             apps/chatbot-py/app/agents/t0_temporal.py
--
-- Doctrine
--   Per "ZERO hardcoding" the previous frozenset({3, 6, 9, 12}) inside
--   t0_temporal.py is a calendar fact, not a protocol invariant —
--   operators may legitimately tighten or extend the valid arrete
--   calendar for a given deployment. This migration moves the
--   calendar to platform_config; commit C5's matching Python change
--   reads it through the shared loader.
--
-- Schema
--   {
--     "quarterly_end_months": [3, 6, 9, 12],   // 1..12, ascending
--     "annual_month": 12,                      // 1..12
--     "annual_day":   31                       // 1..31, must be valid
--                                              //   for the month above
--   }
--
-- Idempotent: ON CONFLICT (config_key) DO UPDATE so a re-apply after
-- editing the JSON value updates the row in place.

DO $$
DECLARE
  v_data    JSONB;
  v_upserted INTEGER;
BEGIN
  v_data := $SEED_DATA$
[
  {
    "config_key": "temporal_arrete_calendar",
    "config_value": {
      "quarterly_end_months": [3, 6, 9, 12],
      "annual_month": 12,
      "annual_day": 31
    },
    "description": "Calendar of canonical arrete-end periods read by chatbot-py's TemporalAgent (apps/chatbot-py/app/agents/t0_temporal.py). quarterly_end_months lists the 1..12 month numbers that close a BCT quarterly reporting period; annual_month + annual_day name the end of the annual period. Tightening or extending the calendar is an operator config change — no code edit needed."
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
  RAISE NOTICE 'migration 062: temporal_arrete_calendar upserted (% rows)', v_upserted;
END $$;
