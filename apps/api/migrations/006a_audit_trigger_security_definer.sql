-- Migration 006a_audit_trigger_security_definer.sql
-- Object: recreate audit_trigger_function as SECURITY DEFINER so the
--         INSERT into audit_log is performed under the function owner's
--         privileges, bypassing FORCE RLS for the audit write.
-- Author: ALGORIA Factory
-- Date: 2026-04-26
-- Depends on: 006_audit_trigger_function.sql, 005a_audit_log_rls.sql
-- References: Document 6 §22.5 (audit_log RLS), §24 (audit trigger)
--
-- 005a enables FORCE ROW LEVEL SECURITY on audit_log with a SELECT-only
-- policy (no INSERT / UPDATE / DELETE policies). The intent per the
-- 005a comment is that audit_log is written ONLY by audit_trigger_function.
--
-- 006 declared the function with the default SECURITY INVOKER, which
-- makes it execute under the calling role. When the calling role is
-- non-bypass (e.g. regflow_app under SET LOCAL ROLE in tests, or any
-- applicative role in production), the INSERT inside the trigger is
-- denied by FORCE RLS because no INSERT policy permits it. The error
-- surface is:
--   ERROR: new row violates row-level security policy for table "audit_log"
--
-- Fix: recreate the function as SECURITY DEFINER so it runs under the
-- function owner (the migration runner / table owner = a privileged
-- role). DEFINER does not bypass RLS by attribute, but the owner of
-- audit_log is the same role and FORCE RLS makes the owner subject to
-- policies — except FORCE RLS still permits DML by the owner if the
-- owner has been granted BYPASSRLS or if RLS policies don't apply at
-- their level. In practice the migration runner is a superuser
-- (in tests `regalica_app`, in production the bootstrap role), so
-- SECURITY DEFINER + superuser owner = audit write succeeds regardless
-- of caller role.
--
-- 006 is immutable; we recreate the function in place (CREATE OR
-- REPLACE) with the same body and the new attribute. Body identical
-- to 006 — only the SECURITY DEFINER directive is added.

CREATE OR REPLACE FUNCTION audit_trigger_function() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_id UUID;
  v_tenant_id UUID;
  v_entity_id UUID;
  v_old JSONB;
  v_new JSONB;
BEGIN
  v_actor_id := current_app_user_id();

  IF TG_OP = 'INSERT' THEN
    v_tenant_id := NEW.tenant_id;
    v_entity_id := NEW.id;
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_entity_id := COALESCE(NEW.id, OLD.id);
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  ELSE -- DELETE
    v_tenant_id := OLD.tenant_id;
    v_entity_id := OLD.id;
    v_old := to_jsonb(OLD);
    v_new := NULL;
  END IF;

  INSERT INTO audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    old_value, new_value, created_at
  ) VALUES (
    v_tenant_id, v_actor_id, TG_OP, TG_TABLE_NAME,
    v_entity_id, v_old, v_new, NOW()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
