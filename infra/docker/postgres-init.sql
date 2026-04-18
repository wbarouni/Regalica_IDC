-- =============================================================================
-- Regalica IDC — Postgres init script
-- Runs ONLY on first container startup (docker-entrypoint-initdb.d).
-- Subsequent schema evolution goes through Sequelize migrations in
-- apps/api/src/db/migrations.
-- =============================================================================

\c regalica;

-- ---- Required extensions ---------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector (RAG embeddings)
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- trigram text search (rule search)
CREATE EXTENSION IF NOT EXISTS btree_gin;   -- composite indexes w/ arrays

-- ---- Read-only analytics role ---------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'regalica_readonly') THEN
    CREATE ROLE regalica_readonly NOINHERIT LOGIN PASSWORD 'change_me_readonly_in_prod';
    GRANT CONNECT ON DATABASE regalica TO regalica_readonly;
    GRANT USAGE ON SCHEMA public TO regalica_readonly;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT ON TABLES TO regalica_readonly;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT ON SEQUENCES TO regalica_readonly;
  END IF;
END
$$;

-- ---- Session variable placeholder (set by api middleware per request) -----
-- app.tenant_id is read by RLS policies defined in migrations (ADR 0003).
-- Setting a server-side default here just avoids "unrecognized configuration
-- parameter" errors before the first migration runs.
-- ---------------------------------------------------------------------------
ALTER DATABASE regalica SET app.tenant_id = '';
ALTER DATABASE regalica SET app.user_id   = '';
