# 09 — Dépendances et versions

---

## Versions d'outillage global

| Outil | Version |
|---|---|
| Node.js | ≥ 20 |
| pnpm | 10.33.0 (packageManager exact) |
| Python | ≥ 3.12 |
| uv (Python) | Dernière image `ghcr.io/astral-sh/uv:latest` |
| TypeScript | ^5.6.3 (racine + api + chatbot-node) |
| Prettier | ^3.3.3 |

---

## `apps/api` — `@regalica/api`

### Dépendances de production

| Package | Version |
|---|---|
| `@azure/storage-blob` | ^12.25.0 |
| `cors` | ^2.8.5 |
| `decimal.js` | ^10.4.3 |
| `dotenv` | ^16.4.5 |
| `express` | ^4.21.1 |
| `fast-xml-parser` | ^4.5.0 |
| `helmet` | ^8.0.0 |
| `jsonwebtoken` | ^9.0.2 |
| `multer` | ^1.4.5-lts.1 |
| `pg` | ^8.13.1 |
| `pg-hstore` | ^2.3.4 |
| `pino` | ^9.5.0 |
| `pino-http` | ^10.3.0 |
| `sequelize` | ^6.37.5 |
| `socket.io` | ^4.8.1 |
| `xlsx` | 0.18.5 (version exacte sans caret) |
| `zod` | ^3.23.8 |

### Dépendances de développement

| Package | Version |
|---|---|
| `@eslint/js` | ^9.15.0 |
| `@types/cors` | ^2.8.17 |
| `@types/express` | ^4.17.21 |
| `@types/jest` | ^29.5.14 |
| `@types/jsonwebtoken` | ^9.0.7 |
| `@types/multer` | ^1.4.12 |
| `@types/node` | ^20.17.6 |
| `@types/pg` | ^8.11.10 |
| `@types/supertest` | ^6.0.2 |
| `eslint` | ^9.15.0 |
| `eslint-config-prettier` | ^9.1.0 |
| `jest` | ^29.7.0 |
| `pino-pretty` | ^11.3.0 |
| `supertest` | ^7.0.0 |
| `ts-jest` | ^29.2.5 |
| `tsx` | ^4.19.2 |
| `typescript` | ^5.6.3 |
| `typescript-eslint` | ^8.14.0 |

---

## `apps/web` — `web`

### Dépendances de production

| Package | Version |
|---|---|
| `@anthropic-ai/sdk` | ^0.90.0 |
| `@base-ui/react` | ^1.4.1 |
| `@google/generative-ai` | ^0.24.1 |
| `@supabase/ssr` | ^0.10.2 |
| `@supabase/supabase-js` | ^2.104.0 |
| `@tanstack/react-query` | ^5.99.2 |
| `@tanstack/react-query-devtools` | ^5.99.2 |
| `class-variance-authority` | ^0.7.1 |
| `clsx` | ^2.1.1 |
| `decimal.js` | ^10.6.0 |
| `fast-xml-parser` | ^5.7.1 |
| `framer-motion` | ^12.38.0 |
| `lucide-react` | ^1.8.0 |
| `next` | 16.2.4 (version exacte) |
| `next-intl` | ^4.9.1 |
| `react` | 19.2.4 (version exacte) |
| `react-dom` | 19.2.4 (version exacte) |
| `react-hook-form` | ^7.72.1 |
| `shadcn` | ^4.3.1 |
| `tailwind-merge` | ^3.5.0 |
| `tw-animate-css` | ^1.4.0 |
| `xlsx` | ^0.18.5 |
| `zod` | ^3.25.76 |
| `zustand` | ^5.0.12 |

### Dépendances de développement

| Package | Version |
|---|---|
| `@tailwindcss/postcss` | ^4 |
| `@types/node` | ^20 |
| `@types/react` | ^19 |
| `@types/react-dom` | ^19 |
| `tailwindcss` | ^4 |
| `typescript` | ^5 |

---

## `apps/chatbot-node` — `@regalica/chatbot-node`

### Dépendances de production

| Package | Version |
|---|---|
| `axios` | ^1.7.7 |
| `cors` | ^2.8.5 |
| `dotenv` | ^16.4.5 |
| `express` | ^4.21.1 |
| `helmet` | ^8.0.0 |
| `pg` | ^8.13.1 |
| `pino` | ^9.5.0 |
| `pino-http` | ^10.3.0 |
| `zod` | ^3.23.8 |

### Dépendances de développement

| Package | Version |
|---|---|
| `@eslint/js` | ^9.15.0 |
| `@types/cors` | ^2.8.17 |
| `@types/express` | ^4.17.21 |
| `@types/jest` | ^29.5.14 |
| `@types/node` | ^20.17.6 |
| `@types/pg` | ^8.11.10 |
| `@types/supertest` | ^6.0.2 |
| `eslint` | ^9.15.0 |
| `eslint-config-prettier` | ^9.1.0 |
| `jest` | ^29.7.0 |
| `pino-pretty` | ^11.3.0 |
| `supertest` | ^7.0.0 |
| `ts-jest` | ^29.2.5 |
| `tsx` | ^4.19.2 |
| `typescript` | ^5.6.3 |
| `typescript-eslint` | ^8.14.0 |

---

## `apps/frontend` — `@regalica/frontend`

### Dépendances de production

| Package | Version |
|---|---|
| `@angular/animations` | ^18.2.0 |
| `@angular/common` | ^18.2.0 |
| `@angular/compiler` | ^18.2.0 |
| `@angular/core` | ^18.2.0 |
| `@angular/forms` | ^18.2.0 |
| `@angular/platform-browser` | ^18.2.0 |
| `@angular/platform-browser-dynamic` | ^18.2.0 |
| `@angular/router` | ^18.2.0 |
| `rxjs` | ~7.8.0 |
| `socket.io-client` | ^4.8.1 |
| `tslib` | ^2.3.0 |
| `zone.js` | ~0.14.10 |

### Dépendances de développement

| Package | Version |
|---|---|
| `@angular-devkit/build-angular` | ^18.2.21 |
| `@angular/cli` | ^18.2.21 |
| `@angular/compiler-cli` | ^18.2.0 |
| `@types/jasmine` | ~5.1.0 |
| `autoprefixer` | ^10.4.20 |
| `jasmine-core` | ~5.2.0 |
| `karma` | ~6.4.0 |
| `karma-chrome-launcher` | ~3.2.0 |
| `karma-coverage` | ~2.2.0 |
| `karma-jasmine` | ~5.1.0 |
| `karma-jasmine-html-reporter` | ~2.1.0 |
| `postcss` | ^8.4.49 |
| `tailwindcss` | ^3.4.15 |
| `typescript` | ~5.5.2 |

---

## `apps/chatbot-py` — `pyproject.toml`

### Dépendances de production (`[project].dependencies`)

| Package | Contrainte |
|---|---|
| `fastapi` | >=0.115.0 |
| `uvicorn[standard]` | >=0.32.0 |
| `sqlalchemy` | >=2.0.36 |
| `asyncpg` | >=0.30.0 |
| `pydantic` | >=2.9.2 |
| `pydantic-settings` | >=2.6.1 |
| `google-generativeai` | >=0.8.3 |
| `httpx` | >=0.27.2 |
| `structlog` | >=24.4.0 |
| `python-multipart` | >=0.0.12 |

### Dépendances de développement (`[dependency-groups].dev`)

| Package | Contrainte |
|---|---|
| `pytest` | >=8.3.3 |
| `pytest-asyncio` | >=0.24.0 |
| `pytest-cov` | >=5.0.0 |
| `ruff` | >=0.7.2 |
| `mypy` | >=1.13.0 |

### Configuration des outils Python

#### Ruff

| Paramètre | Valeur |
|---|---|
| `target-version` | `py312` |
| `line-length` | `100` |
| `src` | `["app", "tests"]` |
| `select` (règles actives) | `E, F, I, N, W, UP, B, C4, SIM, ARG, PTH, RUF, ANN` |
| `ignore` | `ANN401` (permet `typing.Any` en usage limité) |
| Surcharge `tests/**` | `ANN001, ANN201, ARG001` ignorés |

#### mypy

| Paramètre | Valeur |
|---|---|
| `python_version` | `3.12` |
| `strict` | `true` |
| `ignore_missing_imports` | `true` |
| `disallow_untyped_defs` | `true` |
| `warn_return_any` | `true` |
| `warn_unused_ignores` | `true` |
| `plugins` | `pydantic.mypy` |
| Surcharge `tests.*` | `disallow_untyped_defs = false` |

---

## Racine du monorepo — `package.json`

### Dépendances de développement

| Package | Version |
|---|---|
| `prettier` | ^3.3.3 |
| `typescript` | ^5.6.3 |

### Contrainte moteurs

| Moteur | Contrainte |
|---|---|
| `node` | `>=20` |
| `pnpm` | `>=9` |

---

## Images Docker tierces

| Service | Image |
|---|---|
| Base de données | `pgvector/pgvector:pg16` |
| Reverse proxy | `nginx:1.27-alpine` |
| LLM local | `ollama/ollama:latest` |
| Builder API / chatbot-node | `node:20-alpine` |
| Builder frontend | `node:20-alpine` |
| Runtime frontend | `nginx:1.27-alpine` |
| Builder chatbot-py | `python:3.12-slim` |
| Runtime chatbot-py | `python:3.12-slim` |
| uv (copié dans builder) | `ghcr.io/astral-sh/uv:latest` |
