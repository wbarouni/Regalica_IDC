# Regalica IDC

> **Plateforme SaaS multi-tenant de conformité réglementaire BCT à tolérance zéro.**
>
> 4 611 règles RDG exécutées sur un reporting réel BCT 2024-03-31 (banque 23,
> 4 annexes) : **96,2 % de conformité**, **2 secondes d'exécution**, **0 faux
> positif d'arrondi**. Preuve terrain validée en v1.1.

---

## Vue d'ensemble

Regalica IDC détecte les anomalies dans les rapports XML bancaires **avant**
envoi à la BCT et aide les équipes compliance à les corriger. Le produit repose
sur **7 Piliers Inviolables** (cf. `docs/architecture/00-master-document.md`
§3) : ZERO TOLERANCE, ZERO HARDCODING, ZERO HALLUCINATION, SUGGEST DON'T REPAIR,
SILENT GUARDIAN, IMMUTABLE HISTORY, HIERARCHICAL TENANCY.

## Architecture monorepo

```
Regalica_IDC/
├── apps/
│   ├── api/              Express + Sequelize + Socket.IO  (BFF, évaluateur, auth)
│   ├── chatbot-node/     Express + pg natif               (gateway conversationnel)
│   ├── chatbot-py/       FastAPI + LLMClient abstraction  (5 agents LLM + RAG)
│   └── frontend/         Angular 18 + Tailwind 3.4        (standalone, Signals)
├── packages/
│   ├── shared-types/     Types TS partagés
│   ├── rdg-schema/       AST DSL des 4 611 règles         (Phase 1)
│   └── bct-xml-parser/   Parser XML BCT                   (Phase 1)
├── docs/
│   ├── architecture/     Master document v1.1 + extractions structurées
│   └── adr/              Architecture Decision Records
├── tests/fixtures/       RDG.xlsx + 5 XMLs golden 2024-03-31
├── infra/                Docker, Nginx, Postgres init
└── .github/workflows/    CI (lint, typecheck, tests, docker build)
```

## Stack

| Couche            | Technologie                                        |
|-------------------|----------------------------------------------------|
| Frontend          | Angular 18 standalone · Tailwind 3.4 · Signals     |
| API (BFF)         | Express 4 · Sequelize 6 · Socket.IO 4 · Zod        |
| Chatbot gateway   | Express 4 · pg natif (SQL brut)                    |
| Chatbot agents    | FastAPI · SQLAlchemy 2 · pydantic 2 · structlog    |
| LLM               | Gemini 2.5 → Ollama (Qwen 2.5 3B) — cf. ADR 0002   |
| DB                | PostgreSQL 16 + `pgvector` + RLS manuel (ADR 0003) |
| Storage           | Azure Blob Storage                                 |
| Précision numéric | `decimal.js` / `Decimal` Python, 38 digits         |
| Reverse proxy     | Nginx                                              |
| Packaging         | pnpm workspaces (ADR 0004) + uv (Python)           |
| CI                | GitHub Actions · Jest · Karma · pytest · ruff · mypy |

## Démarrage local

### Prérequis
- Node.js 20 LTS + pnpm 10+
- Python 3.12+ + `uv`
- Docker Desktop avec WSL2 (sur Windows)
- (Optionnel) GitHub CLI `gh` pour les PRs

### Bootstrap
```bash
git clone https://github.com/wbarouni/Regalica_IDC.git
cd Regalica_IDC
cp .env.example .env   # ajuste POSTGRES_PASSWORD, JWT_SECRET, GEMINI_API_KEY
pnpm install           # resolves TS deps monorepo
(cd apps/chatbot-py && uv sync)
docker compose up      # démarre postgres, ollama, 4 apps, nginx
```

Accès :
- UI : http://localhost (via nginx) ou http://localhost:4200 (frontend direct)
- API : http://localhost/api/health
- Chatbot : http://localhost/chat/health
- Chatbot-py : http://localhost:8000/health/ (docs Swagger : /docs en dev)

### Dev sans Docker
Chaque app tourne aussi en local :
```bash
# Terminal 1 — postgres (Docker)
docker compose up postgres ollama

# Terminal 2 — api
(cd apps/api && pnpm dev)

# Terminal 3 — chatbot-py
(cd apps/chatbot-py && uv run uvicorn app.main:app --reload)

# Terminal 4 — chatbot-node
(cd apps/chatbot-node && pnpm dev)

# Terminal 5 — frontend (proxy vers api/chat via proxy.conf.json)
(cd apps/frontend && pnpm start)
```

## Tests
```bash
pnpm -r test                     # Jest + Karma (tous workspaces TS)
(cd apps/chatbot-py && uv run pytest)
```

## Documentation

- [`docs/architecture/00-master-document.md`](docs/architecture/00-master-document.md) —
  Vision, architecture, roadmap (**source de vérité**, v1.1 Avril 2026)
- [`docs/architecture/01-extracted-facts.md`](docs/architecture/01-extracted-facts.md) —
  Extraction structurée machine-readable du master doc (908 lignes)
- [`docs/adr/`](docs/adr/) — 4 ADRs initiaux
- [`CLAUDE.md`](CLAUDE.md) — Conventions permanentes pour les sessions Claude Code

## Statut

**Phase 0 (bootstrap)** ✅ — fondations, squelettes, CI verte sur smoke tests
**Phase 1 (data model + RDG import)** → à suivre, cf. §Partie V du master doc

## Licence

UNLICENSED — confidentiel ALGORIA Factory.
