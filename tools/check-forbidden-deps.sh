#!/usr/bin/env bash
# Guard: fail the build if a forbidden dependency is reintroduced in any
# package.json or pyproject.toml of the active monorepo (archives excluded).
#
# Forbidden families: Sequelize, Drizzle, Prisma (npm ORMs),
# Angular, Next.js (npm frameworks), Supabase (npm BaaS),
# SQLAlchemy, Alembic (python ORM + migration tool).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

NPM_PATTERNS=(
  '"sequelize"'
  '"sequelize-'
  '"@sequelize/'
  '"drizzle-orm"'
  '"drizzle-kit"'
  '"drizzle-'
  '"prisma"'
  '"@prisma/'
  '"@angular/'
  '"angular"'
  '"angular-'
  '"next"'
  '"@next/'
  '"@supabase/'
  '"supabase"'
  '"supabase-'
)

PY_PATTERNS=(
  'sqlalchemy'
  'alembic'
)

mapfile -t PKG_FILES < <(find . -name package.json \
  -not -path '*/node_modules/*' \
  -not -path '*/docs/archive/*' \
  -not -path '*/.git/*')

mapfile -t PY_FILES < <(find . -name pyproject.toml \
  -not -path '*/node_modules/*' \
  -not -path '*/docs/archive/*' \
  -not -path '*/.git/*')

fail=0
report=""

for pat in "${NPM_PATTERNS[@]}"; do
  for file in "${PKG_FILES[@]}"; do
    [ -f "$file" ] || continue
    hits=$(grep -nF -- "$pat" "$file" 2>/dev/null || true)
    if [ -n "$hits" ]; then
      while IFS= read -r line; do
        report+="  ${file}:${line}"$'\n'
      done <<< "$hits"
      fail=1
    fi
  done
done

for pat in "${PY_PATTERNS[@]}"; do
  for file in "${PY_FILES[@]}"; do
    [ -f "$file" ] || continue
    hits=$(grep -niF -- "$pat" "$file" 2>/dev/null || true)
    if [ -n "$hits" ]; then
      while IFS= read -r line; do
        report+="  ${file}:${line}"$'\n'
      done <<< "$hits"
      fail=1
    fi
  done
done

if [ "$fail" -eq 1 ]; then
  printf '[FAIL] Forbidden dependency detected:\n'
  printf '%s' "$report"
  exit 1
fi

printf '[OK] No forbidden dependency found.\n'
