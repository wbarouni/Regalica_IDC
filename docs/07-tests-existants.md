# 07 — Tests existants

---

## Vue d'ensemble

| Application | Framework | Fichiers de test | Commande |
|---|---|---|---|
| `apps/api` | Jest 29 + ts-jest + supertest | `test/golden.test.ts`, `test/health.test.ts` | `pnpm test` |
| `apps/chatbot-node` | Jest 29 + ts-jest | Aucun fichier de test observé | `pnpm test --passWithNoTests` |
| `apps/chatbot-py` | pytest 8.3 + pytest-asyncio + pytest-cov | `tests/test_health.py` | `uv run pytest` |
| `apps/frontend` | Karma 6.4 + Jasmine 5.2 (Chrome headless) | Non observés dans les fichiers lus | `ng test --watch=false --browsers=ChromeHeadless` |
| `apps/web` | Aucun framework de test configuré dans `package.json` | — | — |

---

## Configuration Jest — `apps/api`

Deux fichiers de configuration coexistent : `jest.config.js` et `jest.config.ts`. La version `.ts` est prioritaire si ts-jest est actif.

| Paramètre | Valeur |
|---|---|
| `preset` | `ts-jest` |
| `testEnvironment` | `node` |
| `testMatch` | `<rootDir>/test/**/*.test.ts` |
| `collectCoverageFrom` | `src/**/*.ts` (hors `*.d.ts` et `src/index.ts`) |
| `coverageDirectory` | `coverage/` |
| `clearMocks` | `true` |
| `restoreMocks` | `true` |

---

## Configuration Jest — `apps/chatbot-node`

| Paramètre | Valeur |
|---|---|
| `preset` | `ts-jest` |
| `testEnvironment` | `node` |
| `testMatch` | `<rootDir>/test/**/*.test.ts` |
| `collectCoverageFrom` | `src/**/*.ts` (hors `*.d.ts` et `src/index.ts`) |
| `coverageDirectory` | `coverage/` |
| `clearMocks` | `true` |
| `restoreMocks` | `true` |

---

## Configuration pytest — `apps/chatbot-py`

Définie dans `pyproject.toml`, section `[tool.pytest.ini_options]` :

| Paramètre | Valeur |
|---|---|
| `testpaths` | `["tests"]` |
| `asyncio_mode` | `"auto"` |
| `addopts` | `"-ra -q --strict-markers"` |
| `pythonpath` | `["."]` |

---

## `apps/api/test/golden.test.ts` — Test doré BCT

### Rôle

Vérifie que le moteur d'évaluation RDG (`runEvaluation`) produit exactement les mêmes métriques sur le jeu de fixtures immuable. Ce test constitue la baseline non-régressive du projet.

### Fixtures utilisées

| Variable | Valeur |
|---|---|
| `XLSX_PATH` | `tests/fixtures/rdg.xlsx` (feuille `RDG`) |
| `XML_DIR` | `tests/fixtures/golden/bank-23/2024-03-31/` |
| `XML_FILES` | `00-2024-03-31.XML`, `01-2024-03-31.XML`, `02-2024-03-31.XML`, `51-2024-03-31.XML`, `640-2024-03-31.XML` |
| `DEFAULT_TENANT_ID` | `00000000-0000-0000-0000-000000000001` |

### Comportement

Le test charge les règles depuis le fichier XLSX sans connexion base de données (les objets `RuleTerm` sont construits en mémoire à l'aide de `randomUUID()`). Les XMLs sont lus depuis le disque. L'évaluation est exécutée dans `beforeAll` avec un timeout de 60 secondes.

### Cas de test

| Cas | Assertion |
|---|---|
| Nombre de PASS | `passCount === 937` |
| Nombre de FAIL | `failCount === 2` |
| Total règles | `passCount + failCount + skipCount === 4611` |
| Localisation des FAILs | Les 2 FAILs sont sur `annexeCode === '630'`, numéros 266 et 267 |

### Note documentée dans le fichier

Le fichier source indique explicitement que la baseline à 937 PASS / 2 FAIL correspond à 5 fichiers XML sans `630.XML`. La documentation interne (`§9.6`) mentionne 1 014 PASS / 3 FAIL sur 4 XMLs incluant `630.XML`. La divergence est expliquée : le 3e FAIL (règle intra-630 n°265) produit `SKIPPED_MISSING_ANNEXE` en l'absence du fichier `630.XML` dans le jeu de fixtures actuel.

### Logique de chargement XLSX (sans DB)

La fonction `loadRulesFromXlsx()` regroupe les lignes du tableur par clé `(AX_TERM, NUM_REGLE)`. Pour chaque groupe, elle détermine le `kind` de chaque terme :

| Condition | `kind` |
|---|---|
| `COLONNE` non nul | `cell_ref` |
| `RUBRIQUE` non nul et numérique | `literal` |
| Sinon | `literal_text` |

La précision décimale est initialisée à `Decimal.set({ precision: 38, rounding: Decimal.ROUND_HALF_EVEN })`.

---

## `apps/api/test/health.test.ts` — Test endpoint santé

### Rôle

Vérifie que `GET /health` retourne 200 avec les champs attendus.

### Assertions

| Champ | Type attendu |
|---|---|
| `status` | `'ok'` (string littérale) |
| `service` | `'regalica-api'` (string littérale) |
| `uptime` | `number` |
| `timestamp` | `string` |
| `version` | `string` |

L'app Express est instanciée via `createApp()` sans démarrer le serveur HTTP. `supertest` injecte les requêtes directement.

---

## `apps/chatbot-py/tests/test_health.py` — Test endpoint santé Python

### Rôle

Vérifie que `GET /health/` retourne 200 avec les champs attendus sur le service FastAPI.

### Assertions

| Champ | Valeur attendue |
|---|---|
| `status_code` | `200` |
| `payload["status"]` | `"ok"` |
| `payload["service"]` | `"regalica-chatbot-py"` |
| `"uptime"` | présent dans le payload |
| `"timestamp"` | présent dans le payload |
| `"version"` | présent dans le payload |

Le `TestClient` FastAPI est instancié via un fixture pytest `client()`. L'URL testée est `/health/` (avec slash final).

---

## Zones non observées

- Aucun fichier de test n'a été observé dans `apps/chatbot-node/test/` — le script `test` utilise `--passWithNoTests`.
- Les specs Angular (Jasmine/Karma) dans `apps/frontend/src/` n'ont pas été lus dans ce cadre.
- `apps/web` ne dispose d'aucun framework de test déclaré dans son `package.json`.
