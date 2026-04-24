#!/usr/bin/env bash
# Guard D — zero-hardcoding in applicative code.
#
# Scope: .ts, .py, .sh files only. SQL migrations are NOT scanned — the
# canonical schema DDL is a different concern (Document 6 §26) with its
# own structural whitelist (CREATE POLICY role codes, VECTOR(768), FSM
# CHECK IN (...) lists). Guard D targets the applicative layer where
# values must live in env vars or in apps/api/seeds/*.json rather than
# being baked into code.
#
# Rules (case-sensitive):
#   D-001 — LLM model literals and provider names
#   D-002 — canonical agent class names (14 agents from Document 5)
#   D-003 — tenant placeholder / anonymised identifiers
#
# Permanent exclusions (applied as path filters):
#   - apps/api/seeds/                      — canonical values belong here
#   - tests/fixtures/                      — golden baseline data
#   - docs/archive/, docs/as-is-captured/  — frozen historical corpora
#   - node_modules/, pnpm-lock.yaml        — deps
#   - tools/golden-normalizer/             — the anonymisation tool itself
#   - tools/verify-golden-integrity/       — verifies tenant-001 fixtures
#   - tests/ directories + *.test.ts / *.spec.ts / test_*.py / *_test.py
#     — test code is allowed to hardcode fixture values (FSM-adjacent,
#       not a runtime-configurable surface). The doctrine targets
#       applicative (non-test) code.
#   - .env.example                         — the other canonical destination
#
# Per-line exemption: any line containing `nosemgrep: no-hardcoding`
# is skipped. Use sparingly and justify in an inline comment.
#
# Comment lines (starting with //, #, *) are skipped automatically so
# that docstrings and inline comments can reference the literals.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SELF="tools/$(basename "${BASH_SOURCE[0]}")"

# Rule patterns — extended regex (grep -E). Word boundaries (\b) prevent
# matching identifiers that merely contain a keyword as a substring:
# `ollama_url` (a variable name ending in `_url` which is a word char) is
# NOT matched by `\bollama\b`, whereas `"ollama"` (quoted literal) is.
LLM_PATTERN='\b(gemini-[a-z0-9][a-z0-9.-]*|gpt-[34][a-z0-9.-]*|claude-[a-z0-9][a-z0-9.-]*|ollama|qwen[0-9.:a-z-]*)\b'
AGENT_PATTERN='\b(InvestigatorAgent|NotificationAgent|ReporterAgent|VisualizerAgent|CitationAgent|GedAgent|DiffAgent|HistoricalAgent|IngestorXMLAgent|DependencyAgent|TemporalAgent|RuleExcelAssistAgent|RuleFormAssistAgent|ReferentialIngestorAgent)\b'
TENANT_PATTERN='\b(tenant-001|BANK-CODE|BANK-ID|TENANT-NAME|TENANT-GROUP|TENANT-SUBSIDIARY)\b'

FILES=$(git ls-files '*.ts' '*.py' '*.sh' \
  | grep -vE '^(apps/api/seeds/|tests/fixtures/|docs/archive/|docs/as-is-captured/|node_modules/|tools/golden-normalizer/|tools/verify-golden-integrity/)' \
  | grep -vE '(^|/)tests?/' \
  | grep -vE '\.(test|spec)\.ts$' \
  | grep -vE '(^|/)test_[^/]+\.py$' \
  | grep -vE '(^|/)[^/]+_test\.py$' \
  | grep -vxF "$SELF" \
  || true)

fail=0
report=""

check_rule() {
  local rule_id="$1"
  local rule_label="$2"
  local pattern="$3"
  if [ -z "$FILES" ]; then
    return
  fi
  local hits
  hits=$(echo "$FILES" | xargs -r grep -nE "$pattern" 2>/dev/null \
    | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|#|\*)' \
    | grep -vF 'nosemgrep: no-hardcoding' \
    || true)
  if [ -n "$hits" ]; then
    report+="  [${rule_id}] ${rule_label}:"$'\n'
    while IFS= read -r line; do
      report+="    ${line}"$'\n'
    done <<< "$hits"
    fail=1
  fi
}

check_rule "D-001" "LLM model literal or provider name" "$LLM_PATTERN"
check_rule "D-002" "canonical agent class name as string literal" "$AGENT_PATTERN"
check_rule "D-003" "tenant placeholder / anonymised identifier" "$TENANT_PATTERN"

if [ "$fail" -eq 1 ]; then
  printf '[FAIL] Hardcoding detected in applicative code:\n'
  printf '%s' "$report"
  printf '\nFix by moving the value to apps/api/seeds/*.json, to an env var,\nor by adding `# nosemgrep: no-hardcoding` (or `// nosemgrep: no-hardcoding`)\non the line if the literal is a compile-time structural constraint\n(e.g. pydantic Literal[...] membership).\n'
  exit 1
fi

printf '[OK] No hardcoding in applicative code.\n'
