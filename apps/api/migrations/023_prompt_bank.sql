-- Migration 023_prompt_bank.sql
-- Object: prompt_bank table (AI agent prompts) + RLS platform_owner + validate_prompt_schema CHECKs + audit trigger
-- Author: ALGORIA Factory
-- Date: 2026-04-24
-- Depends on: 002_schema_helpers.sql (validate_prompt_schema, current_user_has_role),
--             004_users_roles.sql (author/validator FKs), 006_audit_trigger_function.sql,
--             007_seed_system_roles.sql (platform_owner role must exist for RLS to be usable)
-- References: Document 6 §8 (table), §22.2 (RLS policies)

CREATE TABLE IF NOT EXISTS prompt_bank (
  id                        UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),

  -- Natural business key
  agent_type                VARCHAR(50) NOT NULL,
  function_name             VARCHAR(100) NOT NULL,
  version                   INTEGER NOT NULL,

  -- Prompt content
  template                  TEXT NOT NULL,
  input_schema              JSONB NOT NULL,
  output_schema             JSONB NOT NULL,
  temperature               NUMERIC(3, 2) NOT NULL DEFAULT 0.3,
  max_tokens                INTEGER NOT NULL DEFAULT 4096,
  thinking_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  target_model              VARCHAR(50) NOT NULL DEFAULT 'gemini-2.5-flash',

  -- Lifecycle
  status                    VARCHAR(20) NOT NULL DEFAULT 'draft',

  -- Performance metrics (populated by runtime telemetry, Phase 4+)
  success_rate              NUMERIC(5, 4),
  avg_latency_ms            INTEGER,
  avg_cost_tokens           INTEGER,
  quality_score             NUMERIC(3, 2),
  sample_size               INTEGER,

  -- Bitemporal validity
  valid_from                TIMESTAMPTZ NOT NULL,
  valid_to                  TIMESTAMPTZ,

  -- 4-eyes governance
  author_user_id            UUID NOT NULL REFERENCES users(id),
  validator_user_id         UUID REFERENCES users(id),
  validated_at              TIMESTAMPTZ,

  -- Systemic audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ,

  CONSTRAINT prompt_bank_uk_natural UNIQUE (tenant_id, agent_type, function_name, version),
  CONSTRAINT prompt_bank_ck_valid_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT prompt_bank_ck_status CHECK (
    status IN ('draft', 'in_review', 'active', 'deprecated', 'ab_test_a', 'ab_test_b')
  ),
  CONSTRAINT prompt_bank_ck_temperature CHECK (temperature >= 0 AND temperature <= 2),
  CONSTRAINT prompt_bank_ck_four_eyes CHECK (
    (status IN ('draft', 'in_review') AND validator_user_id IS NULL)
    OR
    (status IN ('active', 'deprecated', 'ab_test_a', 'ab_test_b')
      AND validator_user_id IS NOT NULL
      AND validator_user_id != author_user_id)
  ),
  CONSTRAINT prompt_bank_ck_input_schema CHECK (validate_prompt_schema(input_schema, template)),
  CONSTRAINT prompt_bank_ck_output_schema CHECK (validate_prompt_schema(output_schema, template))
);

-- One active row per (tenant, agent_type, function_name). A/B test rows
-- carry statuses ab_test_a / ab_test_b, which fall outside this partial
-- predicate so the two variants may coexist during an experiment.
CREATE UNIQUE INDEX IF NOT EXISTS prompt_bank_idx_unique_active
  ON prompt_bank (tenant_id, agent_type, function_name)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS prompt_bank_idx_agent_function
  ON prompt_bank (tenant_id, agent_type, function_name)
  WHERE deleted_at IS NULL;

-- Row-Level Security: only members with the platform_owner role may
-- read or write prompt_bank. FORCE RLS ensures the DB owner itself is
-- subject to the policies (without FORCE, owners bypass RLS by default).
ALTER TABLE prompt_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_bank FORCE ROW LEVEL SECURITY;

CREATE POLICY prompt_bank_select ON prompt_bank
  FOR SELECT
  USING (current_user_has_role('platform_owner'));

CREATE POLICY prompt_bank_insert ON prompt_bank
  FOR INSERT
  WITH CHECK (current_user_has_role('platform_owner'));

CREATE POLICY prompt_bank_update ON prompt_bank
  FOR UPDATE
  USING (current_user_has_role('platform_owner'))
  WITH CHECK (current_user_has_role('platform_owner'));

CREATE POLICY prompt_bank_delete ON prompt_bank
  FOR DELETE
  USING (current_user_has_role('platform_owner'));

CREATE TRIGGER prompt_bank_audit
  AFTER INSERT OR UPDATE OR DELETE ON prompt_bank
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
