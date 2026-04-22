# 08 — Scripts et déploiement

---

## Scripts racine (`package.json`)

| Script | Commande |
|---|---|
| `dev` | `docker compose up` |
| `dev:down` | `docker compose down` |
| `build` | `pnpm -r --if-present build` |
| `test` | `pnpm -r --if-present test` |
| `lint` | `pnpm -r --if-present lint` |
| `lint:fix` | `pnpm -r --if-present lint:fix` |
| `format` | `prettier --write .` |
| `format:check` | `prettier --check .` |
| `typecheck` | `pnpm -r --if-present typecheck` |

Les scripts `build`, `test`, `lint`, `typecheck` sont exécutés récursivement sur tous les packages du workspace via `pnpm -r`.

---

## Docker Compose (`docker-compose.yml`)

Le fichier est à la racine du dépôt. Le projet Docker Compose est nommé `regalica-idc`.

### Services

| Service | Image / Build | Port hôte | Port conteneur | Dépendances |
|---|---|---|---|---|
| `postgres` | `pgvector/pgvector:pg16` | 5432 | 5432 | — |
| `ollama` | `ollama/ollama:latest` | 11434 | 11434 | — |
| `api` | Build `apps/api/Dockerfile` | 3000 | 3000 | `postgres` (healthy) |
| `chatbot-py` | Build `apps/chatbot-py/Dockerfile` | 8000 | 8000 | `postgres` (healthy), `ollama` (started) |
| `chatbot-node` | Build `apps/chatbot-node/Dockerfile` | 3001 | 3001 | `postgres` (healthy), `chatbot-py` (started) |
| `frontend` | Build `apps/frontend/Dockerfile` | 4200 | 80 | — |
| `nginx` | `nginx:1.27-alpine` | 80 | 80 | `api`, `chatbot-node`, `frontend` |

### Volumes

| Volume | Usage |
|---|---|
| `pgdata` | Données PostgreSQL persistantes |
| `ollama-models` | Modèles Ollama téléchargés |

### Variables d'environnement

Le fichier `.env` est chargé via `env_file` pour les services `api`, `chatbot-py`, `chatbot-node`. Les variables suivantes sont injectées dans les conteneurs :

| Variable | Valeur par défaut Docker Compose |
|---|---|
| `POSTGRES_USER` | `regalica_app` |
| `POSTGRES_PASSWORD` | `change_me_in_local_env` |
| `POSTGRES_DB` | `regalica` |
| `DATABASE_URL` | Construite dynamiquement à partir des variables ci-dessus |
| `OLLAMA_URL` | `http://ollama:11434` (chatbot-py uniquement) |
| `CHATBOT_PY_URL` | `http://chatbot-py:8000` (chatbot-node uniquement) |

### Healthcheck PostgreSQL

```
pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}
interval: 10s · timeout: 5s · retries: 5
```

### Initialisation PostgreSQL

Le fichier `infra/docker/postgres-init.sql` est monté en lecture seule dans `/docker-entrypoint-initdb.d/00-init.sql`. Il est exécuté une seule fois au premier démarrage du conteneur.

### Reverse proxy Nginx

La configuration Nginx est montée depuis `infra/nginx/nginx.conf`. Nginx écoute sur le port 80 de l'hôte et route vers `api`, `chatbot-node`, et `frontend`.

---

## Dockerfiles

### `apps/api/Dockerfile`

Build en deux étapes (`builder` / `runtime`), image de base `node:20-alpine`.

| Étape | Actions |
|---|---|
| `builder` | Active pnpm 10.33.0 via corepack, installe les dépendances filtrées `@regalica/api`, compile TypeScript (`tsc`), déploie en mode production via `pnpm deploy --prod` |
| `runtime` | Crée un utilisateur non-root `app`, copie `/deploy`, expose le port 3000 |

Healthcheck : `node -e "require('http').get('http://localhost:3000/health', ...)"` — interval 30s, timeout 5s, start-period 15s, retries 3.

Commande de démarrage : `node dist/index.js`.

---

### `apps/chatbot-node/Dockerfile`

Structure identique à `apps/api/Dockerfile`.

| Étape | Actions |
|---|---|
| `builder` | Active pnpm 10.33.0, installe `@regalica/chatbot-node`, compile, déploie prod |
| `runtime` | Utilisateur non-root `app`, port 3001 |

Healthcheck : même pattern HTTP que `apps/api`, sur port 3001.

Commande de démarrage : `node dist/index.js`.

---

### `apps/chatbot-py/Dockerfile`

Build en deux étapes, image de base `python:3.12-slim`. Utilise `uv` (gestionnaire de paquets Python Astral) copié depuis `ghcr.io/astral-sh/uv:latest`.

| Étape | Actions |
|---|---|
| `builder` | Variables `UV_COMPILE_BYTECODE=1`, `UV_LINK_MODE=copy`, `UV_PYTHON_DOWNLOADS=never`. Copie `pyproject.toml`, `README.md`, `app/`. Exécute `uv sync --no-dev` |
| `runtime` | Crée utilisateur `app`, copie `.venv` et `app/` depuis le builder |

Variables d'environnement runtime : `PYTHONDONTWRITEBYTECODE=1`, `PYTHONUNBUFFERED=1`, `PATH="/app/.venv/bin:$PATH"`.

Healthcheck : `python -c "import httpx,sys; sys.exit(0 if httpx.get('http://localhost:8000/health/',timeout=3).status_code==200 else 1)"`.

Commande de démarrage : `uvicorn app.main:app --host 0.0.0.0 --port 8000`.

---

### `apps/frontend/Dockerfile`

Build en deux étapes : compilation Angular puis service Nginx.

| Étape | Actions |
|---|---|
| `builder` | Node 20-alpine, pnpm 10.33.0, installe `@regalica/frontend`, exécute `ng build` |
| `runtime` | Nginx 1.27-alpine, copie `dist/frontend/browser/` vers `/usr/share/nginx/html`, monte `nginx.conf` |

Healthcheck : `wget -q --spider http://localhost/`.

Commande de démarrage : `nginx -g "daemon off;"`.

---

## CI/CD — GitHub Actions (`.github/workflows/ci.yml`)

Le workflow s'appelle `CI`. Il se déclenche sur :

- Push sur les branches `main`, `v2-from-scratch`, `feature/**`, `fix/**`
- Pull Request vers `main`

La concurrence est gérée par groupe `ci-${{ github.ref }}` avec `cancel-in-progress: true`.

### Variables globales

| Variable | Valeur |
|---|---|
| `NODE_VERSION` | `20` |
| `PYTHON_VERSION` | `3.12` |
| `PNPM_VERSION` | `10.33.0` |

### Jobs

| Job | Nom affiché | Dépendances |
|---|---|---|
| `lint-ts` | Lint TS + format | — |
| `lint-python` | Lint Python (ruff + mypy) | — |
| `typecheck-ts` | Typecheck TS (all packages) | — |
| `test-api` | Test @regalica/api (Jest + pg) | — |
| `test-chatbot-node` | Test @regalica/chatbot-node (Jest) | — |
| `test-chatbot-py` | Test chatbot-py (pytest) | — |
| `test-frontend` | Test @regalica/frontend (Karma headless Chrome) | — |
| `build-images` | Build Docker images (smoke) | `lint-ts`, `typecheck-ts` |

### Détail des jobs

#### `lint-ts`

1. `pnpm install`
2. `pnpm format:check`
3. `pnpm -r --filter '!@regalica/frontend' --if-present lint` (frontend exclu)

#### `lint-python`

Exécuté dans `apps/chatbot-py/` via `uv` :
1. `uv sync`
2. `uv run ruff check .`
3. `uv run ruff format --check .`
4. `uv run mypy app`

#### `typecheck-ts`

`pnpm -r --if-present typecheck` — récursif sur tous les packages.

#### `test-api`

Démarre un service PostgreSQL `pgvector/pgvector:pg16` en conteneur de service avec healthcheck. Variables injectées :

| Variable | Valeur CI |
|---|---|
| `DATABASE_URL` | `postgresql://regalica_app:ci_password@localhost:5432/regalica_test` |
| `NODE_ENV` | `test` |
| `JWT_SECRET` | `test_secret_at_least_thirty_two_characters_long` |

Commande : `pnpm test --coverage` dans `apps/api`.

#### `test-chatbot-node`

`pnpm --filter @regalica/chatbot-node test` — pas de service PostgreSQL requis.

#### `test-chatbot-py`

`uv run pytest --cov=app --cov-report=term-missing` dans `apps/chatbot-py`.

#### `test-frontend`

`pnpm test` dans `apps/frontend` — Karma avec Chrome headless.

#### `build-images`

Matrix de 4 images construites en parallèle (`fail-fast: false`) :

| `service` | `context` | `dockerfile` |
|---|---|---|
| `api` | `.` | `apps/api/Dockerfile` |
| `chatbot-node` | `.` | `apps/chatbot-node/Dockerfile` |
| `chatbot-py` | `apps/chatbot-py` | `apps/chatbot-py/Dockerfile` |
| `frontend` | `.` | `apps/frontend/Dockerfile` |

Chaque image est construite avec `docker/build-push-action@v6`, `push: false`, `load: true`. Le cache GitHub Actions (`type=gha`) est utilisé par service.

Aucun push vers un registre n'est effectué dans ce workflow.
