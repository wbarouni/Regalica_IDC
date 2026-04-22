# ADR 0005 — Adoption stack v2 : Next.js 14 + Supabase + Drizzle

- **Status:** Accepted
- **Date:** 2026-04-20
- **Deciders:** CEO (Wissem Barouni), Senior Principal Engineer
- **Supersedes:** ADR 0001 (stack Angular 18 + Express + Sequelize)

## Context

ADR 0001 (2026-04-18) a installé un stack prototype Angular 18 + Express +
Sequelize en remplacement du stack v1 original (Next.js + Supabase + Drizzle).
Ce choix était motivé par un besoin d'itération rapide et de souveraineté
technique sur un PaaS étranger.

Depuis, le prototype Angular a rempli son rôle :

- Les flux UX critiques (workspace, chatbot, rapports, 4-eyes) ont été validés.
- La modélisation Sequelize des 19 tables a stabilisé le schéma de données.
- Les 8 agents déterministes (`apps/api/src/agents/`) sont opérationnels.
- Le service Python `apps/chatbot-py` (FastAPI + SQLAlchemy 2.0) est autonome
  et indépendant du stack frontend.

Le **v2.0 master spec (avril 2026)** tranche sans ambiguïté : le stack de
production est **Next.js 14 App Router + Supabase + Drizzle ORM + Vercel**.
Les raisons techniques qui avaient motivé ADR 0001 (coût Supabase, dépendance
PaaS, stack "connu de l'équipe") sont levées par les décisions de scaling et
de contractualisation prises en Q1 2026.

Un retour au stack v1 est donc justifié, documenté et traçable.

## Decision

Adopter le stack suivant comme **cible de production pour Regalica IDC v2** :

### Frontend

- **Next.js 14** avec App Router (`app/` directory), Server Components par
  défaut, Client Components explicitement marqués `"use client"`.
- **React 18** avec Suspense et Server Actions pour les mutations.
- **Tailwind CSS v3** — pas de changement par rapport au prototype.
- **shadcn/ui** comme bibliothèque de composants de base (cf. ADR 0007).
- Déploiement sur **Vercel** (preview par PR, production sur `main`).

### Backend as a Service

- **Supabase** avec les fonctionnalités suivantes activées :
  - Postgres 15 managé + `pgvector` (RAG embeddings)
  - Row Level Security (RLS) sur 100 % des tables tenant (ADR 0003 reste
    valide dans ses principes ; les policies seront réécrites en SQL natif
    Supabase)
  - Auth avec MFA obligatoire (TOTP) pour les rôles `compliance_officer`,
    `validator`, `admin`
  - Realtime (canaux de présence pour la co-édition et les notifications
    4-eyes, remplace Socket.IO)
  - Storage (uploads XML/PDF)
  - `pgmq` (queue de messages pour les traitements batch asynchrones)
  - Edge Functions (Deno runtime) pour les webhooks BCT et les callbacks LLM
    légers

### ORM

- **Drizzle ORM** (`packages/db`) avec migrations versionnées (`drizzle-kit`).
  - Schéma TypeScript strict comme source de vérité unique.
  - Pas de requêtes raw sauf pour les CTE complexes auditées.
  - Remplacement complet de Sequelize (migration décrite dans ADR 0008).

### Ce qui ne change pas

| Composant | Décision |
|---|---|
| `apps/chatbot-py` | Inchangé. FastAPI + SQLAlchemy 2.0 + LangChain. Autonome. |
| `apps/api/src/agents/` | Logique métier portable — portée vers `packages/agents` (TypeScript) en Phase 3. |
| `tests/fixtures/golden/` | Intouchable. Golden tests bit-identiques restent la gate principale. |
| Les 7 Piliers Inviolables | Tous s'appliquent. Supabase simplifie Pilier 6 (triggers managés) et Pilier 7 (RLS managé). |
| Conventional Commits, Pino, mypy --strict | Inchangés. |

## Consequences

### Positives

- **Réduction drastique du volume de code custom** : Auth, Storage, Realtime,
  RLS managé, Edge Functions sont fournis par Supabase — ce que ADR 0001
  avait identifié comme coût de réécriture est éliminé.
- **SSR natif** via Next.js App Router : temps de chargement initial des
  rapports réglementaires réduit, meilleur SEO pour les pages publiques.
- **Type-safety bout en bout** : Drizzle génère les types TypeScript depuis le
  schéma SQL ; `supabase gen types typescript` complète la couverture.
- **Realtime sans infrastructure** : Supabase Realtime remplace Socket.IO et
  son déploiement séparé.
- **`pgmq` natif** : la queue de batch BCT est dans Postgres, pas dans un
  broker externe — simplifie le monitoring et le replay.
- **Déploiement Vercel** : preview par branche, rollback instantané,
  CDN global — approprié pour des auditeurs BCT accédant depuis Tunis.
- **pgvector managé** : intégration RAG (`apps/chatbot-py`) via connexion
  Postgres standard, sans déploiement séparé.

### Negatives

- **Dépendance PaaS US** : Supabase + Vercel réintroduisent une dépendance
  à des services hébergés hors Tunisie. Atténuation : Supabase est
  open-source et auto-hébergeable sur une VM OVH/Hetzner si exigence
  réglementaire future ; Vercel peut être remplacé par une VM + Nginx pour
  le cas on-prem.
- **Coût récurrent** : Supabase Pro (~$25/mois) + Vercel Pro (~$20/mois).
  Accepté dans le budget v2.
- **Migration non triviale** : cf. ADR 0008 pour le plan détaillé.
  Estimation : 6 semaines pour les phases 0–3.
- **Courbe d'apprentissage Drizzle** : l'équipe maîtrise Sequelize.
  Drizzle est plus proche du SQL — considéré comme un avantage long terme
  mais demande une semaine de montée en compétence.

### Neutres

- Le prototype Angular (`apps/frontend`) reste dans le monorepo en
  maintenance freeze comme référence d'implémentation UX (ADR 0008).
- Les ADRs 0002 (LLM), 0003 (RLS), 0004 (monorepo) restent valides dans
  leurs principes ; seuls leurs exemples de code (Sequelize, Express) sont
  obsolètes.

## Impact sur CLAUDE.md

CLAUDE.md doit être mis à jour pour refléter ce changement de stack :

- **Supprimer** la ligne interdisant Next.js, React, Drizzle, Supabase client
  et Vercel.
- **Ajouter** : stack autorisé = Next.js 14 App Router, Supabase JS client v2,
  Drizzle ORM, Vercel.
- **Conserver** toutes les interdictions relatives à Angular/Express pour les
  nouveaux composants (`apps/web`).

Cette mise à jour CLAUDE.md est bloquante avant le premier commit dans
`apps/web`. Owner : CEO. Timeline : Phase 0 (semaine 1).
