# REGFlow chatbot-py

FastAPI service hosting the LLM-driven conversational layer of REGFlow (Phase 4): the 14 canonical agents from `docs/05-AGENTS-ET-PROMPTS-BANK.md` and the orchestrator from `docs/10-ORCHESTRATION-REGALICA.md`. Phase 0–3 ship a skeleton with a `/health` endpoint and the env-driven configuration scaffolding only.

## Prérequis

- Python 3.12 ou supérieur
- `uv` (gestionnaire de paquets Python Astral)

## Installation

```bash
cd apps/chatbot-py
uv sync
```

## Configuration

Toutes les variables LLM (`LLM_PROVIDER`, `GEMINI_MODEL`, `OLLAMA_URL`, `OLLAMA_MODEL`, `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`) sont **requises** au démarrage — aucune valeur par défaut ne vit dans `app/config.py` (doctrine zéro-hardcoding, voir `docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md`). Les valeurs canoniques pour le dev local sont dans `.env.example` à la racine du repo.

Variables d'environnement supplémentaires gérées par Pydantic Settings :

| Variable           | Requis | Rôle                                                  |
| ------------------ | ------ | ----------------------------------------------------- |
| `NODE_ENV`         | non    | `development` \| `test` \| `production`               |
| `CHATBOT_PY_PORT`  | non    | port HTTP (défaut applicatif `8000`)                  |
| `LOG_LEVEL`        | non    | `debug` \| `info` \| `warning` \| `error` \| `critical` |
| `DATABASE_URL`     | non    | DSN Postgres (utilisé en Phase 4)                     |
| `GEMINI_API_KEY`   | non    | clé API Google Gemini (Phase 4 production)            |

## Lancement local

```bash
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Endpoint smoke : `GET /health/` retourne `200` avec un payload `{ status, service, uptime, timestamp, version }`.

## Tests, lint, typecheck

```bash
uv run pytest                          # tests + couverture
uv run ruff check .                    # lint
uv run ruff format --check .           # format
uv run mypy app                        # typecheck strict
```

## Image Docker

Le `Dockerfile` multi-stage (`builder` / `runtime`) attend que le contexte de build inclue `pyproject.toml`, `README.md`, `app/` et `uv.lock`. Le job CI `build-images` (matrix `chatbot-py`) construit l'image avec `context: apps/chatbot-py`.

```bash
docker build -t regalica-idc/chatbot-py:dev -f apps/chatbot-py/Dockerfile apps/chatbot-py
```
