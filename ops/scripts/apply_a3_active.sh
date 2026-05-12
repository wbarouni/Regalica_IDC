#!/usr/bin/env bash
# ops/scripts/apply_a3_active.sh — wrapper for Lot A.3.active.
#
# Reads docs/prompts/investigator_analyze_fail_v3_VALIDATED_BY.txt,
# verifies it carries a valid UUID v4 distinct from
# SEED_AUTHOR_USER_ID, then exports the file content as
# SEED_VALIDATOR_ATTESTATION_UUID and calls `pnpm migrate:up:operator`.
#
# Migration 121 then double-checks that SEED_VALIDATOR_USER_ID equals
# SEED_VALIDATOR_ATTESTATION_UUID inside the same PG session, refusing
# to promote on any mismatch. The wrapper is the I/O bridge; the SQL
# is the audit boundary.
#
# Required env vars (passed by the human operator before invoking
# this script):
#   SEED_TENANT_ID            — dev tenant UUID
#   SEED_AUTHOR_USER_ID       — UUID of the migration-120 author
#   SEED_VALIDATOR_USER_ID    — UUID of the human validator (must
#                                match the file content)
#   SEED_VALID_FROM           — ISO-8601 timestamp for valid_from
#
# Usage:
#   SEED_TENANT_ID=... SEED_AUTHOR_USER_ID=... SEED_VALIDATOR_USER_ID=... \
#   SEED_VALID_FROM=... bash ops/scripts/apply_a3_active.sh

set -euo pipefail

# ─── Paths ──────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ATTESTATION_FILE="${REPO_ROOT}/docs/prompts/investigator_analyze_fail_v3_VALIDATED_BY.txt"

# ─── 1. File must exist ─────────────────────────────────────────────
if [[ ! -f "${ATTESTATION_FILE}" ]]; then
  printf '[FAIL] ops/scripts/apply_a3_active.sh — fichier de validation absent : %s\n' \
    "${ATTESTATION_FILE}" >&2
  printf '       Voir docs/prompts/investigator_analyze_fail_v3_REVIEW.md §"Procédure de validation 4-yeux".\n' >&2
  exit 2
fi

# ─── 2. Required env vars ───────────────────────────────────────────
for var in SEED_TENANT_ID SEED_AUTHOR_USER_ID SEED_VALIDATOR_USER_ID SEED_VALID_FROM; do
  if [[ -z "${!var:-}" ]]; then
    printf '[FAIL] ops/scripts/apply_a3_active.sh — env var %s manquante.\n' "$var" >&2
    exit 2
  fi
done

# ─── 3. Read file content (trim trailing newlines, no BOM) ──────────
# `printf '%s'` + redirected stdin handles the no-trailing-newline
# convention without invoking sed/awk. We then trim only the canonical
# whitespace (spaces, tabs, CR, LF) — anything else inside the file
# is reported as suspicious.
ATTESTATION_UUID="$(tr -d '[:space:]\r\n' < "${ATTESTATION_FILE}")"

# ─── 4. UUID v4 format check ────────────────────────────────────────
# Standard 8-4-4-4-12 hex pattern, lowercase. Refuses garbage early
# rather than letting the SQL cast raise a generic error later.
UUID_RE='^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
if [[ ! "${ATTESTATION_UUID}" =~ ${UUID_RE} ]]; then
  printf '[FAIL] ops/scripts/apply_a3_active.sh — contenu du fichier (%s) n''est pas un UUID v4 valide.\n' \
    "${ATTESTATION_UUID}" >&2
  printf '       Attendu : 8-4-4-4-12 hex lowercase, 3e groupe commence par 4, 4e par [89ab].\n' >&2
  exit 2
fi

# ─── 5. Refused patterns ────────────────────────────────────────────
if [[ "${ATTESTATION_UUID}" == "00000000-0000-0000-0000-000000000000" ]]; then
  printf '[FAIL] UUID zéro refusé.\n' >&2
  exit 2
fi
if [[ "${ATTESTATION_UUID}" == "${SEED_AUTHOR_USER_ID}" ]]; then
  printf '[FAIL] validator UUID (%s) == author UUID (%s). 4-yeux violé.\n' \
    "${ATTESTATION_UUID}" "${SEED_AUTHOR_USER_ID}" >&2
  exit 2
fi

# ─── 6. File ↔ env consistency ──────────────────────────────────────
if [[ "${ATTESTATION_UUID}" != "${SEED_VALIDATOR_USER_ID}" ]]; then
  printf '[FAIL] mismatch entre fichier et env :\n' >&2
  printf '       SEED_VALIDATOR_USER_ID = %s\n' "${SEED_VALIDATOR_USER_ID}" >&2
  printf '       contenu fichier         = %s\n' "${ATTESTATION_UUID}" >&2
  printf '       Re-signez le fichier OU corrigez l''env var, mais les deux DOIVENT coïncider.\n' >&2
  exit 2
fi

# ─── 7. All checks passed — propagate to migration via GUC env var ──
export SEED_VALIDATOR_ATTESTATION_UUID="${ATTESTATION_UUID}"

printf '[OK]   Wrapper checks passed.\n'
printf '       author     = %s\n' "${SEED_AUTHOR_USER_ID}"
printf '       validator  = %s\n' "${SEED_VALIDATOR_USER_ID}"
printf '       attestation= %s  (= SEED_VALIDATOR_ATTESTATION_UUID GUC)\n' "${ATTESTATION_UUID}"
printf '       Migration 121 will compare both GUCs inside the same PG session.\n'
printf '       Running pnpm --filter @regflow/api migrate:up:operator ...\n\n'

cd "${REPO_ROOT}"
pnpm --filter @regflow/api migrate:up:operator
