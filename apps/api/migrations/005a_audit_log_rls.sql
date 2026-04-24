-- Migration 005a_audit_log_rls.sql
-- Object: enable RLS on audit_log per Document 6 §22.5
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 005_audit_log.sql (creates the partitioned table),
--             007_seed_system_roles.sql (defines the roles referenced
--             in the policy: platform_owner, support_readonly,
--             compliance_director)
-- References: Document 6 §22.5 (RLS policy on audit_log)
--
-- Amendment migration (Flyway-style NNN[a-z]_slug.sql). The original
-- 005 created the partitioned table + immutability trigger but did
-- not install the §22.5 SELECT policy. This amendment closes the gap.
-- Listed AFTER 007 in the depends-on chain because the policy
-- references role codes that must be seedable (compliance_director,
-- support_readonly) — they are part of the 10-role seed established
-- by migration 007.
--
-- Per §22.5 there is no INSERT / UPDATE / DELETE policy: audit_log is
-- written only by the audit_trigger_function, and UPDATE / DELETE are
-- blocked by the immutability trigger installed in 005.

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select ON audit_log
  FOR SELECT
  USING (
    tenant_id = current_app_tenant_id()
    AND (
      actor_user_id = current_app_user_id()
      OR current_user_has_role('platform_owner')
      OR current_user_has_role('support_readonly')
      OR current_user_has_role('compliance_director')
    )
  );
