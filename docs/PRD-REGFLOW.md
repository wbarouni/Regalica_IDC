# REGFlow — PRD consolidé pour Claude Code

**Version :** 1.0
**Date :** avril 2026
**Destinataire :** Claude Code (agent de développement)
**Format :** brief exécutif de première lecture
**Statut :** porte d'entrée unique, référence les Documents 1 à 10 et les 5 livrables

---

## Comment consommer ce document

Claude Code, ce PRD est ton premier point d'ancrage sur le projet REGFlow. Tu le lis avant tout autre document. Il te donne la vue d'ensemble, les invariants, les documents de référence, et la roadmap des 6 phases.

**Après cette première lecture**, tu te plonges dans les documents thématiques selon le sprint en cours :

| Sprint | Documents à consulter en priorité |
|---|---|
| Phase 0 | `PHASE-0-PLAN.md`, `07-PLAN-GOLDEN-BASELINE-v2.md` |
| Phase 1 | `06-SCHEMA-SQL-COMPLET.md`, `08-STATE-MACHINES-WORKFLOW.md` |
| Phase 2 | `docs/as-is-captured/evaluator-algorithm.md`, Livrables 3 et 4 |
| Phase 3 | `06-SCHEMA-SQL-COMPLET.md`, `08-STATE-MACHINES-WORKFLOW.md` |
| Phase 4 | `09-CONTRATS-JSON-AGENTS.md`, `10-ORCHESTRATION-REGALICA.md`, `05-AGENTS-ET-PROMPTS-BANK.md` |
| Phase 5 | maquettes Workspace v5 / Library v3 / Filings, `Regalica_Brand_Book_Edition_One.pdf` |
| Phase 6 | ce PRD section 9 sur durcissement production |

---

## 1. Ce qu'est REGFlow en une phrase

REGFlow est une **plateforme IA on-premises de conformité BCT** pour les banques tunisiennes résidentes, qui applique localement les 4 611 règles du référentiel RDG sur les reportings XML **avant leur soumission** au SED de la Banque Centrale de Tunisie, afin d'éliminer l'exposition juridique liée au délai asynchrone du contrôle BCT.

---

## 2. Acteur, contexte, promesse

**Acteur primaire.** Compliance Officer en banque tunisienne résidente (formation comptable/financière, direction Conformité ou Risques). Usage quotidien, parfois plusieurs heures par jour en clôture. Acheteuse probable : Direction Conformité ou Direction Risques en concertation DSI.

**Contexte.** Le SED BCT est le canal unique de transmission des reportings, avec signature électronique du responsable Reporting (circulaire 2017-06 article 8). La BCT contrôle en trois étapes : structure XSD, contrôles embarqués, contrôles qualité RDG. Le retour BCT est asynchrone (plusieurs jours) et peut produire un rejet avec balise `<Erreur>` listant les règles échouées avec "attendu vs calculé" — mais **sans décomposition ni cause**. Le diagnostic manuel d'un rejet prend plusieurs heures au Compliance Officer. Si la soumission est proche de l'échéance, la banque est exposée à une sanction BCT (circulaire 2017-06 articles 11-12, grille progressive).

**Promesse REGFlow.**

REGFlow s'insère **avant** le SED, jamais en substitution. Il apporte quatre valeurs ajoutées que la BCT ne donne pas :

1. **Détection avant envoi.** Zéro attente, zéro exposition juridique liée au délai.
2. **Preuve de calcul complète.** Décomposition terme par terme, agrégation par rang, verdict PASS/FAIL/SKIP détaillé.
3. **Corrélation entre règles partageant une cause.** Détection de grappes qui seraient 17 FAILs apparents mais une seule correction à faire.
4. **Explication causale actionnable.** Regalica pointe vers l'endroit précis du SI bancaire à corriger, avec citation réglementaire.

**Objectif opérationnel mesurable.** Zéro FAIL sévère avant envoi SED. Chaque FAIL détecté avant soumission est une sanction BCT évitée.

---

## 3. Identité et gouvernance

**Éditeur.** ALGORIA Factory (Tunis). CEO et fondateur : **Wissem Barouni**. Également Head of Financial & Regulatory Reporting chez QNB Tunisia, ce qui garantit la proximité produit-métier.

**Relation avec RegTrack.** REGFlow et RegTrack sont deux applications sœurs d'ALGORIA Factory avec une stack commune. Bases de données séparées, codebases distincts, releases indépendantes. Vente possible séparément. Les évolutions de l'une ne doivent jamais impacter l'autre.

**Tenant primaire pilote.** QNB Tunisia (CodeBanque BCT = 23). Les 58 XML du golden baseline proviennent de cette banque, arrêtés 2021 à 2026.

**Extension géographique naturelle.** Grâce au zéro hardcoding absolu, REGFlow peut s'étendre à d'autres banques tunisiennes immédiatement, puis Maghreb et Afrique francophone en Phase ultérieure via ajout de tenants.

---

## 4. Stack technique gelée

Cette stack est **non négociable**. Toute proposition d'écart est rejetée.

| Couche | Technologie | Rejet(s) associé(s) |
|---|---|---|
| Backend API | Node.js + Express + `pg` natif **SANS ORM** | Sequelize, Prisma, TypeORM, Drizzle |
| Base de données | PostgreSQL 16 + pgvector + extensions standard | Supabase, Firebase |
| Services IA | Python + FastAPI + asyncpg natif **SANS ORM** | SQLAlchemy, Django |
| Frontend | React + Tailwind + Vite | Next.js, Angular, Vue, Nuxt |
| LLM principal | Gemini 2.5 Flash via API Google | Anthropic, OpenAI en prod (seuls Ollama/Qwen en fallback local) |
| LLM fallback | Ollama + Qwen 2.5 3B (Phase 6) | - |
| Embeddings | Gemini text-embedding-004 (dim 768) | - |
| Monorepo | pnpm workspaces | npm workspaces, yarn berry |
| Package manager Python | uv | pip, poetry, pipenv |
| Conteneurisation | Docker + Docker Compose | Podman, rkt |

**Pourquoi pg natif sans ORM.** Performance fine sur les tables volumineuses (`rules` à 4611 entrées × 18452 terms, `audit_log` partitionné, `verdicts` potentiellement millions de lignes). Contrôle précis des requêtes avec support des features PostgreSQL avancées (pgvector, RLS native, triggers, partitioning, UUIDv7). Zéro dette d'abstraction.

**Pourquoi Next.js et Supabase rejetés.** Next.js est un framework applicatif plein qui impose son runtime et ses conventions, incompatible avec la doctrine on-premises stricte exigée par les banques. Supabase est un BaaS cloud qui viole la contrainte on-premises. REGFlow tourne dans le datacenter client, jamais dans un cloud tiers.

---

## 5. Invariants produit non négociables

Ces invariants sont des **contrats de non-régression**. Chaque PR qui les viole doit être refusée quelle que soit sa justification.

1. **Zéro hardcoding.** Toute connaissance métier vit en base (`rules`, `prompt_bank`, `referentials_*`, `referentials_sentinelles`, etc.). Aucun code ne contient de valeur réglementaire BCT en dur.

2. **Moteur produit des verdicts déterministes.** Le test golden sur les 58 XML QNB Tunisia doit produire des totaux exacts à chaque run. Toute divergence après modification du moteur est un bug bloquant le merge.

3. **Règles actives jamais modifiées en place.** Une modification de règle crée une nouvelle version (`valid_to` sur l'ancienne, `valid_from` sur la nouvelle). Traçabilité bitemporelle intégrale via migrations 002-003 du schéma SQL.

4. **Historique `validation_runs` immuable.** Un run terminé ne peut jamais être modifié ni supprimé, sauf la transition contrôlée `is_signed TRUE→FALSE` via procédure stockée `sp_revoke_signature` (Document 8 §13).

5. **Prompts actifs jamais modifiés en place.** Cycle de vie `draft → in_review → active → deprecated` dans `prompt_bank`. Une modification crée une nouvelle version qui passe par 4-yeux.

6. **Performance p95 validation XML standard < 3 secondes.** Mesurée sur un batch typique de 10 annexes. Toute régression au-delà est bloquante.

7. **Stack RegTrack jamais impactée par REGFlow et inversement.** Bases séparées, codebases séparés, pipelines CI séparés.

8. **Zéro-tolérance dette résiduelle.** Pas de `_legacy/`, pas de `TODO: remove`, pas de `.skip()` sans justification datée. Job CI `verify-no-residual-debt` bloque le merge si violé.

9. **Validation 4-yeux systématique.** Toute modification de règle, référentiel ou prompt passe par une demande avec `requested_by_user_id != decided_by_user_id`, appliqué au niveau SQL via check constraint.

10. **Précision Decimal 38 digits ROUND_HALF_EVEN.** Côté TS (`decimal.js`) et côté Python (`decimal.getcontext`). Divergence entre runtimes sur un même calcul = bug.

---

## 6. RDG en 3 paragraphes

Le RDG (Référentiel des Données de Gestion) est le référentiel normatif BCT qui code les contrôles attendus sur les reportings XML des banques.

**Structure.** 4 611 règles × 18 452 terms × 52 annexes × 208 zones de texte × 17 single-term. Unité canonique = règle identifiée par `(AX_TERM, NUM_REGLE)`. `AX_TERM` = annexe porteuse principale. `AX_ORIGINE` = adresse de lecture par term (peut être numérique ou sentinelle C, D1-D6).

**Trois cas pour AX_ORIGINE.**

1. Numérique (annexe) : le term lit une cellule dans une autre annexe.
2. Sentinelle C : constante dans la rubrique elle-même (valeur fixe du RDG).
3. Sentinelles D1-D6 : itération sur rubrique détail (répété par société, membre, instrument).

Une règle est **inter-annexe** dès qu'au moins un `AX_ORIGINE` numérique diffère de `AX_TERM` (environ 5% des règles). `TYPE_CTRL` n'est pas fiable (taux d'erreur ~13%), la classification doit être reconstruite via analyse de `AX_ORIGINE`.

**Importance.** La détection des règles inter-annexes est critique pour la pré-validation T0 (détection des annexes compagnes requises) et pour la détection de grappes de cause racine en T2.

---

## 7. Workflow utilisateur en 4 temps T0/T1/T2/T3

Le workflow traverse 4 temps successifs, chacun gouverné par sa state machine (Document 8).

**T0 — Pré-validation.** L'utilisateur uploade ses XML. REGFlow détecte l'annexe principale, détecte les compagnes requises par dépendance inter-annexe, vérifie la cohérence temporelle. Pré-alertes proactives si quelque chose manque. L'utilisateur clique explicitement "Lancer la validation" pour passer à T1.

**T1 — Validation BCT en 3 étapes.** Le moteur exécute les 3 étapes officielles BCT synchroniquement : structure XSD, contrôles embarqués, contrôles qualité RDG en 5 phases (A/B/D/E). Temps d'exécution p95 < 3 secondes. Production de 3 livrables visibles dans la UI en ordre canonique : synthèse → Livrable C (cause racine) → Livrable A (FAIL) → Livrable B (exhaustif, repliable).

**T2 — Investigation conversationnelle.** L'utilisateur dialogue avec Regalica pour comprendre, itérer, corriger. 7 types de questions supportés (Document 10) : zoom FAIL, grappe, historique, citation, simulation, sanction, plan optimal. Itération jusqu'à zéro FAIL sévère.

**T3 — Analytics capitalisées.** Débloqué uniquement après zéro FAIL sévère. Tendances historiques, statistiques inter-runs, exports, Mode Signature. Archivage automatique après 30 jours d'inactivité, signature conservée 10 ans.

**Ordre canonique imposé.** T0 avant T1 avant T2 avant T3. L'analyse historique (T3) ne peut jamais être exécutée avant une validation RDG complète (T1 terminé). Cette règle est appliquée structurellement au niveau de Regalica et des FSM.

---

## 8. 14 agents IA

Un orchestrateur + 13 spécialistes (Documents 5, 9, 10).

| Agent | Type | Rôle en une phrase |
|---|---|---|
| **Regalica** | Orchestratrice LLM | Seule persona face à l'utilisateur |
| IngestorXML | Déterministe | Parse XML dual-nomenclature vers CellMatrix |
| Dependency | Déterministe | Détecte les annexes compagnes requises |
| Temporal | Déterministe | Vérifie cohérence arrêté inter-XML |
| RuleExcel/FormAssist | LLM | Assiste import et saisie de règles |
| ReferentialIngestor | LLM | Importe référentiels depuis PDF ou XLSX |
| Investigator | LLM critique | Explique causale d'un FAIL avec action suggérée |
| Historical | Hybride | Tendances et récurrences sur runs passés |
| Reporter | LLM | Génère rapport de conformité DOCX/PDF |
| Visualizer | Hybride | Produit graphiques et tableaux |
| Citation | Hybride | Trouve citation réglementaire d'une règle |
| Diff | Déterministe + narration | Compare deux runs |
| Notification | Déterministe | Gère alertes et pré-alertes |
| Ged | Déterministe | Stockage documentaire attaché aux runs |

**Gouvernance des prompts.** Tous les prompts actifs vivent dans la table `prompt_bank` avec versioning et cycle 4-yeux. Température et modèle par agent détaillés au Document 9 §23.

---

## 9. Roadmap 6 phases sur 26 semaines

Plan brute séquentiel avec zéro tolérance dette résiduelle (détaillé dans `PHASE-0-PLAN.md`).

**Phase 0 — Socle propre (2 semaines).** Suppression brute de `apps/web`, `apps/frontend`, `apps/chatbot-node`, `packages/db`. Suppression Sequelize, Supabase, Drizzle. Initialisation du nouveau monorepo canonique. Import du golden baseline via golden-normalizer (Livrable 1). Tag `phase-0-complete`.

**Phase 1 — Base de données canonique (3 semaines).** Écriture des 37 migrations SQL du Document 6. Runner de migrations pg natif. Tests RLS, triggers d'immutabilité, triggers d'audit, partitions `audit_log`. Import des 4611 règles RDG depuis XLSX. Seed des référentiels via Livrable 2 (`seed-referentials-from-xml`).

**Phase 2 — Moteur et non-régression golden (3 semaines).** Création `packages/evaluator` selon capture AS-IS (Livrable 5). Moteur en 5 phases A/B/D/E, support dual-parsing via `@regflow/bct-xml-parser` (Livrable 4), lecture règles depuis DB. **Critère de sortie strict : le test golden (Livrable 3) passe sur tous les batches QNB Tunisia.**

**Phase 3 — Backend API canonique (4 semaines).** Express + pg natif. JWT complet avec middleware actif. FSM T0/T1/T2/T3/4-eyes implémentées selon Document 8. Endpoints RESTful du Document 4. Absorption des routes `chatbot-node` dans `apps/api`. Tests Jest couvrant endpoints, RLS, immutabilité, 4-yeux.

**Phase 4 — Agents canoniques et Regalica (5 semaines).** Refonte `apps/chatbot-py`. Les 14 agents du Document 9 avec leurs prompts dans `prompt_bank`. Regalica orchestratrice selon Document 10 avec router + planner + aggregator. Retry/fallback/circuit breaker. RAG pgvector avec embeddings 768. Tests pytest par agent.

**Phase 5 — Frontend canonique (6 semaines).** React + Tailwind + Vite. Import des maquettes Edition One validées (Workspace v5, Library v3, Filings). Composants extraits dans `packages/ui`. TanStack Query + Socket.IO client. State management Zustand. 3 langues FR/EN/AR avec RTL. Tests Playwright pour parcours critiques.

**Phase 6 — Durcissement production (3 semaines).** Observabilité (Pino + OpenTelemetry + Prometheus + Grafana). SLO/SLI et alertes. Tests de charge. Sécurité OWASP. Documentation runbook. Fallback Ollama + Qwen 2.5 3B. Pré-prod QNB Tunisia pour recette.

**Total : 26 semaines = 6 mois.**

---

## 10. Golden baseline QNB Tunisia

**Corpus.** 58 XML, 9 batches, 51 annexes distinctes sur 52 du RDG. Détails exhaustifs dans `07-PLAN-GOLDEN-BASELINE-v2.md`.

| Batch | Nature | Fichiers | Statut |
|---|---|---|---|
| 2024-12-31 | Annuel QNB Tunisia 2024 | 45 (38 remplis + 7 vides) | **Golden primaire** |
| 2026-02-28 | Mensuel février 2026 | 5 (Bilan + SM complet) | **Golden secondaire** |
| 2026-03-31 | LCR isolé | 1 | Golden unitaire |
| 2024-09-30 | T3 isolé | 1 (annexe 139) | Golden unitaire |
| historical/2021-12-31 | Gros volume | 1 (annexe 483, 23K valeurs) | Test perf |
| historical/2022-12-31 | Isolé | 1 (annexe 880) | Rétrocompatibilité |
| historical/2025-12-01 | Position de change nomenclature ancienne | 1 (annexe 810) | Dual-parsing |
| historical/2025-12-31 | Relations détaillées 2025 | 2 (100, 110) | Sentinelles D |
| structural-references | Annexe 781 sans date | 1 | Référence parser |

**Vérité terrain.** Niveau intermédiaire (Document 7 §9) — Wissem Barouni valide manuellement, produit `expected_verdicts.json` par batch. Dates validées par BCT (toutes soumissions acceptées).

**Confidentialité.** Repo privé, fixtures en clair, accès restreint aux devs habilités, pas d'anonymisation (casserait les tests).

---

## 11. Design system Edition One

Monochrome encre + papier + accent marigold unique. Référence absolue : `Regalica_Brand_Book_Edition_One.pdf` et `Regalica_Design_System_Edition_One.pdf`.

**Invariants design.**

- Zéro nouvelle classe CSS dans les itérations. Réutilisation stricte des primitives.
- Primitives réutilisables : `artefact` (collapsed/standard/expanded), `pill` (pass/fail/rounding/sentinel-c/sentinel-d), `conf` (high/medium/low), `cite`, `btn`.
- Portrait Regalica en base64 inline, jamais en fichier externe.
- Dates format `31/12/2025`.
- Nombres format FR : `57 985,238` (espace millier, virgule décimale).
- TND suffixé, codes rubrique en IBM Plex Mono.
- Alignement droite pour nombres, gauche pour texte.
- Regalica vouvoie toujours, sans emoji, sans superlatif marketing, formules serviles interdites.
- PASS/FAIL en evergreen/vermilion sobres, jamais saturés.

---

## 12. Documents canoniques et livrables

**Documents REGFlow canoniques :**

| # | Titre | Contenu |
|---|---|---|
| 1 | `01-PLATEFORME-REGFLOW-VISION.md` | Vision produit, positionnement, valeur ajoutée |
| 2 | `02-REGLEMENTAIRE-RDG-ET-BCT.md` | RDG, sentinelles, nomenclatures XML, processus BCT |
| 3 | `03-ARCHITECTURE-ET-ZERO-HARDCODING.md` | Architecture, stack, principes zéro-hardcoding |
| 4 | `04-WORKFLOW-UTILISATEUR-COMPLET.md` | Workflow T0/T1/T2/T3, 3 étapes BCT, livrables |
| 5 | `05-AGENTS-ET-PROMPTS-BANK.md` | 14 agents, prompt_bank, cycle de vie |
| 6 | `06-SCHEMA-SQL-COMPLET.md` | 22 tables, 37 migrations, bitemporalité, RLS |
| 7 | `07-PLAN-GOLDEN-BASELINE-v2.md` | Plan golden 58 XML QNB Tunisia |
| 8 | `08-STATE-MACHINES-WORKFLOW.md` | 4 FSM (T0, T1, T2/T3, 4-eyes), Mode Signature révocable |
| 9 | `09-CONTRATS-JSON-AGENTS.md` | Contrats Pydantic des 14 agents |
| 10 | `10-ORCHESTRATION-REGALICA.md` | Router, Planner, Aggregator, 7 types de questions |

**Livrables techniques Phase 0 (pré-fournis) :**

| # | Nom | Type | Emplacement cible |
|---|---|---|---|
| 1 | golden-normalizer | Python | `tools/golden-normalizer/` |
| 2 | seed-referentials-from-xml | Python | `tools/seed-referentials-from-xml/` |
| 3 | packages/evaluator avec golden test | TS | `packages/evaluator/` |
| 4 | bct-xml-parser dual-nomenclature | TS | `packages/bct-xml-parser/` |
| 5 | capture AS-IS algorithme moteur | Markdown | `docs/as-is-captured/evaluator-algorithm.md` |

**Plan d'exécution :**

- `PHASE-0-PLAN.md` — Plan d'exécution détaillé de la Phase 0 par Claude Code.
- `CLAUDE.md` à la racine du monorepo — Instructions permanentes pour Claude Code.

**Autres actifs :**

- `Regalica_Brand_Book_Edition_One.pdf` et `Regalica_Design_System_Edition_One.pdf` — Design system.
- Maquettes HTML validées : `regalica-workspace-v5.html`, `regalica-library-v3.html`, `regalica-filings.html`.
- `RDG.xlsx` — Source canonique des 4611 règles.

---

## 13. Ce que Claude Code doit absolument retenir

**Règles d'or qui évitent 80% des erreurs de trajectoire.**

1. **Toujours lire le document canonique avant d'écrire du code.** Chaque phase a ses documents. Ne jamais inventer.
2. **Toujours vérifier si un invariant produit s'applique à la modification en cours.** Si oui, appliquer strictement. Les invariants sont au-dessus de la productivité courte.
3. **Toujours passer une modification de règle ou référentiel par 4-yeux.** Même en développement, même sur fixture.
4. **Toujours respecter la stack gelée.** Ne jamais proposer Next.js, Supabase, Drizzle, Sequelize, SQLAlchemy même si ça simplifierait.
5. **Toujours traiter la précision Decimal 38 digits comme sacrée.** Aucun calcul financier en `number` flottant.
6. **Toujours ajouter un test golden ou d'intégration pour tout changement de moteur.** Le golden est le contrat de non-régression.
7. **Toujours préserver les dates d'arrêté et les codes annexes exactement tels qu'ils apparaissent dans les XML.** Pas de zero-stripping, pas de normalisation agressive.
8. **Toujours vérifier l'absence de dette résiduelle avant commit.** Pas de `_legacy/`, pas de `.skip()`, pas de `TODO: remove`.
9. **Toujours écrire Regalica à la troisième personne féminine dans le code** (c'est elle). Mais Regalica tutoie personne dans ses sorties — vouvoiement systématique.
10. **Toujours produire du JSON valide depuis un agent spécialiste.** Les schémas Pydantic sont le contrat.

---

## 14. Contact et décisions

**Décisions produit.** Wissem Barouni, CEO ALGORIA Factory.
**Décisions architecturales.** Wissem Barouni en concertation avec l'équipe plateforme.
**Décisions réglementaires.** Wissem Barouni (autorité métier : Head of Financial & Regulatory Reporting QNB Tunisia).

**Escalade en cas de blocage Claude Code.**

- Ambiguïté fonctionnelle → consulter le document canonique de la phase courante.
- Ambiguïté architecturale → consulter `03-ARCHITECTURE-ET-ZERO-HARDCODING.md`.
- Ambiguïté sur le golden → consulter `07-PLAN-GOLDEN-BASELINE-v2.md` et Livrable 3.
- Si toujours bloqué après consultation → documenter la question précise en commentaire dans le code et demander arbitrage humain.

---

*Fin du PRD consolidé REGFlow*
*Version 1.0 — avril 2026 — ALGORIA Factory*
