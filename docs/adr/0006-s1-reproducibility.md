# ADR 0006 — S1 Reproductibilité dev / CI / prod

- **Status** : Accepted
- **Date** : 2026-05-05
- **Chantier** : S1 (stabilisation)
- **Branche** : `phase-0/brute-refactoring`
- **Commits** : `3a6ce64` (L1), `d38aeb4` (L2), `7ebc00a` (L3),
  `279187e` (L4), `e7104a3` (L5), `f2a0b88` (L6), `d251b68` (L7),
  ce commit (L8 + L9), un commit suivant (L10).

## Contexte

L'audit factuel du 04/05 a établi que le projet REGFlow ne fonctionnait
sur aucune machine vierge. Sur la machine du mainteneur, le scénario
« upload XML → lancer validation → verdict à l'écran » marche ; sur
n'importe quelle autre machine, la séquence canonique
`pnpm install && docker-compose up && pnpm migrate:up && pnpm dev`
échoue à atteindre le verdict en raison de **8 étapes manuelles
non documentées** :

1. Créer les 4 `.env` (le `.env.example` racine n'a pas
   `GEMINI_API_KEY` réel).
2. Créer un `docker-compose.override.yml` per-developer (gitignored,
   chemin différent par machine).
3. Décider quelle Postgres utiliser (host vs Docker) et résoudre
   le double listener sur 5432.
4. Back-fill manuel des rows 064/065/066 dans `schema_migrations`
   après installation hors-runner antérieure.
5. Lancer 20 migrations GUC-gated avec les UUIDs operator
   (`SEED_AUTHOR_USER_ID`, `SEED_VALIDATOR_USER_ID`,
   `SEED_TENANT_ID`, `SEED_VALID_FROM`).
6. Provisionner ≥ 2 users (auteur + validateur 4-yeux) + le tenant
   `demo-bank-01` via psql manuel.
7. Backdater `rules.valid_from` à une date < arrête date des
   fixtures (sinon `RuleSelector` retourne 0).
8. Uploader des XMLs de test via le frontend ou l'API.

L'audit du 04/05 conclut explicitement : « sur machine vierge, le
scénario « upload + lancer + verdict » **ne marche pas** sans 7-8
étapes manuelles non documentées ». L'objectif de S1 est binaire :
amener cette dette à zéro.

## Décisions

10 livrables ont été tranchés avant l'écriture (cf. spec S1) :

| #   | Livrable                                     | Décision majeure                                                                                                                                                |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | `docker-compose.override.yml` versionné      | Option A — committer la canonical override + ajouter `docker-compose.local.yml` au `.gitignore` pour les tweaks per-dev.                                        |
| L2  | Migration `999_seed_dev_tenant.sql`          | Option A — migration SQL versionnée, GUC-gated `app.seed_dev_tenant`. UUIDs hardcodés (dev fixtures déterministes), tenant + 2 users + 2 rôles assignés.        |
| L3  | Wrapper `migrate-with-operator`              | Extension du runner existant (additive, non-breaking) — pas de fork. Subcommand `up:operator` côté CLI. Détection GUC-gated par fingerprint de contenu fichier. |
| L4  | `bootstrap-env.ts` + `apps/api/.env.example` | Script idempotent + création du fichier manquant + alignement chatbot-py.                                                                                       |
| L5  | `seed-fixtures.ts`                           | Subset 5 XMLs (le batch `2026-02-28/filled/`) plutôt que les 65 — couvre upload→/runs→completed avec KPIs non-nuls.                                             |
| L6  | `setup-dev.ts` orchestrator                  | Pipeline 6-step idempotent enchaînant L1+L2+L3+L4+L5.                                                                                                           |
| L7  | `GET /api/health`                            | Audit-then-act : route `/health` minimale préservée pour compat. Nouvelle `/api/health` riche, distincte.                                                       |
| L8  | `docs/DEV-SETUP.md` + `CLAUDE.md` §12        | Source unique. La procédure manuelle est explicitement marquée obsolète.                                                                                        |
| L9  | ADR 0006                                     | Ce document.                                                                                                                                                    |
| L10 | Test ultime + CI job `e2e-fresh-machine`     | Séparé en commit dédié.                                                                                                                                         |

Décisions stratégiques tranchées par le CEO (Q1-Q5) :

- **Q1 GEMINI_API_KEY en CI** : fournie via GitHub secret. Le job
  `e2e-fresh-machine` s'appuie dessus.
- **Q2 `docker compose down -v`** : OK à la validation finale,
  backup `pg_dump` pris au préalable côté operator.
- **Q3 Coverage scripts** : 50-60% acceptée sur les scripts I/O
  lourds. La vraie validation est le test E2E « machine vierge ».
- **Q4 Axes UI** : N/A par commit S1. Captures uniquement à la
  vérification finale E2E.
- **Q5 Mode** : autonomous. Commit atomique par livrable, CI verte
  entre chaque, pas d'arrêt sauf blocage métier.

## Justifications par livrable

### L1 — `docker-compose.override.yml` versionné (vs garder par-dev)

Versionner garantit qu'un fresh clone donne immédiatement une stack
cohérente : chatbot-py ET api routent vers le service Docker
`postgres`, sans dépendance à une installation Postgres sur la
machine. Les tweaks per-dev (port remap, alternative DSN, host PG
routing) glissent vers `docker-compose.local.yml` (gitignored, ordre
de merge garanti par Docker Compose : base → override → local).

L'ancien override per-dev (`postgres:3333@host.docker.internal`) a
fait perdre une journée d'audit en avril ; la décision A élimine
définitivement cette classe de drift.

### L2 — Migration SQL `999_*` (vs script TS)

Mécanisme uniforme avec le reste du corpus migration. Audit trail
automatique via `schema_migrations`. Idempotence native via
`ON CONFLICT DO NOTHING`. Numérotée 999 pour s'exécuter en dernier
sans interférer avec la suite canonique 001-075a.

GUC `app.seed_dev_tenant=true` plutôt que `NODE_ENV='development'`
parce que Postgres n'a pas accès à NODE*ENV ; les autres seeds
GUC-gated (042/043/044/...) suivent déjà la convention `app.seed*\*`,
le pattern est connu.

UUIDs hardcodés : doctrine « zero hardcoding » cible les valeurs
métier (règles, prompts, seuils). Les UUIDs de fixtures dev sont
des constantes infrastructure partagées par le frontend
(`VITE_TENANT_ID` / `VITE_USER_ID`), le seed-fixtures script,
le CI e2e job. Une seule source canonique évite la divergence.

### L3 — Wrapper `migrate-with-operator` (vs refactor in-place du runner)

Choix : **extension additive** de `migrator.ts` (deux nouveaux
champs : `MigrationFile.gucGated` et `MigratorOptions.sessionVars`)

- subcommand `up:operator` dans le CLI existant. Pas de fork, pas
  de duplication. Les callers existants (`runUp({migrationsDir})`)
  gardent un comportement identique.

Détection GUC-gated par grep `current_setting('app\.seed_` dans le
contenu du fichier. Aucun registre, aucune liste à maintenir : un
nouveau seed GUC-gated est picked up automatiquement.

`set_config(key, value, true)` parameterisé, pas `SET LOCAL` literal :
les valeurs operator (UUIDs, timestamps) ne touchent jamais la SQL
string — pas de surface d'injection.

### L4 — `bootstrap-env.ts`

Génération crypto-safe via `crypto.randomBytes(48)` pour `JWT_SECRET`
(48 bytes = 64 chars base64). Sync cross-fichiers obligatoire car
chatbot-py et l'API Node s'authentifient mutuellement avec le même
secret (commit 36fef10 / S0 H9).

`POSTGRES_PASSWORD` régénéré uniquement si placeholder (regex
`/change_me/i`). Préserve la valeur operator si déjà customisée.

`GEMINI_API_KEY` : prompt interactif (le seul secret non-générable).
Mode `BOOTSTRAP_ENV_NONINTERACTIVE=true` pour CI.

Création de `apps/api/.env.example` qui manquait (drift identifié
dans l'audit) ; alignement de `apps/chatbot-py/.env.example` sur
le runtime (ajout `CHATBOT_PLANNER_*`, `CHATBOT_T1_AGGREGATOR_*`,
`CHATBOT_AUTO_T1_AFTER_T0`).

### L5 — `seed-fixtures.ts`

Subset 5 XMLs (`tests/fixtures/golden/tenant-001/2026-02-28/filled/`)
plutôt que les 65 disponibles : c'est le plus petit set qui exerce
upload→/runs→completed avec des KPIs non-nuls (les 5 annexes
00/01/620/630/640 couvrent les sentinelles C/D + l'inter-annexe).
Le orchestrator setup-dev tourne en moins d'une minute sur une
machine clean.

Idempotence déléguée à l'API : `apps/api/src/routes/uploads.ts`
ligne 242-244 dédup déjà par SHA-256, retourne HTTP 200 +
`deduplicated:true` au lieu de HTTP 201.

### L6 — `setup-dev.ts`

Pipeline séquentiel 6 steps. Idempotent par composition (chaque
sous-script est lui-même idempotent). Échec d'un step → exit 1
avec message clair (« re-run via X »).

Wait sur la postgres healthcheck via `docker inspect ... .State.
Health.Status`. Pas de wait sur api/chatbot-py healthcheck (aucun
n'est déclaré dans le compose) — fallback sleep 5 s acceptable
pour le moment.

### L7 — `GET /api/health` (vs étendre l'existant)

Audit-then-act : `apps/api/src/routes/health.ts` existe déjà et
sert un payload minimal `{status, service, version, uptime,
timestamp}` SANS dépendance DB. La doctrine SKIP/correction/build
dit « préserver ce qui marche ». La nouvelle route `/api/health` :

- Mountée distinctement (séparation des responsabilités : `/health`
  = liveness, `/api/health` = readiness + structural state).
- Requiert le pool DB pour répondre (queries migrations + tenant +
  rules).
- Retourne le shape canonique réclamé par la spec S1 : `status`,
  `schema_version`, `applied_migrations_count`,
  `expected_migrations_count`, `in_sync`, `tenant_dev_present`,
  `rules_active_count`.
- HTTP 200 si `in_sync`, 503 sinon.

Defensive : les probes tenant + rules attrapent l'erreur (table
absente sur DB pré-022) et surface `false`/`0` plutôt que crash.

### L8 — `docs/DEV-SETUP.md`

Source unique pour le procédé reproductible. CLAUDE.md §12 réécrit
pour pointer vers ce document et marquer la procédure manuelle
historique comme obsolète. Évite la divergence entre la doc agent
(CLAUDE.md) et la doc humain (DEV-SETUP.md).

### L9 — ADR 0006

Ce document.

### L10 — Test ultime + CI job (commit suivant)

Job CI `e2e-fresh-machine` ajouté à `.github/workflows/ci.yml` :
container Linux clean exécute `pnpm install && pnpm setup:dev`
en mode `BOOTSTRAP_ENV_NONINTERACTIVE=true` avec
`GEMINI_API_KEY=${{ secrets.GEMINI_API_KEY }}`. Ensuite curl
`/api/health/` doit retourner `in_sync: true` + `tenant_dev_present:
true` + `rules_active_count > 0`. Le job vérifie la reproductibilité
sur chaque commit.

## Conséquences

### Positives

- 8 étapes manuelles → 1 commande (`pnpm setup:dev`).
- Drift dev/CI/prod éliminé sur les surfaces couvertes par S1.
- 30+ tests unitaires sur les nouveaux scripts (node:test built-in,
  zéro deps).
- 88e migration (`999`) idempotente et conditionnelle, ne touche
  jamais la prod.
- Endpoint `/api/health/` exploitable par tout monitoring/CI/ops
  sans connaissance interne.

### Négatives

- Le `docker-compose.override.yml` versionné force la stack
  Docker-only par défaut. Les devs qui utilisaient leur Postgres
  host devront créer un `docker-compose.local.yml` personnel.
- Les UUIDs hardcodés du tenant dev créent un couplage doc-driven
  entre les 4 surfaces qui les référencent (migration 999,
  seed-fixtures, frontend .env, CI job). Renommage = changement
  coordonné.

### Neutres

- Les 19 anciens migrations GUC-gated (038-075a) restent strictement
  inchangés. Le wrapper les fait tourner correctement sans modifier
  leur contenu.
- L'ancien `migrate:up` reste fonctionnel à l'identique (les
  migrations GUC-gated continuent à no-op). Le CI `migrations-smoke`
  job n'est pas modifié.

## Vérification

Per-livrable tests unitaires (chiffres exacts dans chaque commit
message) :

| Livrable | Tests ajoutés                          | Total tests `pnpm test:tools` après livrable |
| -------- | -------------------------------------- | -------------------------------------------- |
| L2       | 9 (jest, migration 999)                | — (jest côté api)                            |
| L3       | 6 (jest, migrator GUC)                 | — (jest côté api)                            |
| L4       | 15 (node:test, bootstrap-env pure fns) | 15                                           |
| L5       | 10 (node:test, seed-fixtures pure fns) | 25                                           |
| L6       | 5 (node:test, setup-dev helpers)       | 30                                           |
| L7       | 4 (jest, supertest, apiHealth)         | — (jest côté api)                            |

Vérifications globales :

- `pnpm format:check` → green sur chaque commit
- `bash tools/check-no-residual-debt.sh` → `[OK]` sur chaque commit
- `bash tools/check-no-hardcoding.sh` → `[OK]` sur chaque commit
  (dev fixture UUIDs et noms GUC infra exemptés via inline nosemgrep
  - docblock justifiant)
- CI 14/14 vert après chaque push (vérifié via `gh run watch`)

## Liens

- Audit factuel du 04/05 : voir transcript de session.
- Spec chantier S1 : voir prompt utilisateur "S1 reproductibilité".
- ADR 0005 (Tranche 1.1 migration drift) — antécédent direct,
  premier signal du gap reproductibilité.
- `docs/DEV-SETUP.md` — procédure operator canonique.
- `apps/api/migrations/README.md` — convention SQL.
