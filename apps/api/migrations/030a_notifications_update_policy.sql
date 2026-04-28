-- Migration 030a_notifications_update_policy.sql
-- Object: add UPDATE policy to notifications so PATCH /:id/read works
--         under FORCE ROW LEVEL SECURITY (only SELECT was declared in 030).
-- Author: ALGORIA Factory
-- Date: 2026-04-28
-- Depends on: 030_notifications.sql
-- References: Document 6 §22 (tenant isolation), §19 (notifications lifecycle)
--
-- Migration 030 declared `notifications_select` only. Under
-- FORCE ROW LEVEL SECURITY, an UPDATE without a matching policy
-- silently affects 0 rows even for the owning tenant + user. The
-- API route `PATCH /api/tenants/:tenantId/notifications/:id/read`
-- needs to flip `is_read = TRUE` and stamp `read_at = NOW()` on a
-- notification owned by the calling user; this amendment authorises
-- that exact pattern.
--
-- Scope kept tight: only the calling user can update their own
-- notifications inside their tenant. Compliance director / support
-- read-only roles do NOT get UPDATE rights here — those roles only
-- inspect, never mutate user-scoped lifecycle state.

CREATE POLICY notifications_update
  ON notifications
  FOR UPDATE
  USING (
    tenant_id = current_app_tenant_id()
    AND user_id = current_app_user_id()
  )
  WITH CHECK (
    tenant_id = current_app_tenant_id()
    AND user_id = current_app_user_id()
  );
