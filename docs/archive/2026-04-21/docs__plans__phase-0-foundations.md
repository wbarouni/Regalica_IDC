# Phase 0 — Fondations Regalica IDC v2.0

**Date:** 2026-04-20
**Statut:** En cours
**Auteur:** Équipe Regalica
**Version cible:** 2.0.0

---

## Objectif

Phase 0 pose les fondations techniques et documentaires irréversibles de Regalica IDC v2.0. Aucune feature utilisateur n'est livrée en Phase 0. Tout ce qui en sort doit être reproductible, testé, versionné et auditable. La Definition of Done est contractuelle vis-à-vis des phases suivantes.

---

## 1. Structure Monorepo (Turborepo)

Le dépôt adopte un monorepo géré par **Turborepo** avec **pnpm workspaces**. Toute dépendance croisée entre packages passe par les interfaces exportées, jamais par des imports relatifs inter-packages.

### 1.1 Applications (`apps/`)

| Workspace | Technologie | Rôle | Note |
|---|---|---|---|
| `apps/web` | Next.js 14 App Router, TypeScript 5.3 strict | Frontend principal Regalica IDC | Cible principale v2.0 |
| `apps/api` | Express (version gelée) | BFF REST legacy — aucune évolution fonctionnelle | Gelé — maintenance uniquement |
| `apps/chatbot-py` | FastAPI, Python 3.12 | Agent conversationnel indépendant, pipeline LLM | Déploiement indépendant, pas dans le build Turbo principal |
| `apps/chatbot-node` | Node.js, fusionné dans BFF | Logique chatbot Node migrée dans `apps/api` BFF | Migration à compléter en Phase 1 |

`apps/web` est le seul workspace soumis aux 8 gates CI (voir section 4). `apps/chatbot-py` a son propre pipeline pytest/mypy indépendant.

### 1.2 Packages partagés (`packages/`)

| Package | Contenu | Consommateurs |
|---|---|---|
| `packages/ui` | Primitives shadcn/ui configurées, composants Regalica métier | `apps/web` uniquement |
| `packages/agents` | 13 agents runtime (ValidatorAgent, RepairAgent, GoldenSuiteAgent, etc.) | `apps/web`, `apps/api` |
| `packages/db` | Schéma Drizzle ORM, 19 tables, migrations, seed dev | `apps/api`, `apps/web` (Server Components) |
| `packages/design-tokens` | Génération CSS vars depuis la table `design_tokens` Supabase, types TypeScript | `apps/web`, `packages/ui` |
| `packages/persona-regalica` | Configuration voix Regalica, golden suite BCT (1014 PASS / 3 FAIL attendus) | `apps/web`, `apps/chatbot-py`, CI |
| `packages/shared` | Types TypeScript partagés, schémas Zod, utilitaires purs | Tous les workspaces |

### 1.3 Outils ESLint personnalisés (`tools/`)

| Plugin | Règle | Déclencheur CI |
|---|---|---|
| `tools/eslint-plugin-no-hardcoded-rules` | Interdit les règles BCT codées en dur dans les composants — toute règle doit provenir de la table `rules` Supabase | Gate 1 (bloquant) |
| `tools/eslint-plugin-no-emoji` | Interdit tout caractère Unicode dans la plage U+1F300–U+1F9FF dans le code source et les fichiers Markdown du repo | Gate 2 (bloquant) |

Ces deux plugins sont développés en Phase 0 et doivent eux-mêmes passer `vitest` avant d'être activés dans le pipeline.

### 1.4 Configuration Turborepo

```
turbo.json
  pipeline:
    build: depends-on [^build], outputs [.next/**, dist/**]
    typecheck: depends-on [^build]
    lint: no cache (toujours frais)
    test: outputs [coverage/**]
    test:golden: outputs [golden-results/**], no cache
```

La golden suite (`test:golden`) ne doit jamais être mise en cache Turbo — chaque run doit être bit-identique au run précédent pour valider la reproductibilité.

---

## 2. Provisionnement Supabase

Trois projets Supabase distincts sont requis : `regalica-dev`, `regalica-staging`, `regalica-prod`. Aucun secret ne doit apparaître dans le dépôt Git. Toutes les valeurs sensibles transitent par **Supabase Vault** en production et par des variables d'environnement injectées par l'orchestrateur CI en dev/staging.

### 2.1 Checklist de provisionnement (par environnement)

**Projet Supabase**

- [ ] Créer le projet via Supabase Dashboard ou CLI (`supabase projects create`)
- [ ] Nommer selon la convention `regalica-{env}` avec region `eu-west-1` (RGPD)
- [ ] Activer le plan Pro minimum pour staging et prod (Row Level Security ne fonctionne pas en Free pour les workloads multi-tenant)
- [ ] Noter le Project Reference ID — ne jamais le committer

**Row Level Security**

- [ ] Activer RLS sur toutes les tables tenant-aware au moment de leur création dans Drizzle — jamais en post-migration
- [ ] La politique par défaut pour toute table tenant-aware est `DENY ALL` — les politiques d'accès sont ajoutées explicitement
- [ ] Colonne `tenant_id uuid NOT NULL` présente sur toutes les tables métier
- [ ] Politique standard : `USING (tenant_id = auth.jwt() ->> 'tenant_id'::text)`
- [ ] Aucune table sans RLS ne doit exister en dehors des tables système Supabase

**Authentification**

- [ ] Activer Auth MFA TOTP via Dashboard > Authentication > MFA
- [ ] Configurer les providers autorisés : Email uniquement en Phase 0 (SSO SAML en Phase 2)
- [ ] Désactiver l'inscription publique — les utilisateurs sont créés par les admins tenant
- [ ] Durée de session : 8h (conformité BCT)
- [ ] Configurer les templates d'email (FR par défaut, EN/AR en Phase 1)

**Extensions PostgreSQL**

- [ ] Activer `pgvector` (embedding vectoriel pour le moteur RAG Regalica)
- [ ] Activer `pgmq` (file de messages persistante pour les jobs de validation asynchrones)
- [ ] Activer `uuid-ossp` (génération UUID v4 côté base)
- [ ] Activer `pg_trgm` (recherche textuelle approximative sur les libellés de règles)

**Realtime**

- [ ] Activer Supabase Realtime sur le projet
- [ ] Configurer les publications Realtime uniquement sur les tables nécessaires : `validation_runs`, `agent_events`, `chat_messages`
- [ ] Appliquer des politiques RLS sur les channels Realtime (même isolation tenant que les tables)
- [ ] Valider que Realtime remplace intégralement Socket.IO de `apps/api` avant de supprimer Socket.IO

**Storage**

- [ ] Créer les buckets : `reports-xml` (privé), `exports-pdf` (privé), `avatars` (public limité)
- [ ] Appliquer des politiques RLS sur les buckets — accès par `tenant_id` extrait du JWT
- [ ] Taille max upload : 50 Mo par fichier XML BCT
- [ ] Configurer CORS pour `localhost:3000` (dev) et le domaine de prod

**Vault (secrets)**

- [ ] Stocker dans Vault : clé API LLM, clé de chiffrement des rapports, webhook signing secrets
- [ ] Aucune variable d'environnement `.env` ne doit contenir de secret de production
- [ ] Le fichier `.env.example` dans le repo liste les variables attendues avec des valeurs fictives uniquement
- [ ] Ajouter `.env*.local` et `.env.production` au `.gitignore` global

**Edge Functions (Deno)**

- [ ] Environnement Deno configuré pour les Edge Functions Supabase
- [ ] Les Edge Functions n'ont pas accès direct à la base — elles passent par le client Supabase avec le JWT utilisateur (RLS appliqué)
- [ ] Déploiement via `supabase functions deploy` dans le pipeline CI (gate 8)

---

## 3. Pipeline CI/CD — 8 Gates Bloquants

Le pipeline GitHub Actions s'exécute sur chaque Pull Request ciblant `main` et sur chaque push vers `main`. Tous les gates sont bloquants : un seul échec empêche le merge et le déploiement.

L'ordre d'exécution est séquentiel par groupe. Les gates 1-4 s'exécutent en parallèle entre eux. Les gates 5-6 dépendent du succès de 1-4. Les gates 7-8 dépendent du succès de 5-6.

### Gate 1 — ESLint no-hardcoded-rules

```yaml
- name: Lint no-hardcoded-rules
  run: pnpm eslint --plugin @regalica/no-hardcoded-rules --ext .ts,.tsx apps/web packages/
  # Echec si une règle BCT (ex: seuil, libellé, code annexe) est codée en dur
```

Toute valeur de règle BCT doit provenir de la base de données via `packages/db`. Ce lint détecte les patterns `'BCT-'`, les seuils numériques directement dans les composants de validation, et les codes annexe hardcodés.

### Gate 2 — ESLint no-emoji

```yaml
- name: Lint no-emoji
  run: pnpm eslint --plugin @regalica/no-emoji --ext .ts,.tsx,.md apps/ packages/ docs/
  # Plage Unicode interdite : U+1F300 a U+1F9FF
```

Inclut les fichiers Markdown dans `docs/`. Une exception est configurée pour les fichiers dans `tests/fixtures/golden/` qui peuvent contenir du contenu BCT arbitraire.

### Gate 3 — Typecheck strict

```yaml
- name: TypeScript strict typecheck
  run: pnpm typecheck
  # Equivalent a : tsc --noEmit --strict pour tous les workspaces
```

`tsconfig.base.json` impose `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Zéro erreur TypeScript est requis. Les `@ts-ignore` sont interdits — seuls les `@ts-expect-error` avec commentaire explicatif sont tolérés, limités à 3 occurrences max dans le repo.

### Gate 4 — Vitest coverage >80%

```yaml
- name: Vitest unit tests
  run: pnpm vitest run --coverage
  # Seuil : statements 80%, branches 80%, functions 80%, lines 80%
```

La configuration `vitest.config.ts` définit les seuils dans `coverage.thresholds`. Les packages `packages/db` (migrations) et `packages/design-tokens` (génération pure) sont exclus du seuil de coverage — ils sont couverts par des tests d'intégration séparés.

### Gate 5 — Accessibilité axe-core WCAG

```yaml
- name: Axe-core accessibility
  run: pnpm test:a11y
  # Niveau AA sur tout le texte, niveau AAA sur les nombres critiques (KPI, scores)
```

Les tests axe-core s'exécutent via Playwright sur les pages critiques : tableau de bord, résultats de validation, formulaire d'upload. Les violations de niveau AA sont bloquantes. Les violations de niveau AAA sont bloquantes uniquement pour les éléments portant l'attribut `data-a11y="critical"` (chiffres de conformité, scores de risque).

### Gate 6 — Golden Suite BCT

```yaml
- name: Golden suite BCT
  run: pnpm test:golden
  # Resultat attendu : 1014 PASS, 3 FAIL (bit-identiques au fichier de reference)
```

La golden suite valide que le moteur de calcul BCT produit des résultats bit-identiques aux fixtures de référence dans `tests/fixtures/golden/`. Les 3 FAIL attendus sont des cas limites documentés dans `packages/persona-regalica/golden/known-failures.md`. Un 4ème FAIL ou un PASS inattendu sur les 3 cas limites est bloquant — cela signale une régression ou une correction non validée.

### Gate 7 — Next.js build

```yaml
- name: Next.js production build
  run: pnpm --filter web build
  # next build doit se terminer sans erreur
```

La taille du bundle est auditée : `First Load JS` ne doit pas dépasser 250 ko pour la page d'accueil. Le rapport `next-bundle-analyzer` est archivé comme artifact CI pour chaque build.

### Gate 8 — Vercel preview deploy

```yaml
- name: Vercel preview deploy
  run: vercel deploy --prebuilt
  # Deploy de preview sur Vercel, URL posté en commentaire PR
```

Le déploiement Vercel utilise l'artefact de build du gate 7. Les Edge Functions Supabase sont déployées dans ce gate uniquement si des changements sont détectés dans `supabase/functions/`. L'URL de preview est postée automatiquement en commentaire de la PR via l'action Vercel officielle.

---

## 4. Matrice des Risques

Les 5 risques principaux identifiés pour Phase 0, classés par criticité descendante.

### Risque 1 — Complexité des migrations Drizzle (Criticité : HAUTE)

**Description :** Drizzle ORM est choisi pour ses types stricts et son approche SQL-first. Cependant, les migrations automatiques de Drizzle en environnement multi-tenant avec RLS activé présentent des risques de conflits de politiques lors des `ALTER TABLE`. Une migration mal séquencée peut laisser une table temporairement sans RLS.

**Mitigation :**
- Toutes les migrations sont révisées manuellement avant application
- Script de vérification post-migration : `pnpm db:check-rls` valide que toutes les tables tenant-aware ont RLS activé
- Les migrations de production passent par `supabase db push` avec approbation manuelle, jamais automatiquement
- Environnement de staging reçoit chaque migration 24h avant prod

**Seuil d'alerte :** Toute migration touchant une table avec données de production requiert une approbation de deux membres de l'équipe (four-eyes).

### Risque 2 — Isolation RLS multi-tenant (Criticité : HAUTE)

**Description :** Une fuite de données entre tenants via un contournement RLS constitue un incident de sécurité critique pour une plateforme de conformité réglementaire. Les vecteurs d'attaque incluent les fonctions SQL avec `SECURITY DEFINER`, les vues sans RLS, et les Edge Functions bypassant le client Supabase.

**Mitigation :**
- Interdire `SECURITY DEFINER` sauf exception documentée et approuvée
- Aucune vue (`CREATE VIEW`) sans politique RLS correspondante
- Les Edge Functions utilisent exclusivement le client Supabase initialisé avec le JWT utilisateur
- Tests d'isolation automatisés : chaque table a un test Vitest qui tente un accès cross-tenant et vérifie le refus
- Audit de sécurité externe planifié avant ouverture prod

### Risque 3 — Performance pgvector à l'échelle (Criticité : MOYENNE)

**Description :** Le moteur RAG Regalica utilise pgvector pour la recherche de similarité sur les embeddings de règles BCT. Les performances peuvent se dégrader significativement au-delà de 100 000 vecteurs sans indexation adaptée.

**Mitigation :**
- Index `ivfflat` créé dès la Phase 0 sur la colonne `embedding` de la table `kb_chunks`
- Paramètre `lists` calibré à `sqrt(nb_vecteurs)` — réévalué à chaque 10x de croissance
- Monitoring de la latence p95 des requêtes vectorielles via Supabase Logs
- Fallback sur recherche textuelle `pg_trgm` si la latence vectorielle dépasse 200ms

### Risque 4 — Migration Realtime depuis Socket.IO (Criticité : MOYENNE)

**Description :** `apps/api` utilise Socket.IO pour les mises à jour en temps réel du pipeline de validation. Supabase Realtime doit le remplacer intégralement. Les deux systèmes ont des modèles de connexion différents (rooms Socket.IO vs channels Realtime), et la migration doit être transparente pour `apps/web`.

**Mitigation :**
- Couche d'abstraction `packages/shared/realtime.ts` expose une interface unique côté client — l'implémentation sous-jacente (Socket.IO ou Supabase Realtime) est interchangeable
- Migration progressive : Supabase Realtime activé en parallèle de Socket.IO, bascule via feature flag
- Socket.IO supprimé uniquement après validation complète de Realtime en staging
- Tests de charge k6 sur les channels Realtime avant suppression de Socket.IO

### Risque 5 — Rendu RTL arabe (Criticité : FAIBLE en Phase 0, HAUTE en Phase 1)

**Description :** next-intl gère FR/AR/EN. Le rendu RTL pour l'arabe requiert une configuration Tailwind spécifique (`dir="rtl"` sur `<html>`), des classes utilitaires RTL, et une police adaptée (Noto Sans Arabic ou SF Arabic). Les composants shadcn/ui ne sont pas conçus pour RTL nativement.

**Mitigation :**
- Phase 0 : configuration next-intl avec locale `ar`, direction RTL enregistrée dans le layout — aucun composant AR livré
- Tailwind configuré avec le plugin `tailwindcss-rtl` dès Phase 0 pour éviter les refactorisations
- La police `font-arabic` définie dans les tokens (voir `docs/design/00-tokens.md`) est chargée conditionnellement
- Un composant pilote est testé en AR en Phase 0 pour valider la chaîne complète avant Phase 1

---

## 5. Definition of Done — Phase 0

Phase 0 est considérée terminée lorsque **tous** les critères suivants sont vérifiés, sans exception. La validation est faite en session de revue avec au minimum deux membres de l'équipe.

### Documentation (9 documents validés)

- [ ] `docs/plans/phase-0-foundations.md` — ce document, statut : Validé
- [ ] `docs/design/00-tokens.md` — système de tokens v2.0 complet
- [ ] `docs/design/01-materials.md` — spec matériaux glass
- [ ] `docs/design/02-components.md` — spec composants primitifs
- [ ] `docs/design/03-popups.md` — spec popups et sheets métier
- [ ] `docs/adr/ADR-0005-nextjs14-approuter.md` — ADR accepté
- [ ] `docs/adr/ADR-0006-supabase-drizzle.md` — ADR accepté
- [ ] `docs/adr/ADR-0007-design-tokens-db.md` — ADR accepté
- [ ] `docs/adr/ADR-0008-turborepo-monorepo.md` — ADR accepté

### Gouvernance

- [ ] `CLAUDE.md` mis à jour avec les conventions v2.0 (interdiction emoji, interdiction hardcoded rules, palette 75-15-10)
- [ ] ADR 0005 à 0008 au statut `Accepted` dans leur en-tête
- [ ] Aucun ADR en statut `Proposed` à la clôture de Phase 0

### Infrastructure Supabase

- [ ] Projet `regalica-dev` provisionné et opérationnel
- [ ] Projet `regalica-staging` provisionné et opérationnel
- [ ] RLS activé et vérifié sur les 19 tables de `packages/db`
- [ ] Extensions pgvector, pgmq, uuid-ossp, pg_trgm activées
- [ ] Auth MFA TOTP configurée
- [ ] Buckets Storage créés avec politiques RLS
- [ ] Aucun secret en clair dans le dépôt Git (vérification `git log --all -p | grep -E 'sk-|eyJ'` vide)

### Code

- [ ] `apps/web` scaffold Next.js 14 App Router opérationnel (`next dev` fonctionne)
- [ ] `packages/db` — 19 tables Drizzle avec schéma complet et migrations initiales
- [ ] `packages/design-tokens` — génération CSS vars fonctionnelle depuis la table `design_tokens`
- [ ] `tools/eslint-plugin-no-hardcoded-rules` — plugin livré et testé
- [ ] `tools/eslint-plugin-no-emoji` — plugin livré et testé

### Qualité

- [ ] Pipeline CI 8 gates : tous verts sur `main`
- [ ] `pnpm typecheck` : zéro erreur TypeScript
- [ ] `pnpm lint` : zéro warning no-emoji dans tout le repo
- [ ] Golden suite : 1014 PASS / 3 FAIL bit-identiques, reproductible sur deux machines différentes
- [ ] Coverage Vitest : >80% sur tous les packages concernés

---

## 6. Calendrier Indicatif Phase 0

| Semaine | Livrable |
|---|---|
| S1 | ADRs 0005-0008 rédigés et soumis en revue, structure monorepo initialisée |
| S2 | Supabase dev/staging provisionnés, `packages/db` schéma initial 19 tables |
| S3 | `tools/eslint-plugin-*` développés et testés, pipeline CI gates 1-4 verts |
| S4 | `apps/web` scaffold, `packages/design-tokens` opérationnel, gates 5-8 verts, DoD validée |

---

*Ce document est généré en Phase 0 et constitue la référence contractuelle pour l'entrée en Phase 1.*
