#!/usr/bin/env bash
# Guard D — zero-hardcoding in applicative code (semgrep ultra-strict).
#
# Replaces the prior regex-based check with a semgrep ruleset
# (.semgrep/no-hardcoding.yml) that codifies six rules:
#
#   D-001  LLM model literal or provider name        (TS / JS / Py)
#   D-002  Canonical agent class name as literal     (TS / JS / Py)
#   D-003  Tenant placeholder / anonymised id        (TS / JS / Py)
#   D-004  String literal assigned to a configurable
#          variable name                             (TS / JS / Py)
#   D-005  Hardcoded http:// or https:// URL         (TS / JS / Py)
#   D-006  Numeric literal > 100 in assignment       (TS / JS / Py)
#
# Rule D-007 (SQL DEFAULT literals) is intentionally NOT in the
# ruleset yet — it requires the platform_config table and several
# amendment migrations to land first.
#
# Path exclusions and per-line `nosemgrep` overrides are declared
# in .semgrep/no-hardcoding.yml.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v semgrep >/dev/null 2>&1; then
  printf '[FAIL] semgrep is required for Guard D.\n' >&2
  printf '       Install: pip install semgrep==1.161.0\n' >&2
  exit 2
fi

# --error          → exit 1 on any ERROR-severity finding
# --quiet          → suppress banner / progress output
# --metrics off    → no telemetry phone-home
# --no-git-ignore  → respect path-exclude lists in the YAML, not .gitignore
# --disable-version-check → no network call to semgrep registry
output=$(semgrep \
  --config .semgrep/no-hardcoding.yml \
  --error \
  --quiet \
  --metrics off \
  --disable-version-check \
  . 2>&1) || semgrep_exit=$?

semgrep_exit="${semgrep_exit:-0}"

if [ "$semgrep_exit" -ne 0 ]; then
  printf '%s\n' "$output" >&2
  printf '\n[FAIL] ZERO-HARDCODING VIOLATION — move to platform_config or seeds/\n' >&2
  exit 1
fi

printf '[OK] No hardcoding in applicative code.\n'
