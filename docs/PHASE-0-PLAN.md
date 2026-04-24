# REGFlow — Plan d'exécution Phase 0 pour Claude Code

**Version :** 1.0
**Date :** avril 2026
**Périmètre :** instructions précises pour Claude Code pour exécuter la Phase 0 du refactoring brute. Suppression canonique de l'existant non conforme et initialisation du nouveau monorepo conforme à la doctrine.
**Auteur :** Équipe REGFlow
**Statut :** référence opérationnelle pour exécution Claude Code
**Pré-requis :** Documents 1 à 8 finalisés, corpus golden baseline validé (58 XML)

---

## Sommaire

**Partie I — Contexte et doctrine**

1. Posture A brute, zéro tolérance dette résiduelle
2. Invariants critiques à préserver pendant la Phase 0
3. Ce qui est dans le périmètre de la Phase 0
4. Ce qui est hors périmètre

**Partie II — Audit pré-suppression**

5. Inventaire exact de ce qui est supprimé
6. Inventaire de ce qui est conservé
7. Capture des actifs avant suppression

**Partie III — Suppression brute**

8. Création du tag de sauvegarde
9. Suppression des applications non conformes
10. Suppression des packages non conformes
11. Nettoyage des dépendances
12. Nettoyage de la CI et des configurations

**Partie IV — Initialisation du nouveau monorepo**

13. Structure cible du monorepo
14. Workspace pnpm
15. Package `@regflow/api`
16. Package `@regflow/chatbot-py`
17. Packages partagés
18. Scripts de racine

**Partie V — Configuration transverse**

19. CI GitHub Actions
20. Docker Compose
21. ESLint et Prettier
22. pre-commit hooks
23. Politique de dépendances

**Partie VI — Tests et validation de la Phase 0**

24. Tests de santé
25. Tests de propreté
26. Critères de sortie de la Phase 0

**Partie VII — Commits et branches**

27. Séquence de commits
28. Stratégie de branches
29. Points de revue

---

# Partie I — Contexte et doctrine

## 1. Posture A brute, zéro tolérance dette résiduelle

La Phase 0 obéit à deux règles absolues actées par le CEO ALGORIA Factory :

**Règle 1 — Posture A brute.** Tout code qui contredit la doctrine canonique (Documents 1 à 8) est supprimé sans compromis. Pas de migration progressive, pas de transition, pas de "on garde temporairement". La Phase 0 est une coupure nette.

**Règle 2 — Zéro tolérance dette résiduelle.** Aucun code supprimé n'est archivé dans un dossier `_legacy/`, `_archive/`, `_old/`. Aucun fichier n'est commenté plutôt que supprimé. Aucun `// TODO: à supprimer` ne reste. Le seul vestige de l'ancien code est un tag Git `pre-refactoring-backup-2026-04-22` posé avant suppression, pour permettre de retrouver l'état ancien si absolument nécessaire.

Cette discipline a un coût émotionnel : on jette du travail qui a été fait. Elle a un bénéfice immédiat : le repo reste lisible, audit-able, et la productivité de Claude Code en bénéficie parce qu'il ne confond plus code vivant et code mort.

## 2. Invariants critiques à préserver pendant la Phase 0

Trois invariants ne doivent **jamais** être compromis pendant la Phase 0.

**Invariant 1 — Corpus golden baseline.** Les 58 XML du golden baseline validés par Wissem Barouni (CEO ALGORIA Factory / Head of Financial & Regulatory Reporting, banque tunisienne pilote) doivent être importés intacts dans la nouvelle structure — identifiants bancaires anonymisés au passage via `tools/golden-normalizer`. La Phase 0 produit la première version de `tests/fixtures/golden/tenant-001/` conforme au Document 7 v2.

**Invariant 2 — Algorithme du moteur d'évaluation.** Le pipeline en 5 phases (A/B/D/E) du RDG Evaluator est conservé algorithmiquement. Il sera réécrit proprement en Phase 2 dans `packages/evaluator`, mais la logique fonctionnelle doit rester identique pour que le test golden passe à chaque run après refactoring. Le code existant dans `apps/api/src/agents/evaluator/` est étudié, compris, puis supprimé, avec un document d'architecture `packages/evaluator/ALGORITHM.md` qui capture la logique pour le refactoring ultérieur.

**Invariant 3 — Précision Decimal.** La précision décimale 38 digits ROUND_HALF_EVEN côté TypeScript et `decimal.getcontext().prec = 38` côté Python doivent être maintenues. C'est une garantie de cohérence des calculs financiers entre les deux runtimes.

## 3. Ce qui est dans le périmètre de la Phase 0

**Oui, fait en Phase 0 :**

- Suppression de toutes les applications et packages non conformes.
- Initialisation de la nouvelle arborescence canonique.
- Importation du golden baseline via le script de normalisation (Livrable 1).
- Configuration CI, Docker Compose, linters, formatters cohérents.
- Un premier commit taggé `phase-0-complete` qui matérialise l'état de départ du refactoring.

**Pas de code applicatif écrit en Phase 0.** Pas de routes, pas d'agents, pas de frontend, pas de migrations fonctionnelles. La Phase 0 produit un monorepo **squelettique mais propre et compilable** qui sert de base aux Phases 1 à 6.

## 4. Ce qui est hors périmètre

**Non fait en Phase 0 :**

- Écriture des migrations SQL du Document 6 (Phase 1).
- Écriture du moteur d'évaluation canonique (Phase 2).
- Écriture du backend API canonique (Phase 3).
- Écriture des agents canoniques et Regalica (Phase 4).
- Écriture du frontend canonique (Phase 5).
- Durcissement production (Phase 6).

---

# Partie II — Audit pré-suppression

## 5. Inventaire exact de ce qui est supprimé

Basé sur le rapport AS-IS fourni par Claude Code. Liste exhaustive.

### Applications supprimées en totalité

**`apps/web`** — Next.js 16 + Supabase + App Router. Viole la doctrine (Next.js rejeté, Supabase rejeté). Fonctionnalités qui existaient : workspace 3 panneaux `/app`, routes `/api/chat`, `/api/evaluate`, `/api/validate`, store Zustand `session-store.ts`. Tout va dans le nouveau `apps/frontend` React + Tailwind en Phase 5.

**`apps/frontend`** — Angular 18. Viole la doctrine (React est la stack cible). Fonctionnalités qui existaient : composants dashboard, reports, modals (deep-dive, structure-check, upload-report, validation-progress), services (ModalService, ToastService). Tout sera refait depuis les maquettes Edition One HTML validées en Phase 5.

**`apps/chatbot-node`** — relai Express vers chatbot-py. Sa seule fonction était de relayer des appels HTTP. Elle est absorbée dans le nouveau `apps/api` qui devient l'unique point d'entrée backend. Zéro valeur à conserver.

### Packages supprimés

**`packages/db`** — schéma Drizzle avec 21 fichiers. Viole la doctrine (Drizzle rejeté, pg natif sans ORM). Aucune ligne conservée. Les 21 schémas Drizzle ne correspondent pas aux 22 tables du Document 6 et ne peuvent pas servir de base.

**`packages/design-tokens`** — stub. Sera remplacé par `packages/ui` en Phase 5 qui extrait les tokens depuis les maquettes Edition One.

**`packages/persona-regalica`** — stub. La persona vit dans `prompt_bank` (base de données), pas dans un package.

**`packages/rdg-schema`** — types partagés. Les types RDG sont redéfinis dans `packages/evaluator/src/types.ts` en Phase 2.

**`packages/shared-types`** — types health/tenant/verdict. Redéfinis dans les packages consommateurs.

**`packages/ui`** — composants React partagés existants (4 composants). Ils ne correspondent pas aux maquettes Edition One. Remplacés en Phase 5.

**`tools/eslint-plugin-no-emoji`** — stub. À reconstruire en Phase 6 si besoin de discipline automatique.

**`tools/eslint-plugin-no-hardcoded-rules`** — stub. À reconstruire en Phase 6.

### Dépendances supprimées

Dans `apps/api/package.json` :

- `sequelize` (ORM rejeté)
- `pg-hstore` (lié à Sequelize)
- `@azure/storage-blob` (pas de stockage cloud, zstd local selon Document 6)

Dans `apps/web/package.json` : toute l'application part, donc toutes ses dépendances aussi (Next.js, Supabase, Anthropic SDK, shadcn, etc.).

Dans `apps/chatbot-py/pyproject.toml` :

- `sqlalchemy` (ORM Python rejeté, remplacé par asyncpg natif avec requêtes SQL textuelles)

### Fichiers de configuration mis à jour

- `pnpm-workspace.yaml` — liste réduite aux nouveaux workspaces.
- `docker-compose.yml` — 4 services au lieu de 7.
- `.github/workflows/ci.yml` — jobs simplifiés.
- `.env.example` — variables alignées sur le nouveau périmètre.

## 6. Inventaire de ce qui est conservé

**Conservé tel quel ou avec modifications mineures.**

- **`tests/fixtures/`** — contenu actuel remplacé par le golden baseline normalisé (58 XML).
- **`tests/fixtures/rdg.xlsx`** — conservé, il sert de source pour le seeding de la table `rules`.
- **`infra/docker/postgres-init.sql`** — conservé, activation des extensions `vector`, `pgcrypto`, `pg_trgm`, `btree_gin`. Contenu étendu en Phase 1 pour ajouter `uuid-ossp` et `btree_gin` si besoin.
- **`infra/nginx/nginx.conf`** — conservé, sera révisé en Phase 6 pour la production.
- **`.nvmrc`** — conservé, Node 20.
- **`.python-version`** — conservé, Python 3.12.
- **`tsconfig.base.json`** — conservé, configuration TypeScript partagée.
- **`.editorconfig`** — conservé.
- **`.gitattributes`** — conservé.

**Conservé avec réécriture intégrale en Phase 2.**

- **Algorithme moteur 5 phases** — le code part, l'algorithme est documenté dans `packages/evaluator/ALGORITHM.md` pour reconstruction.
- **Algorithme BCT XML Parser** — idem, documenté dans `packages/bct-xml-parser/ALGORITHM.md`.
- **Algorithme Structure Validator** — idem, dans `packages/structure-validator/ALGORITHM.md`.

## 7. Capture des actifs avant suppression

Avant toute suppression, Claude Code doit capturer quatre actifs dans des documents Markdown dans `docs/as-is-captured/` pour référence lors du refactoring.

**Fichier `docs/as-is-captured/evaluator-algorithm.md`.** Extraction de la logique des 5 phases du moteur. Lecture des fichiers `apps/api/src/agents/evaluator/index.ts`, `phases.ts`, `types.ts`. Description en prose structurée : phase A (parsing XML vers CellMatrix), phase B (chargement règles), resolveTerms (résolution de chaque terme), phase D (agrégation par rang), phase E (comparaison LHS op RHS vers verdict). Inclure les 8 statuts de verdict (`PASS`, `FAIL`, `SKIPPED_MISSING_ANNEXE`, etc.).

**Fichier `docs/as-is-captured/bct-xml-parser-algorithm.md`.** Logique d'extraction du CodeAnnexe normalisé, de la matrice rubrique → colonne → valeur, du pattern de zéros en tête supprimés.

**Fichier `docs/as-is-captured/structure-validator-rules.md`.** Règles de validation structurelle XSD par annexe, liste des dimensions contrôlées, messages d'erreur retournés.

**Fichier `docs/as-is-captured/circuit-breaker-and-context-manager.md`.** Extraction depuis `apps/web/src/lib/llm/` (Next.js à supprimer) de la logique du circuit breaker et du context manager sliding window 8 messages. Cette logique sera portée dans `apps/api` en Phase 3.

Ces quatre documents sont commitéesen premier, avant toute suppression. Ils survivent à la Phase 0.

---

# Partie III — Suppression brute

## 8. Création du tag de sauvegarde

```bash
# Depuis la racine du repo
git tag -a pre-refactoring-backup-2026-04-22 \
  -m "Snapshot avant Phase 0 refactoring brute — dernier état AS-IS avec apps/web, apps/frontend, apps/chatbot-node, packages/db, Sequelize, Drizzle, Supabase."
git push origin pre-refactoring-backup-2026-04-22
```

Ce tag est la seule trace de l'ancien état. Il permet de revenir en arrière via `git checkout pre-refactoring-backup-2026-04-22` si absolument nécessaire. Il n'y a aucune autre archive.

## 9. Suppression des applications non conformes

```bash
# Branche de travail dédiée
git checkout -b phase-0/brute-refactoring

# Capture des actifs AVANT suppression
mkdir -p docs/as-is-captured
# Claude Code produit les 4 fichiers markdown de capture (§7)
git add docs/as-is-captured/
git commit -m "docs(as-is): capture algorithms and logic before brute deletion"

# Suppression des applications
git rm -r apps/web
git rm -r apps/frontend
git rm -r apps/chatbot-node

git commit -m "chore(phase-0): remove non-conforming applications

- apps/web: Next.js 16 + Supabase (violates locked stack doctrine)
- apps/frontend: Angular 18 (React is the canonical choice)
- apps/chatbot-node: HTTP relay (absorbed into apps/api)

Algorithms and critical logic captured in docs/as-is-captured/.
All functionality will be reimplemented in Phases 2-5."
```

## 10. Suppression des packages non conformes

```bash
git rm -r packages/db
git rm -r packages/design-tokens
git rm -r packages/persona-regalica
git rm -r packages/rdg-schema
git rm -r packages/shared-types
git rm -r packages/ui
git rm -r tools/eslint-plugin-no-emoji
git rm -r tools/eslint-plugin-no-hardcoded-rules

git commit -m "chore(phase-0): remove non-conforming packages and tools

- packages/db: Drizzle ORM (rejected stack)
- packages/design-tokens, persona-regalica, rdg-schema, shared-types, ui: stubs or deprecated, replaced in Phases 2-5
- tools/eslint-plugin-*: stubs, to be rebuilt in Phase 6 if needed"
```

## 11. Nettoyage des dépendances

Mise à jour de `apps/api/package.json` pour retirer Sequelize et les dépendances associées. Mise à jour de `apps/chatbot-py/pyproject.toml` pour retirer SQLAlchemy.

```bash
# Dans apps/api/, éditer package.json
# Retirer: sequelize, pg-hstore, @azure/storage-blob, @types/... associés

# Dans apps/chatbot-py/, éditer pyproject.toml
# Retirer: sqlalchemy de [project].dependencies

# Verrouillage propre des lockfiles
pnpm install --lockfile-only
cd apps/chatbot-py && uv lock

git add apps/api/package.json apps/chatbot-py/pyproject.toml pnpm-lock.yaml apps/chatbot-py/uv.lock
git commit -m "chore(phase-0): remove ORM dependencies (Sequelize, SQLAlchemy, Drizzle)

Per locked doctrine in Documents 1-3, REGFlow uses pg natively on Node.js
and asyncpg natively on Python. All ORMs are removed in one atomic commit."
```

## 12. Nettoyage de la CI et des configurations

```bash
# Mise à jour .github/workflows/ci.yml
# Retirer jobs: test-frontend (Angular), references à apps/web et apps/chatbot-node
# Conserver jobs: lint-ts, lint-python, typecheck-ts, test-api, test-chatbot-py, build-images (réduit)

# Mise à jour pnpm-workspace.yaml
# Liste réduite à: apps/api, apps/chatbot-py, packages/*, tools/*

# Mise à jour docker-compose.yml
# Services retenus: postgres, api, chatbot-py, nginx
# Services retirés: ollama (reporté en Phase 6), frontend (reconstruit en Phase 5), chatbot-node (absorbé)

# Mise à jour .env.example
# Retirer variables: AZURE_STORAGE_*, CHATBOT_PY_URL (chatbot-node n'existe plus)
# Ajouter variables: GEMINI_API_KEY, GEMINI_MODEL_ID, etc.

git add .github/workflows/ci.yml pnpm-workspace.yaml docker-compose.yml .env.example
git commit -m "chore(phase-0): simplify CI, Docker Compose, and env.example

4 services in Docker Compose: postgres, api, chatbot-py, nginx.
5 jobs in CI: lint-ts, lint-python, typecheck-ts, test-api, test-chatbot-py.
Environment variables aligned with canonical stack."
```

---

# Partie IV — Initialisation du nouveau monorepo

## 13. Structure cible du monorepo

Après Phase 0, la structure du monorepo est la suivante :

```
REGFlow/
├── .github/
│   └── workflows/
│       └── ci.yml                  # Pipeline CI canonique
├── apps/
│   ├── api/                        # Backend Node.js + Express + pg natif
│   │   ├── src/
│   │   │   ├── config.ts           # Config Zod
│   │   │   ├── logger.ts           # Pino
│   │   │   └── index.ts            # Point d'entrée squelette
│   │   ├── tests/
│   │   │   └── health.test.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── jest.config.ts
│   │   └── Dockerfile
│   └── chatbot-py/                 # Services Python + FastAPI
│       ├── app/
│       │   ├── config.py
│       │   ├── logger.py
│       │   └── main.py
│       ├── tests/
│       │   └── test_health.py
│       ├── pyproject.toml
│       ├── uv.lock
│       └── Dockerfile
├── packages/
│   ├── evaluator/                  # Package créé en Phase 2
│   │   ├── ALGORITHM.md            # Capture de la logique avant réécriture
│   │   └── package.json            # Squelette
│   ├── bct-xml-parser/             # Package créé en Phase 2
│   │   ├── ALGORITHM.md
│   │   └── package.json
│   ├── structure-validator/        # Package créé en Phase 2
│   │   ├── ALGORITHM.md
│   │   └── package.json
│   ├── state-machines/             # Package créé en Phase 3
│   │   └── package.json
│   └── ui/                         # Package créé en Phase 5
│       └── package.json
├── tools/
│   ├── golden-normalizer/          # Livrable 1, déjà fourni
│   │   ├── normalize.py
│   │   ├── pyproject.toml
│   │   └── README.md
│   ├── seed-referentials-from-xml/ # Livrable 2
│   │   ├── seed.py
│   │   ├── pyproject.toml
│   │   └── README.md
│   └── verify-golden-integrity/    # À créer en Phase 1
│       └── verify.py
├── tests/
│   ├── fixtures/
│   │   ├── golden/
│   │   │   └── tenant-001/         # Importé via golden-normalizer (anonymisé)
│   │   │       ├── 2024-12-31/
│   │   │       ├── 2026-02-28/
│   │   │       ├── 2026-03-31/
│   │   │       ├── 2024-09-30/
│   │   │       └── historical/
│   │   ├── structural-references/
│   │   ├── rdg.xlsx                # Source des règles pour seeding
│   │   └── README.md
│   └── integration/                # Vide à ce stade
├── docs/
│   ├── as-is-captured/             # 4 fichiers de capture
│   │   ├── evaluator-algorithm.md
│   │   ├── bct-xml-parser-algorithm.md
│   │   ├── structure-validator-rules.md
│   │   └── circuit-breaker-and-context-manager.md
│   ├── 01-PLATEFORME-REGFLOW-VISION.md
│   ├── 02-REGLEMENTAIRE-RDG-ET-BCT.md
│   ├── 03-ARCHITECTURE-ET-ZERO-HARDCODING.md
│   ├── 04-WORKFLOW-UTILISATEUR-COMPLET.md
│   ├── 05-AGENTS-ET-PROMPTS-BANK.md
│   ├── 06-SCHEMA-SQL-COMPLET.md
│   ├── 07-PLAN-GOLDEN-BASELINE-v2.md
│   ├── 08-STATE-MACHINES-WORKFLOW.md
│   └── PHASE-0-PLAN.md             # Ce document
├── infra/
│   ├── docker/
│   │   └── postgres-init.sql
│   └── nginx/
│       └── nginx.conf
├── .github/
├── .nvmrc
├── .python-version
├── .env.example
├── .gitignore
├── .gitattributes
├── .editorconfig
├── docker-compose.yml
├── eslint.config.mjs
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── CLAUDE.md                       # Instructions Claude Code
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

## 14. Workspace pnpm

Nouveau `pnpm-workspace.yaml` :

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'tools/*'
```

## 15. Package `@regflow/api`

Nouveau `apps/api/package.json` nettoyé :

```json
{
  "name": "@regflow/api",
  "version": "1.0.0",
  "private": true,
  "description": "REGFlow Backend API — Express + pg native",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "jest --coverage",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "decimal.js": "^10.4.3",
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "fast-xml-parser": "^4.5.0",
    "helmet": "^8.0.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.13.1",
    "pino": "^9.5.0",
    "pino-http": "^10.3.0",
    "socket.io": "^4.8.1",
    "xlsx": "0.18.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@eslint/js": "^9.15.0",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.14",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/multer": "^1.4.12",
    "@types/node": "^20.17.6",
    "@types/pg": "^8.11.10",
    "@types/supertest": "^6.0.2",
    "eslint": "^9.15.0",
    "eslint-config-prettier": "^9.1.0",
    "jest": "^29.7.0",
    "pino-pretty": "^11.3.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.14.0"
  }
}
```

**Notable absent :** `sequelize`, `pg-hstore`, `@azure/storage-blob`.

Fichier squelette `apps/api/src/index.ts` minimal qui démarre un serveur Express avec une route `/health`. Pas de routes métier, pas de migrations, pas de base de données connectée (ajouté en Phase 1).

## 16. Package `@regflow/chatbot-py`

Nouveau `apps/chatbot-py/pyproject.toml` nettoyé :

```toml
[project]
name = "regflow-chatbot-py"
version = "1.0.0"
description = "REGFlow Python services — FastAPI for LLM agents and RAG"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "asyncpg>=0.30.0",
    "pydantic>=2.9.2",
    "pydantic-settings>=2.6.1",
    "google-generativeai>=0.8.3",
    "httpx>=0.27.2",
    "structlog>=24.4.0",
    "python-multipart>=0.0.12",
]

[dependency-groups]
dev = [
    "pytest>=8.3.3",
    "pytest-asyncio>=0.24.0",
    "pytest-cov>=5.0.0",
    "ruff>=0.7.2",
    "mypy>=1.13.0",
]
```

**Notable absent :** `sqlalchemy`.

Fichier squelette `apps/chatbot-py/app/main.py` minimal avec FastAPI et route `/health`.

## 17. Packages partagés

Pour chaque package `packages/*`, un squelette minimal avec `package.json`, `tsconfig.json`, un `src/index.ts` vide ou très minimal, et le fichier `ALGORITHM.md` ou équivalent qui décrit le plan de construction.

**Exemple `packages/evaluator/package.json` :**

```json
{
  "name": "@regflow/evaluator",
  "version": "0.0.0",
  "private": true,
  "description": "RDG Evaluator — moteur d'évaluation canonique en 5 phases (A/B/D/E)",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "lint": "eslint src test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "decimal.js": "^10.4.3"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/node": "^20.17.6",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.6.3"
  }
}
```

**`packages/evaluator/src/index.ts` :**

```typescript
// Placeholder jusqu'à la Phase 2.
// Le moteur canonique sera implémenté selon packages/evaluator/ALGORITHM.md
export const EVALUATOR_VERSION = '0.0.0-phase-0-skeleton';
```

## 18. Scripts de racine

Nouveau `package.json` racine :

```json
{
  "name": "regflow",
  "version": "1.0.0",
  "private": true,
  "description": "REGFlow — Plateforme de conformité BCT par intelligence artificielle",
  "scripts": {
    "dev": "docker compose up",
    "dev:down": "docker compose down",
    "build": "pnpm -r --if-present build",
    "test": "pnpm -r --if-present test",
    "lint": "pnpm -r --if-present lint",
    "typecheck": "pnpm -r --if-present typecheck",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "golden:normalize": "uv run python tools/golden-normalizer/normalize.py --source-dir tests/fixtures-source --target-dir tests/fixtures --tenant-slug tenant-001 --bank-code-placeholder BANK-CODE --bank-id-placeholder BANK-ID --validation-author \"Wissem Barouni\" --report-file tools/golden-normalizer/reports/normalization.json",
    "golden:verify": "uv run python tools/verify-golden-integrity/verify.py --fixtures-dir tests/fixtures/golden"
  },
  "devDependencies": {
    "prettier": "^3.3.3",
    "typescript": "^5.6.3"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@10.33.0"
}
```

---

# Partie V — Configuration transverse

## 19. CI GitHub Actions

Nouveau `.github/workflows/ci.yml` simplifié :

```yaml
name: CI

on:
  push:
    branches:
      [
        main,
        phase-0/**,
        phase-1/**,
        phase-2/**,
        phase-3/**,
        phase-4/**,
        phase-5/**,
        phase-6/**,
        fix/**,
      ]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  PYTHON_VERSION: '3.12'
  PNPM_VERSION: '10.33.0'

jobs:
  lint-ts:
    name: Lint TypeScript
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: '${{ env.PNPM_VERSION }}' }
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm lint

  lint-python:
    name: Lint Python (ruff + mypy)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '${{ env.PYTHON_VERSION }}' }
      - uses: astral-sh/setup-uv@v3
      - working-directory: apps/chatbot-py
        run: |
          uv sync
          uv run ruff check .
          uv run ruff format --check .
          uv run mypy app

  typecheck-ts:
    name: Typecheck TypeScript
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: '${{ env.PNPM_VERSION }}' }
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test-api:
    name: Test @regflow/api
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: regflow_app
          POSTGRES_PASSWORD: ci_password
          POSTGRES_DB: regflow_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: '${{ env.PNPM_VERSION }}' }
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - working-directory: apps/api
        run: pnpm test --coverage
        env:
          DATABASE_URL: postgresql://regflow_app:ci_password@localhost:5432/regflow_test
          NODE_ENV: test
          JWT_SECRET: test_secret_at_least_thirty_two_characters_long

  test-chatbot-py:
    name: Test chatbot-py
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '${{ env.PYTHON_VERSION }}' }
      - uses: astral-sh/setup-uv@v3
      - working-directory: apps/chatbot-py
        run: |
          uv sync
          uv run pytest --cov=app --cov-report=term-missing

  verify-no-residual-debt:
    name: Verify no residual debt
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Fail on _legacy, _archive, _old directories
        run: |
          if find . -type d \( -name "_legacy" -o -name "_archive" -o -name "_old" -o -name ".backup" \) | grep .; then
            echo "❌ Residual debt directories detected"
            exit 1
          fi
      - name: Fail on TODO removal markers
        run: |
          if grep -rn "TODO: à supprimer\|TODO: remove\|TODO: delete me\|@deprecated temporary" --include="*.ts" --include="*.py" --include="*.js" . ; then
            echo "❌ Residual TODO markers detected"
            exit 1
          fi
      - name: Fail on skipped tests
        run: |
          if grep -rn "it.skip\|test.skip\|describe.skip\|pytest.skip" --include="*.ts" --include="*.py" . ; then
            echo "❌ Skipped tests detected"
            exit 1
          fi
```

**Nouveau job `verify-no-residual-debt`.** C'est l'automatisation de la zéro tolérance dette résiduelle. Il échoue la CI si du code mort ou skippé apparaît.

## 20. Docker Compose

Nouveau `docker-compose.yml` à 4 services :

```yaml
name: regflow

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-regflow_app}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-change_me_in_local_env}
      POSTGRES_DB: ${POSTGRES_DB:-regflow}
    ports: ['5432:5432']
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./infra/docker/postgres-init.sql:/docker-entrypoint-initdb.d/00-init.sql:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}']
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    env_file: .env
    ports: ['3000:3000']
    depends_on:
      postgres:
        condition: service_healthy

  chatbot-py:
    build:
      context: apps/chatbot-py
      dockerfile: Dockerfile
    env_file: .env
    ports: ['8000:8000']
    depends_on:
      postgres:
        condition: service_healthy

  nginx:
    image: nginx:1.27-alpine
    ports: ['80:80']
    volumes:
      - ./infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - api
      - chatbot-py

volumes:
  pgdata:
```

**Services retirés :** `ollama` (reporté en Phase 6), `chatbot-node` (absorbé dans api), `frontend` (reconstruit en Phase 5).

## 21. ESLint et Prettier

`eslint.config.mjs` racine avec règles standards TypeScript, règle contre `any` non justifié, règle contre `it.skip`.

`.prettierrc` standard 2 espaces, semi-colons, simple quotes dans strings TS.

## 22. pre-commit hooks

Ajout d'un `.husky/pre-commit` (optionnel mais recommandé) :

```bash
#!/bin/sh
. "$(dirname -- "$0")/_/husky.sh"

pnpm format:check
pnpm lint
```

## 23. Politique de dépendances

Un script `tools/check-forbidden-deps.sh` exécuté en CI qui échoue si des dépendances interdites par la doctrine apparaissent dans n'importe quel `package.json` ou `pyproject.toml` :

```bash
FORBIDDEN_NPM="sequelize|drizzle-orm|prisma|next|@supabase"
FORBIDDEN_PYPI="sqlalchemy|django"

if grep -rE "\"($FORBIDDEN_NPM)\"" --include="package.json" apps packages tools ; then
  echo "❌ Forbidden npm dependency detected"
  exit 1
fi

if grep -rE "^($FORBIDDEN_PYPI)(\[|=|>|<)" --include="pyproject.toml" apps tools ; then
  echo "❌ Forbidden pypi dependency detected"
  exit 1
fi
```

---

# Partie VI — Tests et validation de la Phase 0

## 24. Tests de santé

À la fin de la Phase 0, deux tests doivent passer :

**Test 1 — `apps/api/tests/health.test.ts`.** Démarre l'app Express, appelle `GET /health`, vérifie `200` et `{ status: 'ok' }`.

**Test 2 — `apps/chatbot-py/tests/test_health.py`.** Démarre FastAPI, appelle `GET /health`, vérifie `200` et `{ status: 'ok' }`.

Ces deux tests existaient déjà dans l'AS-IS. Ils sont conservés et doivent rester verts.

## 25. Tests de propreté

**Test 3 — Golden baseline intégré.** Le dossier `tests/fixtures/golden/tenant-001/` contient la structure normalisée (anonymisée) avec 58 XML et 9 `expected_verdicts.json`. Script `tools/verify-golden-integrity/verify.py` vérifie les checksums.

**Test 4 — Pas de dette résiduelle.** Job CI `verify-no-residual-debt` passe (pas de `_legacy/`, pas de `TODO: remove`, pas de `.skip()`).

**Test 5 — Pas de dépendance interdite.** Job CI `check-forbidden-deps` passe (pas de Sequelize, Drizzle, Next, Supabase, SQLAlchemy).

**Test 6 — Build propre.** `pnpm build` compile sans erreur tous les packages squelettiques.

**Test 7 — Lint propre.** `pnpm lint` passe sans erreur.

**Test 8 — Typecheck propre.** `pnpm typecheck` passe sans erreur.

## 26. Critères de sortie de la Phase 0

La Phase 0 est déclarée complète quand **tous les 8 tests ci-dessus passent** en CI sur la branche `phase-0/brute-refactoring`, **ET** que :

- Le tag `pre-refactoring-backup-2026-04-22` existe et pointe vers l'ancien code.
- Le tag `phase-0-complete` est posé sur le commit final de la Phase 0.
- Les Documents 1 à 8 sont présents dans `docs/`.
- Les 4 documents de capture AS-IS sont présents dans `docs/as-is-captured/`.
- Le fichier `CLAUDE.md` à la racine est rédigé (instructions pour Claude Code).
- Le `README.md` à la racine est mis à jour.

---

# Partie VII — Commits et branches

## 27. Séquence de commits

Phase 0 doit produire exactement cette séquence de commits, dans cet ordre, sur la branche `phase-0/brute-refactoring` :

1. `docs(as-is): capture algorithms and logic before brute deletion`
2. `chore(phase-0): remove non-conforming applications`
3. `chore(phase-0): remove non-conforming packages and tools`
4. `chore(phase-0): remove ORM dependencies (Sequelize, SQLAlchemy, Drizzle)`
5. `chore(phase-0): simplify CI, Docker Compose, and env.example`
6. `feat(phase-0): init new monorepo structure with skeleton apps and packages`
7. `feat(phase-0): add forbidden-deps and no-residual-debt CI guards`
8. `test(phase-0): add health tests for api and chatbot-py skeletons`
9. `feat(phase-0): import golden baseline via golden-normalizer (58 xml, 9 batches)`
10. `docs(phase-0): add Documents 1-8 and CLAUDE.md instructions`
11. `chore(phase-0): final polish and phase-0-complete tag`

Chaque commit est atomique et laisse le repo dans un état compilable.

## 28. Stratégie de branches

**Branche `main`** : contient uniquement l'AS-IS initial plus le tag `pre-refactoring-backup-2026-04-22`. Ne bouge plus pendant la Phase 0.

**Branche `phase-0/brute-refactoring`** : porte les 11 commits de la Phase 0.

**Merge vers `main`** : après validation des 8 tests de sortie, merge squash ou merge classique selon préférence. Le tag `phase-0-complete` est posé sur le commit de merge.

## 29. Points de revue

Deux points de revue humaine sont requis pendant la Phase 0 :

**Revue 1 — après commit 5** (avant l'initialisation du nouveau monorepo). Vérifier que toutes les suppressions sont correctes et qu'aucun fichier à conserver n'a été supprimé par accident.

**Revue 2 — avant le merge vers main**. Vérifier que les 8 tests de sortie passent, que les 11 commits sont propres, que l'arborescence finale est conforme au Document 8.

---

# Annexe — Fichier `CLAUDE.md` de référence

Ce fichier est créé à la racine du monorepo et fournit les instructions de contexte permanentes à Claude Code pour tous les travaux sur le repo.

```markdown
# Instructions pour Claude Code

## Contexte projet

REGFlow — Plateforme IA on-premises de conformité BCT pour banques tunisiennes.
Application sœur de RegTrack chez ALGORIA Factory.
Utilisateur primaire : Compliance Officer en banque tunisienne résidente.

## Doctrine immuable

- Stack gelée : Node.js + Express + pg natif SANS ORM, PostgreSQL + pgvector, FastAPI Python + asyncpg natif, React + Tailwind
- REJETÉS : Next.js, Supabase, Drizzle, Prisma, Sequelize, SQLAlchemy
- Zéro hardcoding : toute connaissance métier en base (`rules`, `prompt_bank`, `referentials_*`)
- Zéro tolérance dette résiduelle : pas de `_legacy/`, pas de `TODO: supprimer`, pas de `.skip()`
- Validation 4-yeux sur toutes les tables de vérité métier

## Documents de référence

- docs/01-PLATEFORME-REGFLOW-VISION.md — Vision et proposition de valeur
- docs/02-REGLEMENTAIRE-RDG-ET-BCT.md — RDG, sentinelles, nomenclatures XML
- docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md — Architecture et principes
- docs/04-WORKFLOW-UTILISATEUR-COMPLET.md — Workflow T0/T1/T2/T3
- docs/05-AGENTS-ET-PROMPTS-BANK.md — 14 agents et prompt_bank
- docs/06-SCHEMA-SQL-COMPLET.md — Schéma SQL canonique (22 tables)
- docs/07-PLAN-GOLDEN-BASELINE-v2.md — Golden baseline du tenant pilote (58 XML)
- docs/08-STATE-MACHINES-WORKFLOW.md — State machines T0/T1/T2/T3/4-yeux

## Règles de développement

- Chaque modification de règle, référentiel, prompt passe par 4-yeux (auteur ≠ valideur)
- Précision Decimal : 38 digits ROUND_HALF_EVEN côté TS et Python
- Dates au format FR : 31/12/2025
- Nombres au format FR : 57 985,238 (espace millier, virgule décimale)
- TND suffixé, codes rubrique en monospace
- Regalica vouvoie toujours, pas d'emojis, pas de superlatifs marketing

## Invariants non négociables

1. Golden baseline du tenant pilote (58 XML) doit toujours passer
2. Règles actives jamais modifiées en place
3. Historique validation_runs immuable
4. Performance p95 validation XML standard < 3s
5. Stack RegTrack jamais impactée par évolution REGFlow
6. Zéro-hardcoding absolu
```

---

_Fin du Plan d'exécution Phase 0 pour Claude Code_
