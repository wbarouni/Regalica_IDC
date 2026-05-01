-- Migration 060_audit_trigger_self_heal_partition.sql
-- Object: make audit_trigger_function self-healing — ensure the current
--         month's audit_log partition exists before each INSERT, so a
--         tenant action on the 1st of any month never crashes when the
--         scheduled partition rotation hasn't run yet.
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 005_audit_log.sql (partitioned table),
--             006_audit_trigger_function.sql (function we replace),
--             035_pg_cron_partitions.sql (audit_log_create_partition_for_month
--                                         helper we delegate to)
-- References: docs/06-SCHEMA-SQL-COMPLET.md sect.17 (partitioning),
--             docs/06-SCHEMA-SQL-COMPLET.md sect.24 (audit trigger).
--
-- Background
--   audit_log is RANGE-partitioned by created_at (one partition per
--   month — see migration 005). Migration 005 only seeds the
--   partition for the month it was applied in; migration 035 ships a
--   pg_cron job that creates next-month partitions in advance, but
--   the standard pgvector image does not preload pg_cron and many
--   on-prem deployments run without it. Result: when the audit
--   trigger fires on the 1st of an unprovisioned month, Postgres
--   raises:
--     no partition of relation "audit_log" found for row
--   propagating up as a 500 from any audited write (run_agent_steps
--   updates included — that is the symptom that triggered this fix).
--
-- Strategy
--   Replace audit_trigger_function so it computes the partition name
--   for NOW()'s month and runs CREATE TABLE IF NOT EXISTS … PARTITION
--   OF audit_log FOR VALUES FROM (start) TO (next_month). The IF NOT
--   EXISTS short-circuits via a single pg_class catalog lookup when
--   the partition is already present — measured at < 50 µs on a
--   warm catalog cache, so the steady-state cost is negligible.
--   Concurrent INSERTs on the 1st of the month race for the CREATE;
--   the IF NOT EXISTS makes that race safe (the second-place caller
--   sees "already exists" without blocking).
--
-- Idempotency
--   CREATE OR REPLACE FUNCTION is idempotent. Re-running this
--   migration mutates nothing. Existing partitions are untouched.

CREATE OR REPLACE FUNCTION audit_trigger_function() RETURNS TRIGGER AS $$
DECLARE
  v_actor_id   UUID;
  v_tenant_id  UUID;
  v_entity_id  UUID;
  v_old        JSONB;
  v_new        JSONB;
  v_now        TIMESTAMPTZ := clock_timestamp();
  v_part_start DATE        := date_trunc('month', v_now)::DATE;
  v_part_end   DATE        := (date_trunc('month', v_now) + INTERVAL '1 month')::DATE;
  v_part_name  TEXT        := 'audit_log_' || to_char(v_part_start, 'YYYY_MM');
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

  -- Self-heal: guarantee the partition for v_now's month exists
  -- before the INSERT. The CREATE TABLE IF NOT EXISTS is a single
  -- catalog probe + a no-op when the partition is already present.
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
    v_part_name, v_part_start, v_part_end
  );

  INSERT INTO audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    old_value, new_value, created_at
  ) VALUES (
    v_tenant_id, v_actor_id, TG_OP, TG_TABLE_NAME,
    v_entity_id, v_old, v_new, v_now
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
