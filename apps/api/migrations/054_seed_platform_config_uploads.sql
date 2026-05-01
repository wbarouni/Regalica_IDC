-- Migration 054_seed_platform_config_uploads.sql
-- Object: extend platform_config with the upload-pipeline tunables
--         consumed by POST /api/uploads (commit 41a).
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 051_platform_config.sql, 052_seed_platform_config.sql
-- References: apps/api/seeds/platform_config.json (single source of
--             truth for the seeded items — keep both in lockstep)
--
-- Same UPSERT pattern as 052 so re-applying after a JSON edit
-- propagates new values without disturbing row ids. The 052 seed
-- (sse_heartbeat_ms) is left untouched.
--
-- 'upload_max_bytes' MUST stay <= the xml_uploads CHECK constraint
-- ceiling (104857600 bytes, defined in 024_xml_uploads.sql). Lifting
-- the ceiling requires both an ALTER TABLE and a re-seed.

DO $$
DECLARE
  v_data    JSONB;
  v_upserted INTEGER;
BEGIN

  v_data := $SEED_DATA$
[
  {
    "config_key": "upload_max_bytes",
    "config_value": 104857600,
    "description": "Maximum size (bytes) accepted by POST /api/uploads. Coupled with the xml_uploads.file_size_bytes <= 104857600 CHECK constraint defined in migration 024 — the platform_config value MUST stay <= the DB CHECK ceiling. Lifting the ceiling requires both an ALTER TABLE and a re-seed."
  },
  {
    "config_key": "compression_algo",
    "config_value": "gzip",
    "description": "Compression algorithm name written to xml_uploads.compression_algo for newly uploaded XMLs. The DB column accepts any VARCHAR(20). 'gzip' uses Node's built-in zlib (zero new dependency); 'zstd' would require @mongodb-js/zstd + native node-gyp build (deferred — Windows toolchain pain)."
  },
  {
    "config_key": "compression_level",
    "config_value": 6,
    "description": "Compression level for the xml_uploads body. gzip range is 0..9 (default 6); zstd range is 1..22. Reread by the upload route on every call so an operator can tune without redeploying."
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
  RAISE NOTICE 'migration 054: platform_config upload tunables upserted (% rows)', v_upserted;

END $$;
