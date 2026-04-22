# Matériaux Glass v2.0 — 4 niveaux

**Date:** 2026-04-20
**Statut:** Référence canonique
**Version:** 2.0.0
**Dépendances:** `docs/design/00-tokens.md`

---

## Principe

Le système de matériaux glass définit 4 niveaux de translucidité pour les surfaces de l'interface. Ces niveaux ne sont pas interchangeables — chaque niveau a des contextes d'usage précis. Le verre est un outil de hiérarchie visuelle, pas un style décoratif.

**Règle absolue : jamais plus de 2 couches glass visibles simultanément.** Une page peut avoir un fond glass (niveau 1) et une carte glass (niveau 2), mais une carte glass à l'intérieur d'une autre carte glass à l'intérieur d'un modal glass constitue une violation.

---

## Niveau 1 — Chrome

### Propriétés CSS

```css
.glass-chrome {
  background:      var(--glass-chrome);           /* rgba(255,255,255,0.92) */
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom:   1px solid var(--glass-border-lo); /* rgba(0,0,0,0.06) */
  /* Pas de border-radius : Chrome est toujours pleine largeur */
  box-shadow:      none; /* Le Chrome n'a pas d'ombre — il est structurel */
}
```

### Contextes d'usage

- Barre de navigation principale (`<header>` sticky)
- Barre d'onglets sticky en haut d'une section
- `TrustBar` (barre de statut de conformité en haut de page)
- En-têtes de tableau avec position sticky (`VerdictTable` header)

Le Chrome ne doit jamais apparaître comme un composant flottant. Il est réservé aux éléments structurellement ancrés au bord d'une surface.

### Règle d'empilement

Le Chrome occupe toujours la couche supérieure. Les éléments qui passent derrière le Chrome (au scroll) sont visibles à travers lui — c'est l'effet recherché. Ne jamais placer un élément glass en dessous d'un Chrome sans qu'il y ait un mouvement de scroll entre eux.

### Composition Tailwind

```typescript
const chromeClasses = [
  "bg-white/[0.92]",
  "backdrop-blur-[20px]",
  "backdrop-saturate-[180%]",
  "border-b",
  "border-black/[0.06]",
].join(" ");
```

Tailwind ne dispose pas de classe native pour `saturate(180%)` en backdrop — il faut ajouter l'extension dans `tailwind.config.ts` :

```typescript
// tailwind.config.ts
theme: {
  extend: {
    backdropSaturate: {
      180: '180%',
    }
  }
}
```

### Exemple composant React (shadcn/ui)

```typescript
// packages/ui/src/glass/chrome-header.tsx
import { cn } from "@/lib/utils";

interface ChromeHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function ChromeHeader({ children, className }: ChromeHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50",
        "bg-white/[0.92]",
        "backdrop-blur-[20px] supports-no-backdrop-blur:bg-white",
        "border-b border-black/[0.06]",
        className
      )}
    >
      {children}
    </header>
  );
}
```

Le fallback `supports-no-backdrop-blur:bg-white` est obligatoire pour les navigateurs sans support `backdrop-filter`.

---

## Niveau 2 — Thick

### Propriétés CSS

```css
.glass-thick {
  background:      var(--glass-thick);             /* rgba(255,255,255,0.80) */
  backdrop-filter: blur(32px) saturate(180%);
  -webkit-backdrop-filter: blur(32px) saturate(180%);
  border:          1px solid var(--glass-border-hi); /* rgba(255,255,255,0.80) */
  border-radius:   var(--radius-xl);               /* 20px */
  box-shadow:      var(--shadow-glass-xl);
}
```

Le rayon est `--radius-xl` (20px) pour les modals et sheets. Pour les cartes larges, `--radius-2xl` (28px) est autorisé.

### Contextes d'usage

- Modals et dialogs (toutes les popups métier documentées dans `docs/design/03-popups.md`)
- Sheets latéraux (SettingsSheet, ReportsHistorySheet)
- Panneaux de configuration étendus
- Cartes de résumé de premier plan (dashboard hero)

Le Thick est le matériau modal par excellence. Sa haute opacité (80%) assure une lisibilité maximale sur n'importe quel fond, ce qui est critique pour les données de conformité.

### Règle d'empilement

Le Thick est la couche la plus haute autorisée dans un empilement glass normal. Un modal Thick peut apparaître sur un fond Regular, mais un modal Thick ne peut pas contenir des cartes Thick à l'intérieur.

### Composition Tailwind

```typescript
const thickClasses = [
  "bg-white/[0.80]",
  "backdrop-blur-[32px]",
  "backdrop-saturate-[180%]",
  "border",
  "border-white/[0.80]",
  "rounded-xl",        /* --radius-xl = 20px */
  "shadow-glass-xl",   /* défini dans tailwind.config.ts via var(--shadow-glass-xl) */
].join(" ");
```

### Exemple composant React (shadcn/ui)

```typescript
// packages/ui/src/glass/glass-modal.tsx
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface GlassModalProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassModal({ children, className }: GlassModalProps) {
  return (
    <DialogContent
      className={cn(
        "bg-white/[0.80]",
        "backdrop-blur-[32px] supports-no-backdrop-blur:bg-white",
        "border border-white/[0.80]",
        "rounded-xl",
        "shadow-[var(--shadow-glass-xl)]",
        className
      )}
    >
      {children}
    </DialogContent>
  );
}
```

---

## Niveau 3 — Regular

### Propriétés CSS

```css
.glass-regular {
  background:      var(--glass-regular);           /* rgba(255,255,255,0.65) */
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border:          1px solid var(--glass-border-lo); /* rgba(0,0,0,0.06) */
  border-radius:   var(--radius-lg);               /* 14px */
  box-shadow:      var(--shadow-glass-md);
}
```

### Contextes d'usage

- Cartes de contenu standard (`GlassCard` variant `regular`)
- Panneaux latéraux d'information (sans être des sheets full-height)
- Toasts et notifications
- Popovers de taille medium
- Éléments de liste avec fond contextuel

Le Regular est le matériau de travail quotidien. La majorité des cartes de l'interface utilisent ce niveau.

### Règle d'empilement

Le Regular peut être posé sur le fond de page (gradient) ou sur une surface `--mono-pearl`. Il ne peut pas être posé sur un autre Regular sans violer la règle des 2 couches maximum.

### Composition Tailwind

```typescript
const regularClasses = [
  "bg-white/[0.65]",
  "backdrop-blur-[20px]",
  "backdrop-saturate-[180%]",
  "border",
  "border-black/[0.06]",
  "rounded-[14px]",    /* --radius-lg */
  "shadow-glass-md",
].join(" ");
```

### Exemple composant React (shadcn/ui)

```typescript
// packages/ui/src/glass/glass-card.tsx
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  variant?: "chrome" | "thick" | "regular" | "thin";
  className?: string;
}

const variantClasses: Record<NonNullable<GlassCardProps["variant"]>, string> = {
  chrome:  "bg-white/[0.92] backdrop-blur-[20px] border-b border-black/[0.06]",
  thick:   "bg-white/[0.80] backdrop-blur-[32px] border border-white/[0.80] rounded-xl shadow-[var(--shadow-glass-xl)]",
  regular: "bg-white/[0.65] backdrop-blur-[20px] border border-black/[0.06] rounded-[14px] shadow-[var(--shadow-glass-md)]",
  thin:    "bg-white/[0.40] backdrop-blur-[12px] border border-black/[0.06] rounded-[10px] shadow-[var(--shadow-glass-sm)]",
};

export function GlassCard({
  children,
  variant = "regular",
  className
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "backdrop-saturate-[180%]",
        "supports-no-backdrop-blur:bg-white",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </div>
  );
}
```

---

## Niveau 4 — Thin

### Propriétés CSS

```css
.glass-thin {
  background:      var(--glass-thin);              /* rgba(255,255,255,0.40) */
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  border:          1px solid var(--glass-border-lo); /* rgba(0,0,0,0.06) */
  border-radius:   var(--radius-md);               /* 10px */
  box-shadow:      var(--shadow-glass-sm);
}
```

### Contextes d'usage

- `CitationPill` (pill de citation KB dans le chat)
- Badges de statut dans des contextes déjà glass
- Indicateurs flottants sur des visualisations
- Éléments hover-reveals sur des tableaux
- `TypingIndicator` (fond du composant de frappe)

Le Thin est le matériau le plus fragile visuellement. Il ne doit jamais porter de texte de corps — uniquement des labels très courts (2-3 mots) ou des icônes.

### Règle d'empilement

Le Thin peut être posé sur un Regular ou un Thick, constituant ainsi la deuxième couche glass autorisée. Il ne peut pas être posé sur un autre Thin, ni être la première couche (il nécessite un fond avec suffisamment de contraste derrière lui pour être lisible).

### Composition Tailwind

```typescript
const thinClasses = [
  "bg-white/[0.40]",
  "backdrop-blur-[12px]",
  "backdrop-saturate-[180%]",
  "border",
  "border-black/[0.06]",
  "rounded-[10px]",    /* --radius-md */
  "shadow-[var(--shadow-glass-sm)]",
].join(" ");
```

---

## Accessibilité

### WCAG AA sur les fonds glass

Les matériaux glass créent des défis d'accessibilité car le fond visible à travers le verre affecte le ratio de contraste du texte. Les règles suivantes s'appliquent :

| Niveau Glass | Texte autorisé | Ratio minimum |
|---|---|---|
| Chrome (0.92) | Tout texte | 4.5:1 (AA) garanti sur fond blanc |
| Thick (0.80) | Tout texte | 4.5:1 (AA) — valider sur le fond réel |
| Regular (0.65) | Texte `--mono-graphite` et plus sombre uniquement | Tester systématiquement |
| Thin (0.40) | Uniquement `--mono-black` sur fond clair | Tester systématiquement |

Les chiffres critiques (scores de conformité, pourcentages de risque) portent l'attribut `data-a11y="critical"` et sont soumis au niveau AAA (7:1) dans le pipeline CI axe-core.

### Attribut `data-a11y` obligatoire

```typescript
// Chiffre critique — gate CI AAA
<span data-a11y="critical" className="tabular-nums font-semibold">
  {conformityScore}%
</span>

// Texte standard — gate CI AA
<p className="text-mono-slate">Description...</p>
```

### Fallback `prefers-reduced-motion`

`backdrop-filter` crée une charge GPU. Les navigateurs respectant `prefers-reduced-motion` doivent recevoir un fond opaque :

```css
@media (prefers-reduced-motion: reduce) {
  .glass-chrome,
  .glass-thick,
  .glass-regular,
  .glass-thin {
    backdrop-filter:         none;
    -webkit-backdrop-filter: none;
    /* Les backgrounds rgba restent, mais sans blur */
  }

  /* Rendre les surfaces opaques pour la lisibilite */
  .glass-regular { background: var(--mono-white); }
  .glass-thin    { background: var(--mono-pearl); }
}
```

En pratique, la classe Tailwind `supports-no-backdrop-blur:bg-white` couvre les navigateurs sans support natif. Le media query `prefers-reduced-motion` couvre le cas où l'utilisateur préfère réduire les effets.

---

## Mode Sombre

Le mode sombre n'est pas une priorité pour Regalica IDC v2.0. Il est noté ici pour que les décisions d'architecture de Phase 0 ne le rendent pas impossible en Phase 3.

**Considérations pour une implémentation future :**

- Les `rgba(255,255,255,...)` des backgrounds glass doivent devenir des références à des tokens CSS qui changent selon le schéma de couleur : `var(--glass-regular)` pointera vers `rgba(30,30,32,0.65)` en dark mode
- Les ombres glass doivent être inversées (highlight interne devient `rgba(255,255,255,0.05)`)
- Le fond de page `--bg-page` passe de blanc vers `#0A0A0A`
- Aucun hard-code dans les composants ne doit empêcher cette évolution — d'où l'obligation de référencer les tokens CSS

La classe Tailwind `dark:` ne doit pas être utilisée en Phase 0 — cela créerait une inconsistance avec les tokens non encore définis pour le mode sombre.

---

*Ce document est la référence pour le composant `GlassCard` dans `packages/ui`. Toute déviation requiert un ADR.*
