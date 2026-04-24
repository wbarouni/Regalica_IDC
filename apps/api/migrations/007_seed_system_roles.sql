-- Migration 007_seed_system_roles.sql
-- Object: seed the 10 system roles per tenant + auto-seed trigger on future tenants
-- Author: ALGORIA Factory
-- Date: 2026-04-24 (amended: +compliance_director +support_readonly;
--                  labels externalised to apps/api/seeds/system_roles.json)
-- Depends on: 003_tenants.sql, 004_users_roles.sql
-- References: Document 6 §5 (role catalogue), §15 (roles table), §22.4 (RLS),
--             §26 entry 007; docs/04 §17-21 (role semantics),
--             docs/05 §12 (prompt_editor)
--
-- Canonical source of role labels: apps/api/seeds/system_roles.json.
-- The jsonb literal embedded in seed_system_roles_for_tenant() below is a
-- verbatim copy of the `roles` array from that file (PostgreSQL cannot read
-- files at function-call time). Consistency between the two is enforced by
-- apps/api/tests/migrations/007_seed_system_roles.test.ts: any edit to the
-- JSON not reflected here, or vice versa, fails the migration test suite.
--
-- TODO(@wbarouni) — Permissions JSONB payload: each role is seeded with
-- the Phase 1 minimal marker { "v": 1, "capabilities": [] }. The real
-- capability lists will be populated in Phase 3 when the authorisation
-- middleware that reads them is wired. Until then, no applicative code
-- must rely on the content of `permissions`.
--
-- TODO(@wbarouni) — Arabic labels (label_ar) are literal translations
-- drafted without a native reviewer. Submit for native review in Phase 5
-- (frontend i18n) and update apps/api/seeds/system_roles.json + the
-- jsonb literal below in lockstep.

-- Seed function: idempotent insertion of the 10 system roles for a tenant.
-- ON CONFLICT (tenant_id, code) DO NOTHING honours the roles_uk UNIQUE
-- constraint, which makes a second call a no-op and allows safe retry.
-- Order is seniority-based: tenant governance first, compliance next,
-- then signatory / auditor / editors.
CREATE OR REPLACE FUNCTION seed_system_roles_for_tenant(p_tenant_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO roles (tenant_id, code, label_fr, label_en, label_ar, permissions, is_system_role)
  SELECT
    p_tenant_id, r.code, r.label_fr, r.label_en, r.label_ar, r.permissions, r.is_system_role
  FROM jsonb_to_recordset($json$[
    {"code":"platform_owner","label_fr":"Propriétaire plateforme","label_en":"Platform owner","label_ar":"مالك المنصة","permissions":{"v":1,"capabilities":[]},"is_system_role":true},
    {"code":"tenant_admin","label_fr":"Administrateur tenant","label_en":"Tenant admin","label_ar":"مدير المستأجر","permissions":{"v":1,"capabilities":[]},"is_system_role":true},
    {"code":"compliance_director","label_fr":"Directeur conformité","label_en":"Compliance director","label_ar":"مدير الامتثال","permissions":{"v":1,"capabilities":[]},"is_system_role":true},
    {"code":"compliance_officer","label_fr":"Responsable conformité","label_en":"Compliance officer","label_ar":"مسؤول الامتثال","permissions":{"v":1,"capabilities":[]},"is_system_role":true},
    {"code":"support_readonly","label_fr":"Support lecture seule","label_en":"Support read-only","label_ar":"دعم للقراءة فقط","permissions":{"v":1,"capabilities":[]},"is_system_role":true},
    {"code":"signatory","label_fr":"Signataire","label_en":"Signatory","label_ar":"موقّع","permissions":{"v":1,"capabilities":[]},"is_system_role":true},
    {"code":"auditor","label_fr":"Auditeur","label_en":"Auditor","label_ar":"مراجع","permissions":{"v":1,"capabilities":[]},"is_system_role":true},
    {"code":"rule_editor","label_fr":"Éditeur de règles","label_en":"Rule editor","label_ar":"محرّر القواعد","permissions":{"v":1,"capabilities":[]},"is_system_role":true},
    {"code":"referential_editor","label_fr":"Éditeur de référentiels","label_en":"Referential editor","label_ar":"محرّر المراجع","permissions":{"v":1,"capabilities":[]},"is_system_role":true},
    {"code":"prompt_editor","label_fr":"Éditeur de prompts","label_en":"Prompt editor","label_ar":"محرّر الموجّهات","permissions":{"v":1,"capabilities":[]},"is_system_role":true}
  ]$json$::jsonb) AS r(
    code TEXT,
    label_fr TEXT,
    label_en TEXT,
    label_ar TEXT,
    permissions JSONB,
    is_system_role BOOLEAN
  )
  ON CONFLICT (tenant_id, code) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Trigger helper: invoked once per newly created tenant to seed its
-- system roles automatically.
CREATE OR REPLACE FUNCTION trigger_seed_system_roles() RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_system_roles_for_tenant(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenants_seed_roles ON tenants;
CREATE TRIGGER tenants_seed_roles
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION trigger_seed_system_roles();

-- Backfill for tenants that existed before this migration was applied.
-- On a fresh install this is a no-op (no tenants yet); on an upgrade
-- path it ensures every existing tenant acquires the system roles.
DO $$
DECLARE
  t_id UUID;
BEGIN
  FOR t_id IN SELECT id FROM tenants LOOP
    PERFORM seed_system_roles_for_tenant(t_id);
  END LOOP;
END $$;
