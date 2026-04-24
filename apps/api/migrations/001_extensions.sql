-- Migration 001_extensions.sql
-- Object: enable required PostgreSQL extensions and the uuidv7() function
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: none
-- References: Document 6 §2 (extensions), §26.4 (uuidv7 annex)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS vector;

-- TODO(@wbarouni): citext is required by users.email (Document 6 §15) but was
-- omitted from the §2 extension list in the current doc revision. Added here
-- tacitly; update Document 6 §2 in a docs commit to reflect the real need.
CREATE EXTENSION IF NOT EXISTS citext;

-- pg_stat_statements is listed in Document 6 §2 but requires
-- shared_preload_libraries cluster-level configuration. We do NOT install
-- it here: the operator enables it in postgresql.conf at deploy time.
-- Once the cluster has it preloaded, CREATE EXTENSION IF NOT EXISTS
-- pg_stat_statements may be run in a future migration if telemetry
-- is desired tenant-wide.

-- UUID v7 (RFC 9562) implementation.
-- Layout:
--   bytes 0..5  : 48-bit unix timestamp in milliseconds (big-endian)
--   byte 6 high : version nibble = 0x7
--   byte 6 low  : random
--   byte 8 high : variant bits = 10xx
--   bytes 7..15 : random
--
-- Depends on pgcrypto.gen_random_bytes() enabled above.
CREATE OR REPLACE FUNCTION uuidv7() RETURNS UUID AS $$
DECLARE
  unix_ts_ms BYTEA;
  uuid_bytes BYTEA;
BEGIN
  unix_ts_ms := substring(
    int8send((EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT)
    FROM 3
  );
  uuid_bytes := unix_ts_ms || gen_random_bytes(10);
  -- Set version to 7 (upper nibble of byte 6).
  uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
  -- Set variant to 10xx (upper two bits of byte 8).
  uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
  RETURN encode(uuid_bytes, 'hex')::UUID;
END;
$$ LANGUAGE plpgsql VOLATILE;
