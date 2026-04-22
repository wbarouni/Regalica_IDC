# Architecture — diagram

## Vue d'ensemble des services (Phase 0 bootstrap)

```mermaid
flowchart LR
    user((User browser))

    subgraph frontend_ct["frontend container (nginx:alpine)"]
        ng[Angular 18 SPA<br/>Tailwind · Signals]
    end

    subgraph api_ct["api container"]
        api[Express 4<br/>+ Sequelize 6<br/>+ Socket.IO 4]
    end

    subgraph chatbot_node_ct["chatbot-node container"]
        cn[Express 4<br/>+ pg natif]
    end

    subgraph chatbot_py_ct["chatbot-py container"]
        cp[FastAPI<br/>+ 5 LLM agents<br/>+ RAG pipeline]
    end

    subgraph infra["infra"]
        ng_rev[nginx reverse proxy]
        pg[(PostgreSQL 16<br/>+ pgvector<br/>+ RLS manuel)]
        ol[Ollama<br/>Qwen 2.5 3B]
        azure[(Azure Blob<br/>uploads)]
        gemini[Gemini API<br/>gemini-2.5-flash]
    end

    user -- HTTPS --> ng_rev
    ng_rev -- "/"      --> frontend_ct
    ng_rev -- "/api/"  --> api_ct
    ng_rev -- "/chat/" --> chatbot_node_ct
    ng_rev -- "/ws/ (Socket.IO)" --> api_ct

    api  --> pg
    api  --> azure
    cn   --> pg
    cn   -- "POST /chat" --> cp
    cp   --> pg
    cp   -. "LLM_PROVIDER=gemini" .-> gemini
    cp   -. "LLM_PROVIDER=ollama" .-> ol
```

## Ports (dev local)

| Service         | Port host | Port container |
|-----------------|-----------|----------------|
| nginx (reverse) | 80        | 80             |
| frontend        | 4200      | 80 (nginx)     |
| api             | 3000      | 3000           |
| chatbot-node    | 3001      | 3001           |
| chatbot-py      | 8000      | 8000           |
| postgres        | 5432      | 5432           |
| ollama          | 11434     | 11434          |

## Réseau et isolation

- Tous les services partagent le réseau Docker par défaut créé par
  `docker compose` (découverte par nom de service).
- Pas d'exposition publique de `postgres` en prod (seul `nginx:80` est exposé).
- En dev on publie tous les ports pour faciliter le debug direct.

## Flow de requête typique : évaluation d'un rapport

```mermaid
sequenceDiagram
    actor U as User (browser)
    participant NG as nginx
    participant FE as frontend (Angular)
    participant API as api (Express)
    participant PG as postgres
    participant AZ as Azure Blob
    participant WS as Socket.IO
    participant CP as chatbot-py

    U->>NG: POST /api/uploads (XML 4 annexes)
    NG->>API: proxy /uploads
    API->>AZ: putBlob(xml)
    API->>PG: INSERT upload_versions (tenant_id, sha256, …)
    API-->>FE: 201 {uploadId}

    FE->>NG: GET /api/uploads/:id/evaluate
    NG->>API: proxy
    API->>WS: emit(progress, 0%)
    API->>PG: SELECT * FROM rules WHERE tenant_id IN (ancestors)
    loop 5-phase algorithm §9.4
        API->>API: Parse → Group → Resolve → Aggregate → Compare
        API->>WS: emit(progress, N%)
    end
    API->>PG: INSERT validation_runs + verdicts
    API-->>FE: 200 {runId, counts}

    FE->>NG: POST /chat (explain verdict 630/265)
    NG->>CP: via chatbot-node
    CP->>PG: SELECT kb_chunks (RAG)
    CP->>CP: LLMClient.generate(system, user, citations)
    CP-->>FE: {text, citations≥1, confidence≥0.95}
```

## Immutabilité & versioning (pilier 6)

```mermaid
flowchart TD
    R[rules] -- "ON UPDATE/DELETE" --> H[rules_history]
    RT[rule_terms] -- "ON UPDATE/DELETE" --> HT[rule_terms_history]
    P[prompts_registry] -- "new version" --> PH[prompts_history]
    KB[kb_chunks] --> KBS[kb_snapshots]
    VR[validation_runs] -- references --> SNAP[rules_snapshot_id<br/>prompts_snapshot_id<br/>kb_snapshot_id]
```

Toute validation run fige les pointeurs (snapshot IDs) au moment T. Replay à
10 ans = rehydrate les rules/prompts/KB à leurs versions de l'époque, ré-exécute
l'évaluateur, vérifie verdict bit-identique.

## Références
- `docs/architecture/00-master-document.md` §8 (data model), §9 (algorithme)
- `docs/architecture/01-extracted-facts.md` §3, §6, §13
- ADR 0003 — RLS manuel
