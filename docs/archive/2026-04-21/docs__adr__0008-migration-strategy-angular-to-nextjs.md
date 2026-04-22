# ADR 0008 — Strategie de migration Angular vers Next.js

- **Status:** Accepted
- **Date:** 2026-04-20
- **Deciders:** CEO (Wissem Barouni), Senior Principal Engineer
- **Depends on:** ADR 0005 (adoption stack v2 Next.js + Supabase + Drizzle)

## Context

Le prototype Angular 18 (`apps/frontend`) tourne a `localhost:4200` et
constitue une preuve de concept UX validée :

- Les 3 panneaux du workspace (nav, éditeur, chatbot) ont été testés avec
  de vrais utilisateurs compliance officers.
- Les flux upload XML, validation 4-eyes et visualisation rapport ont été
  démontrés au CEO et a l'équipe.
- Le backend Express (`apps/api`) expose des endpoints REST consommés par
  Angular ; les routes et les validations Zod sont stables.
- Le schema Sequelize (19 tables) est la référence de données actuelle.

Le prototype **n'est pas** la cible de production. ADR 0005 mandate Next.js 14
+ Supabase + Drizzle. La question n'est donc pas "si" migrer, mais "comment"
migrer de facon ordonnée, sans bloquer les livraisons ni casser les tests
existants.

Deux approches ont été évaluées :

**Option A — Big-bang rewrite** : réécriture complete en une branche
longue durée, intégration a la fin. Rejeté : risque de divergence élevé,
pas de valeur livrée pendant 2+ mois, perte du feedback continu.

**Option B — Build parallele** : `apps/web` (Next.js) coexiste avec
`apps/frontend` (Angular, gelé). Migration progressive par surface, avec
des gates de non-régression a chaque phase. Retenu.

**Option C — Migration incrementale Angular-to-React** : remplacement
composant par composant via un wrapper (ex. Angular Elements). Rejeté :
trop lent, génere une dette technique hybride, complexifie les tests.

## Decision

### Approche : build parallele avec apps/frontend en maintenance freeze

`apps/frontend` (Angular) reste dans le monorepo mais est déclaré en
**maintenance freeze** :

- Aucune nouvelle fonctionnalité n'y est développée.
- Les bugs critiques (securité, données corrompues) sont corrigés s'ils
  bloquent le POC.
- Il n'est pas supprimé — il sert de référence d'implémentation UX pendant
  toute la durée de la migration.
- Les développeurs ne le touchent pas sauf instruction explicite.

`apps/web` (Next.js 14) est le nouveau workspace de développement actif.

### Plan de migration en 5 phases

#### Phase 0 — Fondations (semaine 1-2)

Objectif : le repo compile, les gates passent, Supabase est provisionné.

- [ ] Créer `apps/web` avec `create-next-app --typescript --tailwind --app`
- [ ] Créer `packages/db` avec Drizzle ORM (`drizzle-kit`, `drizzle-orm`)
- [ ] Configurer Supabase project (Postgres 15, pgvector, RLS, Auth, Storage,
      Realtime, pgmq)
- [ ] Configurer Vercel project avec preview deployments par branche
- [ ] Mettre en place le step CI `generate:tokens` (design_tokens → CSS vars)
- [ ] Mettre a jour `CLAUDE.md` : retirer l'interdiction Next.js/Supabase/Drizzle,
      ajouter l'interdiction Angular dans `apps/web`
- [ ] Gate de sortie : `pnpm build` passe sur `apps/web` (page vide OK)

#### Phase 1 — Schema Drizzle + provisioning Supabase (semaine 2-4)

Objectif : le schema de données v2 est défini et migré dans Supabase.

**19 tables a migrer / créer :**

- 10 tables existantes (portées depuis Sequelize) :
  `tenants`, `users`, `reports`, `rules`, `rule_versions`, `upload_versions`,
  `kb_chunks`, `audit_logs`, `prompts`, `prompt_versions`

- 9 nouvelles tables (v2.0 spec) :
  `design_tokens`, `report_signatures`, `report_archives`, `batch_jobs`,
  `evaluation_results`, `silent_guardian_alerts`, `rls_audit_log`,
  `feature_flags`, `notification_queue`

Chaque table :
- Schema TypeScript Drizzle dans `packages/db/schema/`
- Migration SQL dans `packages/db/migrations/`
- RLS policies SQL dans `packages/db/policies/`
- Types TypeScript générés via `supabase gen types typescript`

Regles pour la migration depuis Sequelize :
- Les colonnes `Decimal` Sequelize → `numeric(38,10)` Postgres (Pilier 1)
- Les colonnes de versioning (`valid_from`, `valid_to`) sont conservées
  (Pilier 6)
- RLS est activée sur toutes les tables portant des données tenant (ADR 0003)

Gate de sortie :
- `drizzle-kit push` sans erreur sur le projet Supabase de staging
- Les golden tests passent avec la nouvelle DB (lecture seule)

#### Phase 2 — packages/ui design system (semaine 3-5)

Objectif : la bibliothèque de composants v2 est disponible, documentée,
testée.

- [ ] Initialiser `packages/ui` avec shadcn/ui (`pnpm dlx shadcn-ui@latest init`)
- [ ] Configurer les 4 accents de marque et 4 statuts comme extensions
      Tailwind (`tailwind.config.ts` dans `packages/ui`)
- [ ] Implémenter les 4 materiaux glass comme composants React
      (`GlassChrome`, `GlassThick`, `GlassRegular`, `GlassThin`)
- [ ] Implémenter les composants de base : `Badge` (avec variante par accent),
      `Button` (primary/secondary/ghost), `Sheet`, `Popup`, `CommandBar`
- [ ] Configurer Lucide Icons (`lucide-react`)
- [ ] Tests visuels Storybook pour chaque composant (optionnel v2.0,
      obligatoire v2.1)

Gate de sortie :
- `pnpm build` passe dans `packages/ui`
- Les 4 accents et 4 statuts sont accessibles via tokens CSS variables
- Aucune valeur hex dans les fichiers `.tsx` (lint `no-hardcoded-color`)

#### Phase 3 — Workspace UI /app + 10 popups (semaine 5-8)

Objectif : l'interface principale est fonctionnelle dans Next.js.

- [ ] Implémenter la page `/app` avec le layout 3 panneaux (ADR 0006)
- [ ] Implémenter le Topbar (56px, `glass-chrome`)
- [ ] Implémenter le CommandBar (48px, Cmd+K, `glass-chrome`)
- [ ] Implémenter les 10 popups/sheets avec deep-linking hash (ADR 0006)
- [ ] Implémenter la route `/audit-viewer` avec rôle `auditor_ro`
- [ ] Connecter les Server Actions aux tables Drizzle/Supabase (upload,
      validation, lecture rapports, lecture règles)
- [ ] Porter la logique `apps/api/src/agents/` vers `packages/agents`
      (TypeScript, sans dépendance Express)
- [ ] Implémenter Supabase Realtime pour les notifications 4-eyes (remplace
      Socket.IO)

Gate de sortie :
- Les flux upload XML, validation 4-eyes et lecture rapport fonctionnent
  dans `apps/web`
- Les 8 agents déterministes passent leurs tests dans `packages/agents`
- `apps/frontend` est toujours accessible a `localhost:4200` sans régression

#### Phase finale — Bascule et archivage

Objectif : `apps/web` devient le point d'entrée principal. Angular décommissionné
visuellement (pas supprimé).

- [ ] Le `README.md` monorepo est mis a jour : `apps/web` est la cible,
      `apps/frontend` est marqué "reference implementation - frozen"
- [ ] La documentation onboarding pointe vers `apps/web`
- [ ] Le port `localhost:4200` n'est plus mentionné dans les guides dev
      (sauf la note de référence)
- [ ] Aucune tache CI ne dépend de `apps/frontend`

### Ce qui est preserve exactement

| Composant | Traitement | Justification |
|---|---|---|
| `apps/chatbot-py` | Inchangé, intact | Autonome, FastAPI + SQLAlchemy 2.0, pas de dépendance Angular/Express |
| `tests/fixtures/golden/` | Inchangé, jamais modifié | Golden tests bit-identiques sont la gate principale du projet |
| `apps/api/src/agents/` | Porté vers `packages/agents` (TypeScript) | La logique métier est portable ; Express n'est pas une dépendance de la logique |
| `apps/frontend` | Gelé en maintenance, non supprimé | Référence d'implémentation UX pendant la migration |
| `tests/fixtures/rdg.xlsx` | Inchangé | Source de vérité des règles RDG |

### Ce qui n'est pas fait (interdits explicites)

- **Pas de migration incrementale Angular-to-React** : pas de wrapper Angular
  Elements, pas de composants React montés dans des templates Angular. La
  coexistence est entre deux apps séparées, pas entre deux frameworks dans
  le meme DOM.
- **Pas de Supabase client dans `apps/frontend`** : Angular reste sur
  Express/Postgres vanilla. Introduire Supabase dans Angular violerait la
  separation des apps et compliquerait le gel.
- **Pas d'état partagé entre Angular et Next.js** : pas de localStorage
  partagé, pas d'API commune de session, pas de WebSocket partagé. Les
  deux apps sont isolées.
- **Pas de big-bang** : chaque phase a une gate de sortie explicite et
  livrable. Un commit qui casse les golden tests est refusé quelle que
  soit la phase.
- **Pas de `--no-verify`** : si un hook pre-commit échoue pendant la
  migration, on fixe la cause.

## Consequences

### Positives

- **Risque zero sur le POC existant** : `apps/frontend` continue de
  tourner pendant toute la durée de la migration ; les démonstrations
  planifiées ne sont pas bloquées.
- **Livraisons continues** : chaque phase produit un livrable testable
  et déployable en preview Vercel.
- **Pas de perte de connaissance UX** : `apps/frontend` reste consultable
  comme référence exacte de l'implémentation validée.
- **Isolation propre** : les deux apps ne partagent pas d'état — aucun
  risque de régression croisée.
- **`apps/chatbot-py` protégé** : le service Python n'est jamais touché
  pendant la migration frontend.

### Negatives

- **Duplication temporaire** : pendant les phases 1-3, les memes features
  existent dans deux apps. C'est un coût accepté et borné dans le temps.
- **Risque de dérive de référence** : si `apps/frontend` n'est pas
  strictement gelé (aucune nouvelle feature), il peut diverger de la
  spec v2.0 et perdre sa valeur de référence. Le gel doit etre respecté
  scrupuleusement.
- **Surface de test augmentée en phase 3** : les deux apps doivent passer
  les golden tests — coût de CI doublé temporairement.
- **Montée en compétence Drizzle/Supabase** : estimée a 1 semaine pour
  un développeur connaissant Sequelize/Postgres.

### Neutres

- `apps/frontend` n'est pas supprimé. Si la direction change a nouveau,
  il est immédiatement réactivable.
- La durée totale estimée (8 semaines) est une estimation conservative.
  Les phases 0 et 1 peuvent se paralléliser partiellement.
- Les tests Playwright existants sur Angular peuvent etre conservés comme
  reference comportementale pour écrire les tests Next.js equivalents.
