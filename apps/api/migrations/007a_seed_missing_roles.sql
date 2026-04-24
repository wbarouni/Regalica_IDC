-- Migration 007a_seed_missing_roles.sql
-- Object: backfill compliance_director and support_readonly on tenants
--         that were seeded under the pre-amendment 8-role version of 007
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 007_seed_system_roles.sql (amended)
-- References: Document 6 §5 (role catalogue), §22.4 (RLS references
--             compliance_director and support_readonly)
--
-- Amendment migration (Flyway-style NNN[a-z]_slug.sql, see
-- apps/api/migrations/README.md "When to use an amendment id").
--
-- On a fresh install this migration is a no-op: no tenants exist at
-- this point of the sequence, so the DO-loop iterates over zero rows.
-- On a database where the pre-amendment 007 already seeded 8 roles
-- for existing tenants, this loop calls the now-updated
-- seed_system_roles_for_tenant() on each one. The function is
-- idempotent: the 8 pre-existing roles hit ON CONFLICT DO NOTHING and
-- are left untouched; compliance_director and support_readonly are
-- inserted fresh.

DO $$
DECLARE
  t_id UUID;
BEGIN
  FOR t_id IN SELECT id FROM tenants LOOP
    PERFORM seed_system_roles_for_tenant(t_id);
  END LOOP;
END $$;
