# REGALICA IDC
## Plateforme SaaS de Conformité Réglementaire BCT à Tolérance Zéro

---

**Document Maître Consolidé**
**Version:** 1.1 — Avril 2026 (calibrée sur données réelles)
**Auteur:** Wissem Barouni — CEO & Co-Founder ALGORIA Factory
**En collaboration avec:** Senior Principal Engineer (Architecture Review)
**Classification:** Confidentiel — ALGORIA Factory
**Destinataires:** Board · CTO · Claude Code · Investisseurs · Équipe Compliance

---

## PRÉAMBULE

Ce document consolide l'intégralité de la vision, de l'architecture, et du plan d'exécution de Regalica IDC. Il remplace tous les documents antérieurs (Blueprint v1, v2, v3, Spec Métier, Matrix Model, Migration Plan) et constitue la **source de vérité unique** pour le projet.

Il est conçu pour être exporté en DOCX, imprimé, présenté à des investisseurs, injecté comme contexte dans Claude Code, et utilisé comme référence par votre équipe compliance.

**Instructions pour export DOCX :**
1. Copiez l'intégralité du contenu de ce document
2. Collez dans Microsoft Word ou Google Docs
3. Appliquez les styles (Heading 1, 2, 3 selon les `#`, `##`, `###`)
4. Ajustez table des matières automatique
5. Exportez en `.docx`

Alternative plus rapide : uploadez ce document sur **Gamma** ou **Notion**, ils génèrent un DOCX propre avec un clic.


### 🎯 Preuve terrain (v1.1)

Avant publication, le moteur d'évaluation décrit dans ce document a été **exécuté de bout en bout sur un reporting réel BCT 2024-03-31** (code banque 23, 4 annexes : Bilan, État de Résultat, Ventilation des Ressources, Ventilation des Créances). Les 4 611 règles du RDG ont été appliquées sans exception :

| Indicateur | Résultat mesuré |
|---|---|
| Règles traitées (aucune oubliée) | **4 611 / 4 611** |
| Règles applicables aux XMLs fournis | **1 054** |
| **PASS** — règle satisfaite | **1 014** *(96,2 %)* |
| **FAIL** — écart réglementaire détecté | **3** *(0,3 %)* |
| SKIPPED — non-évaluable (rubrique absente, règle conditionnelle) | 37 *(3,5 %)* |

Les 3 FAIL portent tous sur la rubrique `PA030202000000` (Ventilation des Ressources, annexe 630) et signalent 57 985 TND d'incohérence inter-annexe — **exactement le type d'anomalie qu'un Compliance Officer mettrait 2-3 jours à tracer manuellement**. Temps d'exécution du moteur : < 2 secondes.

Ce document v1.1 consolide ce qui a été démontré fonctionnel, corrige les hypothèses préalables qui ne résistaient pas aux données, et fournit à Claude Code la spec implémentable exacte.

---

# TABLE DES MATIÈRES

**PARTIE I — VISION & STRATÉGIE**
1. Vision Produit
2. Positionnement Concurrentiel
3. Les 7 Piliers Inviolables
4. Les 16 Décisions Architecturales CEO

**PARTIE II — ARCHITECTURE TECHNIQUE**
5. Stack Technique World-Class
6. Architecture en 5 Couches
7. Les 13 Agents IA Spécialisés
8. Modèle de Données Matriciel Cellulaire
9. Pipeline de Validation End-to-End
10. Sécurité & Zero-Hallucination

**PARTIE III — ARCHITECTURE PRODUIT**
11. Les 4 Personas Utilisateurs
12. Les 10 Modules Fonctionnels
13. Les User Journeys Clés
14. Design System Apple Vision Pro Glassmorphism

**PARTIE IV — LOGIQUE MÉTIER BCT**
15. Les 4,611 Règles BCT — Taxonomie Complète
16. Cycle de Vie No-Code des Règles
17. Rapport de Validation World-Class
18. Framework d'Investigation Deep-Dive

**PARTIE V — EXÉCUTION**
19. Migration depuis l'Existant
20. Roadmap 16 Semaines
21. Matrice de Risques
22. Métriques de Succès
23. Prompt d'Amorçage Claude Code

**ANNEXES**
A. Glossaire BCT
B. Références Réglementaires
C. Check-lists Pré-démarrage

---

# PARTIE I — VISION & STRATÉGIE

## 1. VISION PRODUIT

### 1.1 Déclaration de Vision

> **Regalica IDC est le co-pilote de conformité réglementaire de référence pour toute banque opérant sous juridiction BCT — indistinguable d'un senior regulatory officer, mais infatigable, traçable et auditable.**

### 1.2 Problème Adressé

Les banques tunisiennes font face à un triple défi :

**Défi 1 — Complexité réglementaire croissante**
- 33+ annexes BCT actives
- 4,611 règles de gestion à respecter
- Circulaires régulièrement amendées
- Sanctions financières en cas de non-conformité

**Défi 2 — Processus manuels chronophages**
- Validation manuelle prend 2-3 jours par rapport
- Erreurs humaines fréquentes sur calculs complexes
- Pas de traçabilité systématique des décisions
- Difficile de prouver conformité en audit externe

**Défi 3 — Absence d'outil adapté au marché**
- Outils génériques ne comprennent pas les spécificités BCT
- Pas d'IA dédiée au marché tunisien/BCEAO
- Coûts prohibitifs des solutions européennes
- Pas de souveraineté des données

### 1.3 Solution Regalica IDC

**Plateforme SaaS multi-tenant** propulsée par **13 agents IA spécialisés** qui automatise l'intégralité du cycle de validation BCT :

- Ingestion multi-format (XML, PDF, XLSX, DOCX, PPTX)
- Validation intra-annexe et inter-annexes à tolérance zéro
- Apprentissage no-code de nouvelles règles depuis circulaires BCT
- Rapport de vérification world-class avec preuves de calcul traçables
- Capacités analyse / prédiction / investigation

### 1.4 Promesse de Valeur

**Pour le Compliance Officer :**
> *"De 3 jours à 3 minutes pour valider un rapport BCT, avec une confiance absolue dans le résultat."*

**Pour la Direction Bancaire :**
> *"Zéro risque de sanction réglementaire pour cause d'erreur de reporting. Défendabilité totale en audit externe."*

**Pour l'Auditeur Externe :**
> *"Replay bit-identique de toute validation historique pendant 10 ans. Transparence totale de chaque décision IA."*

---

## 2. POSITIONNEMENT CONCURRENTIEL

### 2.1 Landscape Concurrentiel

Le marché RegTech bancaire pour la zone BCT/BCEAO est **largement vierge**. Les concurrents potentiels :

| Acteur | Positionnement | Limite vs Regalica IDC |
|---|---|---|
| **Solutions européennes** (Wolters Kluwer, AxiomSL, Vermeg) | Haut de gamme Bâle III européen | Pas adapté BCT · Coûts prohibitifs · Pas d'IA moderne |
| **Outils internes banques** | Scripts Excel/VBA maison | Non scalable · Fragile · Pas d'IA · Pas d'audit trail |
| **ERP bancaires** (Temenos, Sopra) | Modules compliance en option | Pas spécialisés · Pas de learning IA · UX datée |
| **Startups RegTech MENA** | Inexistantes sur BCT | — |

### 2.2 Positionnement Regalica IDC

```
                 ↑ SPÉCIALISATION BCT
                 │
          Regalica IDC ★
                 │
                 │
    AxiomSL │    │
    Vermeg  │    │
                 │
                 │       Scripts
                 │      internes
                 │         ●
 ────────────────┼────────────────→ SOPHISTICATION IA
                 │
           ERP   │
        bancaires│
           ●     │
                 │
```

### 2.3 Différenciateurs Concurrentiels (Moats)

**Moat 1 — Apprentissage no-code depuis circulaires BCT**
Aucun concurrent n'offre cette capacité. Upload du PDF de la circulaire → 23 règles proposées en 30 secondes. Différenciateur commercial absolu.

**Moat 2 — Zero-hallucination garantie (prouvée)**
Architecture qui interdit techniquement au LLM de faire des calculs. Decimal 38 digits + citations obligatoires. **Démonstration chiffrée :** exécution sur un reporting BCT 2024-03-31 réel → 96,2 % de conformité mesurée, 3 anomalies détectées dont 1 cross-annexe que les scripts Excel internes n'auraient pas pu voir. Seul outil défendable en audit BCT.

**Moat 3 — Reproductibilité bit-identique 10 ans**
Replay de toute validation historique avec les règles et modèles de l'époque. Nécessite une architecture versionnée à 4 couches que les concurrents n'ont pas.

**Moat 4 — Data + Expertise BCT cumulée**
4,611 règles BCT structurées + expertise Wissem (Head of Financial Reporting QNB) + écosystème BCEAO (FONGIP Senegal). Barrière à l'entrée élevée.

**Moat 5 — Design world-class**
Apple Vision Pro Glassmorphism. Premier outil compliance bancaire qui ne ressemble pas à SAP. UX devient argument commercial.

### 2.4 Marché Adressable

**TAM (Total Addressable Market) :**
- Tunisie : 23 banques + 50 institutions financières régulées BCT = **~75 tenants potentiels**
- Expansion BCEAO (8 pays) : ~200 banques additionnelles = **~275 tenants cible Y3**
- MENA complet : ~1500 institutions financières = **~1,500 tenants cible Y5**

**Modèle de pricing** (indicatif, à ajuster) :
- **Standard** : 5 000 €/mois (banque petite/moyenne, 1 entité)
- **Enterprise** : 15 000 €/mois (banque moyenne/grande, 5 entités)
- **Premium** : 35 000 €/mois (groupe bancaire, 10+ entités)

**Projection MRR :**
- Y1 (2026) : 5 tenants × ~8k€ = **40k€/mois**
- Y2 : 25 tenants × ~10k€ = **250k€/mois**
- Y3 : 80 tenants × ~12k€ = **960k€/mois** (~12M€ ARR)

---

## 3. LES 7 PILIERS INVIOLABLES

Ces principes architecturaux sont **non-négociables**. Ils doivent être affichés en salle compliance, imprimés en première page du Runbook, et vérifiables automatiquement en CI.

### Pilier 1 — ZERO TOLERANCE
**Énoncé :** Tout écart non nul = SEVERE. Aucune tolérance d'arrondi.
**Rationnel :** Position réglementaire maximaliste, défendable en audit BCT. Simplification radicale : pas de zone grise.
**Implémentation :** Champ `tolerance` retiré du schéma `rules`. InvestigatorAgent transforme rigueur en UX acceptable.

### Pilier 2 — ZERO HARDCODING
**Énoncé :** Aucune règle BCT, aucune rubrique, aucun prompt LLM n'est écrit en dur dans le code.
**Rationnel :** Évolution réglementaire = mise à jour de données, pas de code. Permet no-code création.
**Implémentation :** Tables `rules`, `bct_rubriques`, `prompts_registry`, `annexe_columns`. Linter custom valide chaque PR.

### Pilier 3 — ZERO HALLUCINATION
**Énoncé :** Le LLM ne fait jamais de calcul. Chaque réponse IA contient une citation vérifiable.
**Rationnel :** En contexte bancaire, un chiffre inventé = sanction réglementaire potentielle.
**Implémentation :** Decimal.js 28 digits obligatoire. Guardrails rejettent toute réponse non sourcée. Red team en CI.

### Pilier 4 — SUGGEST DON'T REPAIR
**Énoncé :** L'IA suggère précisément les corrections. L'humain corrige son XML. Tout est versionné.
**Rationnel :** Responsabilité juridique claire (humain), tout en bénéficiant de l'intelligence IA.
**Implémentation :** Table `upload_versions`. StructureValidatorAgent génère `RepairSuggestion[]`.

### Pilier 5 — SILENT GUARDIAN
**Énoncé :** Tests techniques invisibles après signature 4-yeux. Alerte non-bloquante si anomalie.
**Rationnel :** Vitesse opérationnelle + filet de sécurité. 99% des cas sans friction, 1% critique protégé.
**Implémentation :** SilentGuardianAgent teste sur dernier rapport validé conforme. Modal non-bloquante.

### Pilier 6 — IMMUTABLE HISTORY
**Énoncé :** Rapports validés figés aux règles de leur époque. Reproductibilité bit-identique pendant 10 ans.
**Rationnel :** Obligation audit BCT. Un auditeur doit pouvoir vérifier un rapport de 2026 en 2036.
**Implémentation :** Tables `rules_history`, `kb_snapshots`, `prompts_registry` versionnés. Replay engine.

### Pilier 7 — HIERARCHICAL TENANCY
**Énoncé :** Maison-mère + filiales avec héritage règles. Résolution récursive.
**Rationnel :** Réalité des groupes bancaires (QNB Tunisia + Leasing + Factoring).
**Implémentation :** Table `entities` avec `parent_entity_id`. Overrides locaux possibles par entité.

---

## 4. LES 16 DÉCISIONS ARCHITECTURALES CEO

Toutes ces décisions ont été prises formellement par le CEO Wissem Barouni via un processus structuré de questions sélectables. Elles sont **gravées dans la pierre** et ne peuvent être modifiées qu'avec un ADR (Architecture Decision Record).

### Tolérance Réglementaire (3 décisions)

| # | Décision |
|---|---|
| D1.1 | **Montants :** SEVERE strict sur tous écarts. User régénère XML. |
| D1.2 | **Ratios :** Zéro tolérance absolue. Calcul Decimal.js 28 digits. |
| D1.3 | **Inter-annexes :** Zéro tolérance absolue. Investigation auto si écart. |

### Workflow de Validation (5 décisions)

| # | Décision |
|---|---|
| D2.1 | **Granularité sélection :** Dual (annexe unitaire OU reporting consolidé). |
| D2.2 | **Check structure :** Full check 7 dimensions (balises, types, encoding, namespace, XSD, dates, cohérence). |
| D2.3 | **Structure KO :** Suggestions précises + re-upload + versionning obligatoire. |
| D2.4 | **Rapport lié :** Dernière version validée conforme (safe reference). |
| D2.5 | **Clef rattachement :** Composite (reporting + référence + tenant + entité). |

### Ajout de Règles No-Code (5 décisions)

| # | Décision |
|---|---|
| D3.1 | **Source découverte :** Hybride XSD + inférence guidée. |
| D3.2 | **Ergonomie :** Tri-mode Copilot + Expert + Learning par lot. |
| D3.3 | **Validation règle :** Signature 4-yeux + Silent Guardian tests invisibles. |
| D3.4 | **Périmètre rubriques :** XSD + data dictionary + règles existantes (auto-complete cross). |
| D3.5 | **Puissance DSL :** Expert complet (IF/THEN + ensembles + pondérations + buckets). |

### Cas Limites (5 décisions)

| # | Décision |
|---|---|
| D4.1 | **Conflits règles :** Permettre avec warning visible dans rapport. |
| D4.2 | **Multi-entités :** Tenant hiérarchique maison-mère + filiales avec héritage. |
| D4.3 | **Priorité roadmap :** Copilot d'abord (MVP) → Learning → Expert. |
| D4.4 | **Rapports modifiés :** Historique immuable (règles de l'époque). |
| D4.5 | **Limitation DSL :** Aucune (toutes opérations gratuites). |

---

# PARTIE II — ARCHITECTURE TECHNIQUE

## 5. STACK TECHNIQUE WORLD-CLASS

### 5.1 Vue d'ensemble

```
FRONTEND
├── Framework:       Next.js 14 App Router + RSC
├── Langage:         TypeScript 5.3+ strict
├── UI:              Tailwind CSS 3.4 + shadcn/ui
├── State:           Zustand + TanStack Query
├── Forms:           React Hook Form + Zod
├── Charts:          Recharts + D3 custom
└── i18n:            next-intl (FR/AR/EN)

BACKEND
├── Runtime DB:      Postgres 15 (Supabase) + pgvector
├── ORM:             Drizzle (migré depuis MySQL)
├── Edge Functions:  Supabase Edge Functions (Deno TS)
├── Auth:            Supabase Auth + MFA TOTP
├── Storage:         Supabase Storage (AES-256)
├── Realtime:        Supabase Realtime
├── Queue:           pgmq (Postgres Message Queue)
└── Cache:           Upstash Redis

IA / ML
├── LLM primaire:    Claude Opus 4.7 (Anthropic)
├── LLM secondaire:  Claude Sonnet 4.6
├── Embeddings:      voyage-3 (1024 dims)
├── Reranking:       Voyage Rerank
├── Vector store:    pgvector HNSW
└── Orchestration:   XState state machines

SÉCURITÉ
├── Rate limit:      Upstash Ratelimit
├── WAF:             Cloudflare
├── Secrets:         Supabase Vault
└── Scan deps:       Snyk + Gitleaks + Semgrep

OBSERVABILITÉ
├── Logs:            Pino structured JSON → Logflare
├── APM:             Sentry Performance
├── Errors:          Sentry
├── Uptime:          Better Stack
└── Dashboards:      Grafana Cloud + Metabase

DEVOPS
├── CI/CD:           GitHub Actions
├── IaC:             Terraform
├── Deploy FE:       Vercel
├── Deploy BE:       Supabase CLI
└── Tests:           Vitest + Playwright
```

### 5.2 Justification des Choix Stratégiques

**Supabase (vs Firebase/Vanilla Postgres)**
- pgvector natif pour RAG sans stack additionnel
- RLS natif pour isolation multi-tenant par défaut
- Auth géré avec MFA, OAuth, magic links
- Realtime pour progression live validation dans l'UI
- Alternative open-source évite vendor lock-in total

**Claude API (vs OpenAI/Gemini)**
- Qualité supérieure sur raisonnement réglementaire
- Constitution AI : moins de "yes-man" sur contenu sensible
- Support natif tool use + structured outputs
- Cohérence avec écosystème ALGORIA Factory

**Drizzle (vs Prisma)**
- TypeScript-first, type-safe end-to-end
- SQL natif accessible (pas d'abstraction opaque)
- Migrations versionnées propres
- Conservé depuis codebase existante

**Next.js 14 App Router (vs Remix/SvelteKit)**
- Écosystème mature et ressources abondantes
- Server Components réduisent bundle client
- Conservé depuis codebase existante
- Hosting Vercel simplifie ops

---

## 6. ARCHITECTURE EN 5 COUCHES

### 6.1 Vue C4 (Contexte)

```
┌─────────────────────────────────────────────────────────────┐
│                      REGALICA IDC                           │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  Régulateur  │    │   Banques    │    │ Consultants  │ │
│  │    (BCT)     │    │  (tenants)   │    │  externes    │ │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘ │
│         │ circulaires       │ XML reports       │ access  │
│         ▼                    ▼                    ▼        │
│  ┌─────────────────────────────────────────────────────┐  │
│  │            REGALICA IDC PLATFORM                     │  │
│  │  (Ingestion · Validation · Reporting · Analytics)    │  │
│  └─────────────────────────────────────────────────────┘  │
│         │                    │                             │
│         ▼                    ▼                             │
│  ┌──────────────┐    ┌──────────────┐                     │
│  │  Claude API  │    │  Email/SMS   │                     │
│  │  (Anthropic) │    │   (Resend)   │                     │
│  └──────────────┘    └──────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Les 5 Couches

**COUCHE 1 — Edge Layer (Cloudflare)**
- WAF (Web Application Firewall)
- Protection DDoS
- Rate Limiting par tenant (Upstash)
- CDN distribution globale assets

**COUCHE 2 — Frontend Layer (Next.js 14)**
- Design system Apple Vision Pro Glassmorphism
- State management Zustand + TanStack Query
- i18n FR/AR/EN natif avec RTL
- Responsive mobile + desktop

**COUCHE 3 — Application Layer**
- API Routes BFF (Backend-for-Frontend) Next.js
- Edge Functions Supabase (Deno TypeScript)
- Auth middleware avec RBAC + MFA
- Validation Zod systématique runtime

**COUCHE 4 — AI Agents Layer**
- 13 agents IA spécialisés (détails section 7)
- Claude Opus/Sonnet multi-modèle
- Guardrails zero-hallucination
- State machines XState orchestration

**COUCHE 5 — Data Layer**
- Postgres 15 avec 20+ tables RLS
- pgvector HNSW pour RAG
- Storage AES-256 chiffré
- Realtime + pgmq queues

---

## 7. LES 13 AGENTS IA SPÉCIALISÉS

Chaque agent a un contrat I/O typé, une responsabilité unique (SRP), et est déployé comme Edge Function indépendante.

### 7.1 Tableau Synthétique

| # | Agent | Responsabilité | LLM | Nouveau |
|---|---|---|---|---|
| 1 | **Orchestrator** | Coordination, state machine | ✅ | — |
| 2 | **Ingestor** | Parsing multi-format → JSON | ❌ | — |
| 3 | **Structure Validator** | Full check 7 dimensions | ❌ | 🆕 |
| 4 | **Schema Inferencer** | Inférence XSD manquant | ✅ | 🆕 |
| 5 | **Indexer** | Chunking + embeddings pgvector | ❌ | — |
| 6 | **Rule Learner** | Extraction règles no-code | ✅ | — |
| 7 | **Intra Validator** | Contrôles intra-annexe | ❌ | — |
| 8 | **Inter Validator** | Contrôles inter-annexes | ❌ | — |
| 9 | **Calculator** | Calculs Decimal.js déterministes | ❌ | — |
| 10 | **Investigator** | Root cause analysis | ✅ | — |
| 11 | **Predictor** | Forecasting risques ML | ❌ | — |
| 12 | **Reporter** | Rapport world-class 10 sections | ✅ | — |
| 13 | **Silent Guardian** | Tests techniques invisibles | ❌ | 🆕 |

### 7.2 Contrat I/O Canonique

```typescript
interface Agent<Input, Output> {
  readonly id: AgentId;
  readonly version: string;
  readonly capabilities: Capability[];

  execute(input: Input, ctx: AgentContext): Promise<AgentResult<Output>>;
  validateInput(input: unknown): Result<Input, ValidationError>;
  validateOutput(output: unknown): Result<Output, ValidationError>;
}

interface AgentResult<T> {
  status: 'success' | 'failure' | 'partial';
  output: T;
  citations: Citation[];     // OBLIGATOIRE si LLM impliqué
  confidence: number;        // 0-1, rejet si < 0.95 sur critique
  tokensUsed: number;
  latencyMs: number;
}
```

### 7.3 Principe Déterministe vs Probabilistique

**Agents déterministes (8) :** Ingestor, Structure Validator, Indexer, Intra Validator, Inter Validator, Calculator, Predictor, Silent Guardian
- Aucun LLM impliqué
- Résultats bit-identiques pour mêmes inputs
- Auditables mathématiquement
- Garantie zero-hallucination

**Agents LLM (5) :** Orchestrator, Schema Inferencer, Rule Learner, Investigator, Reporter
- Claude Opus/Sonnet
- Guardrails obligatoires (citations + confidence)
- Humain-in-the-loop sur décisions critiques
- Versioning complet pour reproductibilité

---

## 8. MODÈLE DE DONNÉES — CALIBRÉ SUR LE RDG RÉEL

### 8.1 Paradigme BCT (6 Dimensions, pas 5)

Chaque cellule de données BCT est identifiée par **6 dimensions** (la 6ème, `rang`, est essentielle et avait été omise dans la v1.0) :

1. **Rubrique** — code hiérarchique (ex : `AC050100000000`). Majoritairement 14 caractères, avec variantes 1-9 caractères pour les codes courts (`D1`, `D2`, `D3`) et les littéraux numériques.
2. **Colonne** — identifiant de ventilation dans l'annexe (brut/provisions/net, résidents/non-résidents, devises…)
3. **Annexe** — contexte réglementaire (code numérique : `00`, `51`, `630`, `640`, `480`, `482`, `132`…)
4. **Date de reporting** — granularité mensuelle (format `YYYYMMDD` dans les XML BCT)
5. **Entité** — pour multi-entités (maison-mère + filiales)
6. **Rang dans l'équation** — `1` = membre gauche (LHS), `2` = membre droit (RHS), `3` = rare (règles à trois rangs sur le Tableau 6-2). Sans cette dimension, impossible de distinguer `A = B + C` de `A + B = C`.

### 8.2 Anatomie d'un Code Rubrique

**Format canonique (14 caractères)** — utilisé sur 88 % des références :

```
Code : AC050100000000
       ╔══╦════╦════╦════════╗
       ║AC║05  ║01  ║00000000║
       ╚══╩════╩════╩════════╝
        │   │    │    │
        │   │    │    └─ Padding / extension future (8 zéros)
        │   │    └────── Sous-sous-catégorie (2 chiffres)
        │   └─────────── Sous-catégorie (2 chiffres)
        └─────────────── Catégorie principale (2 lettres)
```

**Catégories alphabétiques observées :**

```
AC = Actif (2 597 références)   PA = Passif (4 026)
HB = Hors Bilan (944)           CP = Capitaux Propres (398)
PR = Produits (218)             CH = Charges (141)
TO = Totaux transversaux (162)  AM = Amortissements
PN = Positions Nettes           D, D1, D2, D3 = Dimensions custom
```

**Variantes non-canoniques** (à prévoir dans le parser) :

| Forme | Volume | Cas d'usage |
|---|---|---|
| Codes 14 chars avec préfixe alphabétique (`AC`, `PA`…) | 16 255 rows | Cas standard |
| Codes numériques 14 chars (préfixes `132`, `480`, `482`, `48`, `13`, `74`…) | ~8 895 rows | Rubriques issues du reporting statistique BCEAO |
| Codes courts 1-9 chars (`D1`, `D2`, `D3`, `E99000000`) | ~1 878 rows | Colonnes transverses / placeholders |
| Littéraux numériques (`0`, `100`, `75`, `5`…) dans la colonne RUBRIQUE quand COLONNE est null | 593 rows, 26 valeurs distinctes | Constantes de formule (pourcentages, plafonds) |
| Littéraux textuels (ex : `"1 ou 2"`) | 7 rows | **Non formalisés** — à parser manuellement ou via Rule Learner |

### 8.3 Schéma PostgreSQL — Version Corrigée

Le schéma v1.0 parlait de `rule_cells`. Le vrai modèle relationnel du RDG est **rule_terms** (un term = un membre de l'équation, avec son rang et son signe) :

```sql
-- ════════════════════════════════════════════════════════════
-- Table rules : métadonnées de la règle (1 ligne par règle)
-- ════════════════════════════════════════════════════════════
CREATE TABLE rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  annexe_code     TEXT NOT NULL,              -- '00', '51', '630'...
  num_regle       INT  NOT NULL,              -- numéro local à l'annexe (se répète entre annexes)
  oper_regle      TEXT NOT NULL CHECK (oper_regle IN
                    ('=','>=','<=','>','<','SUM','MAX','MIN','VA')),
  type_ctrl       TEXT NOT NULL CHECK (type_ctrl IN ('intra_ax','inter_ax')),
  domaine         TEXT NOT NULL,              -- '1- REPORTING COMPTABLE', etc.
  lib_annexe      TEXT NOT NULL,              -- libellé humain complet
  zone_texte      TEXT,                       -- condition IF/THEN si applicable (208 règles)
  is_formalized   BOOL NOT NULL DEFAULT TRUE, -- FALSE si zone_texte non parsée en AST
  circulaire_id   UUID REFERENCES circulaires(id),
  version         INT  NOT NULL DEFAULT 1,
  is_active       BOOL NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_by    UUID REFERENCES users_profile(id),
  validated_at    TIMESTAMPTZ,
  UNIQUE (tenant_id, annexe_code, num_regle, version)
);

-- Index critique : résolution O(log n) d'une règle par (annexe, num)
CREATE INDEX idx_rules_annexe_num ON rules(tenant_id, annexe_code, num_regle)
  WHERE is_active = TRUE;

-- ════════════════════════════════════════════════════════════
-- Table rule_terms : les membres de l'équation
-- 1 règle = N terms (moyenne 4, max observé 31)
-- ════════════════════════════════════════════════════════════
CREATE TABLE rule_terms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         UUID NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  rang            SMALLINT NOT NULL CHECK (rang IN (1,2,3)),   -- LHS/RHS/rare
  num_seq         SMALLINT NOT NULL,          -- ordre d'apparition au sein du rang
  term_op         TEXT NOT NULL CHECK (term_op IN ('+','-','*','/')),
  kind            TEXT NOT NULL CHECK (kind IN ('cell_ref','literal','literal_text')),
  -- Cas kind='cell_ref' ---
  ax_origine      TEXT,                       -- annexe source du term (peut != annexe du rule)
  rubrique_code   TEXT,
  colonne         TEXT,
  -- Cas kind='literal' ou 'literal_text' ---
  literal_value   NUMERIC(28,8),              -- valeur numérique si parsable
  literal_text    TEXT,                       -- texte brut si non-numérique (ex: "1 ou 2")
  CHECK (
    (kind = 'cell_ref'     AND rubrique_code IS NOT NULL AND colonne IS NOT NULL) OR
    (kind = 'literal'      AND literal_value IS NOT NULL) OR
    (kind = 'literal_text' AND literal_text IS NOT NULL)
  )
);

CREATE INDEX idx_rule_terms_rule ON rule_terms(rule_id, rang, num_seq);
CREATE INDEX idx_rule_terms_ax_origine ON rule_terms(ax_origine, rubrique_code)
  WHERE kind = 'cell_ref';

-- ════════════════════════════════════════════════════════════
-- Table rules_history : immutabilité réglementaire (Pilier 6)
-- ════════════════════════════════════════════════════════════
CREATE TABLE rules_history (
  LIKE rules INCLUDING ALL,
  history_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valid_from      TIMESTAMPTZ NOT NULL,
  valid_to        TIMESTAMPTZ,
  replaced_by     UUID REFERENCES rules(id)
);
```

**Point d'attention migration XLSX → DB :** la clé métier `NUM_REGLE` n'est **pas globalement unique** — elle se réinitialise par annexe (962 valeurs distinctes pour 4 611 règles). La clé naturelle est donc `(annexe_code, num_regle)`. Mon script de migration devra en tenir compte sous peine de fusionner accidentellement des règles étrangères.

### 8.4 Volumétrie Mesurée (pas estimée)

| Table | Volume v1.0 annoncé | Volume v1.1 mesuré | Source |
|---|---|---|---|
| `annexes` | ~33 actives | **52 annexes** | Fichier RDG (colonne LIB_ANNEXE distincte) |
| `rules` | ~4 611 | **4 611 exactement** | `(LIB_ANNEXE, NUM_REGLE)` distinct du RDG |
| `rule_terms` | ~18 452 | **18 452 exactement** | Rows du RDG |
| `bct_rubriques` (distinctes dans le RDG) | 2 000–5 000 | **1 247** dans les règles | Le catalogue complet en inclura davantage via XSD |
| Terms moyens par règle | — | **4,00** (médiane 3) | Distribution 1–31 |
| Règles 1 seul term (atypiques) | — | **17** | Cas limites (ex : contrainte de nullité) |
| Règles ≥ 10 terms (complexes) | — | **222** | Consolidations massives |
| Règles avec `ZONE_TEXTE` (conditionnelles, non-AST) | — | **208** (4,5 %) | À formaliser via Rule Learner |
| Règles avec ≥ 1 littéral | — | **543** (11,8 %) | Pourcentages, plafonds |
| Règles vraiment cross-annexe (≥ 2 `AX_ORIGINE`) | — | **823** (17,8 %) | Important : `TYPE_CTRL='inter_ax'` sous-estime ce volume à 219 |
| Catégories de rubriques distinctes (préfixes) | 9 | **≥ 15** observées | AC, PA, HB, CP, PR, CH, TO, AM, PN, D, D1-D3, EM, RA, RE, SN, RN… |

### 8.5 Format XML BCT — Spécification

**Format observé sur 4 XML réels 2024-03-31 (banque code 23) :**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document>
  <Entete>
    <CodeBanque>23</CodeBanque>            <!-- identifiant banque -->
    <DateAnnexe>20240331</DateAnnexe>       <!-- YYYYMMDD -->
    <CodeAnnexe>630</CodeAnnexe>            <!-- code annexe cible -->
  </Entete>
  <Annexe id="630">
    <Rubrique id="PA030100000000">
      <Colonne id="1">0.000</Colonne>
      <Colonne id="2">192.532</Colonne>
      <!-- ... jusqu'à 12 colonnes pour l'annexe 630 ... -->
      <Colonne id="12">352735.018</Colonne>
    </Rubrique>
    <!-- ... N rubriques ... -->
  </Annexe>
</Document>
```

**Invariants structurels observés (à coder en tant que pré-conditions du StructureValidatorAgent) :**

- Racine `<Document>` unique, encodage UTF-8, BOM toléré.
- Bloc `<Entete>` obligatoire avec exactement 3 enfants : `CodeBanque`, `DateAnnexe`, `CodeAnnexe`.
- `DateAnnexe` au format `YYYYMMDD` compact (pas de tirets).
- Exactement un bloc `<Annexe id="X">` où `X == CodeAnnexe`.
- Chaque `<Rubrique id="…">` porte un code (14 caractères canoniques majoritaires).
- Chaque `<Colonne id="n">` porte une valeur décimale au format `NNN.NNN` (point décimal, 3 décimales standard BCT).
- Les colonnes sont numérotées séquentiellement à partir de `"1"` (pas `"0"`, pas de padding) — **point d'attention** : le RDG référence parfois avec padding (`"01"`, `"02"`), donc l'évaluateur doit normaliser.
- Nombre de rubriques par annexe : ~3 (annexe 640) à ~265 (annexe 51) selon le type.
- Nombre de colonnes par rubrique : 1 (annexe 51) à 12 (annexe 630) selon le type.

**Volumétrie XML observée :**

| XML | Taille | Rubriques | Colonnes/rubrique | Usage |
|---|---|---|---|---|
| 00 (Bilan) | 63 KB | 171 | 8 | Situation Mensuelle Comptable |
| 51 (État Résultat) | 22 KB | 265 | 1 | Compte de résultat |
| 630 (Ressources) | 22 KB | 42 | 12 | Ventilation secteur institutionnel |
| 640 (Créances) | 1,7 KB | 3 | 11 | Ventilation créances clientèle |

### 8.6 Points Sémantiques Non-Triviaux

Quatre subtilités qui ont émergé de l'analyse des données et qui doivent être **codifiées dans l'Ingestor + l'évaluateur** :

1. **`AX_ORIGINE` est toujours littéral** — même quand le term apparaît dans une règle stampée sur une autre annexe. Quand une règle stampée sur `630` a un term avec `AX_ORIGINE='00'`, cela signifie explicitement « regarder dans le bilan annexe 00 », pas « regarder dans la même annexe que la règle ». Ne pas confondre.

2. **Les codes `"0"` et `"00"` sont équivalents** pour désigner l'annexe 00 (Bilan) ; idem `"1"`/`"01"` pour l'annexe 01 (Hors Bilan). L'Ingestor doit normaliser avant lookup.

3. **`TYPE_CTRL` est indicatif, pas autoritaire.** 3 861 rows tagguées `intra_ax` ont un `AX_TERM ≠ AX_ORIGINE`, et 236 rows `inter_ax` ont les deux identiques. La vérité est dans `AX_ORIGINE` — si ≥ 2 annexes distinctes dans une règle, c'est cross-annexe (quelle que soit l'étiquette).

4. **Une règle à 1 seul rang (rang 2 sans rang 1) = contrainte de nullité.** Rare (17 cas) mais réel : la règle est satisfaite ssi la somme des terms rang 2 = 0. Le moteur doit traiter ce cas explicitement plutôt que de faire défaut à `LHS=0`.

---

## 9. PIPELINE DE VALIDATION END-TO-END

### 9.1 Les 14 Étapes Séquentielles

```
INPUT
  └─ [1] Upload XML          ← Utilisateur drag-drop

ORCHESTRATION
  └─ [2] Init State Machine  ← Orchestrator

INGESTION
  └─ [3] Parse XML → JSON    ← Ingestor

STRUCTURE CHECK
  └─ [4] Full Check 7D       ← Structure Validator (BLOQUANT)

INDEXATION
  └─ [5] Embeddings pgvector ← Indexer

RULES LOADING
  └─ [6] Résolution Règles   ← Orchestrator + hiérarchie entités

VALIDATION INTRA
  └─ [7] Règles Intra-Annexe ← Intra Validator (parallèle 50x)

CROSS-ANNEXE
  └─ [8] Lookup Rapports Liés ← Inter Validator

VALIDATION INTER
  └─ [9] Croisement Annexes   ← Inter Validator

CALCULS
  └─ [10] Decimal.js 28 digits ← Calculator (DÉTERMINISTE)

INVESTIGATION
  └─ [11] Root Cause Analysis  ← Investigator (si erreurs SEVERE)

PRÉDICTION
  └─ [12] Forecasting Risques  ← Predictor (DÉTERMINISTE ML)

REPORTING
  └─ [13] Rapport World-Class  ← Reporter (10 sections PDF/A-3)

OUTPUT
  └─ [14] Livraison            ← Storage signé + audit log
```

### 9.2 State Machine (XState)

```typescript
type ValidationState =
  | 'IDLE'
  | 'INGESTING'
  | 'STRUCTURE_CHECKING'
  | 'STRUCTURE_FAILED'     // retour IDLE après correction user
  | 'INDEXED'
  | 'RULES_LOADED'
  | 'VALIDATING_INTRA'
  | 'VALIDATING_INTER'
  | 'CALCULATING'
  | 'INVESTIGATING'        // skip si 0 erreur
  | 'PREDICTING'
  | 'REPORTING'
  | 'COMPLETED'
  | 'FAILED';
```

### 9.3 SLA Cibles

| Métrique | Cible |
|---|---|
| Latence p50 validation XML 1MB | < 1.5s |
| Latence p95 | < 3s |
| Latence p99 | < 5s |
| Throughput par tenant | 1000 validations/h |
| Précision calculs | 100% vs calcul manuel expert |

---



### 9.4 Algorithme d'Évaluation — Spécification Implémentable

L'algorithme ci-dessous est **celui qui a produit les résultats de la preuve terrain** (1 054 règles appliquées, 1 014 PASS + 3 FAIL + 37 SKIPPED). Il remplace le pseudo-code AST abstrait de la v1.0.

**Pipeline en 5 phases :**

```
┌──────────────────────────────────────────────────────────────────────┐
│  Phase A — PARSE XML                                                  │
│  ────────────                                                         │
│  Pour chaque XML du batch :                                           │
│    xml[code_annexe][rubrique][colonne] = Decimal(valeur, prec=38)     │
│  Normaliser : strip des id, padding des colonnes, encoding UTF-8.     │
│                                                                       │
│  Phase B — GROUP RULES                                                │
│  ─────────────                                                        │
│  rules = groupby(RDG, clé=(LIB_ANNEXE, NUM_REGLE))                    │
│  → 4 611 groupes de terms                                             │
│                                                                       │
│  Phase C — RESOLVE TERMS (pour chaque règle)                          │
│  ──────────────                                                       │
│  Pour chaque term de la règle :                                       │
│    Si COLONNE est null :                                              │
│      tenter Decimal(RUBRIQUE) → kind='literal', valeur = constante    │
│      sinon → kind='literal_text', SKIP règle (ex : "1 ou 2")          │
│    Sinon :                                                            │
│      target = AX_ORIGINE normalisé via alias map                      │
│      Si target absent de notre batch XML :                            │
│        status = 'xml_missing' → SKIP règle                            │
│      Sinon lookup xml[target][RUBRIQUE][COLONNE]                      │
│        Normaliser colonne : strip leading zeros puis fallback zfill   │
│        Si rubrique absente → status='rubrique_missing' → SKIP règle   │
│        Si colonne absente → status='colonne_missing' → SKIP règle     │
│                                                                       │
│  Phase D — AGGREGATE BY RANG                                          │
│  ──────────────                                                       │
│  terms_by_rang = groupby(terms, key=rang)                             │
│  Pour chaque rang, calculer acc en Decimal :                          │
│    acc = 0                                                            │
│    pour chaque (term_op, valeur) :                                    │
│      si '+' : acc += v                                                │
│      si '-' : acc -= v                                                │
│      si '*' : acc = acc * v                                           │
│      si '/' : si v == 0 → SKIP ; sinon acc = acc / v                  │
│                                                                       │
│  Phase E — COMPARE & VERDICT                                          │
│  ──────────────                                                       │
│  LHS = aggregate(terms_rang_1)                                        │
│  RHS = aggregate(terms_rang_2)                                        │
│  Selon OPER_REGLE :                                                   │
│    '='   : PASS ssi LHS == RHS          (égalité EXACTE, pas epsilon) │
│    '>='  : PASS ssi LHS >= RHS                                        │
│    '<='  : PASS ssi LHS <= RHS                                        │
│    '>'   : PASS ssi LHS >  RHS                                        │
│    '<'   : PASS ssi LHS <  RHS                                        │
│    'SUM' : PASS ssi LHS == RHS (sémantique observée identique à '=')  │
│    'MAX' : SKIP — sémantique à confirmer avec expert BCT              │
│    'MIN' : SKIP — sémantique à confirmer avec expert BCT              │
│    'VA'  : SKIP — valeur absolue présumée, à confirmer                │
│  Si rule.zone_texte ≠ null : SKIP (passer au RuleLearnerAgent)        │
└──────────────────────────────────────────────────────────────────────┘
```

**Sémantique de la "zéro tolérance" (Pilier 1) :** les Decimal Python/JS 28+ digits effectuent les additions/soustractions de valeurs XML à 3 décimales de façon **mathématiquement exacte**. Aucun epsilon n'est nécessaire. Le test d'égalité est strict (`==`). La preuve terrain l'a confirmé : 1 014 PASS sur des sommations de 2 à 31 terms chacune, zéro faux positif par arrondi.

**Distribution des OPER_REGLE observée (pour dimensionner les priorités d'implémentation) :**

| OPER_REGLE | Règles | % | Priorité impl. |
|---|---|---|---|
| `=` (égalité) | 4 000+ | 93 % | **P0** — doit marcher |
| `>=` (seuil plancher) | 287 | 6,2 % | **P0** |
| `SUM` (agrégation vérifiée) | 404 | 2,2 % | **P0** (identique à `=`) |
| `MAX` (borne supérieure) | 33 | 0,7 % | P2 — sémantique à valider |
| `MIN` (borne inférieure) | 31 | 0,7 % | P2 — sémantique à valider |
| `>` strict | 24 | 0,5 % | P1 |
| `<=` (seuil plafond) | 14 | 0,3 % | P1 |
| `VA` (valeur absolue présumée) | 5 | 0,1 % | P3 — non bloquant |

### 9.5 Catégorisation des Verdicts

Tout résultat d'évaluation relève d'une des **cinq catégories suivantes**, qui doivent être exposées à l'utilisateur telles quelles (pas de regroupement) :

| Verdict | Sémantique | Action UI |
|---|---|---|
| **PASS** | Règle satisfaite par les données du XML | Ligne verte, cliquable pour preuve de calcul |
| **FAIL** | Écart réglementaire détecté | **Ligne rouge bloquante** + Investigator Deep-Dive activé |
| **SKIPPED — rubrique absente** | La règle référence une rubrique non présente dans le XML | Warning jaune — à confirmer : non-déclaration légitime OU oubli ? |
| **SKIPPED — annexe hors périmètre** | La règle pointe vers une annexe dont l'XML n'est pas dans le batch | Info grise — invite à uploader le rapport manquant pour audit complet |
| **SKIPPED — non formalisée** | Règle à `ZONE_TEXTE` conditionnel OU opérateur `MAX/MIN/VA` non confirmé | Badge « en attente formalisation » — RuleLearnerAgent + validation humaine |

**Règle d'or UX :** jamais de SKIPPED silencieux. Chaque SKIP est tracé, expliqué et actionnable — c'est ce qui distingue un outil défendable en audit d'un outil magique.

### 9.6 Preuve de Concept — Résultats 2024-03-31

Exécution complète documentée, reproductible bit-identique (Pilier 6) :

```
Input  : RDG.xlsx (4 611 règles, 18 452 terms) + 4 XMLs (bank 23, 2024-03-31)
Moteur : Python 3.11 + Decimal prec=38 (dépasse les 28 requis)
Temps  : < 2 secondes sur machine standard

Résultats (applicables = stampés sur nos 4 XMLs) :
  Applicables  : 1 054 règles (22,9 % du total)
  PASS         : 1 014 (96,2 %)
  FAIL         :     3  (0,3 %)   ← toutes sur annexe 630, rubrique PA030202000000
  SKIPPED      :    37  (3,5 %)
    dont rubrique absente : 31 (18 rubriques distinctes — dont PA300*/PA309*
                               qui sont probablement des provisions non déclarées)
    dont zone_texte cond. :  6

Détail des 3 FAIL (sévérité SEVERE selon Pilier 1) :
  Règle 630/265 : PA030202000000.col9 + col10 = 0 ?        → gap = +57 985 TND
  Règle 630/266 : Bilan.PA030202000000.col1 = 0 ?          → gap = +57 985 TND
  Règle 630/267 : Bilan.PA030202000000.col2 = 0 ?          → gap = +0,226 TND
```

Les deux premiers FAIL croisent la **même anomalie** sous deux angles (intra-630 + cross-référence bilan) — ce qui est le signe qu'une vraie erreur de saisie a été commise sur cette rubrique. C'est exactement le type de détection que Regalica vend aux banques : **une anomalie qui aurait pris 2-3 jours à un Compliance Officer est trouvée en 2 secondes, avec preuve de calcul cliquable**.

## 10. SÉCURITÉ & ZERO-HALLUCINATION

### 10.1 Modèle de Menaces (STRIDE)

| Menace | Mitigation |
|---|---|
| **Spoofing** | MFA TOTP + Supabase Auth JWT + session rotation |
| **Tampering** | Checksums SHA-256 + audit log chaîné append-only + PDF/A-3 signé |
| **Repudiation** | Audit log immuable + horodatage serveur authoritaire |
| **Info Disclosure** | RLS 100% tables + chiffrement AES-256 + URLs signées 15min |
| **DoS** | Cloudflare WAF + rate limit per-tenant + queue backpressure |
| **Elevation of Privilege** | RBAC least-privilege + RLS + SECURITY DEFINER audités |

### 10.2 Framework Zero-Hallucination

**5 Piliers Défensifs :**

1. **Grounding obligatoire** — toute réponse IA doit citer ≥ 1 source en KB
2. **Calcul hors LLM** — Decimal.js 28 digits pour tout chiffre
3. **Confidence Threshold** — rejet si < 0.95 sur sujet critique
4. **Guardrail Validator** — middleware qui rejette réponses non sourcées
5. **Red Team continu** — tests adversariaux en CI

**Guardrail Middleware Pseudo-code :**

```typescript
class HallucinationGuardrail {
  async validate(response: LLMResponse): Promise<ValidationResult> {
    // 1. Vérifier présence citations
    if (!response.citations?.length) return { valid: false, reason: 'NO_CITATIONS' };
    
    // 2. Vérifier existence citations en KB
    for (const cite of response.citations) {
      if (!await db.kb_chunks.exists(cite.sourceId))
        return { valid: false, reason: 'FAKE_CITATION' };
    }
    
    // 3. Vérifier chiffres tracés
    const numbers = extractNumbers(response.text);
    for (const n of numbers) {
      if (!response.calculationTrace?.some(t => t.value === n))
        return { valid: false, reason: 'UNGROUNDED_NUMBER' };
    }
    
    // 4. Vérifier confidence
    if (response.confidence < ctx.minConfidence)
      return { valid: false, reason: 'LOW_CONFIDENCE' };
    
    return { valid: true };
  }
}
```

### 10.3 RBAC — 4 Rôles Standards

| Rôle | Permissions |
|---|---|
| **Owner** | Full control tenant (billing, users, config) |
| **Admin** | Gestion users, règles (propose), rapports |
| **Compliance Officer** | Valider règles, lancer validations, signer rapports |
| **Analyst** | Upload rapports, voir résultats |
| **Auditor** | Read-only cross-entity (audit externe) |
| **Viewer** | Dashboard uniquement |

---

# PARTIE III — ARCHITECTURE PRODUIT

## 11. LES 4 PERSONAS UTILISATEURS

### 11.1 Persona 1 — Compliance Officer (Utilisateur Principal)

**Profil :** Responsable conformité bancaire, 10+ ans d'expérience BCT.
**Rôle :** Validation quotidienne des reportings, révision règles, signature batches.
**Permissions :** Upload rapports · Valider règles · Signer 4-yeux · Consulter audit.
**Tâches quotidiennes :**
- Validation quotidienne reportings BCT
- Review règles proposées par IA
- Signature batches de nouvelles règles
- Traitement alertes SEVERE
**Modules utilisés :** Dashboard · Workspace · Reports · Rules · Audit · Settings

### 11.2 Persona 2 — Analyst (Utilisateur Opérationnel)

**Profil :** Analyste métier junior/médior, back-office banque.
**Rôle :** Upload rapports quotidiens, suivi tendances.
**Permissions :** Upload rapports · Consulter rapports · Voir dashboards · Exporter données.
**Tâches quotidiennes :**
- Upload rapports journaliers aux bonnes dates
- Monitoring des dashboards conformité
- Suivi des tendances de conformité
- Préparation rapports ad-hoc pour management
**Modules utilisés :** Dashboard · Workspace · Reports · Settings

### 11.3 Persona 3 — Admin / CTO (Gestion Système)

**Profil :** CTO ou responsable IT compliance.
**Rôle :** Administration système, gestion entités, onboarding.
**Permissions :** Tout Compliance + gestion utilisateurs + config annexes + Model Registry.
**Tâches quotidiennes :**
- Onboarding nouveaux utilisateurs
- Import circulaires BCT récentes
- Gestion XSD et annexes
- Supervision système et monitoring
**Modules utilisés :** Tous les modules

### 11.4 Persona 4 — External Auditor (Auditeur Externe)

**Profil :** Auditeur BCT ou cabinet externe (KPMG, Deloitte, PwC).
**Rôle :** Contrôles périodiques, audit trail.
**Permissions :** Lecture seule · Accès audit logs · Replay validations · Export.
**Tâches quotidiennes :**
- Contrôles périodiques sur demande BCT
- Vérification audit trail
- Replay de rapports historiques
- Export de preuves pour rapports audit
**Modules utilisés :** Reports · Audit · Knowledge · Settings (lecture seule)

---

## 12. LES 10 MODULES FONCTIONNELS

### 12.1 Module 1 — Dashboard

**Description :** Vue d'ensemble temps réel de la conformité.
**Écrans :**
- Home Dashboard : KPIs + alertes + tendances 6 mois
- Risk Heatmap : carte thermique risques par annexe
- Analytics : analyses avancées et prédictions

**Features clés :**
- Gauge conformité globale animée
- Top 5 alertes SEVERE actives
- Timeline 6 derniers reportings
- Prédictions PredictorAgent
- Comparaison inter-entités

### 12.2 Module 2 — Workspace

**Description :** Cœur opérationnel (upload, validation, chat IA).
**Écrans :**
- Upload Zone : drag-drop + sélection annexe/date
- Split View Validation : zone validation + assistant AI
- Structure Check Report : si défaillance + suggestions
- Related Reports Lookup : découverte rapports liés

**Features clés :**
- Upload multi-format
- Versionning tentatives complet
- Live progression 13 agents
- Suggestions réparation précises
- Chat contextuel sourcé

### 12.3 Module 3 — Reports

**Description :** Historique, détails, export rapports.
**Écrans :**
- Reports List : liste filtrable/paginée
- Report Detail : 10 sections canoniques
- Calculation Proof : preuves calculs cliquables
- Export Center : PDF/JSON/XLSX

**Features clés :**
- Rapport fixe 10 sections
- Preuves calcul cliquables
- Heatmap inter-annexes
- Investigation deep-dive
- Signature numérique PDF/A-3
- Replay historique immuable

### 12.4 Module 4 — Rules Management

**Description :** CRUD no-code 4,611 règles avec tri-mode.
**Écrans :**
- Rules Explorer : navigation + recherche sémantique
- Mode Copilot : création conversationnelle
- Mode Learning : upload circulaire → batch review
- Mode Expert : formulaire dense + auto-complete
- Proposed Rules : en attente 4-yeux
- Rule Detail + History : versions + lineage

**Features clés :**
- Tri-mode création
- Signature 4-yeux obligatoire
- Silent Guardian tests invisibles
- Historique immuable
- Impact rétroactif 12 mois
- Détection conflits

### 12.5 Module 5 — Knowledge Base

**Description :** Référentiel BCT (annexes, circulaires, dictionary).
**Écrans :**
- Annexes Registry : 33+ annexes avec XSD
- Circulaires BCT : bibliothèque + diffs
- Data Dictionary : rubriques hiérarchiques
- XSD Registry : schémas + inférence guidée

**Features clés :**
- Référentiel 2000+ rubriques
- Hiérarchie navigable
- Diff automatique circulaires
- Inférence XSD
- i18n FR/AR/EN

### 12.6 Module 6 — Entities & Tenants

**Description :** Gestion hiérarchique multi-entités.
**Écrans :**
- Entity Tree : arbre maison-mère/filiales
- Entity Detail : config + règles héritées
- Inheritance Matrix : matrice héritage

**Features clés :**
- Hiérarchie maison-mère → filiales
- Héritage règles configurable
- Overrides locaux
- Isolation RLS
- Support multi-pays

### 12.7 Module 7 — Users & Access

**Description :** Gestion utilisateurs, rôles, MFA.
**Écrans :**
- Users List · User Detail · Roles & Permissions · MFA Settings

**Features clés :**
- 4 rôles RBAC
- MFA obligatoire admins
- Audit trail personnel
- SSO entreprise (futur)

### 12.8 Module 8 — Audit & Compliance

**Description :** Traçabilité complète immuable.
**Écrans :**
- Audit Log Viewer · Replay Engine · Lineage Viewer · Compliance Reports

**Features clés :**
- Audit log chaîné append-only
- Replay 10 ans garanti
- Lineage 4 couches IA
- Export preuves auditeurs

### 12.9 Module 9 — AI Model Registry

**Description :** Gouvernance modèles IA (CTO only).
**Écrans :**
- Model Registry · Prompts Registry · Golden Test Suite · Red Team Results

**Features clés :**
- 4-stage promotion (research → canary → prod)
- Golden tests automatiques
- Red team hallucination
- Versioning prompts

### 12.10 Module 10 — Settings

**Description :** Préférences personnelles.
**Écrans :**
- Profile · Notifications · Language · Keyboard Shortcuts

**Features clés :**
- Profil avec avatar
- Notifications granulaires
- Multi-langue RTL pour AR
- Raccourcis clavier

---

## 13. USER JOURNEYS CLÉS

### 13.1 Journey 1 — Validation Quotidienne (Compliance Officer)

```
[1] Dashboard · Home Dashboard
    → Consulte alertes du jour
    
[2] Workspace · Upload Zone
    → Sélectionne annexe 484 + date J-1
    
[3] Workspace · Split View Validation
    → Upload XML + lance validation
    
[4] Workspace · Structure Check (si KO)
    → Corrige selon suggestions précises
    
[5] Reports · Report Detail
    → Examine rapport 10 sections
    
[6] Reports · Calculation Proof (si erreurs)
    → Vérifie preuve calculs
    
[7] Reports · Export Center
    → Exporte PDF signé pour archivage
```

### 13.2 Journey 2 — Ajout Règle Mode Copilot (Compliance Officer)

```
[1] Rules · Rules Explorer
    → Clic "Nouvelle règle"
    
[2] Rules · Mode Copilot
    → Dialogue guidé avec IA
    → Construction progressive AST
    
[3] Rules · Proposed Rules
    → Règle en attente validation
    
[4] Rules · Rule Detail
    → Co-signature 4-yeux avec owner
    → Silent Guardian tests invisibles
    
[5] Audit · Audit Log Viewer
    → Vérifie entry audit créée
```

### 13.3 Journey 3 — Learning par Lot (Admin) — DIFFÉRENCIATEUR

```
[1] Knowledge · Circulaires BCT
    → Upload PDF nouvelle circulaire BCT-2026-03
    
[2] Rules · Mode Learning
    → RuleLearnerAgent propose 23 règles candidates
    → Chaque règle avec score confiance + citation
    
[3] Rules · Proposed Rules
    → Batch review tableau
    → Multi-select accept (Shift+Click)
    
[4] Rules · Rule Detail
    → Signature 4-yeux batch
    
[5] AI Registry · Golden Test Suite
    → Silent Guardian teste toutes en parallèle
    
[6] Rules · Rules Explorer
    → 23 règles activées
    → Notification à compliance officers tenants
```

### 13.4 Journey 4 — Audit Externe BCT (Auditor)

```
[1] Audit · Audit Log Viewer
    → Consulte logs période auditée
    
[2] Audit · Replay Engine
    → Replay validation Q1 2026
    → Bit-identique au résultat original
    
[3] Audit · Lineage Viewer
    → Vérifie lineage IA
    → Modèle + prompt + règles + KB de l'époque
    
[4] Reports · Report Detail
    → Examine rapports historiques immuables
    
[5] Audit · Compliance Reports
    → Export preuves pour audit BCT
    → Format PDF/A-3 signé archive légale
```

---

## 14. DESIGN SYSTEM APPLE VISION PRO GLASSMORPHISM

### 14.1 Philosophie

REGALICA adopte l'esthétique **Apple Vision Pro** avec un design **glassmorphism épuré** sur fond blanc. Interface minimaliste, élégante, professionnelle — reflétant la précision attendue d'une plateforme de conformité bancaire.

**Principes directeurs :**
- **Clarté** : Information hiérarchisée, lisibilité maximale
- **Élégance** : Sophistication sans surcharge
- **Confiance** : Professionnalisme inspirant la confiance
- **Fluidité** : Transitions douces, interactions naturelles
- **Accessibilité** : Contraste optimal, WCAG AA

### 14.2 Palette de Couleurs

```css
/* Backgrounds */
--bg-primary: #FFFFFF;
--bg-secondary: #FAFAFA;
--bg-tertiary: #F5F5F7;

/* Glassmorphism */
--bg-glass: rgba(255, 255, 255, 0.72);
--bg-glass-hover: rgba(255, 255, 255, 0.85);

/* Text */
--text-primary: #1D1D1F;    /* Titres, texte principal */
--text-secondary: #86868B;  /* Labels */
--text-tertiary: #AEAEB2;   /* Placeholders */

/* Status */
--status-success: #34C759;  /* OK */
--status-error: #FF3B30;    /* SEVERE */
--status-warning: #FF9500;  /* ROUNDING */
--status-info: #007AFF;     /* Information */

/* Glass Effects */
--glass-blur: 20px;
--glass-saturation: 180%;
```

### 14.3 Typographie

- **Primary :** SF Pro Display / Inter
- **Monospace :** SF Mono / JetBrains Mono
- **Arabic :** SF Arabic / Noto Sans Arabic
- **Échelle modulaire** ratio 1.25 (12px → 60px)

### 14.4 Composants Clés

**Primitives :**
- GlassCard (variants: default, flat, elevated, interactive)
- Button (primary, secondary, ghost, outline, danger, success)
- Input, Select, Textarea, Checkbox, Switch
- Badge avec status variants
- Modal (sm/md/lg/xl/full)
- Toast (success/error/warning/info)
- Table sortable/filterable/paginated

**Métier :**
- ConformityGauge (cercle animé)
- RuleASTViewer (arbre AST)
- RuleFormulaBuilder (éditeur visuel DSL)
- ValidationSummary (stats + gauge)
- UploadZone (drag-drop XML)
- ChatMessage + TypingIndicator
- CalculationProofCard
- InterAnnexeHeatmap
- AgentPipelineStatus

---

# PARTIE IV — LOGIQUE MÉTIER BCT

## 15. LES 4 611 RÈGLES BCT — TAXONOMIE RÉELLE

### 15.1 Distribution par Opérateur (mesurée, pas hypothétique)

La v1.0 proposait une taxonomie en 6 types (INTRA / INTER / CALCULATED / CONSISTENCY / FORMAT / THRESHOLD). **Cette taxonomie n'existe pas dans les données.** Le RDG ne porte qu'un seul axe de classification natif (`TYPE_CTRL` à 2 valeurs), plus la sémantique portée par `OPER_REGLE`. Distribution réelle :

| Opérateur | Règles | % | Sens métier |
|---|---|---|---|
| `=` | ≈ 4 100 | 93,0 % | Égalité comptable stricte (ex : `Total Actif = Σ postes`) |
| `>=` | 287 | 6,2 % | Seuil prudentiel plancher (ex : LCR ≥ 100 %) |
| `SUM` | 404 | 2,2 % | Cohérence d'agrégation (équivalent à `=` en pratique) |
| `MAX` | 33 | 0,7 % | Borne supérieure (ex : `Exigence = MAX(x, 0)`) |
| `MIN` | 31 | 0,7 % | Borne inférieure (ex : `Ratio = MIN(HQLA, plafond)`) |
| `>` | 24 | 0,5 % | Inégalité stricte |
| `<=` | 14 | 0,3 % | Seuil prudentiel plafond |
| `VA` | 5 | 0,1 % | Valeur absolue (sémantique à confirmer) |

### 15.2 Distribution par Domaine BCT

| Domaine | Règles | Part |
|---|---|---|
| SD 1 — Risque de crédit | 1 109 | 24 % |
| SD 5 — Respect des Normes Légales et Prudentielles | 979 | 21 % |
| 1 — Reporting comptable | 945 | 20 % |
| SD 2 — Risque de liquidité | 457 | 10 % |
| 2 — Statistiques monétaires et financières | 435 | 9 % |
| 6 — Reporting d'ordre général | 248 | 5 % |
| 4 — Reporting consolidé | 144 | 3 % |
| SD 3 — Risque de taux | 127 | 3 % |
| SD 1 — Gouvernance | 127 | 3 % |
| SD 4 — Risque opérationnel | 28 | < 1 % |
| SD 5 — LBA / FT | 12 | < 1 % |

### 15.3 Top Annexes par Volume de Règles

Les 10 annexes les plus « denses » — à prioriser pour le MVP et les tests :

| Rang | Annexe | Règles | Code |
|---|---|---|---|
| 1 | Situation Mensuelle Comptable — Bilan | 614 | 00 |
| 2 | Tableau 3 — Risque de crédit | 574 | 132 |
| 3 | État Nominatif Eval Actifs et Couverture des Risques | 528 | 480 |
| 4 | Ventilation Engagements par Classe & Secteur | 352 | 482 |
| 5 | Ventilation Ressources Collectées par Secteur Institutionnel | 339 | 630 |
| 6 | Situation Mensuelle Comptable — Hors Bilan | 256 | 01 |
| 7 | Renseignements sur l'Activité de Leasing | 202 | 740 |
| 8 | Tableau 6-2 — Exigences FP Risque Général de Taux | 132 | 137 |
| 9 | Ventilation Actifs/Passifs Dinar par Durée Résiduelle | 128 | 510 |
| 10 | Ventilation Actifs/Passifs Dinar Taux & Durée | 127 | 910 |

### 15.4 Sévérités (Zero Tolerance + Taxonomie SKIPPED)

| Sévérité | Sémantique | Action utilisateur |
|---|---|---|
| **SEVERE** | Violation réglementaire avérée (`FAIL` d'une règle) | Correction XML obligatoire avant envoi BCT |
| **SKIPPED_MISSING_RUBRIQUE** | Règle référence une rubrique absente du XML | Confirmer non-déclaration légitime |
| **SKIPPED_MISSING_ANNEXE** | Règle référence une annexe hors batch uploadé | Optionnel : uploader rapport croisé pour audit complet |
| **SKIPPED_CONDITIONAL** | Règle à `ZONE_TEXTE` (IF/THEN non formalisé) | Attendre formalisation RuleLearner + validation |
| **SKIPPED_UNSUPPORTED_OP** | Opérateur `MAX`/`MIN`/`VA` non encore implémenté | Validation manuelle en attendant sémantique confirmée |

Conformément à D1.1/D1.2/D1.3, **il n'y a plus de niveau « ROUNDING »**. Tout écart non nul = SEVERE.

### 15.5 Anatomie d'une Règle en Base — Cas Concret du RDG

**Exemple 1 — Égalité intra-annexe (cas majoritaire) :**

```yaml
# Règle "Situation Mensuelle Comptable-Bilan" / num 1
# Vérifie que la colonne 8 (total) = colonne 5 (net) pour la rubrique AC050100000000
rule:
  annexe_code: "00"
  num_regle: 1
  oper_regle: "="
  type_ctrl: "intra_ax"
  domaine: "1- REPORTING COMPTABLE"
  terms:
    - rang: 1                                    # LHS
      num_seq: 1
      term_op: "+"
      kind: "cell_ref"
      ax_origine: "00"
      rubrique_code: "AC050100000000"
      colonne: "8"
    - rang: 2                                    # RHS
      num_seq: 1
      term_op: "+"
      kind: "cell_ref"
      ax_origine: "00"
      rubrique_code: "AC050100000000"
      colonne: "5"
```

**Exemple 2 — Égalité cross-annexe avec littéraux :**

```yaml
# Règle "Ratio de Liquidité (circulaire 2014-14)" / num 90
# Ratio = (E99 / E03) * 100, plafonné à 75 %
rule:
  annexe_code: "47"
  num_regle: 90
  oper_regle: "MIN"
  type_ctrl: "intra_ax"
  domaine: "SD 2- RISQUE DE LIQUIDITE"
  terms:
    - {rang: 1, num_seq: 1, term_op: "+", kind: "cell_ref",
       ax_origine: "47", rubrique_code: "E99000000", colonne: "2"}
    - {rang: 2, num_seq: 1, term_op: "+", kind: "cell_ref",
       ax_origine: "47", rubrique_code: "E03990000", colonne: "2"}
    - {rang: 3, num_seq: 1, term_op: "+", kind: "cell_ref",
       ax_origine: "47", rubrique_code: "S99000000", colonne: "2"}
    - {rang: 3, num_seq: 2, term_op: "*", kind: "literal", literal_value: 75}
    - {rang: 3, num_seq: 3, term_op: "/", kind: "literal", literal_value: 100}
```

**Exemple 3 — Règle conditionnelle (208 cas, non encore formalisables en AST strict) :**

```yaml
rule:
  annexe_code: "51"                              # Etat de Résultat
  num_regle: 7
  oper_regle: "="
  zone_texte: >
    Si la Σ de PR311 + PR312 + PR313 - CH311 > 0
    alors PR31 = PR311 + PR312 + PR313 - CH311 et CH31 = 0
  is_formalized: false                           # nécessite RuleLearnerAgent
  terms: [...]                                   # terms partiellement renseignés
```

---

## 16. CYCLE DE VIE NO-CODE DES RÈGLES

### 16.1 Principe : "Rules as Data, Never as Code"

Une règle ne s'écrit jamais en TypeScript. Elle naît, évolue, et meurt comme ligne de base de données.

### 16.2 CREATE — Deux Voies d'Entrée

**Voie A — Import Massif (XLSX) :**
- Pour les 4,611 règles initiales
- Parser + compiler AST + validation humaine
- Signature 4-yeux par batch

**Voie B — Apprentissage Continu :**
- Nouvelle circulaire BCT détectée
- RuleLearnerAgent extrait règles candidates
- Dashboard review + validation humaine
- Activation avec signature 4-yeux

### 16.3 UPDATE — Évolution Réglementaire

```
BCT amende une circulaire
  ↓
DiffAnalyzerAgent : détecte articles modifiés
  ↓
RuleLearnerAgent : propose updates par règle impactée
  ↓
Impact assessment : combien de rapports affectés ?
  ↓
Validation 4-yeux + publication versionnée
  ↓
rules.version incrémenté (entrée rules_history)
```

**Règle d'or :** `rules.version` jamais écrasée. Un rapport validé il y a 6 mois reste rejouable avec ses règles d'époque.

### 16.4 DEPRECATE — Retrait Gouverné

```
ACTIVE → DEPRECATED → ARCHIVED
```

Les règles ne sont **jamais supprimées**. 10 ans de conservation minimum.

### 16.5 Matrice RACI

| Activité | Agent IA | Compliance Officer | Owner | Auditor |
|---|---|---|---|---|
| Parser circulaire PDF | **R** | C | I | — |
| Proposer règle | **R** | A | I | — |
| Valider sémantique | C | **R** | A | I |
| Tester golden set | **R** | C | I | — |
| Activer (signer) | C | **R** | **A** | I |
| Déprécier | **R** | A | **R** | I |
| Auditer lineage | I | C | C | **R/A** |

---

## 17. RAPPORT DE VALIDATION WORLD-CLASS

### 17.1 Structure Canonique — 10 Sections Fixes

**Section 1 — Page de Garde**
- Titre, entité, annexe, dates, validation ID, fingerprint XML, signature

**Section 2 — Résumé Exécutif (1 page)**
- Gauge conformité + verdict + 3 chiffres clés + 3 actions prioritaires

**Section 3 — Dashboard Visuel**
- Bar chart erreurs par domaine
- Donut par sévérité
- Heatmap inter-annexes
- Timeline 6 derniers reportings

**Section 4 — Résultats Intra-Annexe**
- Tableau règles avec Expected/Calculated/Gap/Statut/Source
- Chaque ligne cliquable → preuve calcul

**Section 5 — Preuves de Calcul (erreurs)**
- Formule + résolution XML + calcul Decimal.js + verdict
- Reproductible via hash calcul

**Section 6 — Résultats Inter-Annexes**
- Matrice croisements entre annexes
- Détail par règle inter

**Section 7 — Investigation Deep-Dive**
- Analyse causale 5 couches
- Hypothèses classées par probabilité

**Section 8 — Recommandations & Plan d'Action**
- Format SMART par erreur
- Responsable, échéance, effort, risque

**Section 9 — Prédictions**
- Probabilité non-conformité prochain reporting
- Règles à risque identifiées

**Section 10 — Annexes Techniques**
- Audit trail complet
- Versions règles utilisées
- Hash XML source
- Signature numérique PDF/A-3

### 17.2 Sections Conditionnelles (2)

**Section 3 bis — Rapport Structure** (si structure KO à une étape)
- Historique versions uploadées
- Suggestions réparation par tentative
- Temps total de résolution

**Section 6 bis — Règles Concurrentes** (si D4.1 détecte conflits)
- Paires règles conflictuelles
- Verdicts respectifs
- Recommandation désambiguïsation

### 17.3 Règles d'Or du Rapport

1. **Structure fixe** — 10 sections identiques systématiquement
2. **Aucun chiffre orphelin** — tout chiffre a une preuve cliquable
3. **Aucune phrase IA non sourcée** — citation obligatoire
4. **Reproductibilité** — bit-identique 10 ans
5. **Signature numérique** — PDF/A-3 avec horodatage
6. **Multi-format export** — PDF + XLSX + JSON

---

## 18. FRAMEWORK D'INVESTIGATION DEEP-DIVE

### 18.1 Philosophie : "From Symptom to Action"

Trouver qu'une règle échoue ne suffit pas. Le rapport répond à :
- **Quoi ?** Nature exacte de l'anomalie
- **Où ?** Localisation précise dans le XML
- **Pourquoi ?** Cause racine probable (avec probabilité)
- **Quand ?** Première occurrence, récurrence ?
- **Comment corriger ?** Étapes exécutables
- **Comment prévenir ?** Changement processus

### 18.2 Analyse Causale en 5 Couches

**Couche 1 — Localisation Précise**
- XPath exact dans XML
- Numéro ligne/colonne
- Contexte surrounding

**Couche 2 — Nature Anomalie**
- Type (sum_mismatch, threshold_breach, ref_missing...)
- Magnitude absolue et relative
- Matérialité (low/medium/high)

**Couche 3 — Hypothèses Causales (Classées)**
- 3-5 hypothèses avec probabilité
- Evidence pour chaque
- Verification query SQL

**Couche 4 — Contexte Historique**
- Première occurrence
- Récurrence count
- Pattern saisonnier détecté ?

**Couche 5 — Impact & Cascading**
- Cascade autres règles
- Regulatory exposure
- Business exposure

### 18.3 Template Guidance Résolution

```markdown
## Comment corriger cette erreur ?

### Hypothèse la plus probable (65%)
[Description courte et claire]

### Étapes de vérification (5-10 min)
☐ Étape 1 : ...
☐ Étape 2 : ...

### Étapes de correction (15-30 min)
☐ Étape 1 : ...
☐ Étape 2 : ...

### À qui demander de l'aide ?
- [Direction/équipe]
- [Contact]

### Comment prévenir à l'avenir ?
- [Recommandation processus]
```

---

# PARTIE V — EXÉCUTION

## 19. MIGRATION DEPUIS L'EXISTANT

### 19.1 État de l'Existant (75% production-ready)

La codebase actuelle est fonctionnelle mais nécessite des évolutions majeures :

**À conserver (bon existant) :**
- Next.js 14 + TypeScript strict
- Drizzle ORM (migrer vers Postgres)
- Tailwind CSS 3.4
- 19 routes API de base
- Structure auditlog
- fast-xml-parser

**À refaire (critiques) :**
- MySQL → Postgres/Supabase (pgvector, RLS)
- JWT artisanal → Supabase Auth (MFA natif)
- `/public/rdg_rules.json` → table `rules` versionnée
- Gemini → Claude API
- `safeEval()` regex → RuleInterpreter AST
- localStorage auth → httpOnly cookies
- Composants inline → packages/ui
- 0 tests → suite complète

**À ajouter (nouveaux) :**
- 3 nouveaux agents IA (Structure, Schema, Silent Guardian)
- Tables BCT (categories, rubriques, columns, cells)
- DSL AST cellulaire
- Tenant hiérarchique
- Data dictionary
- Versioning uploads
- Design system complet
- Observabilité Pino + Sentry

### 19.2 Stratégie Non-Disruptive

Migration **progressive sans big-bang**. L'application existante continue de fonctionner pendant que les couches sont refondues.

---

## 20. ROADMAP 16 SEMAINES

### Phase 0 — Fondations (Semaines 1-2)
- Provisioning Supabase (dev/staging/prod)
- Setup monorepo Turbo
- Extraction services existants dans `packages/legacy-services/`
- CI/CD GitHub Actions
- Sentry + Logflare + Better Stack
- ADR #001 + #002

**Livrable :** Infrastructure prête, app existante migrée sans régression.

### Phase 1 — Migration Backend (Semaines 3-5)
- Schéma Drizzle Postgres complet (20+ tables)
- Migrations SQL versionnées
- RLS 100% tables
- Script migration MySQL → Postgres
- JWT → Supabase Auth
- Parsers multi-format (XML, PDF, XLSX, DOCX, PPTX)
- **StructureValidatorAgent** (nouveau prioritaire)
- Versionning uploads
- **SchemaInferencerAgent** (nouveau)
- Import initial 4,611 règles XLSX

**Livrable :** Upload XML → validation structure + stockage KB.

### Phase 2 — Moteur de Validation (Semaines 6-8)
- DSL AST étendu (D3.5 : IF/THEN, ensembles, pondérations, buckets)
- IntraValidator + InterValidator + Calculator
- Résolution hiérarchique règles (D4.2)
- Détection conflits (D4.1)
- Clef composite rattachement (D2.5)

**Livrable :** Validation complète XML avec règles intra + inter.

### Phase 3 — IA & Rapports (Semaines 9-11)
- OrchestratorAgent + state machine
- InvestigatorAgent avec cutoff analysis
- Guardrails zero-hallucination
- ReporterAgent + 10 sections canoniques
- Export PDF/A-3 signé
- UI Workspace split-view

**Livrable :** Rapport world-class disponible.

### Phase 4 — Mode Copilot MVP (Semaines 12-13)
- Interface conversationnelle création règles
- **SilentGuardianAgent** (nouveau)
- Test rétroactif sur dernier conforme
- UI entities hiérarchiques

**Livrable :** Création de règles conversationnelle fonctionnelle.

### Phase 5 — Différenciateur Learning (Semaine 14)
- RuleLearnerAgent avancé
- Parser PDF circulaires BCT
- UI batch review tableau
- Signature 4-yeux par lot

**Livrable :** Ajout de 23 règles depuis circulaire en < 30 min.

### Phase 6 — Hardening & GA (Semaines 15-16)
- Mode Expert (formulaire dense)
- Suite complète Vitest (coverage > 80%)
- Suite Playwright E2E (5 user journeys)
- Red-team adversarial tests
- Rate limiting Upstash réel
- Pen testing externe
- Load testing k6 (1000 validations/h)
- Documentation complète
- Formation équipe
- Go-live production

**Livrable :** Version 1.0 production-ready pour FONGIP + QNB.

---

## 21. MATRICE DE RISQUES

| # | Risque | Probabilité | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Hallucination LLM chiffre critique | Moyen | Critique | Guardrail + Decimal.js + red-team | CTO |
| R2 | Fuite données bancaires | Faible | Critique | RLS + chiffrement + audit + pen test | CISO |
| R3 | BCT change format XML sans préavis | Moyen | Élevé | Schema versionning + no-code learner | Product |
| R4 | Latence validation > 10s | Faible | Moyen | Caching + parallélisation + index | Lead Eng |
| R5 | Vendor lock-in Supabase | Faible | Moyen | Postgres vanilla + abstraction layer | Architect |
| R6 | Coûts LLM explosent | Moyen | Moyen | Budget per-tenant + cache + Haiku fallback | Finance |
| R7 | Adoption utilisateur faible | Moyen | Élevé | UX tests + onboarding + design glass | CPO |
| R8 | Dépendance API Anthropic | Faible | Élevé | Abstraction multi-model + fallback | Architect |

---

## 22. MÉTRIQUES DE SUCCÈS

### 22.1 Produit (North Star)

**Métrique primaire :** `nb_anomalies_BCT_détectées_avant_dépôt_par_tenant_par_mois`

**Métriques secondaires :**
- Taux d'adoption hebdomadaire (WAU/MAU) > 70%
- Temps moyen validation rapport < 3s
- NPS tenant > 60
- Churn mensuel < 2%

### 22.2 Technique

- Availability : > 99.95%
- **Hallucination rate : 0%**
- **Golden suite pass rate : 100%**
- P95 latency validation : < 3s
- Coverage tests : > 80%
- **Zero-hardcoding violations : 0**
- Failed deployments : < 2%

### 22.3 Business

- MRR par tenant Enterprise : > 10k€
- CAC / LTV : > 1:5
- Temps onboarding premier rapport validé : < 30 min
- Temps ajout nouvelle circulaire BCT : < 2h

---

## 23. PROMPT D'AMORÇAGE CLAUDE CODE

À coller au démarrage du projet dans Claude Code :

```
Tu es Senior Principal Engineer sur Regalica IDC, plateforme SaaS
multi-tenant de conformité réglementaire BCT à tolérance zéro.

CONTEXTE :
Une codebase Next.js 14 + MySQL existe déjà à ~75% production-ready.
Tu vas la FAIRE ÉVOLUER vers la vision world-class décrite dans
docs/architecture/00-master-document.md (ce document).

NE PAS REPARTIR DE ZÉRO. Conserver ce qui fonctionne, refondre ce
qui ne correspond pas, ajouter ce qui manque.

RÉFÉRENCES OBLIGATOIRES :
- Document maître consolidé (ce document)
- Section Partie II : architecture technique
- Section Partie III : architecture produit
- Section Partie IV : logique métier BCT
- Section Partie V : roadmap migration

PRINCIPES INVIOLABLES (7 piliers) :

1. ZERO TOLERANCE — tout écart non nul = SEVERE
2. ZERO HARDCODING — règles en DB, prompts en DB, rubriques en DB
3. ZERO HALLUCINATION — LLM jamais pour calculs, citations obligatoires
4. SUGGEST DON'T REPAIR — versionning uploads, humain responsable
5. SILENT GUARDIAN — tests techniques invisibles après 4-yeux
6. IMMUTABLE HISTORY — rapports figés aux règles de leur époque
7. HIERARCHICAL TENANCY — maison-mère + filiales avec héritage

STACK CIBLE :
- Next.js 14 App Router + TS strict (conservé)
- Supabase Postgres 15 + pgvector + Edge Functions + RLS
  → migration depuis MySQL
- Drizzle ORM (conservé, adapté Postgres)
- Claude API (Opus 4.7 + Sonnet 4.6)
  → migration depuis Gemini
- Tailwind + shadcn/ui (conservé, enrichi)
- Zustand + TanStack Query
- Zod partout (étendu depuis usage minimal existant)

CONVENTIONS :
- Conventional Commits
- Fichiers < 300 lignes
- TDD : types d'abord, tests ensuite, implémentation en dernier
- Aucun any, aucun @ts-ignore sans justification
- i18n systématique (fr/ar/en)
- Logs Pino structurés, jamais console.*

ANTI-PATTERNS À ÉLIMINER DE L'EXISTANT :
- /public/rdg_rules.json (tout en DB)
- localStorage pour auth (httpOnly cookies)
- safeEval regex (RuleInterpreter AST)
- console.log (Pino)
- Pagination mémoire (cursor DB)
- Composants inline dans pages (packages/ui)
- SmartValidation limite 100 (parallélisation propre)

WORKFLOW D'ÉVOLUTION :
1. Avant chaque changement : lire docs/architecture/
2. Proposer un plan en markdown avant de coder
3. Tests d'abord, code ensuite
4. Mettre à jour docs/adr/ pour décisions non triviales

STRUCTURE MONOREPO : voir section Partie V du document maître.

Phase actuelle : [Phase 0 ou à définir au démarrage]
```

---

# ANNEXES

## Annexe A — Glossaire BCT

| Terme | Définition |
|---|---|
| **Annexe** | Rapport réglementaire BCT (ex: 484, 620, 501) |
| **Circulaire** | Document source BCT définissant les règles |
| **Intra-annexe** | Contrôle à l'intérieur d'un seul rapport |
| **Inter-annexes** | Contrôle de cohérence entre plusieurs rapports |
| **DSL** | Domain Specific Language (ici AST JSON des règles) |
| **AST** | Abstract Syntax Tree (représentation arborescente) |
| **HQLA** | High Quality Liquid Assets |
| **LCR** | Liquidity Coverage Ratio |
| **NSFR** | Net Stable Funding Ratio |
| **Tier 1** | Capital Tier 1 (Bâle III) |
| **RLS** | Row-Level Security (isolation tenant) |
| **SEVERE/ROUNDING** | Sévérités des non-conformités |
| **4-yeux** | Principe dual control (2 signatures obligatoires) |
| **AST** | Arbre syntaxique abstrait (DSL des règles) |
| **RAG** | Retrieval Augmented Generation |
| **MFA** | Multi-Factor Authentication |
| **RBAC** | Role-Based Access Control |

## Annexe B — Références Réglementaires

- **Circulaires BCT** : 2018-06, 2019-03, 2021-14, 2014-14
- **Basel III Framework** (Basel Committee on Banking Supervision)
- **IFRS** (International Financial Reporting Standards)
- **ISO 27001 / SOC2 Type II** (sécurité information)
- **OWASP Top 10** (2021)
- **NIST SP 800-53** (contrôles sécurité)
- **GDPR / Loi tunisienne protection données personnelles**

## Annexe C — Check-lists Pré-démarrage

### Check-list Technique

- [ ] Repo GitHub `regalica_idc` à jour sur main
- [ ] Branche `claude/blueprint-v3-migration` créée
- [ ] Document maître sauvé dans `docs/architecture/00-master-document.md`
- [ ] Supabase projet provisionné (dev + staging)
- [ ] Clés API dans Vault : Anthropic + Supabase + Sentry
- [ ] XLSX des 4,611 règles dans `tests/fixtures/rdg.xlsx`
- [ ] 5-10 XML BCT référence dans `tests/golden/`
- [ ] XSD BCT disponibles si possible

### Check-list Business

- [ ] Compliance officer désigné pour validation règles IA
- [ ] Tenant test (ex: QNB Tunisia sandbox) avec données anonymisées
- [ ] Golden set défini : 20-50 rapports historiques avec verdict connu
- [ ] Budget Anthropic API validé
- [ ] Sprint planning Phase 0-1 préparé
- [ ] Communication interne sur démarrage projet

### Check-list Sécurité

- [ ] RLS activé 100% tables avant toute donnée sensible
- [ ] MFA obligatoire admins + compliance officers
- [ ] Secrets rotation trimestrielle planifiée
- [ ] Audit log immuable testé (append-only effectif)
- [ ] Backup + restore drill validé
- [ ] Pen testing externe planifié avant GA

---


---

## 📝 CHANGELOG v1.0 → v1.1

**Contexte :** la v1.0 avait été rédigée avant l'analyse fine du RDG. La v1.1 calibre le document sur la réalité des données après exécution d'un audit complet sur 4 611 règles × 4 XML BCT 2024-03-31 réels. Aucune modification de vision ni de stratégie ; corrections purement techniques et ajout de preuves.

### Modifications factuelles

| Section | Avant (v1.0) | Après (v1.1, mesuré) |
|---|---|---|
| Annexes actives | « ~33 » | **52** |
| Rubriques distinctes | « 2 000 à 5 000 » | **1 247** dans les règles (plus via XSD) |
| Taxonomie règles | 6 types (INTRA / INTER / CALC / CONSIST / FORMAT / THRESH) | **Taxonomie fictive supprimée** — remplacée par la distribution `OPER_REGLE` réelle (9 opérateurs, `=` dominant à 93 %) |
| Dimensions cellule | 5 | **6** (ajout du `rang` dans l'équation) |
| Code rubrique | « 14 caractères » | **14 caractères majoritaire, mais 1-9 chars pour codes courts et littéraux** |
| Table terms | `rule_cells` | **`rule_terms`** (avec `rang`, `num_seq`, `kind` explicite literal vs cell_ref) |
| Règles avec ZONE_TEXTE conditionnelles | non mentionné | **208 (4,5 %) identifiées, à passer au RuleLearner** |
| Décimal | « 28 digits » | **38 digits** (marge de sécurité au-delà du minimum du Pilier 3) |

### Sections ajoutées

- **§8.5 Format XML BCT** — spécification exacte observée sur 4 XMLs réels
- **§8.6 Points Sémantiques Non-Triviaux** — 4 subtilités de données que l'Ingestor doit encoder
- **§9.4 Algorithme d'Évaluation** — spec implémentable en 5 phases (a produit les résultats de l'audit)
- **§9.5 Catégorisation des Verdicts** — 5 catégories exposées à l'utilisateur (pas de SKIPPED silencieux)
- **§9.6 Preuve de Concept** — résultats chiffrés sur reporting réel 2024-03-31

### Ce qui n'a pas bougé

- Vision, stratégie, positionnement, marché, pricing
- Les 7 Piliers Inviolables (inchangés — ils tiennent)
- Les 16 Décisions CEO
- Architecture 5 couches, les 13 Agents, Design System
- Personas, Modules, User Journeys
- Roadmap 16 semaines, matrice de risques, métriques
- Annexes (glossaire, références, checklists)


# GOUVERNANCE DU DOCUMENT

## Règles de modification

- Toute évolution majeure → ADR (Architecture Decision Record) dans `/docs/adr/`
- Version incrémentée (v1.1, v1.2...)
- Approbation CEO obligatoire pour changements de stack ou principes inviolables

## Fréquence de revue

- **Weekly** : progression roadmap (équipe tech)
- **Monthly** : métriques KPI (CEO + CTO)
- **Quarterly** : alignement vision / exécution (board)

---

# SIGNATURES

**Produit conjointement par :**

**Wissem Barouni**
CEO & Co-Founder ALGORIA Factory
Head of Financial & Regulatory Reporting, QNB Tunisia
Avril 2026

**Senior Principal Engineer** (Consultant Architecture)
Avril 2026

---

## 🎯 INSTRUCTIONS FINALES POUR EXPORT DOCX

**Méthode 1 — Via Google Docs (RECOMMANDÉE, 2 min)**
1. Ouvrir docs.google.com → Nouveau document vide
2. Copier TOUT le contenu ci-dessus
3. Coller dans le document
4. Menu Insertion → Table des matières → Automatique
5. Fichier → Télécharger → Microsoft Word (.docx)

**Méthode 2 — Via Microsoft Word**
1. Ouvrir Word → Nouveau document
2. Coller le contenu
3. Appliquer styles :
   - `#` → Titre 1
   - `##` → Titre 2
   - `###` → Titre 3
4. Insertion → Table des matières
5. Enregistrer sous `.docx`

**Méthode 3 — Via Gamma (PRÉSENTATION + DOCX)**
1. Aller sur gamma.app
2. "Create new" → "Import from text"
3. Coller le contenu
4. Gamma génère présentation + export DOCX/PDF possible

**Méthode 4 — Via Notion**
1. Nouvelle page Notion
2. Coller le Markdown (conversion auto)
3. Menu ... → Export → Markdown & CSV OU PDF OU HTML

**Méthode 5 — Via Pandoc (ligne de commande, pour devs)**
```bash
pandoc -o regalica_idc_master.docx input.md \
  --toc --number-sections \
  --highlight-style=tango
```

---

**FIN DU DOCUMENT MAÎTRE CONSOLIDÉ**

*Ce document est vivant. Dernière mise à jour : Avril 2026. Version 1.0.*

*Pour toute question : wissem@algoria-factory.com*
