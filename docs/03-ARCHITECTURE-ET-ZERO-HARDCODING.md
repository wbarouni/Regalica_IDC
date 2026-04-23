# REGFlow — Plateforme de Conformité BCT par Intelligence Artificielle

## Document 3 — Architecture et doctrine zéro-hardcoding

**Version :** 1.0
**Date :** avril 2026
**Périmètre :** architecture technique de REGFlow, stack gelée non négociable, topologie on-premises, doctrine zéro-hardcoding, décomposition monorepo, flux de données, sécurité transverse, liste consolidée des invariants non négociables.
**Auteur :** Équipe REGFlow
**Statut :** référence canonique pour Claude Code
**Dépendances :** Document 1 (vision produit), Document 2 (cadre réglementaire), Document 6 (schéma SQL complet)

---

## Sommaire

**Partie I — Stack gelée**

1. Choix de stack et raisons
2. Technologies explicitement rejetées
3. Runtime versions gelées

**Partie II — Topologie on-premises**

4. Déploiement en datacenter client
5. Composants et relations
6. Zéro dépendance SaaS externe critique

**Partie III — Doctrine Zéro Hardcoding**

7. Règle fondatrice
8. Pas de règle RDG codée en dur
9. Pas de prompt IA codé en dur
10. Pas de persona hardcodée
11. Feature flags pour tout déploiement progressif

**Partie IV — Décomposition monorepo**

12. `apps/api` — BFF Express + pg natif
13. `apps/chatbot-py` — FastAPI + agents LLM
14. `packages/bct-xml-parser` — parser dual-nomenclature
15. `packages/evaluator` — moteur RDG en 5 phases
16. `packages/state-machines`, `structure-validator`, `ui` — skeletons
17. `tools/` — utilitaires de normalisation et vérification

**Partie V — Flux de données**

18. Flux de validation XML
19. Flux de conversation avec Regalica
20. Flux 4-yeux pour toute modification de règle ou prompt

**Partie VI — Sécurité transverse**

21. Row-Level Security multi-tenant
22. Audit log avec partitionnement
23. Authentification JWT et sessions
24. Isolation pnpm stricte

**Partie VII — Invariants non négociables**

25. Liste consolidée des invariants architecturaux

---

# Partie I — Stack gelée

## 1. Choix de stack et raisons

La stack technique de REGFlow est **non négociable**. Toute proposition d'écart ou d'alternative est rejetée quelle que soit sa justification. Les choix qui suivent résultent de contraintes produit et réglementaires (on-premises strict, performance fine sur des tables massives, précision Decimal 38 digits, auditabilité complète) et non de préférences d'équipe.

| Couche                 | Technologie retenue                                                         | Raison courte                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Backend API            | Node.js + Express + `pg` natif **sans ORM**                                 | Contrôle fin des requêtes, support natif de pgvector / RLS / triggers / partitioning, zéro dette d'abstraction |
| Base de données        | PostgreSQL 16 + pgvector + extensions standard                              | RLS native multi-tenant, partitioning, UUIDv7, historisation bitemporelle, embeddings pgvector 768             |
| Services IA            | Python + FastAPI + asyncpg natif **sans ORM**                               | Idem côté Python, latence faible, écosystème Pydantic pour validation runtime                                  |
| Frontend               | React + Tailwind + Vite                                                     | SPA pure, build reproductible, aucun runtime serveur à déployer chez le client                                 |
| LLM principal          | Gemini 2.5 Flash via API Google                                             | Qualité de structured output, coût, latence p95 < 3 s sur l'usage cible                                        |
| LLM fallback local     | Ollama + Qwen 2.5 3B (activé en Phase 6)                                    | Continuité de service en coupure Google, déploiement on-premises                                               |
| Embeddings             | Gemini `text-embedding-004` dimension 768                                   | Compatible pgvector, qualité multilingue (FR/EN/AR)                                                            |
| Monorepo               | pnpm workspaces                                                             | Isolation stricte des deps, `workspace:*` pour liens inter-packages                                            |
| Package manager Python | `uv` (Astral)                                                               | Installation reproductible, résolution rapide, compatible `pyproject.toml`                                     |
| Conteneurisation       | Docker + Docker Compose                                                     | Standard bancaire, pas de runtime exotique                                                                     |
| Précision numérique    | `decimal.js` (TS) + `decimal` stdlib (Python), 38 digits, `ROUND_HALF_EVEN` | Obligation RDG, cohérence cross-runtime                                                                        |

**Pourquoi `pg` natif sans ORM.** Les tables REGFlow sont volumineuses par construction : `rules` contient 4 611 entrées × 18 452 `terms`, `audit_log` est partitionnée, `validation_fail_details` peut atteindre plusieurs millions de lignes par mois pour un tenant actif. Une abstraction ORM introduit une couche de traduction imprévisible sur les requêtes critiques et interdit l'usage direct des fonctionnalités PostgreSQL avancées (pgvector, partitioning déclaratif, RLS native, triggers d'immutabilité, UUIDv7). `pg` natif garantit qu'une requête écrite dans le code est exactement celle envoyée à la base. Voir Document 6 pour le schéma complet.

**Pourquoi Next.js et Supabase rejetés.** Next.js est un framework applicatif plein qui impose son runtime serveur, ses conventions et son cycle de build/deploy intégré — incompatible avec la contrainte on-premises stricte où le frontend doit se construire comme SPA statique déployable derrière Nginx dans n'importe quel datacenter client. Supabase est un BaaS hébergé en cloud tiers qui viole la même contrainte. REGFlow tourne dans le datacenter de la banque cliente, jamais dans un cloud tiers.

**Pourquoi Gemini 2.5 Flash et pas Claude ou GPT en production.** Choix produit de l'éditeur. Seuls Ollama + Qwen en fallback local sont tolérés en plus. Cette contrainte peut évoluer au cas par cas sur décision explicite de Wissem Barouni ; elle n'est pas un dogme technique mais un choix commercial.

## 2. Technologies explicitement rejetées

Cette liste n'est pas indicative. Elle est appliquée par le job CI `forbidden-deps` (`tools/check-forbidden-deps.sh`) qui fait échouer le build si l'une de ces dépendances apparaît dans un `package.json` ou `pyproject.toml` actif.

| Famille                        | Rejets                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| ORM npm                        | `sequelize`, `@sequelize/*`, `prisma`, `@prisma/*`, `drizzle-orm`, `drizzle-kit`, `drizzle-*`, TypeORM |
| Framework frontend rejeté      | `@angular/*`, `angular`, `angular-*`, `next`, `@next/*`                                                |
| BaaS cloud                     | `@supabase/*`, `supabase`, `supabase-*`                                                                |
| ORM / migration Python rejetés | `sqlalchemy`, `alembic`                                                                                |

**Règle opérationnelle.** Toute proposition d'intégrer un élément de cette liste est refusée sans débat, y compris si elle semble accélérer une tâche courte. Voir `CLAUDE.md` §3 pour la mise en œuvre opérationnelle dans les sessions Claude Code.

## 3. Runtime versions gelées

| Runtime      | Version exacte                      | Fichier d'ancrage                                                                                   |
| ------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Node.js      | 20.x (20-alpine en conteneur)       | `.github/workflows/ci.yml` env `NODE_VERSION`, `apps/api/Dockerfile` ARG                            |
| Python       | 3.12                                | `.github/workflows/ci.yml` env `PYTHON_VERSION`, `apps/chatbot-py/pyproject.toml` `requires-python` |
| pnpm         | 10.33.0                             | `.github/workflows/ci.yml` env `PNPM_VERSION`, `package.json` `packageManager`, `engines.pnpm`      |
| PostgreSQL   | 16 (image `pgvector/pgvector:pg16`) | `docker-compose.yml`, `.github/workflows/ci.yml` service                                            |
| TypeScript   | 5.6.x                               | Chaque `package.json` TS du monorepo                                                                |
| `decimal.js` | 10.4.x                              | `apps/api/package.json`, `packages/bct-xml-parser/package.json`, `packages/evaluator/package.json`  |

Les bumps de ces versions passent par un commit dédié, jamais mélangés à une feature. Voir `CLAUDE.md` §5 pour la règle de commit atomique.

---

# Partie II — Topologie on-premises

## 4. Déploiement en datacenter client

REGFlow est une plateforme on-premises stricte. Elle est installée dans le datacenter de la banque cliente (bare metal ou virtualisé), jamais dans un cloud public tiers. Cette contrainte découle d'une exigence produit non négociable : les XML BCT contiennent des données bancaires client réelles qui ne peuvent pas sortir du périmètre de responsabilité de la banque avant soumission au SED.

**Conséquences architecturales.**

- Aucun service SaaS critique dans le chemin de donnée principal. Le seul service externe toléré en nominal est l'API Gemini (Google) pour le LLM. La Phase 6 prévoit un fallback Ollama + Qwen 2.5 3B local qui rend la plateforme 100 % self-hosted en mode dégradé.
- Aucune télémétrie produit sortante vers ALGORIA Factory. L'observabilité (Pino + OpenTelemetry + Prometheus + Grafana, arrivée Phase 6) reste intégralement dans le périmètre du client.
- Le frontend est un artefact statique buildé par Vite, servi par Nginx derrière le reverse proxy du client. Pas de serveur de rendu, pas de fonction edge.
- Les images Docker sont poussées vers un registry privé de la banque ou montées en bundle signé selon la politique interne.

## 5. Composants et relations

La topologie minimale d'une installation REGFlow comprend cinq composants, tous conteneurisés dans le même `docker compose` (`docker-compose.yml` à la racine du monorepo pour le développement, bundle équivalent en production).

| Composant           | Image / technologie                               | Rôle                                                                                      |
| ------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `postgres`          | `pgvector/pgvector:pg16`                          | Base de données unique (schéma complet Document 6, RLS active)                            |
| `api`               | Image buildée depuis `apps/api/Dockerfile`        | BFF Express, endpoints REST, Socket.IO, middleware JWT, accès DB                          |
| `chatbot-py`        | Image buildée depuis `apps/chatbot-py/Dockerfile` | Service FastAPI qui héberge Regalica et les 13 spécialistes, accès DB asyncpg             |
| `nginx`             | `nginx:alpine`                                    | Reverse proxy, terminaison TLS, sert le frontend statique buildé, route `/api` et `/chat` |
| Frontend (statique) | Build Vite embarqué par `nginx`                   | SPA React + Tailwind, pas de runtime serveur                                              |

**Flux de dépendance run-time.**

```
User browser → Nginx → (static assets | /api → api | /chat → chatbot-py)
                              api ─────────────────────────→ postgres
                              chatbot-py ──────────────────→ postgres
                              chatbot-py ──────────────────→ Gemini API (sortant)
                              chatbot-py ──(fallback P6)──→ Ollama local
```

Les deux services applicatifs (`api` et `chatbot-py`) partagent la même base PostgreSQL. Aucune communication directe service-à-service hors DB : tout échange passe par des tables transactionnelles (`validation_runs`, `conversations`, `messages`) et des events Socket.IO émis par `api` vers le frontend. Ce pattern simplifie la cohérence et l'audit.

## 6. Zéro dépendance SaaS externe critique

Le seul service externe dont dépend REGFlow en nominal est l'API Gemini de Google. En cas d'indisponibilité Gemini :

1. Circuit breaker local dans `apps/chatbot-py` (voir la capture AS-IS `docs/as-is-captured/circuit-breaker-and-context-manager.md`) ouvre le circuit après N échecs consécutifs.
2. Retry exponentiel avec jitter (Phase 4 — Document 9 §5).
3. Fallback Ollama + Qwen 2.5 3B activé en Phase 6 — en fallback, Regalica signale à l'utilisateur que l'enrichissement IA tourne en mode dégradé, sans masquer le fait.
4. En dégradation totale (pas de LLM disponible), Regalica répond « L'assistance IA est momentanément indisponible. Les résultats du moteur d'évaluation restent consultables. » Le moteur déterministe RDG (`packages/evaluator`) reste 100 % opérationnel parce qu'il ne dépend d'aucun LLM (Document 9 §1).

Aucun autre service cloud tiers ne figure dans le chemin critique. Pas de Sentry externe, pas de Datadog, pas de bus de messages hébergé, pas de storage objet externe. L'observabilité complète arrive en Phase 6 et reste on-premises.

---

# Partie III — Doctrine Zéro Hardcoding

## 7. Règle fondatrice

Toute connaissance métier vit en base de données. Aucune valeur réglementaire, aucun prompt LLM, aucune règle RDG, aucune persona, aucun référentiel BCT n'est écrit en dur dans le code applicatif. Cette règle est l'invariant n°1 du PRD (PRD §5.1) et elle s'applique sans exception.

**Trois tables de vérité métier** portent cette doctrine (schéma détaillé au Document 6) :

| Table            | Contenu                                                                                           | Gouvernance                         |
| ---------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `rules`          | Les 4 611 règles RDG avec leurs `terms` (18 452), leurs formules, leurs tolérances                | 4-yeux, historisation bitemporelle  |
| `prompt_bank`    | Tous les prompts actifs des 14 agents, versionnés, avec `params_schema` validé Pydantic           | 4-yeux, feature-flaggable           |
| `referentials_*` | 14 tables de référentiels (rubriques, colonnes, annexes, sentinelles, dépendances inter-annexes…) | 4-yeux, seed initial via Livrable 2 |

**Conséquence directe.** Le code applicatif charge depuis la DB au démarrage (ou au besoin avec cache) et n'embarque aucune constante métier. Le job CI `no-residual-debt` (`tools/check-no-residual-debt.sh`) vérifie en plus qu'aucune référence à des artefacts supprimés ou au scope `@regalica/` ne reste dans le code actif.

## 8. Pas de règle RDG codée en dur

Les 4 611 règles RDG vivent dans la table `rules` (Document 6 §7) avec leurs 18 452 termes dans la table associée. Elles sont importées une seule fois en Phase 1 depuis le fichier source `RDG.xlsx` via une migration SQL. Toute modification ultérieure respecte la doctrine 4-yeux (PRD §5.9, Document 8 §15-17) :

1. Un auteur propose la modification via l'UI de gouvernance, ce qui crée une demande dans `four_eyes_approvals` avec `requested_by_user_id`.
2. Un second utilisateur (contraint SQL `requested_by_user_id != decided_by_user_id`) approuve ou refuse.
3. Sur approbation, l'ancienne version de la règle voit son `valid_to` rempli à `NOW()`, une nouvelle version est insérée avec `valid_from = NOW()` et `status = 'active'`. L'historique est conservé pour audit.

Aucun code TypeScript ou Python du monorepo ne peut contourner cette doctrine. La capture AS-IS historique du moteur (`docs/as-is-captured/as-is-evaluator-algorithm.md`) documente le calcul, **pas** les règles elles-mêmes — celles-ci arrivent exclusivement par lecture DB en Phase 2.

## 9. Pas de prompt IA codé en dur

Tous les prompts actifs des 14 agents vivent dans la table `prompt_bank` (Document 6 §8) avec :

- `agent_key` identifiant l'agent (p.ex. `regalica_router_v1`, `investigator_v1`)
- `version` entier monotone croissant
- `prompt_template` texte avec placeholders typés
- `params_schema` JSON Schema validé côté Python par Pydantic avant appel LLM
- `status ∈ {draft, in_review, active, deprecated}`
- `feature_flag_key` optionnel pour déploiement progressif

Le service `chatbot-py` charge le prompt actif par `agent_key` au moment d'exécuter l'agent, jamais avant. Pas de cache applicatif long-lived ; un rechargement prompt DB est immédiat. Voir Document 5 pour le cycle de vie détaillé et Document 9 pour la matrice agent ↔ prompt_bank entries.

**Conséquence de développement.** Dans un sprint Phase 4, écrire un agent implique :

1. Créer l'entrée `prompt_bank` en `status = 'draft'` via migration ou via la procédure 4-yeux.
2. Écrire le code Python de l'agent qui lit le prompt par `agent_key` et version.
3. Valider la sortie avec Pydantic (contrats JSON du Document 9).
4. Faire passer l'entrée en `active` via 4-yeux.

Jamais « on colle le prompt dans le code, on testera, on déplacera en DB plus tard ». Cette tentation est explicitement proscrite par PRD §5.5.

## 10. Pas de persona hardcodée

**Regalica n'existe pas dans le code.** Elle vit dans `prompt_bank` sous plusieurs `agent_key` :

- `regalica_router_v1` — classification d'intention (Document 10 §15)
- `regalica_planner_v1` — sélection des spécialistes (Document 10 §16)
- `regalica_aggregator_<intent_type>_v1` — composition de la réponse en langage naturel par type de question (Document 10 §17)

Les invariants de voix (vouvoiement systématique, zéro emoji, zéro formule servile, citations obligatoires pour toute affirmation factuelle — Document 10 §5) sont appliqués en post-traitement sur la sortie finale de Regalica, pas sur les outputs des spécialistes (qui n'atteignent jamais l'utilisateur). Ces post-traitements sont eux-mêmes pilotés par des règles stockées, pas par du code conditionnel hardcodé.

Le portrait Regalica inline en base64 (PRD §11) est une ressource statique du design system, pas une valeur métier — il est embarqué côté frontend dans les composants UI.

## 11. Feature flags pour tout déploiement progressif

La table `feature_flags` (Document 6 §18) porte les activations progressives. Un nouveau prompt, une nouvelle règle RDG, une évolution de logique de router Regalica passent par un flag avant activation tenant-wide :

- `feature_flag_key` optionnel sur les entrées `prompt_bank` et `rules`.
- Flag par tenant avec pourcentage de rollout et allowlist utilisateurs.
- Rollback instantané en désactivant le flag (effet immédiat sans redéploiement).

**Conséquence.** Un bug en production sur un prompt nouvellement activé se corrige en deux actions : désactivation du flag (effet runtime immédiat pour les futurs appels), puis mise en chantier d'une nouvelle version corrective. Pas de hotfix code ni de redéploiement en urgence.

---

# Partie IV — Décomposition monorepo

Le monorepo est structuré en trois familles de packages gouvernées par `pnpm-workspace.yaml` : `apps/*`, `packages/*`, `tools/*`. Le scope npm `@regflow/*` est appliqué à tous les packages TypeScript du workspace (anti-régression vérifiée par Guard B, `tools/check-no-residual-debt.sh`). Toute résurgence du scope historique `@regalica/` fait échouer le build.

## 12. `apps/api` — BFF Express + pg natif

**Rôle.** Backend-for-frontend Node.js qui porte les endpoints REST consommés par le frontend SPA et les événements temps réel Socket.IO. C'est le point d'entrée unique côté HTTP.

**Techno.** Express 4 + `pg` natif, validation d'entrée Zod, logs Pino, erreurs typées. Aucun ORM. Aucune abstraction DB au-dessus de `pg.Pool`. Middleware JWT avec rotation access/refresh (Phase 3).

**Responsabilités en Phase 3-6 (après Phase 0 squelette).**

- Authentification et gestion de session JWT.
- Endpoints d'upload XML et déclenchement de runs de validation.
- Orchestration de l'appel au moteur (`packages/evaluator`) et persistance des verdicts dans `validation_runs` / `validation_fail_details`.
- Endpoints REST pour Workspace / Library / Filings (Document 4 §20-22).
- Émission Socket.IO des événements FSM (progression T1, changements d'état, notifications).
- Endpoints de gouvernance 4-yeux pour règles, prompts, référentiels.

**Phase 0.** Squelette minimal avec `/health` opérationnel et tests Jest associés (`apps/api/test/health.test.ts`). Voir `docs/PHASE-0-PLAN.md` §15.

**Package manifest.** `apps/api/package.json` sous le nom `@regflow/api`, private, deps réelles (`express`, `pg`, `zod`, `jsonwebtoken`, `pino`, `socket.io`, `decimal.js`, `fast-xml-parser`, `helmet`, `multer`, `cors`).

## 13. `apps/chatbot-py` — FastAPI + agents LLM

**Rôle.** Service Python asynchrone qui héberge les 14 agents IA (Regalica orchestratrice + 13 spécialistes, Document 9). C'est la couche IA du produit.

**Techno.** FastAPI + Uvicorn, `asyncpg` natif pour l'accès DB (pas de SQLAlchemy, pas d'Alembic — voir §2), Pydantic v2 pour la validation des contrats JSON (Document 9 §3), `structlog` pour logs structurés compatibles Pino côté API.

**Responsabilités en Phase 4.**

- Exposition HTTP des endpoints agents (invocation Regalica, invocation directe d'un spécialiste pour les besoins T0 déterministes).
- Chargement des prompts depuis `prompt_bank` par `agent_key` et version active.
- Appel LLM avec retry / circuit breaker / fallback (capture AS-IS `docs/as-is-captured/circuit-breaker-and-context-manager.md`).
- Validation Pydantic stricte de chaque output d'agent avant retour au caller.
- Accès RAG pgvector pour citations et enrichissement contextuel.

**Phase 0.** Squelette minimal avec `/health` opérationnel et tests pytest associés (`apps/chatbot-py/tests/test_health.py`). Voir `docs/PHASE-0-PLAN.md` §16.

**Package manifest.** `apps/chatbot-py/pyproject.toml` sous le nom `regflow-chatbot-py` (convention Python sans scope), managé par `uv`.

## 14. `packages/bct-xml-parser` — parser dual-nomenclature

**Rôle.** Livrable 4 de Phase 0. Parser TypeScript qui gère les trois nomenclatures XML BCT (moderne `<Entete>`, ancienne `<ENTETE>`, spécialisée 781 / 810) et produit une structure unifiée `CellMatrix` consommée par le moteur d'évaluation.

**API publique.**

- `parseBctXml(xmlContent: string): ParsedXml` — parse un seul XML, détection automatique de nomenclature.
- `parseBctBatch(xmls): { parsed, mergedCells }` — parse et fusionne plusieurs XML d'un même arrêté.
- `detectNomenclature(content: string): Nomenclature` — utilitaire de détection isolé.
- `normalizeDate(raw: string): string | null` — normalise `YYYYMMDD` et `DD/MM/YYYY` vers `YYYY-MM-DD`.

**Deps externes.** `fast-xml-parser` avec `parseTagValue: false` pour préserver `"00"` en string (jamais convertir en nombre avant validation), `decimal.js` pour la précision 38 digits.

**Invariants embarqués.**

- Code annexe préservé tel quel, jamais de zero-stripping.
- Dates normalisées uniquement en sortie (`YYYY-MM-DD`), jamais en entrée.
- Les valeurs numériques traversent le parser en `Decimal`, jamais en `number`.

**Package manifest.** `packages/bct-xml-parser/package.json` sous le nom `@regflow/bct-xml-parser`, private, `"type": "module"`.

## 15. `packages/evaluator` — moteur RDG en 5 phases

**Rôle.** Livrable 3 de Phase 0 (test golden) et fondation du moteur d'évaluation qui sera écrit en Phase 2 selon la capture AS-IS `docs/as-is-captured/as-is-evaluator-algorithm.md`. Le moteur implémente les 5 phases A/B/D/E documentées dans cette capture.

**Responsabilités cibles (Phase 2).**

- Lire les règles depuis `rules` / `rules_terms` (zéro hardcoding).
- Lire les référentiels depuis `referentials_*`.
- Appliquer les 4 611 règles sur la `CellMatrix` fournie par le parser.
- Produire des verdicts typés `Verdict ∈ {PASS, FAIL_SEVERE, FAIL_ROUNDING, SKIPPED_*}` avec décomposition terme-par-terme et `rule_id`, `expected`, `calculated`, `delta`.
- Préserver la précision Decimal 38 digits ROUND_HALF_EVEN sur toute la chaîne.

**Phase 0.** Le package ship aujourd'hui le test golden (`test/golden.test.ts`, Document 7 §15) qui valide le parsing et les métadonnées sur les 8 batches du corpus QNB Tunisia. 73 tests passent, 32 sont skippés (bloc Phase 2 `describe.skip`, à activer quand le moteur sera opérationnel). **Aucun échec autorisé** — voir `CLAUDE.md` §8 pour le contrat de non-régression.

**Dépendance workspace.** `@regflow/evaluator` dépend de `@regflow/bct-xml-parser` via `workspace:*`. La résolution TypeScript passe par le champ `paths` du `tsconfig.json` d'evaluator (voir notes de l'extraction Livrables 1-4).

## 16. `packages/state-machines`, `structure-validator`, `ui` — skeletons

Trois packages en skeleton créés en Phase 0, à remplir en phases ultérieures. Chacun expose aujourd'hui un placeholder typé et un `package.json` sous scope `@regflow/*` privé, sans dépendances externes.

| Package                        | Livraison | Contenu cible                                                                    |
| ------------------------------ | --------- | -------------------------------------------------------------------------------- |
| `@regflow/state-machines`      | Phase 3   | Implémentation TypeScript des 4 FSM du Document 8 (T0, T1, T2/T3, 4-yeux)        |
| `@regflow/structure-validator` | Phase 3   | Règles de validation XSD et contrôles embarqués BCT (Document 4 §7-8)            |
| `@regflow/ui`                  | Phase 5   | Primitives Edition One réutilisables (`artefact`, `pill`, `conf`, `cite`, `btn`) |

Les trois packages portent un script `lint` stubbé en Phase 0 en attendant que la config ESLint soit complètement hoistée ; les deux livrables Phase 0 (`bct-xml-parser`, `evaluator`) ont la même convention. Voir commit `fix(phase-0): hoist eslint deps to root and fix apps/api lint clean` pour le hoist déjà effectué côté root.

## 17. `tools/` — utilitaires de normalisation et vérification

Quatre utilitaires indépendants, gouvernés par `pnpm-workspace.yaml` `tools/*` mais portant des `pyproject.toml` (Python) plutôt que des `package.json` — pnpm ignore les dirs sans `package.json`, ce qui est la propriété recherchée.

| Outil                               | Type   | Rôle                                                                                                            |
| ----------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `tools/golden-normalizer/`          | Python | Livrable 1 Phase 0 : normalise les XML BCT du Compliance Officer en `tests/fixtures/golden/`                    |
| `tools/seed-referentials-from-xml/` | Python | Livrable 2 : génère les migrations SQL de seeding des `referentials_*` depuis le corpus golden                  |
| `tools/verify-golden-integrity/`    | Python | Vérifie l'intégrité bit-identique des fixtures golden (checksums, exécuté en CI à partir de Phase 2)            |
| `tools/check-forbidden-deps.sh`     | Bash   | Guard A du job CI — échoue si une dep forbidden apparaît dans un manifeste actif                                |
| `tools/check-no-residual-debt.sh`   | Bash   | Guard B du job CI — échoue si une trace de scope `@regalica/` ou de package supprimé revient dans le code actif |

Les deux guards Bash tournent dans la section « Phase 0 guards (fail-fast) » de `.github/workflows/ci.yml` et sont exécutables localement par l'opérateur (`bash tools/check-*.sh`).

---

# Partie V — Flux de données

## 18. Flux de validation XML

Le chemin critique produit d'un run de validation suit 7 étapes, toutes déterministes (zéro appel LLM obligatoire) :

```
1. Upload HTTP multipart       → apps/api endpoint
2. Persistance xml_uploads     → postgres
3. Déclenchement run           → apps/api instancie un validation_runs id
4. Parsing dual-nomenclature   → @regflow/bct-xml-parser → CellMatrix
5. Évaluation 5 phases A/B/D/E → @regflow/evaluator (lecture rules + referentials_*)
6. Persistance verdicts        → validation_runs, validation_fail_details, clusters
7. Émission Socket.IO          → frontend reçoit progress + livrables C/A/B
```

**Invariants du flux.**

- Aucun appel LLM dans ce chemin critique (PRD §5.2 : « moteur produit des verdicts déterministes »).
- Précision Decimal 38 digits ROUND_HALF_EVEN préservée de l'étape 4 à l'étape 6.
- Le run terminé est immutable (`validation_runs` soumis à trigger d'immutabilité, Document 6 §23).
- La latence cible p95 sur un batch typique de 10 annexes est < 3 secondes (PRD §5.6), mesurée de l'étape 3 à l'étape 7.

Les étapes conversationnelles T2/T3 (§19 ci-dessous) s'ajoutent **après** cet enchaînement, jamais dedans.

## 19. Flux de conversation avec Regalica

Un message utilisateur entrant dans une conversation T2 traverse le pipeline d'orchestration documenté au Document 10 §2 :

```
User message → apps/api (persist messages)
             → apps/chatbot-py (invoke Regalica)
                  ├─ étape 1 Router (classify intent, load prompt_bank.regalica_router_v1)
                  ├─ étape 2 Planner (select specialists, load prompt_bank.regalica_planner_v1)
                  ├─ étape 3 Specialists (invocations typées Pydantic, JSON stricts Document 9)
                  ├─ étape 4 Aggregator (compose response, load prompt_bank.regalica_aggregator_<intent>_v1)
                  └─ étape 5 Voice post-processing (invariants voix, Document 10 §5)
             → apps/api (persist messages, emit Socket.IO)
             → frontend (affiche réponse)
```

**Invariants du flux.**

- Chaque prompt est chargé depuis `prompt_bank` à l'appel — jamais de prompt en dur.
- Chaque sortie d'agent est validée par Pydantic avant d'être agrégée. Une sortie invalide déclenche un retry unique avec prompt correctif, puis escalade (Document 9 §5).
- Regalica n'affiche jamais les JSON bruts des spécialistes à l'utilisateur ; elle compose systématiquement en langage naturel.
- Les 7 types de questions canoniques (Document 10 Partie II) ont chacun un `agent_key` aggregator distinct, ce qui rend le prompt_bank matrix ciblée et maintenable.

## 20. Flux 4-yeux pour toute modification de règle ou prompt

Toute modification sur `rules`, `referentials_*` ou `prompt_bank` en production passe par le workflow 4-yeux documenté au Document 8 Partie V. Flux en 4 étapes :

```
1. requested_by_user (Acteur A)   → INSERT four_eyes_approvals
   (état = 'pending', payload = diff proposé, entity_type, entity_id)
2. Notification au reviewer pool  → NotificationAgent / Document 9 §19
3. decided_by_user (Acteur B)     → UPDATE four_eyes_approvals
   (contrainte SQL: decided_by_user_id != requested_by_user_id)
   - approve    → application de la modification (nouvelle version bitemporelle)
   - reject     → état = 'rejected', justification obligatoire
4. Audit log    → audit_log partitionné capture les 2 acteurs, la justification,
   l'horodatage, le diff final. Conservation obligatoire (Document 6 §17).
```

**Garanties de l'architecture.**

- La contrainte `requested_by_user_id != decided_by_user_id` est un `CHECK` SQL, pas une règle applicative — impossible à contourner depuis le code.
- L'historisation bitemporelle (`valid_from`, `valid_to`) est portée par les tables `rules`, `prompt_bank` et `referentials_*` ; un rollback est un `UPDATE valid_to = NOW()` sur la version courante et un `INSERT` de la version antérieure réactivée, jamais un `DELETE`.
- Le PRD §5.9 formule l'invariant associé : « validation 4-yeux systématique », appliquée au niveau SQL via check constraint.

---

# Partie VI — Sécurité transverse

## 21. Row-Level Security multi-tenant

REGFlow est multi-tenant par construction. La séparation des données tenant vit au niveau de chaque ligne, pas au niveau d'une connexion ou d'une base distincte. Mécanique (Document 6 Partie VII) :

- Chaque table transactionnelle porte `tenant_id uuid not null`.
- Chaque session applicative pose deux variables de session PostgreSQL : `app.tenant_id` et `app.user_id`, via `SET LOCAL` en début de transaction.
- Une fonction utilitaire `app_tenant_id()` lit ces variables et filtre les `USING` / `WITH CHECK` des policies RLS.
- `postgres-init.sql` crée un rôle `regalica_readonly` NOLOGIN pour les requêtes de lecture BI en lecture stricte.

**Conséquence sécurité.** Un bug applicatif qui oublierait de filtrer par `tenant_id` dans une requête ne compromet pas l'isolation : la policy RLS applique toujours le filtre. La RLS est la dernière ligne de défense, pas la première.

**TODO(@wbarouni)** : valider en revue sécurité Phase 3 que les policies RLS couvrent 100 % des tables avec `tenant_id`, y compris les tables `conversations` / `messages` / `rag_*`.

## 22. Audit log avec partitionnement

La table `audit_log` (Document 6 §17) capture toute opération sensible : création / modification / rejet de règle, prompt, référentiel ; signature et révocation de run ; 4-yeux approvals ; accès administrateurs. Elle est partitionnée par mois (`PARTITION BY RANGE (occurred_at)`) pour borner la taille des partitions actives et faciliter l'archivage à froid au-delà d'une rétention définie (TODO(@wbarouni) : définir la durée exacte en Phase 6, probablement 10 ans pour les signatures, 3 ans pour le reste).

**Inviolabilité.** `audit_log` ne supporte ni `UPDATE` ni `DELETE` en dehors des triggers de partition (drop partitions archivées). Toute tentative applicative est bloquée par trigger (Document 6 §23).

## 23. Authentification JWT et sessions

JWT avec rotation access/refresh (Phase 3). Paramètres gelés :

- Durée access token : `JWT_ACCESS_TTL = 15m` (Zod default dans `apps/api/src/config.ts`).
- Durée refresh token : `JWT_REFRESH_TTL = 7d`.
- Secret : `JWT_SECRET` 32 caractères minimum (enforced par Zod `.min(32)`).
- Algorithme : TODO(@wbarouni) — par défaut HS256, envisageable RS256 en production si les banques imposent une PKI.
- Table `sessions` (Document 6 §15) porte les refresh tokens avec révocation immédiate possible.

**Séparation access / refresh.** Le frontend reçoit un access token court-lived qu'il présente en `Authorization: Bearer`. Le refresh token vit en cookie `HttpOnly; Secure; SameSite=Strict` et ne traverse jamais le JavaScript client.

## 24. Isolation pnpm stricte

pnpm applique l'isolation stricte par défaut (pas de `shamefully-hoist`), ce qui signifie qu'un package ne peut importer que les deps qu'il déclare dans son propre `package.json`. Cette propriété est utilisée comme garde supplémentaire :

- Aucune dép non déclarée ne peut être importée « par accident » via le node_modules hoisté.
- Le root `package.json` déclare explicitement les deps eslint utilisées par le root `eslint.config.mjs` (commit `fix(phase-0): hoist eslint deps to root and fix apps/api lint clean`).
- Les workspace links (`workspace:*`) sont visibles dans le graphe de deps et auditables.

---

# Partie VII — Invariants non négociables

## 25. Liste consolidée des invariants architecturaux

Les 15 invariants ci-dessous consolident PRD §5 (10 invariants produit), les règles de Phase 0 (Guards A et B, zéro dette résiduelle, format:check vert) et les règles architecturales propres à ce document. Ils sont cités par `CLAUDE.md` comme contrat permanent. Toute PR qui en viole un doit être refusée quelle que soit sa justification.

1. **Zéro hardcoding.** Aucune règle RDG, aucun prompt LLM, aucune persona, aucune valeur métier BCT n'est écrite en dur dans le code applicatif. Tout vit dans `rules`, `prompt_bank`, `referentials_*` (PRD §5.1, §7, §8, §9, §10).

2. **Zéro dette résiduelle.** Pas de `_legacy/`, pas de `TODO: remove`, pas de `.skip()` sans justification datée, pas de référence au scope historique `@regalica/`, pas de référence aux packages supprimés. Guards A et B l'enforceent (PRD §5.8).

3. **Stack gelée non négociable.** Node + Express + `pg` natif, PostgreSQL + pgvector, FastAPI + asyncpg, React + Tailwind + Vite, Gemini 2.5 Flash. Toute alternative est refusée (§1, §2).

4. **Moteur produit des verdicts déterministes.** Le test golden sur les 58 XML QNB Tunisia doit produire 73 passed / 32 skipped / 0 failed à chaque run sur une même version du moteur. Toute divergence est un bug bloquant (PRD §5.2).

5. **Règles actives jamais modifiées en place.** Historisation bitemporelle via `valid_from` / `valid_to`. Une modif crée une nouvelle version (PRD §5.3, Document 6 §6).

6. **`validation_runs` immuable.** Un run terminé ne peut jamais être modifié ni supprimé, sauf transition contrôlée `is_signed TRUE→FALSE` via procédure stockée `sp_revoke_signature` (Document 8 §13, PRD §5.4).

7. **Prompts actifs jamais modifiés en place.** Cycle `draft → in_review → active → deprecated` dans `prompt_bank` (PRD §5.5, Document 5).

8. **Performance p95 validation XML standard < 3 secondes.** Mesurée sur un batch typique de 10 annexes. Toute régression est bloquante (PRD §5.6).

9. **Stack RegTrack jamais impactée par REGFlow et inversement.** Bases, codebases, pipelines CI séparés (PRD §5.7, Document 1 §12).

10. **Validation 4-yeux systématique.** Contrainte SQL `requested_by_user_id != decided_by_user_id` sur `four_eyes_approvals`. Appliqué au niveau DB, impossible à contourner depuis le code (PRD §5.9, §20 ci-dessus).

11. **Précision Decimal 38 digits ROUND_HALF_EVEN.** Côté TS (`decimal.js`) et côté Python (`decimal.getcontext`). Divergence entre runtimes sur un même calcul = bug (PRD §5.10).

12. **On-premises strict.** Aucun service SaaS critique dans le chemin de donnée principal hors l'API Gemini (avec fallback local Ollama en Phase 6) (§4, §6).

13. **Format, lint, typecheck, tests, guards : tous verts.** Aucun commit n'est mergé si l'un des jobs CI échoue ou si `pnpm format:check` remonte un fichier. Voir `CLAUDE.md` §4.

14. **Scope npm unique `@regflow/*`.** Tous les packages TypeScript du workspace portent ce scope. Toute résurgence de `@regalica/` fait échouer Guard B (§12-17 et commit `chore(phase-0): rename npm scope @regalica → @regflow`).

15. **Pas d'emoji dans le code ou les fichiers versionnés.** Invariant produit et de voix (PRD §11, Document 10 §5). Exception : les sorties CLI ASCII (`[OK]`, `[FAIL]`) utilisées par les guards, qui ne sont pas des emoji.

---

**Document suivant :** `04-WORKFLOW-UTILISATEUR-COMPLET.md` — parcours utilisateur T0/T1/T2/T3 en prose, les 3 étapes BCT, les livrables UI Workspace / Library / Filings, cycles d'itération correction.
