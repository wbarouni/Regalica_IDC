-- Migration 007_seed_system_roles.sql
-- Object: seed the 8 system roles per tenant + auto-seed trigger on future tenants
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 003_tenants.sql, 004_users_roles.sql
-- References: Document 6 §15 (roles table), §26 entry 007;
--             docs/04 §17-21 (role semantics), docs/05 §12 (prompt_editor)
--
-- TODO(@wbarouni) — Permissions JSONB payload: each role is seeded with
-- the Phase 1 minimal marker { "v": 1, "capabilities": [] }. The real
-- capability lists will be populated in Phase 3 when the authorisation
-- middleware that reads them is wired. Until then, no applicative code
-- must rely on the content of `permissions`.
--
-- TODO(@wbarouni) — Arabic labels (label_ar) are literal translations
-- drafted without a native reviewer. Submit for native review in Phase 5
-- (frontend i18n) and update via a docs/i18n migration.

-- Seed function: idempotent insertion of the 8 system roles for a tenant.
-- ON CONFLICT (tenant_id, code) DO NOTHING honours the roles_uk UNIQUE
-- constraint, which makes a second call a no-op and allows safe retry.
CREATE OR REPLACE FUNCTION seed_system_roles_for_tenant(p_tenant_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO roles (tenant_id, code, label_fr, label_en, label_ar, permissions, is_system_role)
  VALUES
    (p_tenant_id, 'platform_owner',      'Propriétaire plateforme',   'Platform owner',       'مالك المنصة',        '{"v":1,"capabilities":[]}'::jsonb, TRUE),
    (p_tenant_id, 'tenant_admin',        'Administrateur tenant',     'Tenant admin',         'مدير المستأجر',      '{"v":1,"capabilities":[]}'::jsonb, TRUE),
    (p_tenant_id, 'compliance_officer',  'Responsable conformité',    'Compliance officer',   'مسؤول الامتثال',     '{"v":1,"capabilities":[]}'::jsonb, TRUE),
    (p_tenant_id, 'signatory',           'Signataire',                'Signatory',            'موقّع',              '{"v":1,"capabilities":[]}'::jsonb, TRUE),
    (p_tenant_id, 'auditor',             'Auditeur',                  'Auditor',              'مراجع',              '{"v":1,"capabilities":[]}'::jsonb, TRUE),
    (p_tenant_id, 'rule_editor',         'Éditeur de règles',         'Rule editor',          'محرّر القواعد',       '{"v":1,"capabilities":[]}'::jsonb, TRUE),
    (p_tenant_id, 'referential_editor',  'Éditeur de référentiels',   'Referential editor',   'محرّر المراجع',       '{"v":1,"capabilities":[]}'::jsonb, TRUE),
    (p_tenant_id, 'prompt_editor',       'Éditeur de prompts',        'Prompt editor',        'محرّر الموجّهات',      '{"v":1,"capabilities":[]}'::jsonb, TRUE)
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
