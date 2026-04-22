# Composants Primitifs v2.0

**Date:** 2026-04-20
**Statut:** Référence canonique
**Version:** 2.0.0
**Dépendances:** `docs/design/00-tokens.md`, `docs/design/01-materials.md`

---

## Conventions transversales

Tous les composants primitifs respectent les règles suivantes :

- **Tokens uniquement** : aucune valeur hex, px, ou rem hardcodée — toutes les valeurs référencent `var(--nom-du-token)`
- **Focus ring** : tout élément interactif affiche `box-shadow: var(--shadow-focus)` au focus clavier
- **ARIA** : chaque composant inclut les attributs ARIA nécessaires, documentés dans sa section
- **Keyboard nav** : la navigation clavier est fonctionnelle sans souris — Tab, Enter, Space, Escape, flèches selon le contexte
- **Icônes Lucide** : les icônes proviennent exclusivement de Lucide Icons. Pas d'icônes SVG inline custom sauf décision d'ADR
- **RTL** : les composants utilisent les propriétés CSS logiques (`inset-inline-start` vs `left`, `padding-inline` vs `padding-left/right`) pour supporter l'arabe

---

## 1. Button

### Objectif

Le Button est le composant d'action primaire. Il encapsule toutes les interactions déclenchées par l'utilisateur qui produisent un effet sur le système.

### Variants (6)

| Variant | Rôle | Background | Texte |
|---|---|---|---|
| `primary` | Action principale de la page | `var(--brand-violet)` | `var(--mono-white)` |
| `secondary` | Action secondaire, alternatives | `var(--brand-violet-bg)` | `var(--brand-violet)` |
| `ghost` | Action tertiaire, navigation légère | Transparent | `var(--mono-slate)` |
| `destructive` | Suppression, révocation, actions irréversibles | `var(--functional-fail)` | `var(--mono-white)` |
| `outline` | Alternative neutre au secondary | Transparent + border `var(--mono-silver)` | `var(--mono-graphite)` |
| `link` | Navigation inline dans le texte | Transparent | `var(--brand-violet)` |

### Tailles (5)

| Taille | Height | Padding inline | Font size | Radius |
|---|---|---|---|---|
| `xs` | 28px | `var(--space-3)` | `var(--text-xs)` | `var(--radius-sm)` |
| `sm` | 32px | `var(--space-4)` | `var(--text-sm)` | `var(--radius-sm)` |
| `md` (défaut) | 36px | `var(--space-5)` | `var(--text-base)` | `var(--radius-sm)` |
| `lg` | 40px | `var(--space-6)` | `var(--text-md)` | `var(--radius-md)` |
| `xl` | 48px | `var(--space-8)` | `var(--text-lg)` | `var(--radius-md)` |

### États (6)

| État | Comportement visuel |
|---|---|
| `default` | Apparence de base définie par le variant |
| `hover` | Variant primary : `var(--brand-violet-hi)`. Transition `var(--duration-instant)` `var(--ease-out)` |
| `active` / `pressed` | Variant primary : `var(--brand-violet-lo)`. Transform `scale(0.98)` |
| `focus-visible` | `box-shadow: var(--shadow-focus)` — jamais `outline: none` sans remplacement |
| `disabled` | `opacity: 0.40`, `cursor: not-allowed`, `pointer-events: none` |
| `loading` | Spinner Lucide `Loader2` avec `animate-spin`, texte masqué pour les lecteurs d'écran via `aria-hidden` |

### Accessibilité

- Tag HTML : `<button type="button">` par défaut, `<button type="submit">` dans les formulaires
- État loading : `aria-busy="true"` + `aria-label` mis à jour (ex: "Validation en cours...")
- État disabled : `aria-disabled="true"` (jamais `disabled` seul — cela retire le composant du tab order sans annonce)
- Variant destructive : doit être accompagné d'un `aria-label` explicite décrivant l'action irréversible
- Icône seule (sans texte) : `aria-label` obligatoire

### Responsive

Sur mobile (`< 640px`), les boutons `lg` et `xl` passent en pleine largeur (`width: 100%`) sauf si la prop `noExpand` est passée.

---

## 2. Input

### Objectif

L'Input est le composant de saisie de texte avec label flottant style visionOS. Le label passe de position placeholder à position label au focus ou quand la valeur est non vide.

### Comportement du label flottant

Le label commence centré verticalement dans le champ (position placeholder). Au focus ou à la saisie, il monte avec une transition fluide vers le coin supérieur gauche, réduit en taille :

```
-- Etat vide --              -- Etat focus/rempli --
+------------------+         +------------------+
|                  |         | Label            |
|   Label          |   -->   | valeur saisie    |
|                  |         |                  |
+------------------+         +------------------+
```

Transition : `var(--duration-fast)` `var(--ease-out)`.

Label vide : `var(--text-base)`, couleur `var(--mono-steel)`, centré verticalement.
Label flottant : `var(--text-xs)`, couleur `var(--mono-slate)`, top `var(--space-2)`.

### États (6)

| État | Apparence |
|---|---|
| `default` | Border `var(--mono-silver)`, background `var(--mono-white)` |
| `focus` | Border `var(--brand-violet)`, `box-shadow: var(--shadow-focus)`, label flottant |
| `filled` | Border `var(--mono-silver)`, label flottant, texte `var(--mono-graphite)` |
| `error` | Border `var(--functional-fail)`, message d'erreur visible, icône `AlertCircle` |
| `success` | Border `var(--functional-pass)`, icône `CheckCircle` |
| `disabled` | Background `var(--mono-pearl)`, label et valeur `var(--mono-steel)`, pas d'interaction |

### Accessibilité

- `<input>` toujours associé à un `<label>` via `htmlFor` / `id` — jamais de placeholder seul comme label
- Le `placeholder` attribut est vide ou absent — le label visuel remplace ce rôle
- Messages d'erreur dans un `<p>` avec `role="alert"` et `aria-describedby` pointant vers l'input
- `autocomplete` configuré selon le type de champ (nom, email, etc.)
- `aria-invalid="true"` en état error

### Tokens utilisés

`--mono-white`, `--mono-silver`, `--mono-pearl`, `--mono-slate`, `--mono-steel`, `--mono-graphite`, `--brand-violet`, `--functional-fail`, `--functional-pass`, `--shadow-focus`, `--radius-sm`, `--text-xs`, `--text-base`, `--duration-fast`, `--ease-out`

---

## 3. GlassCard

### Objectif

Conteneur glass de contenu. La variante détermine le niveau de matériau (voir `docs/design/01-materials.md`).

### Variants (4)

| Variant | Matériau | Radius | Shadow | Usage type |
|---|---|---|---|---|
| `chrome` | `--glass-chrome` | Aucun (structurel) | Aucune | Headers sticky |
| `thick` | `--glass-thick` | `--radius-xl` | `--shadow-glass-xl` | Modals, panneaux de premier plan |
| `regular` (défaut) | `--glass-regular` | `--radius-lg` | `--shadow-glass-md` | Cartes de contenu standard |
| `thin` | `--glass-thin` | `--radius-md` | `--shadow-glass-sm` | Badges, pills, éléments flottants légers |

### Structure interne recommandée

```
GlassCard
  CardHeader (padding: var(--space-6) var(--space-6) var(--space-4))
    CardTitle (font-size: var(--text-xl), font-weight: var(--font-semibold))
    CardDescription (font-size: var(--text-sm), color: var(--mono-steel))
  CardContent (padding: 0 var(--space-6))
  CardFooter (padding: var(--space-4) var(--space-6) var(--space-6))
```

### Accessibilité

- Si la carte est cliquable dans son intégralité, utiliser `<article>` avec `tabIndex={0}` et `onKeyDown` pour Enter/Space
- Si la carte contient des actions internes, ne pas rendre la carte entière cliquable — les actions individuelles ont leur focus
- `role="region"` avec `aria-label` pour les cartes portant une section sémantique distincte

---

## 4. Toast

### Objectif

Notification temporaire non bloquante, positionnée en haut à droite de la fenêtre. Les Toasts ne demandent pas d'action — pour les confirmations, utiliser un Dialog.

### Position

Fixe, `top: var(--space-6)`, `right: var(--space-6)`. En mobile, pleine largeur en bas de l'écran.

### Types (4)

| Type | Icône Lucide | Couleur accent | Usage |
|---|---|---|---|
| `success` | `CheckCircle` | `var(--functional-pass)` | Action réussie, validation complète |
| `error` | `XCircle` | `var(--functional-fail)` | Erreur système, échec d'upload |
| `warning` | `AlertTriangle` | `var(--functional-skipped)` | Attention requise, action partielle |
| `info` | `Info` | `var(--brand-navy)` | Information contextuelle |

### Comportement

- Durée d'affichage : 4s (error : 6s, non auto-dismiss)
- Entrée : `translateX(+110%)` vers `translateX(0)`, `var(--duration-base)` `var(--ease-out)`
- Sortie : `opacity: 1` vers `opacity: 0`, `var(--duration-fast)` `var(--ease-in-out)`
- Maximum 3 toasts simultanés — le plus ancien est retiré si un 4ème apparaît
- Pause au survol (la durée est suspendue tant que la souris est sur le toast)

### Accessibilité

- `role="status"` pour success et info, `role="alert"` pour error et warning
- `aria-live="polite"` pour status, `aria-live="assertive"` pour alert
- Bouton de fermeture : icône `X` Lucide avec `aria-label="Fermer la notification"`
- Jamais de toast auto-dismiss sur les erreurs — l'utilisateur doit explicitement fermer

### Tokens utilisés

`--glass-thick`, `--shadow-glass-xl`, `--radius-lg`, `--functional-pass`, `--functional-fail`, `--functional-skipped`, `--brand-navy`, `--duration-base`, `--duration-fast`, `--ease-out`, `--ease-in-out`

---

## 5. ConformityGauge

### Objectif

Visualisation SVG en arc de cercle représentant le score de conformité BCT d'une annexe ou d'un rapport. Composant de premier plan dans le tableau de bord.

### Spécifications SVG

- Taille du composant : 240px x 240px (ajustable via prop `size`)
- Arc : 240 degrés (de -210deg à +30deg, soit une ouverture en bas)
- Stroke width : 16px (piste de fond) / 14px (arc de progression)
- Centre : (120, 120)
- Rayon du cercle de l'arc : 92px

### Couleurs selon le score

| Plage de score | Couleur de l'arc | Token |
|---|---|---|
| 90-100% | Vert | `var(--functional-pass)` |
| 70-89% | Or | `var(--brand-gold)` |
| 50-69% | Orange | `var(--functional-skipped)` |
| 0-49% | Rouge | `var(--functional-fail)` |

La piste de fond (arc complet non rempli) utilise `var(--mono-silver)`.

### Contenu central

```
+-------------------+
|                   |
|    [Score%]       |  var(--text-4xl), var(--font-semibold), var(--mono-graphite)
|    Conformité     |  var(--text-sm), var(--mono-steel)
|    [Annexe]       |  var(--text-xs), var(--mono-silver)
|                   |
+-------------------+
```

Le score est animé de 0 au score réel à l'entrée dans le viewport (`IntersectionObserver`). Durée : `var(--duration-slow)`, easing `var(--ease-out)`. Désactivé si `prefers-reduced-motion`.

### Accessibilité

- `role="img"` sur le `<svg>`
- `aria-label="Score de conformité : [score]% pour l'annexe [code]"`
- `<title>` interne au SVG pour les lecteurs d'écran qui ne lisent pas `aria-label`
- Valeur texte également visible dans le DOM — jamais de chiffre uniquement dans le SVG

### Tokens utilisés

`--functional-pass`, `--functional-fail`, `--functional-skipped`, `--brand-gold`, `--mono-silver`, `--mono-graphite`, `--mono-steel`, `--text-4xl`, `--text-sm`, `--text-xs`, `--font-semibold`, `--duration-slow`, `--ease-out`

---

## 6. VerdictTable

### Objectif

Tableau de résultats de validation BCT. Affiche les règles vérifiées avec leur statut PASS/FAIL/SKIPPED/PENDING. Colonne header sticky Chrome. Lignes expandables.

### Structure

```
+--------------------------------------------------+  <-- Chrome header sticky
| Ref BCT  | Libellé              | Statut | Score |
+--------------------------------------------------+
| BCT-001  | Fonds propres...     | PASS   | 100%  |  <-- Ligne contractée
+--------------------------------------------------+
| BCT-002  | Ratio de levier...   | FAIL   |  68%  |  <-- Ligne expandée
|          | Détail : valeur attendue 8%, valeur    |
|          | calculée 5.2%. Ecart : -2.8pp.         |
|          | [Voir recommandation Regalica]          |
+--------------------------------------------------+
```

### Header

- Matériau : Chrome (`var(--glass-chrome)`)
- Position : `sticky top-0`
- Hauteur : 44px
- Texte : `var(--text-sm)`, `var(--font-semibold)`, `var(--mono-graphite)`, `letter-spacing: var(--tracking-uppercase)`, `text-transform: uppercase`
- Z-index : supérieur aux lignes du tableau

### Lignes

- Hauteur contractée : 48px
- Background alterné : `var(--mono-white)` / `var(--mono-pearl)`
- Hover : background `var(--brand-violet-bg)`
- Expansion : animation `var(--duration-fast)` `var(--ease-out)`, chevron `ChevronDown` Lucide qui pivote 180deg

### Colonnes numériques

Toutes les cellules numériques (scores, valeurs calculées) utilisent la propriété CSS `font-variant-numeric: tabular-nums` pour l'alignement vertical des chiffres. Classe Tailwind : `tabular-nums`.

### Accessibilité

- `<table>` sémantique avec `<thead>`, `<tbody>`
- `<th scope="col">` pour les en-têtes de colonnes
- Ligne expandable : `<tr>` avec `aria-expanded="true/false"` et `aria-controls` pointant vers la ligne de détail
- La ligne de détail masquée est `hidden` (pas simplement `opacity: 0`) quand contractée
- Trier une colonne : bouton dans le `<th>` avec `aria-sort="ascending|descending|none"`

### Tokens utilisés

`--glass-chrome`, `--mono-white`, `--mono-pearl`, `--mono-graphite`, `--brand-violet-bg`, `--functional-pass`, `--functional-fail`, `--functional-skipped`, `--functional-pending`, `--text-sm`, `--font-semibold`, `--tracking-uppercase`, `--duration-fast`, `--ease-out`

---

## 7. ChatBubble

### Objectif

Bulle de message dans l'interface de chat Regalica. Deux orientations selon l'émetteur.

### Variantes

**Message utilisateur (droite)**
- Alignement : `justify-end`
- Background : `var(--brand-violet)`, border-radius `var(--radius-xl)` avec coin inférieur droit à `var(--radius-xs)`
- Texte : `var(--mono-white)`, `var(--text-base)`, `var(--leading-normal)`
- Max-width : 72% du conteneur

**Message Regalica (gauche)**
- Alignement : `justify-start`
- Background : `var(--glass-regular)` (matériau Regular)
- Texte : `var(--mono-graphite)`, `var(--text-base)`, `var(--leading-normal)`
- Max-width : 80% du conteneur
- Avatar violet circulaire (32px) à gauche : lettre "R" en `var(--mono-white)` sur fond `var(--brand-violet)`

### Contenu des messages Regalica

Les messages Regalica peuvent contenir :
- Texte Markdown parsé (gras, italique, listes uniquement — pas de titres)
- `CitationPill` inlinés dans le texte
- Un `ConformityGauge` compact (taille 120px) si le message contient un score

### Horodatage

`var(--text-xs)`, `var(--mono-steel)`, affiché sous chaque bulle. Format : `HH:mm`.

### Accessibilité

- Conteneur de chat : `role="log"`, `aria-live="polite"`, `aria-label="Conversation avec Regalica"`
- Chaque message : `role="article"`
- Avatar Regalica : `aria-hidden="true"` (décoratif)
- Distinction émetteur : `aria-label` sur chaque article incluant l'émetteur ("Vous, 14:32" / "Regalica, 14:33")

---

## 8. TypingIndicator

### Objectif

Indicateur visuel que Regalica est en train de formuler une réponse. Trois points animés.

### Rendu

```
[R]  •  •  •
```

Avatar Regalica à gauche (identique au `ChatBubble` Regalica), suivi de trois points dans une bulle `glass-thin`.

### Animation des points

Chaque point est un cercle de 6px de diamètre, couleur `var(--brand-violet)`. L'animation est un cycle de scale `1.0` vers `1.4` vers `1.0` :

- Point 1 : `delay: 0ms`
- Point 2 : `delay: 150ms`
- Point 3 : `delay: 300ms`
- Durée du cycle : `600ms`, `var(--ease-in-out)`, répétition infinie

`prefers-reduced-motion` : l'animation est remplacée par `opacity: 0.4` sur les points sans cycle, statiques.

### Accessibilité

- `role="status"`, `aria-label="Regalica est en train de répondre"`
- L'animation est `aria-hidden="true"` — le texte accessible est dans le `aria-label`

---

## 9. CitationPill

### Objectif

Pill compacte citant une source de la base de connaissances Regalica. Apparaît inline dans les messages Regalica ou dans les détails d'investigation. Cliquable pour ouvrir le `RegalicaContextualHelpPopover`.

### Anatomie

```
[BookOpen]  Circulaire BCT N°12  [92%]
```

- Icône `BookOpen` Lucide, 12px, couleur `var(--brand-navy)`
- Titre tronqué à 24 caractères avec ellipse
- Badge de confiance : score en `var(--text-xs)`, `tabular-nums`, fond `var(--brand-navy-bg)`
- Background global : `var(--glass-thin)` (matériau Thin)
- Border-radius : `var(--radius-full)`
- Padding : `var(--space-1)` vertical, `var(--space-3)` horizontal

### Comportement au clic

Ouvre `RegalicaContextualHelpPopover` ancré à la pill. Le popover contient le texte complet de la source, le niveau de confiance, et la version du modèle.

### États

- `default` : apparence de base
- `hover` : background `var(--brand-navy-bg)` plus opaque, curseur pointer, transition `var(--duration-instant)`
- `focus-visible` : `box-shadow: var(--shadow-focus)`
- `active` : popover ouvert, fond légèrement plus sombre

### Accessibilité

- Tag : `<button>` (déclencheur d'action)
- `aria-label="Voir la source : [titre complet]"`
- `aria-expanded="true/false"` selon l'état du popover
- `aria-haspopup="dialog"` pour annoncer l'ouverture d'un popover

### Tokens utilisés

`--glass-thin`, `--brand-navy`, `--brand-navy-bg`, `--radius-full`, `--text-xs`, `--space-1`, `--space-3`, `--shadow-focus`, `--duration-instant`

---

## 10. TrustBar

### Objectif

Barre horizontale en haut de la page principale (sous le header de navigation), affichant 4 badges d'état de conformité globale de la session en cours. Matériau Chrome.

### Structure

```
[ShieldCheck] Conformité globale : 87%   [Clock] Dernière MAJ : 14:32   [FileCheck] 12/14 annexes   [AlertTriangle] 2 anomalies
```

### Badges (4)

| Badge | Icône Lucide | Token de couleur | Contenu |
|---|---|---|---|
| Score global | `ShieldCheck` | `var(--functional-pass)` si >=80%, `var(--functional-skipped)` si 60-79%, `var(--functional-fail)` si <60% | Pourcentage moyen de conformité |
| Dernière mise à jour | `Clock` | `var(--mono-steel)` | Horodatage de la dernière validation |
| Couverture annexes | `FileCheck` | `var(--brand-navy)` | X/Y annexes validées |
| Anomalies | `AlertTriangle` | `var(--functional-fail)` si >0, `var(--mono-steel)` si 0 | Nombre d'anomalies ouvertes |

### Disposition

Hauteur : 40px. Flexbox avec `gap: var(--space-6)`, centrés verticalement. Padding horizontal : `var(--space-6)`.

### Accessibilité

- `role="status"` sur le `<div>` contenant la TrustBar
- `aria-label="Résumé de conformité BCT en temps réel"`
- Chaque badge est un `<span>` non interactif avec les données accessibles en texte (`aria-label` si l'icône porte la sémantique)
- La TrustBar se met à jour via Supabase Realtime — les mises à jour sont annoncées via `aria-live="polite"`

### Tokens utilisés

`--glass-chrome`, `--mono-steel`, `--brand-navy`, `--functional-pass`, `--functional-fail`, `--functional-skipped`, `--text-sm`, `--font-medium`, `--space-6`, `--duration-base`

---

*Ce document est la source de vérité pour `packages/ui`. Chaque composant doit avoir une entrée Storybook correspondante en Phase 1.*
