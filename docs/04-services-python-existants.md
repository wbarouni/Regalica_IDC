# 04 — Services Python existants

---

## apps/chatbot-py — FastAPI + LLM + RAG

### Framework et version

| Élément | Valeur |
|---|---|
| Framework | FastAPI ≥0.115.0 |
| Serveur ASGI | Uvicorn (standard) ≥0.32.0 |
| Python requis | ≥ 3.12 |
| ORM | SQLAlchemy ≥2.0.36 (présent dans les dépendances, usage non observé dans les routes lues) |
| Accès DB async | asyncpg ≥0.30.0 |
| Validation | Pydantic ≥2.9.2 + pydantic-settings ≥2.6.1 |
| LLM | google-generativeai ≥0.8.3 |
| HTTP client | httpx ≥0.27.2 |
| Logger | structlog ≥24.4.0 |
| Port par défaut | 8000 |

### Structure des dossiers

```
apps/chatbot-py/app/
├── agents/
│   ├── base.py                 # BaseAgent, AgentContext, AgentResult
│   ├── investigator.py         # InvestigatorAgent
│   ├── orchestrator.py         # OrchestratorAgent
│   ├── persona_formatting.py   # Détection et application de format Regalica
│   ├── persona_guardrails.py   # Guardrails persona (citations, confidence, emoji)
│   ├── persona_regalica.py     # PersonaRegalicaAgent (audit voix)
│   ├── reporter.py             # ReporterAgent
│   ├── rule_learner.py         # RuleLearnerAgent
│   └── schema_inferencer.py    # SchemaInferencerAgent
├── llm/
│   ├── base.py                 # Protocol LLMClient + LLMResponse (Pydantic)
│   ├── gemini.py               # GeminiClient (implémenté)
│   └── ollama.py               # OllamaClient (stub — Phase 6)
├── rag/
│   ├── chunker.py              # Découpage texte en chunks (sliding window)
│   ├── embedder.py             # Embedder Gemini text-embedding-004 + fallback hash
│   ├── models.py               # Pydantic models : KbChunk, ChunkSearchResult
│   └── retriever.py            # Retriever pgvector (search + ingest)
├── routes/
│   ├── chat.py                 # POST /chat
│   ├── health.py               # GET /health
│   └── persona.py              # POST /persona/audit
├── config.py                   # Settings Pydantic
├── logger.py                   # Configuration structlog
└── main.py                     # Point d'entrée FastAPI
```

### Endpoints exposés

| Méthode | Chemin | Fichier | Description |
|---|---|---|---|
| GET | `/health` | `routes/health.py` | Statut, version, uptime |
| POST | `/chat` | `routes/chat.py` | Q&A conformité avec guardrails LLM |
| POST | `/persona/audit` | `routes/persona.py` | Audit persona Regalica avant affichage |

### Endpoint `POST /chat` — comportement détaillé

Le endpoint reçoit :
```python
{ message: str, run_id?: str, tenant_id: str, session_id?: str, kb_snippets: list[str] }
```

Routage interne :
- Si `run_id` est présent ET que le message contient un mot-clé FAIL (`fail`, `écart`, `non conforme`, `rejet`, etc.) → `InvestigatorAgent` avec contexte du run
- Sinon → Q&A générale avec grounding KB

Guardrail de confiance : si `confidence < 0.95`, la réponse retourne `low_confidence: true` avec un message standardisé au lieu de la réponse générée.

### Endpoint `POST /persona/audit` — comportement détaillé

Reçoit un `PersonaInput` contenant la réponse brute d'un agent LLM. Exécute `PersonaRegalicaAgent.audit()` qui :
1. Détecte le format de réponse (7 formats adaptatifs)
2. Vérifie les guardrails (citations, confiance, phrases serviles, emoji)
3. Post-traite la réponse (strip phrases serviles, formatage)

Retourne `422` si le bloqueur dur `NO_CITATIONS` se déclenche.

### Modules IA identifiés

#### Interface LLMClient (`llm/base.py`)

Protocol Python (`runtime_checkable`) définissant le contrat des adaptateurs LLM :
```python
async def generate(system: str, user: str, *, json_schema?: dict, max_tokens: int) -> LLMResponse
```

`LLMResponse` (Pydantic) : `text`, `citations`, `confidence`, `tokens_used`, `latency_ms`, `model_id`

#### GeminiClient (`llm/gemini.py`)

- Modèle : `gemini-2.5-flash` (configurable)
- Température : 0.1 (faible pour déterminisme)
- Exécution synchrone dans un thread pool (`run_in_executor`) pour rester async
- Confiance estimée depuis `avg_logprobs` si disponible, sinon défaut `0.97`
- Fallback confiance 0.0 si la réponse est bloquée

#### OllamaClient (`llm/ollama.py`)

Stub déclaré : `generate()` lève `NotImplementedError("OllamaClient.generate is implemented in Phase 6")`.

### Pipeline RAG

#### Chunker (`rag/chunker.py`)

- Entrée : texte brut
- Algorithme : sliding window avec conscience des paragraphes
  - Découpe sur `\n\n` (paragraphes), puis `\n` (lignes), puis `". "` (phrases)
  - Fenêtre glissante de 400 mots, chevauchement de 50 mots
- Sortie : liste de strings (chunks non vides)
- Sans I/O, sans effet de bord, testable unitairement

#### Embedder (`rag/embedder.py`)

- Backend Gemini (`text-embedding-004`) : vecteur 768 dimensions via API REST (`generativelanguage.googleapis.com`)
- Backend hash (fallback) : SHA-256 → 768 floats en [-1, 1], déterministe, non sémantique
- Sélection automatique au `__init__` selon `GEMINI_API_KEY` et `LLM_PROVIDER`
- En cas d'erreur Gemini, bascule automatiquement sur le hash fallback (log WARNING)

#### Retriever (`rag/retriever.py`)

- Lecture/écriture dans la table `kb_chunks` via asyncpg direct
- `search(query, tenant_id, top_k=5)` : calcul de similarité cosinus pgvector (`<=>`)
- `ingest(chunks, source_ref, tenant_id)` : insertion avec `ON CONFLICT (id) DO NOTHING`
- `search()` retourne `[]` sans lever d'exception en cas d'erreur DB ou d'embedder

### Intégrations externes identifiées

| Intégration | Usage |
|---|---|
| API Google Gemini (REST) | Génération de texte (gemini-2.5-flash) + embeddings (text-embedding-004) |
| apps/api (HTTP interne) | Fetch des verdicts FAIL via `GET /api/runs/:id/fails/first` et `GET /api/runs/:id/summary` |
| PostgreSQL via asyncpg | Lecture/écriture `kb_chunks` pour le RAG |
| Ollama (stub) | Non implémenté |
