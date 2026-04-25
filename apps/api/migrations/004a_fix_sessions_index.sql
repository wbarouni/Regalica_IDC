-- Migration 004a_fix_sessions_index.sql
-- Object: drop the VOLATILE NOW() predicate from sessions_idx_user_active
--         (Postgres rejects non-IMMUTABLE functions in index predicates)
-- Author: ALGORIA Factory
-- Date: 2026-04-25
-- Depends on: 004_users_roles.sql
--
-- 004_users_roles.sql creates sessions_idx_user_active with predicate
--   WHERE revoked_at IS NULL AND expires_at > NOW()
-- NOW() is STABLE not IMMUTABLE — Postgres 16 rejects it in index
-- predicates. Base migration is immutable; this amendment drops and
-- recreates the index with the same name, removing the time-dependent
-- term. Time-range filtering (expires_at > $1) is handled at query
-- level where the bind parameter is IMMUTABLE to the planner.

DROP INDEX IF EXISTS sessions_idx_user_active;

CREATE INDEX IF NOT EXISTS sessions_idx_user_active
  ON sessions (user_id)
  WHERE revoked_at IS NULL;
