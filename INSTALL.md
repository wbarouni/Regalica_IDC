# INSTALL — REGFlow team install (3 commands)

Bring the **complete** REGFlow stack — Postgres + 96 migrations + seeded
referentials (annexes, rubriques, rules, prompts, intent specialists) +
golden fixtures + Node API + Python chatbot + frontend — to your local
machine in three commands.

This document is the contract between the maintainer and the team. The
canonical CI gate `e2e-fresh-machine` runs the same flow on every push:
if CI is green, the install path below is guaranteed to work on a
clean Ubuntu/macOS/Windows machine that meets the prerequisites.

---

## Prerequisites

Install once per machine:

| Tool        | Min version | Why                              |
| ----------- | ----------- | -------------------------------- |
| Git         | any         | Clone the repo                   |
| Node.js     | 20+         | Backend API + frontend           |
| pnpm        | 9+          | Workspace package manager        |
| uv (Astral) | latest      | Python service deps              |
| Docker      | running     | Postgres + containerised runtime |

Quick install on macOS / Linux:

```bash
# Node 20 via nvm (or your favourite manager)
nvm install 20 && nvm use 20

# pnpm
npm install -g pnpm@10

# uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Docker — install Docker Desktop (macOS / Windows) or docker-ce (Linux)
# and make sure `docker info` succeeds before continuing.
```

On Windows: install Docker Desktop, Node 20 LTS from nodejs.org, then
`npm i -g pnpm@10`, then `irm https://astral.sh/uv/install.ps1 | iex`.

You'll also need a **Google AI Studio Gemini API key** (free tier OK):
get one at <https://aistudio.google.com/apikey>. Each team member uses
their own — the bootstrap script asks for it interactively the first
time and stores it in your local `.env` (gitignored, never leaves your
machine).

---

## The 3 commands

```bash
git clone https://github.com/wbarouni/Regalica_IDC.git
cd Regalica_IDC
pnpm bootstrap
```

`pnpm bootstrap` chains `pnpm install && pnpm setup:dev`. The
underlying [`tools/setup-dev.ts`](tools/setup-dev.ts) orchestrator runs
six idempotent steps:

| #   | Step                            | What                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `bootstrap-env`                 | Generates `.env` files from `.env.example`, prompts once for the `GEMINI_API_KEY`, signs a fresh `JWT_SECRET`.                                                                                                                                                                             |
| 2   | `docker compose up -d postgres` | Pulls + starts Postgres 16 + pgvector, mounts the named volume `pgdata`.                                                                                                                                                                                                                   |
| 3   | wait postgres healthcheck       | Polls `pg_isready` until ready (≤ 60s).                                                                                                                                                                                                                                                    |
| 4   | `pnpm migrate:up:operator`      | Applies the 96 migrations with the dev operator GUCs (`SEED_TENANT_ID`, `SEED_AUTHOR_USER_ID`, `SEED_VALIDATOR_USER_ID`, `SEED_VALID_FROM`). The GUC-gated seed migrations turn from no-ops into actual data writes; the dev tenant + dev users are created by `037a_seed_dev_tenant.sql`. |
| 5   | `docker compose up -d`          | Builds + starts the api + chatbot-py + nginx containers.                                                                                                                                                                                                                                   |
| 6   | `seed-fixtures`                 | Uploads 5 canonical XMLs from `tests/fixtures/golden/tenant-001/` into the dev tenant so the team has working data to validate.                                                                                                                                                            |

After ~5–10 min on a cold machine (Docker image pulls + builds), the
script prints:

```
================================================================
  Dev environment ready.

  Frontend (Vite dev server):  pnpm --filter @regflow/web dev
                                http://localhost:5173
  API (Express):                http://localhost:3000
  Health check:                 curl http://localhost:3000/api/health
  chatbot-py (FastAPI):         http://localhost:8000

  Tenant id (dev):  d3a7c6e6-2d18-4ff6-8183-94507eded6d7
  Author user id:   2cb0ce35-4b43-499f-b23a-722ef86902ce
================================================================
```

The **frontend dev server** does NOT auto-start — Vite is intentionally
left out of the docker-compose so it can hot-reload against your local
source tree. Start it once when you want to use the app:

```bash
pnpm --filter @regflow/web dev
```

Open <http://localhost:5173>. Upload any XML from
`tests/fixtures/golden/tenant-001/2026-02-28/filled/`, click `Lancer`,
chat with Regalica.

---

## Daily usage

```bash
docker compose up -d                 # bring the stack up after a reboot
pnpm --filter @regflow/web dev       # frontend hot-reload
docker compose down                  # stop everything (keeps the DB volume)
docker compose down -v               # stop AND wipe the DB volume (full reset)
```

Re-running `pnpm bootstrap` is **idempotent**: it does not wipe the DB,
does not re-prompt for `GEMINI_API_KEY` if `.env` already has one, and
applies any new migrations that landed since the last run.

---

## Troubleshooting

### `docker info` fails

Docker Desktop is not running. Start it and wait for the whale icon
to settle, then re-run `pnpm bootstrap`.

### Migration step 4 fails with `42501 insufficient_privilege`

A new migration introduced a column that the `regflow_engine` role
cannot UPDATE. Check the migration's `GRANT` clause and verify it
extends migration `036_grants_regflow_app.sql`. This is a maintainer
issue — open an issue with the migration filename + the SQL error.

### Step 6 fails with `ECONNREFUSED 127.0.0.1:3000`

The API container did not become ready in time. Inspect logs:

```bash
docker compose logs --tail=100 api
docker compose logs --tail=100 chatbot-py
```

Then re-run only the failing step:

```bash
pnpm seed:fixtures
```

### `GEMINI_API_KEY missing` from chatbot-py logs

You skipped the prompt or your key is invalid. Edit `.env` at the
repo root, set `GEMINI_API_KEY=AIza…`, then `docker compose restart
chatbot-py`.

### Port 5432 / 3000 / 8000 / 80 already in use

A local Postgres / Node / FastAPI / Nginx is bound to the same port.
Either stop them or override the ports in
`docker-compose.local.yml` (gitignored — meant for per-developer
overrides). Example skeleton:

```yaml
# docker-compose.local.yml — your personal port remap, never committed
services:
  postgres:
    ports: ['55432:5432']
  api:
    ports: ['3001:3000']
```

Then your local `DATABASE_URL` (in `.env`) needs `localhost:55432` if
you connect from outside Docker.

### Windows: `bash` not found / shell scripts fail

The bootstrap script uses POSIX shell helpers (`docker compose`, `git`,
etc.). Use Git Bash or WSL2 to run `pnpm bootstrap`. PowerShell alone
is not sufficient because the underlying tools/setup-dev.ts spawns
shell commands.

---

## Updating after the maintainer pushes

```bash
git pull
pnpm bootstrap
```

`pnpm bootstrap` re-runs `pnpm install` (picks up new dependencies)
and `pnpm setup:dev` (picks up new migrations). Your DB state is
preserved across runs.

If a new env variable was added to `.env.example`, `bootstrap-env`
prompts you for it on the next run. If you skip the prompt, the
service that needs it will refuse to start with a clear message
naming the missing variable.

---

## What you do NOT need to do

- ❌ Manual `psql` to apply migrations — `pnpm bootstrap` handles it.
- ❌ Manual `INSERT` for the dev tenant / dev user — migration `037a` seeds them.
- ❌ Manual seed of prompt_bank / referentials — migrations 038–096 cover everything.
- ❌ Manual `pip install` / `pyenv` — `uv sync` happens inside the chatbot-py Docker build.
- ❌ Connect to a remote staging DB — everything runs locally.
- ❌ Set up Gemini billing — the free tier of Google AI Studio is enough for dev.

---

## How this stays smooth

The maintainer's discipline (codified in
[`CLAUDE.md`](CLAUDE.md) §14):

1. Every new runtime variable lands in `.env.example` at the **same
   commit** as the code that reads it.
2. Every new migration is GUC-gated when it carries seeded data, so
   `migrate:up:operator` keeps applying everything cleanly.
3. The CI job `e2e-fresh-machine` runs `pnpm bootstrap` on a fresh
   ubuntu-latest runner on every push and asserts `/api/health`
   reports `in_sync=true`, `tenant_dev_present=true`, `applied=expected`.
   If that job is green on a commit, the install above is guaranteed
   to work for that commit.
4. Guard E (`tools/check-no-secrets.sh`) blocks any push that would
   leak a real key through a tracked file.

So when you `git pull` and `pnpm bootstrap` runs cleanly — that's not
a hope, it's a contract.
