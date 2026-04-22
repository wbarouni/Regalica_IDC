# ADR 0007 — Design system : regle 75-15-10, monochrome + 4 accents semantiques

- **Status:** Accepted
- **Date:** 2026-04-20
- **Deciders:** CEO (Wissem Barouni), Senior Principal Engineer

## Context

Le prototype Angular utilise une palette réduite à deux valeurs : noir
`#1D1D1F` et blanc `#FFFFFF`. Cette approche full-monochrome produit une
interface fonctionnelle mais visuellement indifférenciée — il est impossible
de distinguer au premier coup d'oeil une action IA d'une action de conformité,
ou un statut "signé légalement" d'un statut "validé techniquement".

Par ailleurs, aucune grammaire visuelle formelle n'est documentée pour les
glassmorphismes, les icones, les tokens de design, ni les anti-references.
Chaque développeur fait ses propres choix, produisant une incohérence
progressive.

Le **v2.0 master spec** mandate une régle de composition stricte :
**75 % monochrome + 15 % accents de marque semantiques + 10 % couleurs
fonctionnelles de statut.**

Ce ratio s'applique a toute surface rendue : composants, PDF exportés,
emails systeme, logs structurés (niveau visuel). L'objectif est une
interface qui soit a la fois sobre (conforme aux attentes des auditeurs
BCT) et immédiatement lisible sur l'axe "qui fait quoi" (IA vs compliance
vs legal vs premium).

## Decision

### 1. Regle de composition 75-15-10

**75 % — Monochrome** (arriere-plan, typographie, séparateurs, surfaces
neutres) :

| Token | Valeur | Usage |
|---|---|---|
| `color.mono.950` | `#1D1D1F` | Corps de texte, titres |
| `color.mono.900` | `#2C2C2E` | Texte secondaire |
| `color.mono.600` | `#6C6C70` | Labels, placeholders |
| `color.mono.200` | `#E5E5EA` | Bordures, séparateurs |
| `color.mono.100` | `#F2F2F7` | Arriere-plan léger |
| `color.mono.000` | `#FFFFFF` | Surface principale |

**15 % — 4 accents de marque** (voir section 2).

**10 % — Couleurs fonctionnelles de statut** (voir section 3).

Le respect de ce ratio est vérifiable visuellement ; aucun outil automatique
n'est mandaté en Phase 0, mais un audit design est prevu en Phase 3.

### 2. Les 4 accents semantiques de marque

Chaque accent a un **domaine sémantique strict et exclusif**. L'utilisation
d'un accent hors de son domaine est un bug de design, traité comme un bug
fonctionnel.

#### VIOLET `#5B4FE4` — IA / Regalica / actions primaires

Usage autorisé :

- Bouton primary (`bg-violet`, texte blanc)
- Avatar Regalica (l'assistant IA)
- Bulles de chat générées par l'IA
- Citations KB dans les réponses IA (`border-l-4 border-violet`)
- Indicateur "IA en cours" (spinner, pulse)
- Mise en evidence des suggestions IA dans le workspace

Usage interdit : badges BCT, signatures, archives, métriques premium.

Token : `color.brand.violet` = `#5B4FE4`

#### NAVY `#1E3A8A` — Conformite / audit / reglementaire

Usage autorisé :

- Badges "BCT" et "RDG" (étiquettes de référence réglementaire)
- Timeline d'audit (chaque noeud d'événement)
- Bandeau de signature 4-eyes (fond du modal de validation)
- Indicateur "En cours d'audit" sur un rapport
- Numéros de référence BCT dans les tableaux

Usage interdit : actions IA, statuts de validation technique, archives signées.

Token : `color.brand.navy` = `#1E3A8A`

#### EMERALD `#064E3B` — Signe / archive / legal

Usage autorisé :

- Badge "Signé" sur un rapport définitivement validé
- Badge "Archivé" sur une période clôturée
- Icone de cadenas sur les rapports en période légale (10 ans)
- Fond de la bannière "Période clôturée — lecture seule"
- Indicateur de cohérence bit-identique dans l'historique

Usage interdit : actions en cours, signatures en attente, métriques IA.

Token : `color.brand.emerald` = `#064E3B`

#### GOLD `#A87C3A` — Premium / métriques hero / différenciateurs

Usage autorisé :

- Badge "Premium" sur les fonctionnalités de tier supérieur
- Badge "Silent Guardian" (Pilier 5 — tests en arriere-plan)
- KPI heroes dans le Dashboard (chiffre principal en gold, libellé en mono)
- Icone de couronne sur les tenants de niveau Enterprise
- Mise en evidence des différenciateurs concurrentiels dans l'onboarding

Usage interdit : erreurs, validations, actions ordinaires, texte courant.

Token : `color.brand.gold` = `#A87C3A`

### 3. Couleurs fonctionnelles de statut (10 %)

Ces couleurs sont distinctes des accents de marque. Elles communiquent un
état technique, pas une identité de domaine.

| Token | Valeur | Sémantique |
|---|---|---|
| `color.status.pass` | `#34C759` | Test passé, validation OK |
| `color.status.fail` | `#FF3B30` | Erreur, rejet, echec |
| `color.status.skipped` | `#FF9500` | Non exécuté, avertissement |
| `color.status.pending` | `#A855F7` | En attente, en file |

Note : `color.status.pending` (`#A855F7`) est un violet distinct de
`color.brand.violet` (`#5B4FE4`). Ils ne sont jamais substituables l'un
a l'autre. Le violet de statut est réservé aux états de pipeline technique ;
le violet de marque est réservé a l'identité IA.

### 4. Design tokens en base de données

Aucune valeur hexadécimale n'apparait dans le code des composants. Toutes
les valeurs sont référencées par leur token CSS variable :

```css
/* Généré depuis la table design_tokens — ne pas éditer manuellement */
:root {
  --color-brand-violet: #5B4FE4;
  --color-brand-navy: #1E3A8A;
  --color-brand-emerald: #064E3B;
  --color-brand-gold: #A87C3A;
  --color-status-pass: #34C759;
  --color-status-fail: #FF3B30;
  --color-status-skipped: #FF9500;
  --color-status-pending: #A855F7;
}
```

La table `design_tokens` dans Supabase stocke chaque token avec son nom,
sa valeur, sa version, et un commentaire de justification. La génération
du fichier CSS est automatisée dans le pipeline CI (step `generate:tokens`).

Modifier une couleur directement dans un composant Tailwind ou CSS est un
anti-pattern détecté par lint (`no-hardcoded-color` rule custom).

### 5. Icones : Lucide exclusivement

- **Lucide Icons** est la bibliothèque d'icones unique du projet.
- Zero emoji dans le code source, les commits, les ADRs, les logs, les PDFs
  exportés, les emails systeme, et les commentaires de code.
- Les icones SVG custom (logo Regalica, logo BCT) sont dans `packages/ui/icons/`
  et exportées comme composants React, pas comme balises `<img>`.
- L'utilisation d'une icone hors de Lucide (FontAwesome, Material Icons, etc.)
  requiert un ADR.

Justification : cohérence visuelle, treeshaking optimal (Lucide est modulaire),
pas de licence commerciale requise, style compatible avec les références
retenues.

### 6. Materiaux glass (glassmorphisme)

Quatre materiaux sont définis, chacun pour une couche d'interface précise :

| Materiau | Backdrop blur | Opacité fond | Couche d'usage |
|---|---|---|---|
| `glass-chrome` | `blur(20px)` | `rgba(255,255,255,0.72)` | Navigation (Topbar, CommandBar) |
| `glass-thick` | `blur(40px)` | `rgba(255,255,255,0.88)` | Modales et sheets (popups) |
| `glass-regular` | `blur(12px)` | `rgba(255,255,255,0.60)` | Popovers et menus contextuels |
| `glass-thin` | `blur(6px)` | `rgba(255,255,255,0.40)` | Tooltips et overlays légers |

Contrainte d'empilement : **maximum 2 couches glass simultanées**. Exemple
valide : `glass-chrome` (Topbar) + `glass-thick` (modal). Exemple invalide :
`glass-thick` (sheet) + `glass-regular` (popover) + `glass-thin` (tooltip)
simultanément sur le meme Z-index stack.

Les tokens de materiau sont dans `design_tokens` :
`glass.chrome`, `glass.thick`, `glass.regular`, `glass.thin`.

### 7. Références et anti-références

**Références** (sources d'inspiration directes) :

- **Apple visionOS** — glassmorphisme, typographie SF Pro, densité de
  l'information, surfaces spatiales
- **Linear** — CommandBar, navigation par hash, vitesse perçue, typographie
  mono pour les identifiants
- **Stripe Dashboard** — densité des tableaux de données, KPI layout,
  couleurs fonctionnelles sobres
- **Arc Browser** — espace de travail condensé, sidebar comme outil et non
  comme navigation principale

**Anti-références** (patterns explicitement proscrits) :

- **SAP GUI** — grilles de données compressées, couleurs primaires criardes,
  hiérarchie visuelle absente
- **Material Design 2014** — ombres portées multiples, ripple effects,
  composants génériques sans personnalité
- **Dark-mode-first** — le mode sombre n'est pas une priorité v2.0.
  L'interface est light-mode par défaut. Dark mode sera adressé en v2.1
  uniquement si la demande marché le justifie.

## Consequences

### Positives

- **Lisibilité métier immédiate** : un compliance officer identifie
  instantanément "ce bloc violet vient de l'IA", "ce badge navy est une
  référence BCT", "ce badge emerald signifie que c'est figé légalement".
- **Cohérence garantie** : les tokens en DB empechent la dérive visuelle
  progressive.
- **Maintenabilité** : changer la couleur de marque violet nécessite une
  mise a jour d'une seule ligne en DB, pas un grep sur tout le codebase.
- **Accessibilité** : les 4 accents et les 4 statuts ont été choisis pour
  satisfaire WCAG AA (ratio de contraste >= 4.5:1 sur fond blanc) — a
  vérifier formellement en Phase 3 avec un audit Lighthouse.
- **Cohérence PDF/export** : les memes tokens sont utilisés pour la
  génération PDF (via Puppeteer ou react-pdf) — les rapports exportés
  ont la meme grammaire visuelle que l'interface.

### Negatives

- **Contrainte pour les développeurs** : interdire les hex dans les
  composants nécessite une configuration ESLint custom et une formation
  de l'équipe.
- **Complexité initiale des tokens** : la table `design_tokens` et le
  step CI de génération doivent etre mis en place en Phase 0 avant tout
  travail de composants.
- **Glassmorphisme et performance** : `backdrop-filter: blur()` est
  GPU-intensif. Sur des machines de compliance officers (souvent des
  laptops d'entreprise standard), des tests de performance doivent valider
  que 60fps est maintenu avec 2 couches glass simultanées.

### Neutres

- Le mode sombre est explicitement reporté. Les tokens sont structurés
  pour l'accepter (variables CSS theméables) mais aucun travail n'y est
  alloué en v2.0.
- Lucide Icons couvre environ 95 % des besoins identifiés. Les 5 % restants
  (logo BCT, icone RDG-specifique) sont traités comme assets custom dans
  `packages/ui/icons/`.
