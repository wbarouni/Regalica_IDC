# ADR 0001 — Stack override vs master document v1.1

- **Status:** Accepted
- **Date:** 2026-04-18
- **Deciders:** CEO (Wissem Barouni), Senior Principal Engineer

## Context

Le master document v1.1 (`docs/architecture/00-master-document.md`, Partie II)
spécifie un stack cible :
- Frontend : Next.js 14 + React + Tailwind
- Backend : Supabase (Postgres managé + Auth + Storage + Edge Functions)
- LLM : Anthropic Claude via SDK officiel
- Déploiement : Vercel

L'extraction structurée (`01-extracted-facts.md` §14 + §Q4) confirme que ce
stack est inscrit dans le document sans être marqué comme superseded.

Cependant, le CEO a demandé un **nouveau stack** lors du bootstrap Phase 0,
matérialisé dans le prompt de réinitialisation :
- Frontend : Angular 18 standalone + Tailwind 3.4 + Webpack (si requis)
- Backend principal : Express.js + Sequelize (Postgres 16 vanilla + pgvector)
- Service IA : FastAPI Python (5 agents LLM) + Gemini (puis Ollama)
- Gateway chatbot : Express + pg natif (SQL brut, pas d'ORM)
- Storage : Azure Blob
- SonarQube en quality gate
- Pas de Supabase, pas de Vercel, pas de Next.js, pas de Claude API

L'ancien repo `wbarouni/Regalica_IDC` contenait une implémentation partielle
du stack v1 (Next.js + Drizzle + MySQL + Vercel), préservée dans le tag
`archive/v1-nextjs-drizzle`.

## Decision

Le **nouveau stack spécifié par le CEO est la cible Phase 0+**. La Partie II
du master doc v1.1 est **traitée comme obsolète** pour les aspects
technologie (Next.js/Supabase/Claude/Vercel), mais **l'intention produit
(Parties I, III, IV, V) reste la source de vérité**.

Concrètement :
- **Fonctionnalités** (§9 algorithme, §8 data model, §3 piliers, §10 personas)
  restent strictement celles du master doc.
- **Implémentation** (quelle techno pour quelle couche) suit le nouveau stack.

Les 7 Piliers Inviolables s'appliquent à tous les choix techno. Deux piliers
demandent un effort additionnel sous le nouveau stack :

- **Pilier 6 (IMMUTABLE HISTORY)** : sans Supabase, on doit coder nous-mêmes
  les tables versionnées (`rules_history`, `prompts_history`, `kb_snapshots`)
  et l'immutabilité (triggers Postgres, colonnes `valid_from`/`valid_to`).
- **Pilier 7 (HIERARCHICAL TENANCY) + RLS** : sans Supabase RLS managé, les
  policies sont écrites à la main (cf. ADR 0003).

## Consequences

### Positives
- Souveraineté : Postgres vanilla + Azure + Ollama = aucune dépendance critique
  à un PaaS US (exigence marché tunisien).
- Coût maîtrisable par tenant (Ollama local >> Claude API tokenisé).
- Contrôle total sur la surface (SQL brut pour chatbot, tuning Postgres libre).
- Le stack est proche de ce que l'équipe d'ingénierie connaît déjà.

### Négatives
- Volume de code à écrire augmente (ce que Supabase offrait gratuitement :
  auth, storage, RLS managé, edge functions).
- Deux packages `rdg-schema` (TS + Python) au lieu d'un seul (Claude + Zod).
- Maintenance de Dockerfiles multi-stages au lieu de Vercel/Supabase déploiement.

### Neutres
- Les features produit (UI, agents, évaluateur, RAG) sont indépendantes du stack
  — elles seront implémentées à l'identique.
- Le master doc reste la source de vérité sur la logique métier ; cet ADR
  documente juste la divergence d'implémentation.

## Open questions escalated from extraction

L'extraction structurée (`01-extracted-facts.md` §Q1-Q4) a flaggé 4
divergences entre prompt CEO et master doc :
- Q1 : migration Next.js/Supabase → Angular/Express
- Q2 : service Python `chatbot-py` (pas dans le doc)
- Q3 : Ollama (pas dans le doc)
- Q4 : Azure Blob (pas dans le doc)

Cet ADR tranche Q1-Q4 en faveur du prompt. Si un investisseur ou un board
reviewer lit le doc v1.1 seul, ils verront le stack v1 — les ADRs sont la
référence à jour.

**Action suivante :** republier une v1.2 du master doc avec la Partie II
réécrite, référençant les ADRs 0001-0004. Owner : CEO. Timeline : après
Phase 1.
