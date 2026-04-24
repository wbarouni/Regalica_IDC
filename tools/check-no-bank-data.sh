#!/usr/bin/env bash
# Guard C — permanent tenant-data protection.
#
# Fails the build if any banned bank-identifying pattern appears in the
# active tree. Patterns are cumulative: every new client ever onboarded
# adds its specific identifiers to BANNED_PATTERNS below.
#
# Scope: tracked files, excluding docs/archive/ and docs/as-is-captured/
# (historical corpora frozen before this rule existed).
#
# Exclusion — `--tenant-name-pattern PATTERN=REPLACEMENT` CLI examples:
# any line that contains `--tenant-name-pattern` is skipped because its
# presence proves the pattern is being consumed as an anonymisation
# input, not leaked as tenant data. Documenting the normalizer requires
# spelling the pattern at least once; the guard tolerates that.
#
# To onboard a new tenant:
#   1. Run normalize.py with --tenant-slug tenant-00X, --bank-code-placeholder,
#      --bank-id-placeholder, and the required --tenant-name-pattern entries.
#   2. Append the tenant's real identifiers (bank code, matricule,
#      legal name, slug variants) to BANNED_PATTERNS below.
#   3. Re-run this guard locally: bash tools/check-no-bank-data.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BANNED_PATTERNS=(
  # Tenant #001 — pilot, anonymised 2026-04
  'QNB'
  'qnb-tunisia'
  '0014247W'
)

SELF="$(basename "${BASH_SOURCE[0]}")"

fail=0
report=""

for pat in "${BANNED_PATTERNS[@]}"; do
  hits=$(git ls-files \
      | grep -vE '^(docs/archive/|docs/as-is-captured/)' \
      | grep -vE '^pnpm-lock\.yaml$' \
      | xargs -r grep -nF --binary-files=without-match -- "$pat" 2>/dev/null \
      | grep -v "^tools/${SELF}:" \
      | grep -v -- '--tenant-name-pattern' \
      || true)
  if [ -n "$hits" ]; then
    report+="  pattern: ${pat}"$'\n'
    report+="${hits}"$'\n'
    fail=1
  fi
done

if [ "$fail" -eq 1 ]; then
  printf '[FAIL] Banned tenant-identifying data detected:\n'
  printf '%s' "$report"
  printf '\nIf a new client onboarded, add its real identifiers to\nBANNED_PATTERNS in %s and re-run the normalizer with\nthe appropriate placeholders.\n' "$SELF"
  exit 1
fi

printf '[OK] No banned tenant-identifying data in tracked tree.\n'
