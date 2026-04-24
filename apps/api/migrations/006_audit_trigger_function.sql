-- Migration 006_audit_trigger_function.sql
-- Object: generic audit_trigger_function attachable to any tenant-scoped sensitive table
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 002_schema_helpers.sql (current_app_user_id), 005_audit_log.sql (audit_log table)
-- References: Document 6 §24

-- Ships the function only; individual tables (rules, prompt_bank,
-- referentials_*, etc.) attach the trigger in their own CREATE TABLE
-- migrations (008, 022, 023, ...). A later attachments-only migration
-- may retro-attach the trigger on users / roles / user_roles if the
-- initial absence of auditing on governance tables becomes a concern.
--
-- Assumptions on the target table:
--   - has an `id` column of any type
--   - has a `tenant_id` column (multi-tenant invariant, Document 6 §1)

CREATE OR REPLACE FUNCTION audit_trigger_function() RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;
