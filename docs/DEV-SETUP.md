# DEV-SETUP — REGFlow

Single canonical procedure for taking a fresh clone to a working dev
environment. **One command** for the bulk of the work, two manual
inputs (Gemini API key + accept Docker prompts on first run).

This document supersedes the manual procedure historically scattered
across `CLAUDE.md` §12 and operator memory. Anything not described
here is no longer required.

## Pre-requisites

- **Docker Desktop** ≥ 4.x with Compose V2 plugin (run `docker compose
version` to confirm; the legacy `docker-compose` binary is not
  enough).
- **Node.js 20** (an `engines.node` constraint pins this in the root
  `package.json`).
- **pnpm 10.33.0** (an `engines.pnpm` constraint pins this; `corepack
enable` then `corepack prepare pnpm@10.33.0 --activate` is the
  cleanest install).
- Outbound HTTPS to `generativelanguage.googleapis.com` for the
  Regalica LLM calls (chatbot-py).

## One-command bootstrap

```bash
git clone https://github.com/wbarouni/Regalica_IDC.git
cd Regalica_IDC
pnpm install
pnpm setup:dev
```

`pnpm setup:dev` runs the orchestrator at `tools/setup-dev.ts`. The
6 steps are documented in `docs/adr/0006-s1-reproducibility.md` §6;
in summary:

1. **bootstrap-env** — copies the four `.env.example` files to their
   matching `.env` if absent, generates a 48-byte `JWT_SECRET` and
   syncs it across every `.env` that declares the key, generates
   a `POSTGRES_PASSWORD` and rewrites `DATABASE_URL` accordingly,
   then prompts interactively for `GEMINI_API_KEY` (the only secret
   the script cannot generate).
2. **postgres up** — `docker compose up -d postgres` against the
   canonical `pgvector/pgvector:pg16` image with the volume
   `pgdata` mounted from the named volume.
3. **postgres healthcheck** — polls `docker inspect ...
.State.Health.Status` until `healthy` (timeout 60 s).
4. **migrate up:operator** — applies the 88 SQL migrations (87 base
   - `037a_seed_dev_tenant.sql`) with the operator GUCs (`SEED_*`)
     that turn the GUC-gated seed migrations from no-ops into actual
     data writes (rules, prompts, dev tenant, dev users).
5. **stack up** — `docker compose up -d api chatbot-py nginx`.
6. **seed-fixtures** — POSTs the 5 canonical XML fixtures
   (`tests/fixtures/golden/tenant-001/2026-02-28/filled/*.xml`) into
   the dev tenant via the API's `POST /api/tenants/:id/uploads` so
   the operator has runs ready to launch from the workspace UI.

The orchestrator is **idempotent**. Re-running it on a populated
machine prints `deduplicated=5` instead of `uploaded=5` and reports
`JWT_SECRET consistent`.

## Non-interactive mode (CI)

```bash
BOOTSTRAP_ENV_NONINTERACTIVE=true GEMINI_API_KEY=... pnpm setup:dev
```

`BOOTSTRAP_ENV_NONINTERACTIVE=true` skips the `GEMINI_API_KEY`
prompt; the value MUST be supplied via the env or chatbot-py
will refuse to start. The CI job `e2e-fresh-machine` exercises
exactly this branch with `GEMINI_API_KEY` pulled from the GitHub
secret of the same name.

## Verification

Once `setup:dev` returns, verify in three steps:

1. **Health endpoint** — single curl returns the canonical S1
   payload:

   ```bash
   curl -s http://localhost:3000/api/health/ | python -m json.tool
   ```

   Expected:

   ```json
   {
     "status": "ok",
     "schema_version": "075a_backdate_rules_valid_from.sql",
     "applied_migrations_count": 88,
     "expected_migrations_count": 88,
     "in_sync": true,
     "tenant_dev_present": true,
     "rules_active_count": 4611
   }
   ```

   `status` MUST be `"ok"` (HTTP 200). `out_of_sync` (HTTP 503)
   means a pending migration was not applied — re-run
   `pnpm --filter @regflow/api migrate:up:operator` after exporting
   the `SEED_*` env vars (see the orchestrator's step 4).

2. **Frontend** — start the Vite dev server and load the workspace:

   ```bash
   pnpm --filter @regflow/web dev
   ```

   Open `http://localhost:5173/workspace`. The Persona sidebar
   shows the dev tenant + the compliance officer + 4611 active
   rules; the Filings tab lists the 5 seeded XML uploads.

3. **End-to-end run** — from the workspace, click any seeded
   upload → "Lancer la validation". The run should reach
   `status='completed'` within ~30 s with KPI grid + FailsTable +
   synthesis_artifact markdown rendered.

## Per-developer customisations

The canonical Compose stack lives in `docker-compose.yml` +
`docker-compose.override.yml` (both committed). Personal tweaks
(port remap, alternative DSN, host PG routing) belong in
`docker-compose.local.yml` — that file is gitignored. Compose
merges base → override → local in declaration order.

Example `docker-compose.local.yml` to publish Postgres on a
non-default host port:

```yaml
services:
  postgres:
    ports:
      - '15432:5432'
```

## Known issues + resolutions

| Symptom                                                              | Likely cause                                                                          | Resolution                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `chatbot-py` exits with `ValueError: No API key was provided`        | `GEMINI_API_KEY` empty in the root `.env`                                             | Re-run `pnpm bootstrap:env` (interactive) or export the key and re-run `pnpm setup:dev`                                                     |
| `POST /runs → 501 COLUMN_NOT_FOUND`                                  | `migrate:up` was used instead of `migrate:up:operator`; GUC-gated migrations no-opped | `SEED_DEV_TENANT=true SEED_AUTHOR_USER_ID=… pnpm --filter @regflow/api migrate:up:operator`                                                 |
| `seed-fixtures` reports `network error`                              | API container not yet listening on 3000                                               | Re-run `pnpm setup:dev`; the orchestrator gates on the postgres healthcheck but only sleeps 5 s for api/chatbot-py — bump the wait or retry |
| `/api/health` returns `tenant_dev_present: false`                    | Migration 037a ran without the `app.seed_dev_tenant` GUC                              | Same fix as the 501 row above                                                                                                               |
| Local Postgres on host port 5432 conflicts with the Compose Postgres | Two listeners fighting for the same TCP port                                          | Stop the host Postgres OR override the published port in `docker-compose.local.yml` (see example above)                                     |

## Useful sub-scripts

Each step of the orchestrator is callable individually for debugging:

```bash
pnpm bootstrap:env                     # step 1
pnpm --filter @regflow/api migrate:up:operator   # step 4
pnpm seed:fixtures                     # step 6
pnpm test:tools                        # 30 unit tests on the tools/ scripts
```

The full migrator interface is unchanged for production:

```bash
pnpm --filter @regflow/api migrate:status   # applied / pending / drifted
pnpm --filter @regflow/api migrate:up       # legacy: no GUCs, GUC-gated migs no-op
pnpm --filter @regflow/api migrate:up:operator   # S1 L3: applies with GUCs
pnpm --filter @regflow/api migrate:verify   # checksum drift check
```

## References

- [`docs/adr/0006-s1-reproducibility.md`](adr/0006-s1-reproducibility.md) — design rationale for every S1 livrable.
- [`docs/adr/0005-tranche-1-1-migration-drift-and-launch-error-surface.md`](adr/0005-tranche-1-1-migration-drift-and-launch-error-surface.md) — the prior fix that exposed the reproducibility gap.
- [`apps/api/migrations/README.md`](../apps/api/migrations/README.md) — migration file conventions.
- [`CLAUDE.md`](../CLAUDE.md) §12 — points here for the canonical procedure.
