-- Migration 002_schema_helpers.sql
-- Object: session-context helpers (current user/tenant/role) and prompt schema validator
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 001_extensions.sql
-- References: Document 6 §22.1 (helpers), §8 (validate_prompt_schema)

-- Session context read from `app.current_user_id` and `app.current_tenant_id`
-- set by the backend at the start of every DB transaction via
-- `SET LOCAL app.current_user_id = :user_id`. NULL when the session
-- variable is unset (background jobs, migrations, health probes).
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS UUID AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_app_tenant_id() RETURNS UUID AS $$
  SELECT nullif(current_setting('app.current_tenant_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- current_user_has_role uses plpgsql (not LANGUAGE SQL) on purpose.
-- SQL-language function bodies are validated at CREATE time, which would
-- fail here because user_roles and roles are created later in migration
-- 004. plpgsql bodies are validated at call time; by the time this
-- function is actually invoked, the dependent tables exist.
-- Functional semantics identical to the canonical definition in §22.1.
CREATE OR REPLACE FUNCTION current_user_has_role(role_code TEXT) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = current_app_user_id()
      AND r.code = role_code
      AND ur.revoked_at IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Phase 1 minimal — full JSON Schema Draft 2020-12 validation arrives in
-- Phase 4 when prompt_bank is actually consumed (Document 5 §20 seed,
-- Document 6 §8 rationale). This baseline enforces only that the schema
-- document is a JSON object and the template is non-null, which catches
-- the most obvious misuse without depending on a JSON Schema validator
-- in plpgsql (non-trivial to implement correctly).
CREATE OR REPLACE FUNCTION validate_prompt_schema(
  schema_doc JSONB,
  template_text TEXT
) RETURNS BOOLEAN AS $$
  SELECT schema_doc IS NOT NULL
     AND jsonb_typeof(schema_doc) = 'object'
     AND template_text IS NOT NULL;
$$ LANGUAGE SQL IMMUTABLE;
