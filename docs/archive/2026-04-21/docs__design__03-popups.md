# Popups et Sheets Métier v2.0 — 10 composants

**Date:** 2026-04-20
**Statut:** Référence canonique
**Version:** 2.0.0
**Dépendances:** `docs/design/00-tokens.md`, `docs/design/01-materials.md`, `docs/design/02-components.md`

---

## Anatomie canonique

Tous les modals et sheets partagent la même anatomie structurelle. Les dérogations sont documentées dans chaque composant.

### Header (hauteur fixe : 56px)

```
+--[X]-------[H2 — Titre du modal]--[Description courte]--+
```

- Bouton de fermeture : icône `X` Lucide, 20px, couleur `var(--mono-slate)`, positionné `inset-inline-end: var(--space-4)`, centré verticalement
- Titre H2 : `var(--text-xl)`, `var(--font-semibold)`, `var(--mono-graphite)`
- Description : `var(--text-sm)`, `var(--mono-steel)`, sur la même ligne ou en sous-titre selon la largeur
- Séparateur bas : 1px solid `var(--mono-silver)`

### Body

- Padding : `var(--space-6)` sur tous les côtés
- Overflow : `auto` avec scroll interne — jamais de scroll de la page derrière le modal
- Max-height : `calc(100vh - 96px)` (48px pour le header, 48px pour le footer)

### Footer

- Hauteur : auto, minimum 64px avec padding `var(--space-4)` vertical
- Disposition : flex, `justify-end`, `gap: var(--space-3)`
- Deux boutons standard : `Annuler` (variant `ghost`) + bouton d'action primaire (variant selon le contexte)
- Séparateur haut : 1px solid `var(--mono-silver)`

### Matériau et overlay

- Matériau du modal : Thick (`var(--glass-thick)`, `backdrop-filter: blur(32px) saturate(180%)`)
- Overlay de fond : `rgba(0, 0, 0, 0.12)` avec `backdrop-filter: blur(4px)` sur le contenu derrière
- Animation d'entrée du modal : `scale(0.96) opacity(0)` vers `scale(1) opacity(1)`, `var(--duration-base)` `var(--ease-spring)`
- Animation de l'overlay : `opacity(0)` vers `opacity(1)`, `var(--duration-fast)` `var(--ease-out)`

### Focus trap

Tous les modals activent un focus trap : la navigation Tab reste à l'intérieur du modal tant qu'il est ouvert. Le premier élément focusable reçoit le focus à l'ouverture.

### Fermeture

- Touche Escape : ferme le modal (sauf les modals marqués `non-dismissible`)
- Clic sur l'overlay : ferme le modal (sauf les modals marqués `non-dismissible`)
- Bouton X : toujours disponible, sauf exception documentée
- Les modals destructifs affichent une confirmation avant fermeture si des modifications non sauvegardées sont présentes

### Deep-linking par hash URL

Chaque modal peut être ouvert directement via un hash URL. La route parente gère l'ouverture en lisant `window.location.hash` au chargement. Format : `#modal-{identifiant}`.

---

## 1. UploadReportModal

**Hash URL :** `#modal-upload-report`
**Largeur :** 560px (`md`)
**Dismissible :** Oui

### Objectif

Permet à l'utilisateur de charger un nouveau rapport XML BCT. Gère la sélection de l'annexe, la période de reporting, et la validation préliminaire du fichier avant envoi au pipeline de validation complet.

### Contenu du body

**Sélection de l'annexe**

Dropdown de sélection de l'annexe BCT cible. Les options proviennent de la base de données (table `annexes`) — jamais hardcodées. Le dropdown affiche : code court (ex: "A1"), libellé complet ("Tableau des Fonds Propres"), et fréquence de reporting (mensuelle/trimestrielle/annuelle).

**Sélecteur de période**

Le sélecteur de période est adaptatif selon la fréquence de l'annexe sélectionnée :
- Fréquence mensuelle : sélecteur mois/année (ex: "Mars 2026")
- Fréquence trimestrielle : sélecteur trimestre/année (ex: "Q1 2026")
- Fréquence annuelle : sélecteur année (ex: "2025")

La période est bloquée si un rapport pour cette annexe et cette période est déjà signé — un message d'information explique la situation.

**Zone de drop**

Zone de drag-and-drop avec border en pointillés `2px dashed var(--mono-silver)`. Icône `Upload` Lucide centré, texte d'instruction en `var(--mono-steel)`. Au survol d'un fichier valide : border passe à `var(--brand-violet)`, background `var(--brand-violet-bg)`.

Validation côté client immédiate :
- Type MIME : `application/xml` ou `text/xml`
- Extension : `.xml`
- Taille : maximum 50 Mo
- En cas d'erreur : message inline sous la zone (pas de Toast)

Une fois le fichier accepté, affichage du nom, de la taille, et du hash SHA-256 calculé côté client (via `crypto.subtle.digest`). Le hash est affiché en `var(--text-xs)` `font-mono` sous le nom du fichier.

**Pill de pré-vérification inter-annexe**

Avant l'upload, si l'annexe a des dépendances avec d'autres annexes, une pill `CitationPill`-style affiche le statut de pré-vérification :

```
[LinkIcon]  Pré-check A3 requis   [CheckCircle vert]  Disponible
```

Si le rapport dépendant est manquant : pill orange avec `AlertTriangle`, et le bouton de soumission est désactivé avec un message explicatif.

### Footer

- Bouton `Annuler` (ghost)
- Bouton `Charger le rapport` (primary) — désactivé si le fichier n'est pas sélectionné ou si le pré-check échoue

### Accessibilité

- La zone de drag-and-drop est également accessible comme `<input type="file">` cliquable avec `aria-label="Zone de chargement du rapport XML"`
- Annonce des changements d'état via `aria-live="polite"` (fichier sélectionné, hash calculé, pré-check terminé)

---

## 2. StructureCheckModal

**Hash URL :** `#modal-structure-check`
**Largeur :** 720px (`lg`)
**Dismissible :** Oui

### Objectif

Affiche les résultats de la vérification structurelle du XML uploadé. Les 7 invariants structurels BCT sont vérifiés avant d'entrer dans le pipeline de validation complet. Des suggestions de réparation automatique sont proposées quand possible.

### Contenu du body

**En-tête de résultat**

Résumé : nombre d'invariants passés, nombre en échec. Ex: "5 / 7 invariants validés". Couleur selon le ratio : `var(--functional-pass)` si 7/7, `var(--functional-skipped)` si >=5/7, `var(--functional-fail)` si <5/7.

**Liste des 7 invariants**

Chaque invariant est affiché dans une ligne avec :
- Icône statut : `CheckCircle` (`var(--functional-pass)`) / `XCircle` (`var(--functional-fail)`) / `AlertTriangle` (`var(--functional-skipped)`)
- Libellé de l'invariant : `var(--text-base)`, `var(--mono-graphite)`
- Détail technique (si échec) : `var(--text-sm)`, `var(--mono-steel)`, expandable

Les 7 invariants BCT vérifiés :
1. Namespace XML valide (conformité au schéma XSD BCT)
2. Encodage UTF-8 sans BOM
3. Structure des entités déclarantes (SIREN/LEI présent)
4. Période de reporting cohérente avec le code annexe
5. Lignes obligatoires toutes présentes (pas de section manquante)
6. Formats numériques (décimales selon la norme BCT)
7. Totaux de contrôle internes cohérents

**Liste RepairSuggestion**

Pour chaque invariant en échec avec réparation possible, une `RepairSuggestion` est affichée :
- Description de la réparation proposée
- Extrait du XML avant/après (diff minimal)
- Bouton `Appliquer la correction` (secondary)

Les corrections appliquées modifient le XML en mémoire. Le nouveau SHA-256 est recalculé et affiché.

**CTA de re-upload**

Si des corrections ont été appliquées : bouton `Télécharger le XML corrigé` pour que l'utilisateur puisse sauvegarder le fichier corrigé localement.

### Footer

- `Annuler` (ghost) — abandon
- `Ignorer et valider quand même` (outline) — visible uniquement si des échecs sont non-bloquants
- `Lancer la validation` (primary) — activé si tous les invariants bloquants sont passés

### Accessibilité

- Liste des invariants : `<ul>` avec `<li>` pour chaque invariant
- Invariants en échec avec réparation : `aria-expanded` sur le bouton d'expansion du détail
- `aria-live="assertive"` sur la zone des corrections appliquées

---

## 3. ValidationProgressModal

**Hash URL :** `#modal-validation-progress`
**Largeur :** 560px (`md`)
**Dismissible :** Non (pendant l'exécution)

### Objectif

Affiche la progression du pipeline de validation en temps réel via Supabase Realtime. Le pipeline comporte 14 étapes. L'utilisateur ne peut pas fermer ce modal pendant qu'une validation est en cours.

### Comportement non-dismissible

- La touche Escape est désactivée pendant l'exécution du pipeline
- Le clic sur l'overlay est désactivé
- Le bouton X est absent de l'en-tête pendant l'exécution
- Après la fin du pipeline (succès ou échec), le modal devient dismissible et le bouton X apparaît

### Pipeline — 14 étapes

Chaque étape est affichée dans une liste verticale avec :
- Icône de statut (en attente : `Circle` gris, en cours : `Loader2` animé violet, succès : `CheckCircle` vert, échec : `XCircle` rouge)
- Libellé de l'étape
- Durée d'exécution (affichée en millisecondes après complétion)

Les 14 étapes du pipeline :
1. Initialisation de la session de validation
2. Chargement des règles BCT applicables (depuis Supabase)
3. Parsing du XML
4. Résolution des entités déclarantes
5. Vérification des limites réglementaires
6. Calcul des ratios prudentiels
7. Vérification des seuils d'alerte
8. Analyse des écarts par rapport à la période précédente
9. Vérification des règles de cohérence inter-rubriques
10. Calcul du score de conformité
11. Génération des recommandations Regalica (LLM)
12. Indexation vectorielle dans pgvector
13. Persistance des résultats en base
14. Notification des parties prenantes

### Affichage en temps réel

La progression est reçue via un channel Supabase Realtime sur la table `agent_events`, filtré par `validation_run_id`. Chaque event met à jour l'état de l'étape correspondante.

Une barre de progression globale en haut du modal indique le pourcentage d'étapes complétées. Elle utilise `var(--brand-violet)` pour la partie remplie et `var(--mono-silver)` pour la piste.

### Contenu de l'en-tête (non-dismissible)

```
[Loader2 animé]  Validation en cours...   [id de la session]
Description : Ne fermez pas cette fenêtre. La validation est en cours.
```

### Footer pendant l'exécution

Un seul bouton : `Annuler la validation` (variant `destructive`, outline) — avec confirmation via AlertDialog intégré.

### Footer après complétion

- `Fermer` (ghost)
- `Voir les résultats détaillés` (primary) → ferme ce modal et ouvre `DeepDiveInvestigationModal`

### Accessibilité

- `role="dialog"` avec `aria-modal="true"`, `aria-label="Validation en cours"`
- `aria-live="polite"` sur la liste des étapes — annonce les transitions d'état
- La barre de progression : `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="14"`

---

## 4. DeepDiveInvestigationModal

**Hash URL :** `#modal-deepdive`
**Largeur :** 960px (`xl`)
**Dismissible :** Oui

### Objectif

Analyse causale approfondie d'une anomalie ou d'un résultat de validation. Organisée en 5 couches causales présentées en accordéon expandable. Le contenu est généré par le pipeline LLM Regalica et indexé dans pgvector.

### Structure en accordéon — 5 couches causales

Chaque couche est un panneau accordéon avec :
- En-tête : icône Lucide + titre de la couche + badge de criticité + chevron `ChevronDown` (pivote 180deg quand ouvert)
- Corps : contenu détaillé, expandable
- Transition : `var(--duration-fast)` `var(--ease-out)`

**Couche 1 — Données**
Icône : `Database`
Contenu : valeur brute extraite du XML, valeur attendue selon la règle, delta absolu et relatif. Format tableau deux colonnes.

**Couche 2 — Règle**
Icône : `BookOpen`
Contenu : texte complet de la règle BCT applicable (chargé depuis la table `rules`), référence réglementaire, date d'entrée en vigueur. `CitationPill` cliquables sur les références.

**Couche 3 — Calcul**
Icône : `Calculator`
Contenu : trace du calcul pas à pas (formule appliquée, valeurs intermédiaires, résultat final). Format liste numérotée avec monospace pour les expressions mathématiques.

**Couche 4 — Contexte**
Icône : `BarChart2`
Contenu : comparaison avec les périodes précédentes (6 dernières occurrences), tendance graphique minimal (sparkline SVG), mentions d'événements contextuels si disponibles.

**Couche 5 — Recommandation**
Icône : `Lightbulb`
Contenu : recommandation Regalica générée par LLM, confiance en pourcentage, actions concrètes suggérées sous forme de liste, références aux sources KB. `CitationPill` pour chaque source.

### Disposition

Sur la largeur xl (960px), les couches 1 et 2 peuvent être affichées côte à côte (colonnes égales). Les couches 3, 4, 5 occupent la pleine largeur. Sur des largeurs inférieures à 768px, toutes les couches passent en colonne unique.

### Accessibilité

- Accordéon : pattern ARIA disclosure widget — `<button aria-expanded="true/false" aria-controls="panel-{id}">` + `<div id="panel-{id}" role="region">`
- Les chevrons sont `aria-hidden="true"`
- Les `CitationPill` dans le contenu respectent leurs propres specs d'accessibilité

---

## 5. FourEyesSignatureModal

**Hash URL :** `#modal-four-eyes`
**Largeur :** 400px (`sm`)
**Dismissible :** Oui (avec confirmation si non soumis)

### Objectif

Modal de signature à double regard (four-eyes principle) pour les actions de validation définitive d'une annexe. Requiert une confirmation explicite avant d'activer le bouton de signature.

### Contexte destructif-adjacent

Ce modal ne supprime rien, mais déclenche une action irréversible (signature officielle d'un rapport BCT). Il suit les règles des dialogues destructifs :

- Icône `ShieldCheck` en `var(--brand-navy)` dans l'en-tête (pas `AlertTriangle` — l'action est positive mais irréversible)
- Le nom complet de l'annexe et la période apparaissent dans le corps du texte de confirmation
- Délai obligatoire de 2 secondes sur le bouton de signature avant qu'il devienne cliquable
- Checkbox de confirmation obligatoire avant que le délai commence

### Contenu du body

**Résumé de l'action**

```
Vous vous apprêtez à signer officiellement :
Annexe : [Code] — [Libellé complet]
Période : [Période]
Score de conformité : [Score]%
Signataire : [Prénom Nom] ([email])
```

Textes en `var(--mono-graphite)`, valeurs en `var(--font-semibold)`.

**Checkbox de confirmation**

```
[  ] Je confirme avoir vérifié les résultats de validation et j'approuve
     la soumission de ce rapport aux autorités compétentes.
```

La checkbox utilise le composant `Checkbox` shadcn/ui. Elle doit être cochée pour que le compte à rebours commence.

**Compte à rebours**

Après cochage de la checkbox, un compteur de 2 secondes s'affiche à côté du bouton de signature :

```
[Signature officielle]  Dans 2s...
```

Le bouton devient actif après 2 secondes. Si la checkbox est décochée pendant le compte à rebours, le compteur se réinitialise.

### Footer

- `Annuler` (ghost) — ferme sans action
- `Signature officielle` (primary, variant `brand-emerald`) — désactivé pendant le compte à rebours

### Accessibilité

- `aria-describedby` pointant vers le texte de résumé de l'action
- La checkbox : `aria-required="true"`, label explicite
- Le bouton pendant le délai : `aria-disabled="true"` + `aria-label="Signature officielle - disponible dans 2 secondes"`
- `aria-live="polite"` sur le compte à rebours

---

## 6. RuleCreationWizardModal

**Hash URL :** `#modal-rule-wizard`
**Largeur :** `calc(100vw - 48px)` (quasi-plein écran)
**Dismissible :** Oui (avec confirmation si des données ont été saisies)

### Objectif

Wizard de création d'une nouvelle règle BCT dans le système Regalica. Trois modes de création selon le niveau d'expertise de l'utilisateur. Stepper en haut du modal.

### Stepper

Stepper horizontal en haut du body (pas dans l'en-tête). 3 à 5 étapes selon le mode. Chaque étape : numéro + libellé + statut (completed `var(--functional-pass)`, current `var(--brand-violet)`, upcoming `var(--mono-silver)`).

### Trois modes

**Mode Copilot (par défaut)**

Regalica guide la création par questions en langage naturel. L'utilisateur décrit la règle en français (ou EN/AR), Regalica propose une formalisation structurée, l'utilisateur valide ou corrige.

Étapes : Description > Formalisation Regalica > Validation > Test sur données historiques > Confirmation

Composants : `ChatBubble` pour les messages Regalica, `Input` pour les réponses utilisateur, `GlassCard regular` pour les propositions de formalisation.

**Mode Learning (intermédiaire)**

Formulaire guidé avec aide contextuelle inline. Chaque champ est accompagné d'un `RegalicaContextualHelpPopover`.

Étapes : Type de règle > Paramètres > Seuils > Conditions > Test > Confirmation

Composants : Formulaires shadcn/ui, dropdowns, sliders numériques.

**Mode Expert (avancé)**

Éditeur de code YAML ou JSON de la règle brute, avec syntax highlighting et validation en temps réel.

Étapes : Éditeur > Validation syntaxique > Test > Confirmation

Composants : Éditeur de code (CodeMirror ou similaire), `VerdictTable` miniature pour les résultats de test.

### Sélecteur de mode

Affiché dans l'en-tête, à droite du titre : trois boutons toggle pour basculer entre les modes. Le mode actif est souligné en `var(--brand-violet)`. Changer de mode réinitialise le stepper après confirmation.

### Accessibilité

- Stepper : `role="list"` + `role="listitem"` pour chaque étape
- Étape courante : `aria-current="step"`
- Boutons Précédent/Suivant dans le footer avec `aria-label` explicites

---

## 7. RelatedReportLookupModal

**Hash URL :** `#modal-related-lookup`
**Largeur :** 560px (`md`)
**Dismissible :** Oui

### Objectif

Affiché quand une règle de validation détecte une dépendance inter-annexe manquante. Invite l'utilisateur à uploader le rapport manquant ou à confirmer qu'il est inapplicable.

### Contexte d'ouverture

Ce modal s'ouvre automatiquement depuis `ValidationProgressModal` quand l'étape de vérification des dépendances inter-annexes détecte des données manquantes. Il peut aussi être ouvert depuis le `UploadReportModal` via la pill de pré-vérification.

### Contenu du body

**Résumé de la dépendance**

```
La validation de l'Annexe [code] requiert les données de l'Annexe [code-dependant].

Statut de l'Annexe [code-dependant] pour la période [période] :
[Badge SKIPPED orange]  Non soumise

[N] règles en statut SKIPPED dans votre rapport sont liées à cette dépendance.
```

Le nombre de règles SKIPPED est mis en avant en `var(--text-3xl)`, `var(--font-semibold)`, couleur `var(--functional-skipped)`.

**Actions disponibles**

Deux options exclusives en radio buttons visuels (cards sélectionnables) :

Option A : "Charger l'Annexe manquante maintenant" — ouvre `UploadReportModal` en cascade (le modal courant reste visible derrière)

Option B : "Continuer sans cette Annexe (règles marquées SKIPPED)" — le rapport sera finalisé avec les règles SKIPPED documentées

### Footer

- `Annuler` (ghost)
- `Confirmer le choix` (primary) — activé après sélection d'une option

### Accessibilité

- Le décompte SKIPPED : `data-a11y="critical"`, soumis au gate AAA en CI
- Les radio buttons cards : `role="radio"`, groupés dans un `role="radiogroup"` avec `aria-label`

---

## 8. RegalicaContextualHelpPopover

**Hash URL :** `#popover-help-{citation-id}` (unique par citation)
**Largeur :** 360px (`regular`)
**Type :** Popover ancré (pas un modal plein écran)

### Objectif

Popover d'aide contextuelle ancré au `CitationPill` déclencheur. Affiche le contenu complet de la source de la base de connaissances Regalica, le niveau de confiance, et les métadonnées du modèle LLM.

### Matériau

Regular (`var(--glass-regular)`), `var(--shadow-glass-lg)`, `var(--radius-lg)`. Pas d'overlay de fond — le popover est ancré, pas modal.

### Contenu

**En-tête du popover**

- Icône `BookOpen` + titre de la source (`var(--text-base)`, `var(--font-semibold)`)
- Bouton X pour fermer, `var(--mono-steel)`

**Corps**

- Texte extrait de la source : `var(--text-sm)`, `var(--leading-relaxed)`, `var(--mono-graphite)`, limité à 400 caractères avec "Lire la suite" si plus long
- Score de confiance : barre de progression horizontale (`var(--brand-violet)` sur `var(--mono-silver)`) + pourcentage `tabular-nums`
- Référence : code de la source (ex: "Circulaire BCT N°12, Article 4.2")

**Métadonnées du modèle**

Affichées en pied du popover, séparées par un divider :
- Version du modèle LLM utilisé pour la génération (ex: "Regalica-v2.1-BCT")
- Date de l'index vectoriel utilisé
- `var(--text-xs)`, `var(--mono-steel)`

### Positionnement

Préférence : apparaît au-dessus du déclencheur (`placement="top"`). Si l'espace est insuffisant : bascule automatiquement en dessous (`placement="bottom"`). Décalage : `var(--space-2)` entre le déclencheur et le popover.

### Comportement

- S'ouvre au clic sur `CitationPill`
- Se ferme : clic en dehors, Escape, second clic sur le déclencheur
- Pas de focus trap — c'est un popover, pas un modal. Tab peut quitter le popover.

### Accessibilité

- `role="tooltip"` si le contenu est purement informatif, `role="dialog"` si l'utilisateur peut interagir (cliquer sur "Lire la suite")
- `aria-expanded` sur le `CitationPill` déclencheur
- Focus positionné sur le premier élément interactif du popover à l'ouverture

---

## 9. SettingsSheet

**Hash URL :** `#sheet-settings`
**Disposition :** Sheet latéral droit, pleine hauteur
**Largeur :** 480px sur desktop, pleine largeur sur mobile
**Dismissible :** Oui

### Objectif

Panneau de configuration complète de l'espace de travail de l'utilisateur. Organisé en 7 sections dans une navigation verticale à gauche (ou en tabs en mobile).

### Matériau

Thick (`var(--glass-thick)`). Le sheet glisse depuis le bord droit. Animation : `translateX(+100%)` vers `translateX(0)`, `var(--duration-slow)` `var(--ease-out)`.

### Navigation interne (7 sections)

Navigation verticale en `var(--text-sm)`, items avec icônes Lucide, highlight de la section active en `var(--brand-violet-bg)`, texte `var(--brand-violet)`.

**Section 1 — Profil**
Icône : `User`
Contenu : Photo de profil (upload via Supabase Storage), Prénom, Nom, Titre professionnel, Email (lecture seule)

**Section 2 — Notifications**
Icône : `Bell`
Contenu : Toggles pour les types de notifications (validation complète, anomalie détectée, rapport signé, mention dans un rapport). Canal (email / in-app / les deux).

**Section 3 — Langue et région**
Icône : `Globe`
Contenu : Sélecteur de langue (FR / EN / AR), direction RTL automatique pour AR, format de date (DD/MM/YYYY ou MM/DD/YYYY), format numérique (1.234,56 ou 1,234.56)

**Section 4 — Entités**
Icône : `Building`
Contenu : Liste des entités BCT déclarantes associées au tenant. Ajout/suppression d'entités (SIREN, LEI, dénomination).

**Section 5 — Utilisateurs**
Icône : `Users`
Contenu : Gestion des membres du workspace. Invitation par email, attribution de rôles (Lecteur / Validateur / Signataire / Admin).

**Section 6 — Registre IA**
Icône : `Cpu`
Contenu : Liste des modèles LLM utilisés par Regalica, version, date de mise à jour, statut de conformité IA Act. Toggle d'activation par modèle.

**Section 7 — Maintenance**
Icône : `Settings`
Contenu : Purge du cache de tokens, re-synchronisation des règles BCT depuis Supabase, export des logs d'audit.

### Footer du sheet

- `Fermer` (ghost) à gauche
- `Sauvegarder` (primary) à droite — uniquement activé si des modifications non sauvegardées existent

### Accessibilité

- `role="dialog"`, `aria-modal="true"`, `aria-label="Paramètres du workspace"`
- Navigation interne : `role="navigation"`, `aria-label="Sections des paramètres"`
- Items de navigation : `role="link"` ou boutons avec `aria-current="page"` pour la section active

---

## 10. ReportsHistorySheet

**Hash URL :** `#sheet-history`
**Disposition :** Sheet latéral droit, pleine hauteur
**Largeur :** 560px sur desktop, pleine largeur sur mobile
**Dismissible :** Oui

### Objectif

Historique complet des rapports soumis par le tenant. Triable, filtrable, avec accès rapide aux résultats de chaque rapport.

### Matériau

Thick (`var(--glass-thick)`). Même animation d'entrée que `SettingsSheet`.

### Barre de filtres (sticky sous l'en-tête)

Trois filtres cumulables :

**Filtre Période**
Sélecteur de plage de dates. Presets : "Ce trimestre", "6 derniers mois", "Cette année", "Personnalisé".

**Filtre Annexe**
Multi-select dropdown des codes annexe. Affiche les codes avec libellés courts.

**Filtre Statut**
Checkboxes pour les statuts : En cours, Validé, PASS, FAIL, Signé, Archivé. Les couleurs des checkboxes correspondent aux tokens fonctionnels.

Un compteur de résultats est mis à jour en temps réel : "N rapports" en `var(--mono-steel)`.

### Liste des rapports

Chaque rapport est une ligne de tableau avec :
- Code annexe + libellé court
- Période
- Score de conformité (`tabular-nums`, coloré selon `--functional-*`)
- Statut (badge avec couleur fonctionnelle)
- Date de soumission
- Actions : `Eye` (voir les résultats), `Download` (exporter PDF)

**Tri des colonnes**

Clic sur l'en-tête d'une colonne trie la liste. Icône `ArrowUp`/`ArrowDown` Lucide indique le sens du tri. Le tri par défaut est chronologique décroissant (plus récent en premier).

**Pagination**

Pagination infinie (infinite scroll) ou bouton "Charger plus" selon la quantité de données. Pas de pagination numérotée — trop fragmentée pour de l'historique.

### Pré-visualisation rapide

Au survol d'une ligne (hover), un tooltip minimal affiche le score de conformité et les 3 principales anomalies du rapport, sans ouvrir un modal complet.

### Accessibilité

- `role="dialog"`, `aria-modal="true"`, `aria-label="Historique des rapports BCT"`
- Tableau : `<table>` sémantique, `<th scope="col">` avec `aria-sort`
- Infinite scroll : annonce du chargement des nouvelles lignes via `aria-live="polite"`
- Actions par ligne : boutons `aria-label="Voir les résultats de [code annexe] [période]"`

---

## Règles pour les dialogs destructifs

Les actions irréversibles suivent un protocole strict dans toute l'application :

1. **Icône** : `AlertTriangle` en `var(--functional-skipped)` dans l'en-tête du dialog (pas `XCircle` — la suppression est une action, pas une erreur)
2. **Texte** : le nom de l'objet affecté apparaît explicitement dans le body (ex: "Vous allez révoquer la signature de **Annexe A3 — Fonds propres, Q1 2026**")
3. **Délai** : le bouton d'action destructive est disabled pendant 2 secondes après ouverture. Un compteur visible `"Dans Xs"` s'affiche sur le bouton.
4. **Checkbox** : une checkbox de confirmation est requise avant que le délai commence. Son libellé est spécifique à l'action (pas de formulation générique "Je confirme").
5. **Escape** : la touche Escape ferme le dialog destructif sans exécuter l'action — toujours.
6. **Variant bouton** : `destructive` (fond `var(--functional-fail)`).

---

*Ce document est la source de vérité pour les 10 popups métier. Toute popup non listée ici doit faire l'objet d'un ADR avant implémentation.*
