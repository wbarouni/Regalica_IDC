# 03 — Frontend existant

Deux interfaces coexistent dans le repo : `apps/frontend` (Angular 18) et `apps/web` (Next.js 16).

---

## apps/frontend — Angular 18

### Framework et version

| Élément | Valeur |
|---|---|
| Framework | Angular ^18.2.0 |
| Style | SCSS + Tailwind (via PostCSS) |
| Port de développement | 4200 |
| Port de production (Docker) | 80 (Nginx) |

### Structure des dossiers

```
apps/frontend/src/
├── app/
│   ├── dashboard/
│   │   └── dashboard.component.ts      # Composant tableau de bord
│   ├── modals/
│   │   ├── deep-dive/
│   │   │   └── deep-dive-modal.component.ts
│   │   ├── structure-check/
│   │   │   └── structure-check-modal.component.ts
│   │   ├── upload-report/
│   │   │   └── upload-report-modal.component.ts
│   │   ├── validation-progress/
│   │   │   └── validation-progress-modal.component.ts
│   │   └── index.ts
│   ├── reports/
│   │   └── reports.component.ts        # Composant liste des rapports
│   ├── shared/
│   │   ├── button/button.component.ts
│   │   ├── glass-card/glass-card.component.ts
│   │   ├── modal/base-modal.component.ts
│   │   ├── modal/modal.service.ts
│   │   ├── toast/toast.component.ts
│   │   ├── toast/toast.service.ts
│   │   └── index.ts
│   ├── app.component.ts                # Composant racine
│   ├── app.component.html              # Template racine
│   ├── app.component.scss
│   ├── app.config.ts                   # Configuration application Angular
│   └── app.routes.ts                   # Routes Angular
├── styles/
│   ├── animations.scss                 # Animations CSS
│   ├── materials.scss                  # Matériaux glass (backdrop-blur)
│   └── tokens.scss                     # Variables CSS design tokens
├── index.html                          # Point d'entrée HTML
├── main.ts                             # Bootstrap Angular
└── styles.scss                         # Import global des feuilles de style
```

### Pages et routes

Les routes Angular sont définies dans `app.routes.ts`. Les composants observés correspondent à :

- Un composant principal `app.component.ts` (interface de travail principale)
- Un composant `dashboard.component.ts`
- Un composant `reports.component.ts`

### Composants de premier niveau

| Composant | Localisation | Rôle apparent |
|---|---|---|
| `AppComponent` | `app.component.ts` | Racine de l'application, interface principale |
| `DashboardComponent` | `dashboard/dashboard.component.ts` | Tableau de bord |
| `ReportsComponent` | `reports/reports.component.ts` | Liste des rapports |
| `UploadReportModalComponent` | `modals/upload-report/` | Modal d'upload de fichier XML |
| `StructureCheckModalComponent` | `modals/structure-check/` | Modal de vérification structurelle |
| `ValidationProgressModalComponent` | `modals/validation-progress/` | Modal de progression de validation |
| `DeepDiveModalComponent` | `modals/deep-dive/` | Modal d'investigation approfondie |
| `ButtonComponent` | `shared/button/` | Bouton réutilisable |
| `GlassCardComponent` | `shared/glass-card/` | Carte glass morphism |
| `BaseModalComponent` | `shared/modal/` | Abstraction de modal |
| `ToastComponent` | `shared/toast/` | Notification toast |

### Services identifiés

| Service | Localisation | Rôle apparent |
|---|---|---|
| `ModalService` | `shared/modal/modal.service.ts` | Gestion de l'ouverture/fermeture des modals |
| `ToastService` | `shared/toast/toast.service.ts` | Gestion des notifications toast |

### Gestion d'état

Aucun state manager externe identifié (pas de NgRx, pas de Akita). L'état est géré via les services Angular natifs et les observables RxJS.

### Styles

Trois fichiers SCSS structurent le design system :
- `tokens.scss` — variables CSS (palette de couleurs, espacements)
- `materials.scss` — matériaux glass (backdrop-filter, opacités)
- `animations.scss` — animations CSS

---

## apps/web — Next.js 16

### Framework et version

| Élément | Valeur |
|---|---|
| Framework | Next.js 16.2.4 (App Router) |
| React | 19.2.4 |
| TypeScript | ^5 (strict) |
| Style | Tailwind CSS ^4 |
| Port de développement | 3000 |

### Structure des dossiers

```
apps/web/src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts       # POST /api/chat — appel Gemini 2.5 Flash
│   │   ├── evaluate/route.ts   # POST /api/evaluate — évaluation RDG
│   │   └── validate/route.ts   # POST /api/validate — validation structurelle
│   ├── app/
│   │   ├── error.tsx           # Error boundary du workspace
│   │   └── page.tsx            # Page principale /app (workspace)
│   ├── error.tsx               # Error boundary global
│   ├── favicon.ico
│   ├── globals.css             # CSS global + variables Tailwind
│   ├── layout.tsx              # Layout racine (Geist fonts, Providers)
│   └── page.tsx                # Page racine — redirect vers /app
├── components/
│   └── ui/
│       └── button.tsx          # Composant Button (shadcn/ui)
└── lib/
    ├── agents/
    │   ├── bct-xml-parser.ts       # Parser XML BCT (copie de apps/api)
    │   ├── evaluator/
    │   │   ├── index.ts            # runEvaluation() — point d'entrée
    │   │   ├── phases.ts           # 5 phases de l'évaluation (A/B/D/E)
    │   │   └── types.ts            # Types RuleTerm, VerdictStatus, etc.
    │   └── structure-validator.ts  # Validateur de structure XML
    ├── llm/
    │   ├── circuit-breaker.ts      # Circuit breaker pour appels LLM
    │   ├── context-manager.ts      # Sliding window contexte (8 messages max)
    │   └── gemini-client.ts        # Wrapper Gemini avec retry exponentiel
    ├── stores/
    │   └── session-store.ts        # Zustand — accumulateur de fichiers XML
    ├── logger.ts                   # Logger structuré (JSON)
    ├── providers.tsx               # Providers React (TanStack Query)
    └── utils.ts                    # Utilitaires CSS (cn)
```

### Routes et pages

| Route | Fichier | Description |
|---|---|---|
| `/` | `app/page.tsx` | Redirige vers `/app` |
| `/app` | `app/app/page.tsx` | Workspace principal (3 panneaux) |
| `/api/chat` | `app/api/chat/route.ts` | API conversationnelle Regalica |
| `/api/evaluate` | `app/api/evaluate/route.ts` | Évaluation RDG par annexe |
| `/api/validate` | `app/api/validate/route.ts` | Validation structurelle XML |

### Page `/app` — description

La page `/app` est un workspace à 3 panneaux :

- **Panneau gauche** — zone de dépôt de fichiers XML + visualisation des 4 étapes pipeline (Structure Validator → RDG Evaluator → Pattern Analyst → Regalica Report)
- **Panneau centre** — conversation Regalica (bulles user droite / Regalica gauche avec avatar violet)
- **Panneau droit** — tableau des verdicts (PASS/FAIL/SKIP) avec détail par règle expandable

L'analyse est déclenchée automatiquement après dépôt de fichiers. Regalica envoie un message dès la réception du fichier, puis fait progresser le pipeline étape par étape. Si des annexes complémentaires sont requises (`requiredAnnexes`), Regalica les mentionne explicitement dans le chat.

### Gestionnaire d'état

Zustand ^5.0.12 — un store `session-store.ts` accumule les fichiers XML déposés successivement (Map `filename → File`) pour permettre l'évaluation inter-annexes sans recharger les fichiers précédents.

### Appels API identifiés

- `POST /api/validate` — validation structurelle multi-fichiers
- `POST /api/evaluate` — évaluation RDG avec détection d'annexes manquantes
- `POST /api/chat` — conversation Regalica (Gemini 2.5 Flash)

### Bibliothèques UI

| Bibliothèque | Usage observé |
|---|---|
| Lucide React ^1.8.0 | Icônes exclusivement (Upload, Send, FileText, etc.) |
| shadcn/ui ^4.3.1 | Composants UI de base (Button) |
| Tailwind CSS ^4 | Utilitaires CSS |
| Framer Motion ^12.38.0 | Présent dans les dépendances, usage non observé dans les fichiers lus |
| TanStack Query ^5.99.2 | Provider configuré dans `providers.tsx` |
