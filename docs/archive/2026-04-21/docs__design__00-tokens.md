# Design Tokens v2.0 — Système 75-15-10

**Date:** 2026-04-20
**Statut:** Référence canonique
**Version:** 2.0.0

---

## Principe fondamental

Aucune valeur de couleur (hex, rgba), dimension (px, rem, em) ou durée (ms) ne doit apparaître directement dans un composant React ou dans un fichier Tailwind `className`. Toute valeur doit référencer une variable CSS définie ici. Les tokens sont stockés dans la table `design_tokens` de Supabase et générés par `packages/design-tokens` à chaque build.

Le système de design suit la règle **75-15-10** :
- **75%** — Monochromes : surfaces, textes, séparateurs, fonds neutres
- **15%** — Accents de marque : actions primaires, états sémantiques, identité visuelle
- **10%** — Fonctionnel : feedback, statuts, alertes

---

## 1. Couleurs Monochromes (75%)

Ces couleurs constituent la majorité visuelle de l'interface. Elles définissent la hiérarchie de l'information sans distraction chromatique.

### Palette monochromes

```css
:root {
  --mono-black:    #0A0A0A;  /* Texte principal, icônes haute importance */
  --mono-graphite: #1D1D1F;  /* Titres, labels critiques */
  --mono-slate:    #3F3F46;  /* Corps de texte, descriptions */
  --mono-steel:    #71717A;  /* Texte secondaire, placeholders actifs */
  --mono-silver:   #D4D4D8;  /* Bordures, séparateurs, dividers */
  --mono-pearl:    #F4F4F5;  /* Fonds de cartes, surfaces élevées */
  --mono-white:    #FFFFFF;  /* Fond de page, surfaces primaires */
}
```

### Gradient de fond de page

```css
:root {
  --bg-page: linear-gradient(135deg, #FAFAFF 0%, #FFFFFF 50%, #FAF8FF 100%);
}
```

Le gradient de fond est appliqué uniquement sur l'élément `<body>`. Il est subtil (variation de luminance inférieure à 2%) et ne doit jamais être utilisé sur des surfaces imbriquées.

---

## 2. Matériaux Glass

Les matériaux glass sont définis par leur niveau de transparence et s'empilent selon des règles strictes (voir `docs/design/01-materials.md`). Maximum 2 couches glass visibles simultanément.

### Backgrounds glass

```css
:root {
  --glass-chrome:  rgba(255, 255, 255, 0.92);
  --glass-thick:   rgba(255, 255, 255, 0.80);
  --glass-regular: rgba(255, 255, 255, 0.65);
  --glass-thin:    rgba(255, 255, 255, 0.40);
}
```

### Bordures glass

```css
:root {
  --glass-border-hi: rgba(255, 255, 255, 0.80); /* Highlight interne (haut/gauche) */
  --glass-border-lo: rgba(0,   0,   0,   0.06); /* Contour externe subtil */
}
```

---

## 3. Accents de Marque (15%)

Quatre couleurs d'accent, chacune avec trois variantes : `hi` (hover/focus), `lo` (pressed/active), `bg` (fond teinté translucide).

### Violet — IA, Regalica, Primary

Couleur principale de la marque. Utilisée pour les actions primaires, l'avatar Regalica, les indicateurs IA, et les éléments interactifs de premier niveau.

```css
:root {
  --brand-violet:    #5B4FE4;
  --brand-violet-hi: #7A71EB;
  --brand-violet-lo: #4238C7;
  --brand-violet-bg: rgba(91, 79, 228, 0.08);
}
```

### Navy — Conformité, Audit

Utilisé pour les éléments liés au cadre réglementaire BCT : scores de conformité, liens vers les textes de référence, badges d'audit.

```css
:root {
  --brand-navy:    #1E3A8A;
  --brand-navy-hi: #2E4FA8;
  --brand-navy-lo: #15286B;
  --brand-navy-bg: rgba(30, 58, 138, 0.08);
}
```

### Emerald — Signé, Archivé

Utilisé pour les états terminaux positifs : rapport signé, annexe archivée, validation définitivement close.

```css
:root {
  --brand-emerald:    #064E3B;
  --brand-emerald-hi: #0D6B53;
  --brand-emerald-lo: #033426;
  --brand-emerald-bg: rgba(6, 78, 59, 0.08);
}
```

### Gold — Premium, KPI

Utilisé pour les indicateurs de performance clés, les éléments de valeur ajoutée premium, et les highlights de tableau de bord.

```css
:root {
  --brand-gold:    #A87C3A;
  --brand-gold-hi: #C2954E;
  --brand-gold-lo: #8B642A;
  --brand-gold-bg: rgba(168, 124, 58, 0.08);
}
```

---

## 4. Couleurs Fonctionnelles (10%)

Ces couleurs communiquent des statuts système. Elles sont réservées aux états de feedback et ne doivent jamais être utilisées à des fins décoratives.

### Statuts de validation BCT

```css
:root {
  /* PASS — Validation réussie */
  --functional-pass:    #34C759;
  --functional-pass-bg: rgba(52, 199, 89, 0.10);

  /* FAIL — Validation échouée, erreur */
  --functional-fail:    #FF3B30;
  --functional-fail-bg: rgba(255, 59, 48, 0.10);

  /* SKIPPED — Règle non applicable, contournement documenté */
  --functional-skipped:    #FF9500;
  --functional-skipped-bg: rgba(255, 149, 0, 0.10);

  /* PENDING — En cours de traitement, file d'attente */
  --functional-pending:    #A855F7;
  --functional-pending-bg: rgba(168, 85, 247, 0.10);
}
```

### Bague de focus

Appliquée sur tous les éléments interactifs au focus clavier. Répond aux critères WCAG AA de visibilité du focus.

```css
:root {
  --shadow-focus: 0 0 0 3px rgba(91, 79, 228, 0.20),
                  0 0 0 1px #5B4FE4;
}
```

---

## 5. Typographie

### Familles de polices

```css
:root {
  --font-sans:    "SF Pro Display", "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-arabic:  "SF Arabic",     "Noto Sans Arabic", sans-serif;
  --font-mono:    "SF Mono",       "JetBrains Mono", ui-monospace, monospace;
}
```

`--font-arabic` est chargée conditionnellement uniquement quand la locale active est `ar`. Elle est activée via `<html lang="ar" dir="rtl">` et le sélecteur CSS `:lang(ar)`.

### Échelle de taille de texte

```css
:root {
  --text-xs:   12px;  /* Labels micro, footnotes */
  --text-sm:   13px;  /* Texte secondaire, métadonnées */
  --text-base: 14px;  /* Corps de texte standard */
  --text-md:   15px;  /* Corps légèrement mis en avant */
  --text-lg:   16px;  /* Titres de section, labels importants */
  --text-xl:   20px;  /* Titres de carte, sous-titres */
  --text-2xl:  24px;  /* Titres de page secondaires */
  --text-3xl:  32px;  /* Titres principaux */
  --text-4xl:  40px;  /* Hero, grands KPI */
  --text-5xl:  56px;  /* Display, landing page */
}
```

### Graisses de police

Seules trois graisses sont autorisées. Les graisses 700 (bold) et 800 (extrabold) sont interdites — elles cassent la cohérence visuelle du système.

```css
:root {
  --font-regular:  400;
  --font-medium:   500;
  --font-semibold: 600;
}
```

### Hauteurs de ligne

```css
:root {
  --leading-tight:   1.2;   /* Titres, display */
  --leading-normal:  1.5;   /* Corps de texte standard */
  --leading-relaxed: 1.75;  /* Texte long, paragraphes */
}
```

### Espacement des lettres

```css
:root {
  --tracking-uppercase: 0.08em; /* Obligatoire sur tout texte en majuscules */
}
```

Tout texte affiché en `text-transform: uppercase` doit avoir `letter-spacing: var(--tracking-uppercase)`. Ne pas espacer les textes en casse normale.

---

## 6. Espacement

Grille de 4px. Toutes les valeurs d'espacement sont des multiples de 4px. Les dimensions non multiples de 4px sont interdites sauf pour les bordures (1px) et les bagues de focus.

```css
:root {
  --space-1:  4px;   /* Micro-espacement, gaps internes icon+label */
  --space-2:  8px;   /* Espacement interne compact */
  --space-3:  12px;  /* Padding boutons small */
  --space-4:  16px;  /* Padding standard, gaps de grille */
  --space-5:  20px;  /* Espacement confortable */
  --space-6:  24px;  /* Padding de carte, section spacing */
  --space-8:  32px;  /* Espacement entre sections */
  --space-10: 40px;  /* Grandes séparations */
  --space-12: 48px;  /* Hauteur d'en-tête modal */
  --space-16: 64px;  /* Espacement de page */
  --space-20: 80px;  /* Sections larges */
  --space-24: 96px;  /* Marges de layout */
}
```

---

## 7. Rayons de bordure

```css
:root {
  --radius-xs:   4px;     /* Badges, tags, pills compacts */
  --radius-sm:   6px;     /* Boutons, inputs */
  --radius-md:   10px;    /* Composants medium, glass thin */
  --radius-lg:   14px;    /* Cartes standard, glass regular */
  --radius-xl:   20px;    /* Modals, glass thick */
  --radius-2xl:  28px;    /* Panneaux larges, sheets */
  --radius-full: 9999px;  /* Avatars, indicators, toggles */
}
```

---

## 8. Ombres (style Apple multi-couche)

Chaque ombre est composée de plusieurs couches : une ombre portée diffuse, une ombre portée proche, et un highlight interne pour simuler la source lumineuse supérieure.

```css
:root {
  --shadow-glass-sm:
    0 1px 2px   rgba(0, 0, 0, 0.04),
    0 2px 4px   rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.60);

  --shadow-glass-md:
    0 2px  4px  rgba(0, 0, 0, 0.04),
    0 4px  8px  rgba(0, 0, 0, 0.06),
    0 8px  16px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.70);

  --shadow-glass-lg:
    0 4px   8px  rgba(0, 0, 0, 0.04),
    0 8px   16px rgba(0, 0, 0, 0.06),
    0 16px  32px rgba(0, 0, 0, 0.06),
    0 24px  48px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.80);

  --shadow-glass-xl:
    0 8px   16px rgba(0, 0, 0, 0.04),
    0 16px  32px rgba(0, 0, 0, 0.06),
    0 32px  64px rgba(0, 0, 0, 0.08),
    0 48px  96px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.90);
}
```

La couche `inset` (highlight interne) est ce qui différencie une ombre glass d'une ombre plate. Elle simule la réflexion de la lumière venant du haut de l'écran sur la surface translucide.

---

## 9. Motion (Animation)

### Durées

```css
:root {
  --duration-instant: 100ms;  /* Feedback immédiat : couleur au hover, toggle */
  --duration-fast:    200ms;  /* Micro-interactions : apparition de badge, checkbox */
  --duration-base:    300ms;  /* Transitions standard : ouverture de dropdown */
  --duration-slow:    500ms;  /* Transitions complexes : ouverture de modal, sheet */
}
```

### Courbes d'accélération

```css
:root {
  --ease-out:     cubic-bezier(0.16, 1,    0.3,  1);    /* Entrées, apparitions */
  --ease-in-out:  cubic-bezier(0.65, 0,    0.35, 1);    /* Transitions d'état */
  --ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1);    /* Éléments avec rebond */
}
```

`--ease-spring` est réservé aux éléments avec un effet de rebond expressif (badge count, succès de validation). Ne pas l'utiliser sur des éléments de navigation ou des transitions structurelles.

Toutes les animations doivent respecter `prefers-reduced-motion` :

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration:   0.01ms !important;
    transition-duration:  0.01ms !important;
  }
}
```

---

## 10. Infrastructure des tokens

### Table Supabase `design_tokens`

Les tokens sont stockés dans Supabase et servent de source de vérité unique :

```sql
CREATE TABLE design_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,  -- ex: 'brand-violet'
  value       text NOT NULL,          -- ex: '#5B4FE4'
  category    text NOT NULL,          -- 'color' | 'spacing' | 'radius' | 'shadow' | 'motion' | 'typography'
  description text,
  updated_at  timestamptz DEFAULT now()
);
```

RLS activé. Lecture publique (anon key) autorisée — les tokens ne sont pas des données sensibles. Écriture réservée au rôle `service_role`.

### Package `packages/design-tokens`

Le package génère deux artefacts à chaque build :

1. **`tokens.css`** — fichier de variables CSS importé dans `apps/web/app/globals.css`
2. **`tokens.ts`** — objet TypeScript pour usage dans les tests et les composants Storybook

La génération s'exécute en tant que plugin Vite/Next.js au démarrage du serveur dev et au build de production. En cas d'indisponibilité Supabase, le build utilise le fichier `tokens.css` caché en artefact CI.

### Règle d'utilisation dans les composants

```typescript
// INTERDIT — valeur hardcodee
<div style={{ color: '#5B4FE4' }} />
<div className="text-[#5B4FE4]" />

// INTERDIT — valeur Tailwind sans token
<div className="text-violet-600" />

// CORRECT — variable CSS via token
<div style={{ color: 'var(--brand-violet)' }} />

// CORRECT — classe Tailwind mappee sur le token (via tailwind.config.ts)
<div className="text-brand-violet" />
```

Le `tailwind.config.ts` référence toutes les variables CSS via `var(--nom-du-token)`. Aucune valeur litterale ne doit apparaître dans la configuration Tailwind elle-même.

---

*Toute modification de ce fichier requiert une mise à jour correspondante de la table `design_tokens` en base et une version incrémentée dans `packages/design-tokens/package.json`.*
