#!/usr/bin/env bash
# Guard: fail the build if active code or configuration still references
# artefacts removed during Phase 0 brute refactoring, or the legacy npm scope.
#
# Scope (pragmatic): code + config only. docs/ is excluded because the
# product persona name and historical references live there legitimately.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PATTERNS=(
  '@regalica/'
  'persona-regalica'
  'rdg-schema'
  'shared-types'
  'design-tokens'
  'apps/frontend'
  'apps/chatbot-node'
)

SCAN_DIRS=(apps packages tools infra .github)

ROOT_FILES=(
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
  docker-compose.yml
  .env.example
  tsconfig.base.json
)

SELF="$(basename "${BASH_SOURCE[0]}")"

fail=0
report=""

for pat in "${PATTERNS[@]}"; do
  for dir in "${SCAN_DIRS[@]}"; do
    [ -d "$dir" ] || continue
    if hits=$(grep -rnF \
        --exclude-dir=node_modules \
        --exclude="$SELF" \
        -- "$pat" "$dir" 2>/dev/null); then
      report+="${hits}"$'\n'
      fail=1
    fi
  done

  for file in "${ROOT_FILES[@]}"; do
    [ -f "$file" ] || continue
    if hits=$(grep -nF -- "$pat" "$file" 2>/dev/null); then
      while IFS= read -r line; do
        report+="${file}:${line}"$'\n'
      done <<< "$hits"
      fail=1
    fi
  done
done

if [ "$fail" -eq 1 ]; then
  printf '[FAIL] Residual debt detected in active code/config:\n'
  printf '%s' "$report"
  exit 1
fi

printf '[OK] No residual debt found.\n'
