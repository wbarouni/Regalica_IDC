-- Migration 056_workflow_steps.sql
-- Object: system-global ordered catalogue of agent steps that compose
--         each FSM phase (T0/T1/T2/T3) of the validation pipeline.
-- Author: ALGORIA Factory
-- Date: 2026-05-01
-- Depends on: 001_extensions.sql (uuidv7), 036_grants_regflow_app.sql
-- References: docs/04-WORKFLOW-UTILISATEUR-COMPLET.md (T0/T1/T2/T3),
--             docs/05-AGENTS-ET-PROMPTS-BANK.md §8 (deterministic
--             agents that have no prompt_bank entry)
--
-- The chatbot-py /upload route reads this catalogue to drive the T0
-- pipeline (and Phase 3 will use it for T1/T2/T3) — adding or
-- reordering an agent is a (056 + seed amendment) operation, no
-- code change. agent_type values mirror the prompt_bank.agent_type
-- vocabulary when an LLM is involved; deterministic agents
-- (ingestor_xml/dependency/temporal/notification/ged) carry the
-- canonical agent_type from doc 05 §8 even though they have no
-- matching prompt_bank row.
--
-- No tenant_id: the workflow grammar is the same across every
-- tenant. Same RLS pattern as question_types (open SELECT, REVOKE
-- writes on regflow_app + regflow_engine).

CREATE TABLE IF NOT EXISTS workflow_steps (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  phase           VARCHAR(10)  NOT NULL,
  step_order      SMALLINT     NOT NULL,
  agent_type      VARCHAR(64)  NOT NULL,
  function_name   VARCHAR(128) NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT workflow_steps_uk_phase_order
    UNIQUE (phase, step_order),

  CONSTRAINT workflow_steps_ck_phase
    CHECK (phase IN ('T0', 'T1', 'T2', 'T3')),

  CONSTRAINT workflow_steps_ck_step_order
    CHECK (step_order > 0),

  CONSTRAINT workflow_steps_ck_agent_type_format
    CHECK (agent_type ~ '^[a-z][a-z0-9_]*$'),

  CONSTRAINT workflow_steps_ck_function_name_format
    CHECK (function_name ~ '^[a-z][a-z0-9_]*$')
);

-- Hot-path index: chatbot-py loads "ordered active steps for phase X"
-- on every run kickoff.
CREATE INDEX IF NOT EXISTS workflow_steps_idx_active_phase
  ON workflow_steps (phase, step_order)
  WHERE is_active = TRUE AND deleted_at IS NULL;

ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_steps FORCE ROW LEVEL SECURITY;

CREATE POLICY workflow_steps_select ON workflow_steps
  FOR SELECT
  USING (TRUE);

REVOKE INSERT, UPDATE, DELETE ON workflow_steps FROM regflow_app;
REVOKE INSERT, UPDATE, DELETE ON workflow_steps FROM regflow_engine;
