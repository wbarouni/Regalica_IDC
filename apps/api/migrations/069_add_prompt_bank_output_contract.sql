-- Migration 069_add_prompt_bank_output_contract.sql
-- Object: add `output_contract` column to prompt_bank so the chatbot-py
--         orchestrator can pick its post-processing pipeline (raw text vs
--         strict JSON parse) from a per-prompt operator-controlled field
--         instead of carrying a frozen if/elif on (agent_type, function_name)
--         in source.
-- Author: ALGORIA Factory
-- Date: 2026-05-02
-- Depends on: 023_prompt_bank.sql, 043_seed_prompt_bank.sql
-- References: docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3,
--             docs/05-AGENTS-ET-PROMPTS-BANK.md §7,
--             apps/chatbot-py/app/services/orchestrator.py (_invoke_aggregator)
--
-- Doctrine
--   Aggregator prompts (regalica/aggregate_*) emit free-form French
--   markdown for direct display to the user. All other prompts emit a
--   JSON envelope with a strict output_schema parsed downstream.
--   The orchestrator already discriminates by intent; this column lifts
--   the discriminant out of source so a future aggregator that switches
--   to a JSON envelope (or a non-aggregator that emits markdown) can
--   change behaviour via a 4-yeux promotion in prompt_bank, no code
--   release.
--
-- Backfill
--   The naming convention (regalica/aggregate_*) maps deterministically
--   to the runtime contract used pre-migration; the UPDATE preserves
--   that contract for every existing row. Future inserts must declare
--   output_contract explicitly (NOT NULL after backfill).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + the UPDATE is naturally
-- re-runnable.

-- DEFAULT 'json' guarantees that any pre-069 INSERT site that does not
-- mention the column (migration 058, the legacy 023_prompt_bank.test.ts
-- INSERTs, the workspace.test.ts INSERT, and any future non-aggregator
-- prompt) lands the conservative non-aggregator contract. The
-- subsequent UPDATE only flips the regalica/aggregate_* rows to
-- 'string'. This way new aggregator prompts must declare
-- `output_contract: "string"` explicitly while every other call site
-- keeps working without modification.
ALTER TABLE prompt_bank
  ADD COLUMN IF NOT EXISTS output_contract VARCHAR(16) NOT NULL DEFAULT 'json';

-- Backfill existing rows from the naming convention. The seed JSON file
-- (apps/api/seeds/prompts.json) declares the same value as a documentary
-- mirror; tests assert mirror equality.
UPDATE prompt_bank
   SET output_contract = 'string'
 WHERE agent_type = 'regalica'
   AND function_name LIKE 'aggregate\_%' ESCAPE '\'
   AND output_contract <> 'string';

ALTER TABLE prompt_bank
  ADD CONSTRAINT prompt_bank_ck_output_contract
  CHECK (output_contract IN ('string', 'json'));

DO $$
DECLARE
  v_string_count INTEGER;
  v_json_count   INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_string_count
    FROM prompt_bank WHERE output_contract = 'string';
  SELECT COUNT(*) INTO v_json_count
    FROM prompt_bank WHERE output_contract = 'json';
  RAISE NOTICE
    'migration 069: prompt_bank.output_contract added + backfilled (% string, % json)',
    v_string_count, v_json_count;
END $$;
