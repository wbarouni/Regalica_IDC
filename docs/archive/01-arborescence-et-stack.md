# 01 — Arborescence et stack technique

---

## Arborescence du repo (niveaux 1 et 2)

```
Regalica_IDC/
├── .github/
│   └── workflows/          # CI GitHub Actions (ci.yml)
├── apps/
│   ├── api/                # Backend Express + Sequelize (Node.js)
│   ├── chatbot-node/       # Relai HTTP Express vers chatbot-py (Node.js)
│   ├── chatbot-py/         # Service LLM + RAG (FastAPI, Python)
│   ├── frontend/           # Interface Angular 18
│   └── web/                # Interface Next.js 16 App Router
├── docs/
│   └── archive/
│       └── 2026-04-21/     # Documents archivés
├── infra/
│   ├── docker/             # postgres-init.sql
│   └── nginx/              # nginx.conf
├── packages/
│   ├── bct-xml-parser/     # Parser XML BCT (package TypeScript partagé)
│   ├── db/                 # Schéma Drizzle ORM (package TypeScript)
│   ├── design-tokens/      # Design tokens (package TypeScript, stubs)
│   ├── persona-regalica/   # Config persona Regalica (stubs)
│   ├── rdg-schema/         # Types RDG partagés (package TypeScript)
│   ├── shared-types/       # Types partagés health/tenant/verdict
│   └── ui/                 # Composants React partagés (4 composants)
├── tests/
│   ├── fixtures/
│   │   ├── golden/bank-23/2024-03-31/  # 5 fichiers XML BCT golden
│   │   └── rdg.xlsx                    # Fichier RDG source
│   ├── e2e/                # Dossier présent, vide
│   └── integration/        # Dossier présent, vide
├── tools/
│   ├── eslint-plugin-no-emoji/             # Plugin ESLint (stubs)
│   └── eslint-plugin-no-hardcoded-rules/   # Plugin ESLint (stubs)
├── .env.example            # Variables d'environnement documentées
├── .github/workflows/ci.yml
├── .nvmrc                  # Node.js v20
├── .python-version         # Python 3.12
├── docker-compose.yml      # Orchestration locale : 7 services
├── eslint.config.mjs       # ESLint racine
├── package.json            # Monorepo root (pnpm workspaces)
├── pnpm-workspace.yaml     # Déclaration des workspaces
├── pnpm-lock.yaml
└── tsconfig.base.json      # Configuration TypeScript partagée
```

---

## Stack technique observée

| Composant | Technologie | Version |
|---|---|---|
| Gestionnaire de paquets Node | pnpm | 10.33.0 |
| Runtime Node.js | Node.js | ≥ 20 (`.nvmrc`: 20) |
| Runtime Python | Python | 3.12 (`.python-version`) |
| Monorepo | pnpm workspaces | — |
| Base de données | PostgreSQL | 16 (image Docker `pgvector/pgvector:pg16`) |
| Extension vectorielle | pgvector | activée via image Docker et `CREATE EXTENSION IF NOT EXISTS vector` |
| ORM principal (apps/api) | Sequelize | ^6.37.5 |
| ORM secondaire (packages/db) | Drizzle ORM | défini dans package.json du package |
| Backend principal | Express | ^4.21.1 |
| Backend Python | FastAPI | ≥0.115.0 |
| Frontend actif | Angular | ^18.2.0 |
| Frontend en développement | Next.js | 16.2.4 |
| LLM utilisé | Gemini 2.5 Flash | `gemini-2.5-flash` (API Google) |
| LLM secondaire (stub) | Ollama / Qwen 2.5 3B | `qwen2.5:3b` — non implémenté |
| Embeddings | Gemini `text-embedding-004` | 768 dimensions |
| TypeScript | TypeScript | ^5.6.3 (api, chatbot-node), ^5.3 (packages/db) |
| Communication temps réel | Socket.IO | ^4.8.1 |
| Reverse proxy | Nginx | 1.27-alpine |
| Conteneurisation | Docker + Docker Compose | — |
| CI | GitHub Actions | — |

---

## Fichiers de configuration identifiés

| Fichier | Rôle |
|---|---|
| `package.json` (racine) | Déclaration du monorepo, scripts globaux (`lint`, `test`, `build`, `dev`) |
| `pnpm-workspace.yaml` | Déclare les packages du monorepo : `apps/*`, `packages/*`, `tools/*` |
| `tsconfig.base.json` | Configuration TypeScript partagée (strict, ES2022, NodeNext) |
| `eslint.config.mjs` | Configuration ESLint racine |
| `.prettierrc` | Configuration Prettier |
| `.editorconfig` | Conventions d'indentation |
| `.nvmrc` | Version Node.js requise : 20 |
| `.python-version` | Version Python requise : 3.12 |
| `.env.example` | Variables d'environnement requises documentées |
| `.gitignore` | Fichiers exclus du contrôle de version |
| `.gitattributes` | Attributs Git (normalization fins de ligne) |
| `docker-compose.yml` | Orchestration locale : postgres, ollama, api, chatbot-py, chatbot-node, frontend, nginx |
| `infra/docker/postgres-init.sql` | Script d'initialisation Postgres (extensions, rôle readonly, session vars) |
| `infra/nginx/nginx.conf` | Configuration reverse proxy Nginx |
| `.github/workflows/ci.yml` | Pipeline CI GitHub Actions |
| `apps/api/jest.config.ts` | Configuration Jest pour apps/api |
| `apps/chatbot-py/pyproject.toml` | Configuration Python : dépendances, ruff, mypy, pytest |
| `apps/web/package.json` | Dépendances Next.js 16 |
