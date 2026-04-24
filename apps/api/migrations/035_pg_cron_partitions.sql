-- Migration 035_pg_cron_partitions.sql
-- Object: audit_log partition management functions (+ optional pg_cron wiring)
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 005_audit_log.sql
-- References: Document 6 §17 (partitioning strategy), §26 entry 035
--
-- Document 6 §17 says partitions are "créées dynamiquement par pg_cron
-- ou par application" — the "or" is load-bearing. The standard
-- pgvector/pgvector:pg16 image does not ship pg_cron; a production
-- on-prem deployment may install it, dev/test/CI typically does not.
--
-- This migration therefore installs:
--   1. Portable plpgsql functions that any scheduler can invoke:
--      audit_log_create_partition_for_month(year, month)
--      audit_log_create_next_month_partition()
--      audit_log_detach_old_partitions(retention_years)
--   2. A guarded DO block that registers pg_cron jobs IF AND ONLY IF
--      the pg_cron extension is already installed. We never run
--      CREATE EXTENSION pg_cron here: that requires superuser and a
--      cluster preload configuration which is a deployment concern,
--      not a migration concern.
--
-- Non-pg_cron deployments must schedule the functions externally:
--   * monthly   (1st at 00:00 UTC) — SELECT audit_log_create_next_month_partition();
--   * quarterly (1st at 00:00 UTC) — SELECT audit_log_detach_old_partitions(10);
-- via host cron, systemd timer, Kubernetes CronJob, or an application-
-- level periodic task.

-- 1. Create partition for an arbitrary (year, month). Idempotent.
CREATE OR REPLACE FUNCTION audit_log_create_partition_for_month(
  p_year INTEGER,
  p_month INTEGER
) RETURNS TEXT AS $$
DECLARE
  start_date DATE := make_date(p_year, p_month, 1);
  end_date   DATE := (start_date + INTERVAL '1 month')::DATE;
  part_name  TEXT := 'audit_log_' || to_char(start_date, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
    part_name, start_date, end_date
  );
  RETURN part_name;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the partition for the month AFTER the current one. Intended
-- target of a monthly scheduler (1st of each month). Calling in advance
-- guarantees writes at month-boundary do not hit a missing partition.
CREATE OR REPLACE FUNCTION audit_log_create_next_month_partition() RETURNS TEXT AS $$
DECLARE
  next_month_start DATE := (date_trunc('month', NOW()) + INTERVAL '1 month')::DATE;
BEGIN
  RETURN audit_log_create_partition_for_month(
    EXTRACT(YEAR FROM next_month_start)::INTEGER,
    EXTRACT(MONTH FROM next_month_start)::INTEGER
  );
END;
$$ LANGUAGE plpgsql;

-- 3. Detach partitions older than the retention window. Parses the
-- YYYY_MM suffix from child table names rather than introspecting
-- partition bounds from pg_inherits + pg_class (simpler, matches the
-- naming convention enforced by the create functions above). Detached
-- partitions remain as regular tables; the operator's cold-archival
-- pipeline exports and drops them separately.
CREATE OR REPLACE FUNCTION audit_log_detach_old_partitions(
  p_retention_years INTEGER DEFAULT 10
) RETURNS INTEGER AS $$
DECLARE
  cutoff_date DATE := (date_trunc('month', NOW()) - make_interval(years := p_retention_years))::DATE;
  part_record RECORD;
  part_upper  DATE;
  part_suffix TEXT;
  detached    INTEGER := 0;
BEGIN
  FOR part_record IN
    SELECT c.oid, c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'audit_log'::regclass
      AND c.relname ~ '^audit_log_[0-9]{4}_[0-9]{2}$'
  LOOP
    part_suffix := substring(part_record.relname FROM 'audit_log_(.*)');
    -- part_suffix like '2030_03' -> upper bound = first of next month.
    part_upper := (to_date(part_suffix, 'YYYY_MM') + INTERVAL '1 month')::DATE;
    IF part_upper <= cutoff_date THEN
      EXECUTE format('ALTER TABLE audit_log DETACH PARTITION %I', part_record.relname);
      detached := detached + 1;
    END IF;
  END LOOP;
  RETURN detached;
END;
$$ LANGUAGE plpgsql;

-- 4. If pg_cron is installed cluster-wide, register the two jobs. We do
-- NOT attempt CREATE EXTENSION here: that requires superuser and the
-- shared_preload_libraries setting, both outside a regular migration's
-- authority. Operators who run pg_cron install it out-of-band; we just
-- latch onto it if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions
    WHERE name = 'pg_cron' AND installed_version IS NOT NULL
  ) THEN
    PERFORM cron.schedule(
      'audit_log_monthly_partition',
      '0 0 1 * *',
      $job$SELECT audit_log_create_next_month_partition();$job$
    );
    PERFORM cron.schedule(
      'audit_log_quarterly_detach',
      '0 0 1 */3 *',
      $job$SELECT audit_log_detach_old_partitions(10);$job$
    );
  END IF;
END $$;
