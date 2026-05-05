-- Migration 999_seed_dev_tenant.sql
-- Object: seed the canonical dev/CI tenant + author + validator users
--         + role assignments so that `pnpm setup:dev` (S1) yields a
--         tenant ready to receive XML uploads + run validations
--         end-to-end without any out-of-band psql session.
-- Author: ALGORIA Factory
-- Date: 2026-05-05
-- Depends on: 003_tenants.sql, 004_users_roles.sql,
--             007_seed_system_roles.sql (the AFTER INSERT trigger
--             tenants_seed_roles auto-populates the 10 system roles
--             for every new tenant; this migration relies on it
--             implicitly so it can grant the two roles by code below).
-- References: docs/adr/0006-s1-reproducibility.md, docs/DEV-SETUP.md.
--
-- Numbered 999 (much higher than the canonical 001-075a sequence) so
-- this seed runs LAST and is unambiguously a dev/CI affordance, not
-- part of the production schema evolution. Production deployments
-- skip this migration via the GUC gate below.
--
-- Required session var:
--   app.seed_dev_tenant — must be the literal string 'true'. Posted
--                         by setup-dev.ts (S1 L6) and the e2e CI job
--                         (S1 L10). Production migrate:up never sets
--                         it, so the entire DO block returns early
--                         as a no-op (audit-trail still records the
--                         migration as applied).
--
-- All UUIDs and identifiers below are intentionally hardcoded so the
-- frontend dev .env (VITE_TENANT_ID, VITE_USER_ID), the seed-fixtures
-- script (S1 L5), the migrate-with-operator wrapper (S1 L3), and the
-- CI job all share the SAME canonical references without runtime
-- substitution. They are dev fixtures, not business data — the
-- "zero-hardcoding" doctrine targets business values (rules, prompts,
-- thresholds), not test fixtures.
--
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING. Re-running
-- this migration after the rows are already present is a strict
-- no-op (the AFTER INSERT trigger does not fire on the conflict
-- branch, so the role catalogue is not duplicated either).

DO $$
DECLARE
  v_gate          TEXT;
  v_tenant_id     CONSTANT UUID := 'd3a7c6e6-2d18-4ff6-8183-94507eded6d7';
  v_author_id     CONSTANT UUID := '2cb0ce35-4b43-499f-b23a-722ef86902ce';
  v_validator_id  CONSTANT UUID := 'ef810369-1e96-485d-bf1d-dc8937e32bb9';
  v_compliance_role_id UUID;
  v_signatory_role_id  UUID;
BEGIN
  v_gate := current_setting('app.seed_dev_tenant', true);
  IF v_gate IS NULL OR v_gate <> 'true' THEN
    RAISE NOTICE
      'migration 999: app.seed_dev_tenant != ''true'' — skipping dev seed';
    RETURN;
  END IF;

  -- 1. Tenant. The AFTER INSERT trigger from migration 007 fires on
  --    success and seeds the 10 system roles for this tenant. On
  --    conflict the trigger does NOT fire (PostgreSQL skips the row
  --    entirely), so re-running stays idempotent.
  INSERT INTO tenants (
    id, slug, legal_name, bct_bank_code,
    default_language, timezone, deployment_mode, is_active
  )
  VALUES (
    v_tenant_id, 'demo-bank-01', 'Demo Bank 01 (S1 dev fixture)', 'BANK-01',
    'fr', 'Africa/Tunis', 'on_premises', TRUE
  )
  ON CONFLICT (id) DO NOTHING;

  -- 2. Author user — compliance_officer role (4-eyes "author" half).
  INSERT INTO users (
    id, tenant_id, external_sso_id, email, full_name,
    preferred_language, timezone, is_active
  )
  VALUES (
    v_author_id, v_tenant_id, 'sso-dev-compliance',
    'compliance@demo-bank-01.example', 'Compliance Officer (dev)',
    'fr', 'Africa/Tunis', TRUE
  )
  ON CONFLICT (id) DO NOTHING;

  -- 3. Validator user — signatory role (4-eyes "validator" half).
  INSERT INTO users (
    id, tenant_id, external_sso_id, email, full_name,
    preferred_language, timezone, is_active
  )
  VALUES (
    v_validator_id, v_tenant_id, 'sso-dev-signatory',
    'validator@demo-bank-01.example', 'Validator Signatory (dev)',
    'fr', 'Africa/Tunis', TRUE
  )
  ON CONFLICT (id) DO NOTHING;

  -- 4. Look up the auto-seeded role IDs by code. The trigger from
  --    007 ran during step 1 above (or was already present from a
  --    previous re-run); either way the rows exist.
  SELECT id INTO v_compliance_role_id
    FROM roles WHERE tenant_id = v_tenant_id AND code = 'compliance_officer';
  SELECT id INTO v_signatory_role_id
    FROM roles WHERE tenant_id = v_tenant_id AND code = 'signatory';

  IF v_compliance_role_id IS NULL OR v_signatory_role_id IS NULL THEN
    RAISE EXCEPTION
      'migration 999: expected roles compliance_officer + signatory '
      'were not seeded for tenant % — verify migration 007 trigger',
      v_tenant_id;
  END IF;

  -- 5. Role assignments. user_roles UNIQUE constraint is on
  --    (user_id, role_id, assigned_at); we pin assigned_at to a
  --    deterministic timestamp so re-runs hit the conflict branch
  --    instead of stacking duplicate rows with NOW().
  INSERT INTO user_roles (
    tenant_id, user_id, role_id, assigned_at
  )
  VALUES (
    v_tenant_id, v_author_id, v_compliance_role_id,
    '2026-05-05T00:00:00Z'::timestamptz
  )
  ON CONFLICT (user_id, role_id, assigned_at) DO NOTHING;

  INSERT INTO user_roles (
    tenant_id, user_id, role_id, assigned_at
  )
  VALUES (
    v_tenant_id, v_validator_id, v_signatory_role_id,
    '2026-05-05T00:00:00Z'::timestamptz
  )
  ON CONFLICT (user_id, role_id, assigned_at) DO NOTHING;

  RAISE NOTICE
    'migration 999: dev tenant % + author % + validator % seeded',
    v_tenant_id, v_author_id, v_validator_id;
END $$;
