# 02 — Backend existant

Deux services Node.js coexistent : `apps/api` (backend principal) et `apps/chatbot-node` (relai HTTP).

---

## apps/api — Express + Sequelize

### Framework et version

| Élément | Valeur |
|---|---|
| Framework | Express ^4.21.1 |
| ORM | Sequelize ^6.37.5 |
| Base de données | PostgreSQL 16 (via pg ^8.13.1) |
| Logger | Pino ^9.5.0 + pino-http ^10.3.0 |
| Temps réel | Socket.IO ^4.8.1 |
| Auth | jsonwebtoken ^9.0.2 (JWT) |
| Stockage fichiers | Azure Blob Storage (@azure/storage-blob ^12.25.0) |
| Upload | multer ^1.4.5-lts.1 (mémoire, limite 20 Mo par fichier) |
| Validation | zod ^3.23.8 |
| Port par défaut | 3000 |

### Structure des dossiers

```
apps/api/src/
├── agents/
│   ├── evaluator/          # Moteur d'évaluation RDG (index.ts, phases.ts, types.ts)
│   ├── ingestor/           # Parser XML BCT (bct-xml-parser.ts)
│   └── structure-validator/ # Validateur de structure XML (index.ts)
├── db/
│   ├── migrate.ts          # Runner de migrations séquentiel
│   ├── migrations/         # 10 migrations Sequelize (001 à 010)
│   ├── models/             # Modèles Sequelize (rule, rule-term, validation-run, verdict)
│   ├── seeders/            # Seeders : design-tokens, prompts, rdg-seeder
│   └── sequelize.ts        # Instance Sequelize (pool : min 2, max 10)
├── middleware/
│   └── error-handler.ts    # Middleware d'erreur Express
├── routes/
│   ├── design-tokens.ts    # GET /api/design-tokens
│   ├── evaluation.ts       # GET /api/evaluation/runs
│   ├── health.ts           # GET /health
│   ├── prompts.ts          # GET /api/prompts
│   ├── runs.ts             # GET /api/runs/:id
│   └── uploads.ts          # POST /api/uploads/evaluate
├── app.ts                  # Création de l'app Express + Socket.IO
├── config.ts               # Variables d'environnement validées via Zod
├── index.ts                # Point d'entrée : démarrage serveur + migrations
└── logger.ts               # Instance Pino
```

### Endpoints HTTP

| Méthode | Chemin | Fichier | Description observée |
|---|---|---|---|
| GET | `/health` | `routes/health.ts` | Statut, version, uptime |
| GET | `/api/evaluation/runs` | `routes/evaluation.ts` | Liste des runs de validation pour un tenant (`x-tenant-id` requis) |
| GET | `/api/evaluation/runs/:runId` | `routes/evaluation.ts` | Détail d'un run avec ses verdicts |
| GET | `/api/prompts` | `routes/prompts.ts` | Liste des prompts actifs pour un tenant (avec fallback global) |
| GET | `/api/prompts/:key` | `routes/prompts.ts` | Prompt actif par clé + locale (fallback `fr`) |
| GET | `/api/runs/:id` | `routes/runs.ts` | Résumé PASS/FAIL/SKIP d'un run |
| GET | `/api/runs/:id/fails/first` | `routes/runs.ts` | Premier verdict FAIL enrichi avec métadonnées de règle |
| GET | `/api/design-tokens` | `routes/design-tokens.ts` | Tokens de design actifs (groupés par catégorie) |
| GET | `/api/design-tokens/:key` | `routes/design-tokens.ts` | Token de design par clé |
| POST | `/api/uploads/evaluate` | `routes/uploads.ts` | Upload multi-fichiers XML → validation structure + évaluation RDG + persistance run/verdicts |

### Middlewares identifiés

| Middleware | Rôle |
|---|---|
| `helmet` | En-têtes de sécurité HTTP |
| `cors` | CORS configurable via `API_CORS_ORIGIN` |
| `express.json({ limit: '1mb' })` | Parsing JSON avec limite de taille |
| `pinoHttp` | Logging HTTP structuré |
| `errorHandler` | Capture les erreurs non gérées, retourne `{ error }` JSON |
| `multer` | Upload de fichiers en mémoire (route `/api/uploads/evaluate`) |

### Authentification identifiée

Le package `jsonwebtoken` est présent dans les dépendances et la configuration expose `JWT_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`. Aucun middleware JWT n'est observé dans les routes actives — l'authentification par token n'est pas encore câblée aux routes existantes. Le header `x-tenant-id` est utilisé directement pour l'isolation des données.

### Configuration (`src/config.ts`)

Variables d'environnement validées par Zod :

| Variable | Type | Défaut |
|---|---|---|
| `NODE_ENV` | enum | `development` |
| `API_PORT` | number | `3000` |
| `API_CORS_ORIGIN` | string | `http://localhost:4200` |
| `LOG_LEVEL` | enum | `info` |
| `DATABASE_URL` | string | — (requis) |
| `JWT_SECRET` | string (≥32 chars) | — (optionnel) |
| `JWT_ACCESS_TTL` | string | `15m` |
| `JWT_REFRESH_TTL` | string | `7d` |
| `AZURE_STORAGE_CONNECTION_STRING` | string | — (optionnel) |
| `AZURE_STORAGE_CONTAINER` | string | `regalica-uploads` |

### Socket.IO

Le serveur Socket.IO est créé dans `app.ts` et attaché au serveur HTTP. Il émet deux types d'événements depuis la route `/api/uploads/evaluate` :

- `progress` — `{ runId, percentage }` — émis à 25%, 50%, 75%, 100% pendant l'évaluation
- `verdict` — un objet par verdict FAIL — émis à la fin de l'évaluation

---

## apps/chatbot-node — Relai Express

### Framework et version

| Élément | Valeur |
|---|---|
| Framework | Express (version dans package.json) |
| Logger | Pino |
| Port par défaut | 3001 |

### Structure des dossiers

```
apps/chatbot-node/src/
├── middleware/
│   └── error-handler.ts
├── routes/
│   ├── chat.ts             # POST /chat — relai vers chatbot-py
│   └── health.ts           # GET /health
├── app.ts                  # Création de l'app Express
├── config.ts               # Variables d'environnement
├── db.ts                   # Connexion pg native (présente, usage non observé dans les routes)
├── index.ts                # Point d'entrée
└── logger.ts               # Instance Pino
```

### Endpoints HTTP

| Méthode | Chemin | Fichier | Description observée |
|---|---|---|---|
| GET | `/health` | `routes/health.ts` | Statut du service |
| POST | `/chat` | `routes/chat.ts` | Valide la requête (Zod), relaie vers `chatbot-py` via axios |

### Comportement du relai

La route `POST /chat` valide le corps entrant avec le schéma Zod :

```typescript
{ tenantId: uuid, conversationId?: uuid, message: string (1–8000 chars) }
```

Elle effectue ensuite un `POST` vers `{CHATBOT_PY_URL}/chat` avec un timeout de 30 secondes. En cas d'erreur HTTP upstream, retourne `502`. Le fichier `db.ts` est présent mais aucune persistance en base n'est observée dans les routes actuelles.
