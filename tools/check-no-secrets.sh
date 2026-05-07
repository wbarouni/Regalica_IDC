#!/usr/bin/env bash
# Guard E (no-secrets): fail the build if a tracked file looks like it
# carries a real secret. The check has two layers:
#
#   1. STRUCTURAL — any tracked file matching the env-secret patterns
#      `.env`, `*.env` (other than `*.env.example`) is forbidden, even
#      if its contents are placeholders today. The .gitignore covers
#      future drops; this guard catches files already in the index.
#
#   2. CONTENT — scan the live working tree for high-entropy patterns
#      that match common credential shapes:
#        - Google AI Studio / Gemini API key:  AIza[0-9A-Za-z_-]{35}
#        - OpenAI key:                          sk-[A-Za-z0-9]{32,}
#        - GitHub PAT classic / fine:           ghp_/ghs_/gho_/ghu_/ghr_
#        - SSH private key headers:             -----BEGIN ... PRIVATE KEY-----
#        - JWT secret strings ≥32 chars hex     [a-fA-F0-9]{32,}=$ (excluded
#          intentionally — too noisy; JWTs need a different gate).
#
# False-positive policy: this guard is INTENTIONALLY conservative. It
# is the last line of defence before a push reaches GitHub; a manual
# allowlist comment can be added in a future revision once we have a
# concrete need. For now, no allowlist — every match is a fail.
#
# Scope: docs/ + tests/fixtures/ are EXCLUDED on purpose. Doc snippets
# routinely show example tokens; fixture XMLs may carry placeholder
# IDs that look like secrets to a regex.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SELF_BASENAME="$(basename "${BASH_SOURCE[0]}")"

EXCLUDED_DIRS=(
  '--exclude-dir=node_modules'
  '--exclude-dir=.git'
  '--exclude-dir=.venv'
  '--exclude-dir=__pycache__'
  '--exclude-dir=docs'
  '--exclude-dir=archive'
  '--exclude-dir=as-is-captured'
  '--exclude-dir=fixtures'
  '--exclude-dir=fixtures-source'
  '--exclude-dir=dist'
  '--exclude-dir=build'
  '--exclude-dir=coverage'
  '--exclude-dir=.pytest_cache'
  '--exclude-dir=.mypy_cache'
  '--exclude-dir=.ruff_cache'
)

# ----------------------------------------------------------------------------
# Layer 1 — structural: env files in the index.
# ----------------------------------------------------------------------------

# Tracked files matching env-secret shapes EXCEPT *.env.example.
tracked_env_files=$(git ls-files | grep -E '(^|/)\.env(\.[^/]+)?$|(^|/)[^/]*\.env$' | grep -vE '\.env\.example$|^\.env\.example$' || true)

# ----------------------------------------------------------------------------
# Layer 2 — content: high-entropy credential patterns in TRACKED files only.
#
# Scoping to `git ls-files` is critical: a developer's local `.env`
# (gitignored) carries a real GEMINI_API_KEY by design and would
# trigger every Gemini-shape match. Restricting the scan to tracked
# files means a real secret only fails the guard once it has been
# `git add`'d — which is exactly the moment the failure is useful.
# ----------------------------------------------------------------------------

PATTERNS=(
  'AIza[0-9A-Za-z_-]{35}'
  'sk-[A-Za-z0-9]{32,}'
  'ghp_[A-Za-z0-9]{36,}'
  'ghs_[A-Za-z0-9]{36,}'
  'gho_[A-Za-z0-9]{36,}'
  'ghu_[A-Za-z0-9]{36,}'
  'ghr_[A-Za-z0-9]{36,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)

# Build a newline-delimited list of tracked files, excluding self +
# the canonical templates (which carry harmless placeholders by design).
# Repo paths never contain newlines or unprintable bytes (enforced by
# git itself by default), so newline delimitation is safe here.
mapfile -t tracked_files < <(git ls-files | grep -vE \
  -e '^tools/check-no-secrets\.sh$' \
  -e '\.env\.example$' \
  -e '(^|/)docs/' \
  -e '(^|/)tests/fixtures/' \
  -e '(^|/)tests/fixtures-source/' \
  || true)

content_hits=""
if [ "${#tracked_files[@]}" -gt 0 ]; then
  for pat in "${PATTERNS[@]}"; do
    # Forward the file list as positional arguments to `grep -EHn`,
    # which returns "filename:lineno:match" lines we feed back into
    # the report. `|| true` keeps `set -e` from short-circuiting on
    # zero matches.
    found=$(grep -EHn \
      --binary-files=without-match \
      "${pat}" "${tracked_files[@]}" 2>/dev/null || true)
    if [ -n "${found}" ]; then
      content_hits+="${found}"$'\n'
    fi
  done
fi

# ----------------------------------------------------------------------------
# Verdict.
# ----------------------------------------------------------------------------

fail=0
report=""

if [ -n "${tracked_env_files}" ]; then
  report+=$'[FAIL] Tracked env files (use .env.example only):\n'
  report+="${tracked_env_files}"$'\n'
  fail=1
fi

if [ -n "${content_hits}" ]; then
  report+=$'[FAIL] Live secret patterns detected in working tree:\n'
  report+="${content_hits}"$'\n'
  fail=1
fi

if [ "${fail}" -eq 1 ]; then
  printf '%s' "${report}"
  printf '\n'
  printf 'Action: remove the offending content, rotate any leaked credential\n'
  printf '        (revoke + reissue the key with the upstream provider), and\n'
  printf '        re-run this guard locally before pushing.\n'
  exit 1
fi

printf '[OK] No secret pattern detected.\n'
