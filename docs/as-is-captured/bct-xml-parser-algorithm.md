# REGFlow — Capture AS-IS

## Algorithme du parser XML BCT (ingestor)

**Version :** 1.0
**Date :** avril 2026
**Type :** document de capture pré-suppression
**Origine :** `apps/api/src/agents/ingestor/bct-xml-parser.ts` de l'ancien monorepo Regalica_IDC
**Statut :** référence pour la réécriture en Phase 2 du plan brute, à consommer par `@regflow/bct-xml-parser` (Livrable 4)
**Audience :** équipe qui écrira la version canonique de `packages/bct-xml-parser` en Phase 2

---

## Pourquoi ce document existe

Le code AS-IS du parser XML BCT est supprimé en Phase 0. Il sera réécrit dans `packages/bct-xml-parser/` en Phase 2 avec support **dual-nomenclature** (moderne + legacy) fourni par le Livrable 4. La version AS-IS capturée ici ne gérait que la nomenclature moderne et contenait un bug critique de normalisation qui a faussé les tests golden (voir §Bugs à ne jamais réintroduire).

Ce document fige la logique fonctionnelle et les anti-patterns identifiés, pour que la réécriture Phase 2 ne reproduise pas les erreurs et conserve les comportements corrects.

---

## Vue d'ensemble

**Fonction publique unique.** `parseBctXml(xmlContent: string): ParsedXml`.

**Entrée.** Une chaîne XML UTF-8 représentant un reporting BCT d'annexe unique.

**Sortie.** Un objet `ParsedXml` avec quatre champs :

```typescript
interface ParsedXml {
  bankCode: string;      // code banque extrait de l'entête
  dateAnnexe: string;    // YYYYMMDD — date d'arrêté
  annexeCode: string;    // code annexe NORMALISÉ (⚠ bug — voir §Bugs)
  cells: CellMatrix;     // Map<annexeId, Map<rubriqueId, Map<colonneId, Decimal>>>
}
```

**Librairies utilisées.**
- `fast-xml-parser` pour le parsing XML en mode préservation des attributs.
- `decimal.js` pour les valeurs numériques avec précision arbitraire.

**Précision Decimal.** Configurée au chargement du module avec :
```typescript
Decimal.set({ precision: 38, rounding: Decimal.ROUND_HALF_EVEN });
```
C'est un side-effect global du module. Précision 38 digits, arrondi banker's rounding. Doit être conservée à l'identique en Phase 2.

---

## Configuration du parser XML

Le parser `fast-xml-parser` est instancié une seule fois avec les options suivantes :

```typescript
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: true,
  isArray: (tagName) => tagName === 'Rubrique' || tagName === 'Colonne' || tagName === 'Annexe',
});
```

**Détails et implications.**

- `ignoreAttributes: false` — les attributs XML sont préservés dans l'AST (essentiel car les `id=` sont portés par des attributs).
- `attributeNamePrefix: '@_'` — convention pour distinguer les attributs des éléments enfants dans l'objet parsé.
- `parseAttributeValue: false` — les attributs restent des chaînes (ex. `id="00"` reste `"00"` et ne devient pas `0`).
- **`parseTagValue: true`** — ⚠ contenu textuel des tags est converti en type natif si possible. `<Colonne id="1">00</Colonne>` produit un `#text` entier `0` et non `"00"`. Ce comportement est compensé par le `String(col['#text'])` qui re-convertit, mais il est fragile et a déjà causé des régressions.
- `isArray` force `Rubrique`, `Colonne`, `Annexe` à être toujours des tableaux même lorsqu'il n'y en a qu'un seul, pour uniformiser le code d'itération.

**Anti-pattern à corriger en Phase 2.** Forcer `parseTagValue: false` pour préserver les chaînes telles quelles et convertir explicitement en `Decimal` lorsque c'est voulu. C'est ce que recommande déjà la capture `as-is-evaluator-algorithm.md` §"Ce qui doit être retiré et jamais réintroduit".

---

## Structure AST attendue

Schéma simplifié de ce que produit `parser.parse(xmlContent)` :

```
Document
  Entete
    CodeBanque   (string | number)
    DateAnnexe   (string | number — attendu YYYYMMDD)
    CodeAnnexe   (string | number)
  Annexe         (RawAnnexe | RawAnnexe[])
    @_id         (string | number)
    Rubrique[]
      @_id       (string | number)
      Colonne[]
        @_id     (string | number)
        #text    (string | number)
```

Les interfaces TypeScript utilisées (`RawColonne`, `RawRubrique`, `RawAnnexe`, `RawDocument`) sont un simple typage du résultat de `fast-xml-parser`. Elles ne portent aucune logique.

---

## Algorithme pas à pas

### Étape 1 — Parsing et extraction de l'entête

```typescript
const raw = parser.parse(xmlContent) as { Document: RawDocument };
const doc = raw.Document;

const bankCode = String(doc.Entete.CodeBanque);
const dateAnnexe = String(doc.Entete.DateAnnexe);
const annexeCode = normalizeAnnexeCode(doc.Entete.CodeAnnexe);  // ⚠ bug ici
```

- `bankCode` : code de la banque, converti brutalement en chaîne. Aucune validation.
- `dateAnnexe` : date d'arrêté. Aucune vérification du format YYYYMMDD dans le parser (c'est le rôle du `structure-validator`, voir capture séparée).
- `annexeCode` : ⚠ passe par `normalizeAnnexeCode` qui applique `replace(/^0+/, '')`. **C'est le bug critique** (voir §Bugs à ne jamais réintroduire).

### Étape 2 — Cas XML sans annexe

```typescript
if (!doc.Annexe) {
  return { bankCode, dateAnnexe, annexeCode, cells: new Map() };
}
```

Si aucun élément `<Annexe>` n'est présent, le parser retourne une `CellMatrix` vide sans erreur. La validation structurelle (dimension D4) est de la responsabilité du `structure-validator`.

### Étape 3 — Itération sur les annexes

```typescript
const annexes = Array.isArray(doc.Annexe) ? doc.Annexe : [doc.Annexe];

for (const annexe of annexes) {
  const axCode = normalizeAnnexeCode(annexe['@_id']);  // ⚠ bug ici aussi
  const rubriqueMap = cells.get(axCode) ?? new Map();
  cells.set(axCode, rubriqueMap);
  // ...
}
```

Chaque annexe a un identifiant `@_id` qui passe lui aussi par `normalizeAnnexeCode`. Le parser **fusionne** les rubriques d'annexes multiples partageant le même `axCode` normalisé, ce qui est un comportement silencieux dangereux.

### Étape 4 — Itération sur les rubriques

```typescript
for (const rubrique of rubriques) {
  const rubId = String(rubrique['@_id']);  // ⚠ PAS normalisé ici
  const colMap = rubriqueMap.get(rubId) ?? new Map();
  rubriqueMap.set(rubId, colMap);
  // ...
}
```

**Incohérence majeure AS-IS.** L'identifiant de rubrique `rubId` n'est **PAS** passé par `normalizeId` — il est juste converti en chaîne. Donc une rubrique `id="0010"` reste `"0010"` tandis qu'une annexe `id="00"` devient `"0"`. Asymétrie silencieuse qui complexifie tous les lookups en aval.

Si la même `rubId` apparaît plusieurs fois (par exemple dans des conteneurs `<Societe>`, `<Membre>`, `<Instrument>` imbriqués), les colonnes fusionnent dans la même `Map<colonneId, Decimal>`. Comportement de fusion de clés, pas de remplacement total.

### Étape 5 — Itération sur les colonnes

```typescript
for (const col of colonnes) {
  const colId = normalizeId(col['@_id']);  // ⚠ normalisation asymétrique
  const value = new Decimal(String(col['#text']));
  colMap.set(colId, value);
}
```

- `colId` passe **aussi** par `normalizeId`. Donc `Colonne id="01"` devient clé `"1"` dans la Map.
- La valeur est convertie en `Decimal` via `String(col['#text'])`. **Cas dangereux :** si `#text` est absent (colonne auto-fermante `<Colonne id="1"/>`), `String(undefined)` retourne `"undefined"` et `new Decimal("undefined")` lève une exception. Aucun `try/catch` autour. Le parser AS-IS crashe sur ce cas.

---

## Bugs à ne jamais réintroduire

### BUG 1 — Normalisation `replace(/^0+/, '') || '0'` du CodeAnnexe

Code fautif AS-IS :

```typescript
function normalizeId(raw: string | number): string {
  const s = String(raw);
  const stripped = s.replace(/^0+/, '') || '0';
  return stripped;
}
```

**Effet.** `"00"` → `"0"`. `"01"` → `"1"`. `"010"` → `"10"`.

**Pourquoi c'est un bug.** Les codes d'annexe BCT (CodeAnnexe dans l'entête, `@_id` de `<Annexe>`, `@_id` de `<Colonne>`) sont des **identifiants textuels canoniques du RDG**. Ils ne sont pas des nombres. `"00"` et `"0"` sont des annexes différentes dans le référentiel BCT. Les zéros de tête sont sémantiquement porteurs.

**Comment ce bug a été détecté.** Lors de l'exécution du test golden refactorisé sur les 5 XML `bank-23`/`2024-03-31`, un écart est apparu entre les codes d'annexe stockés en base (référentiels seedés avec le code exact du XLSX RDG) et les codes produits par le parser. La règle `(AX_TERM=00, NUM_REGLE=1)` ne trouvait aucune cellule parce que la CellMatrix avait stocké la cellule sous la clé `"0"` au lieu de `"00"`.

**Règle pour la Phase 2.** **Ne JAMAIS réintroduire cette normalisation.** Les identifiants d'annexe, de rubrique et de colonne doivent être **préservés exactement** tels qu'ils apparaissent dans le XML. Si une normalisation est strictement requise pour un lookup cross-annexe, elle doit être locale à la zone de lookup et jamais propagée dans les clés de la CellMatrix.

Cette règle est également consignée dans `as-is-evaluator-algorithm.md` §"Ce qui doit être retiré et jamais réintroduit".

### BUG 2 — `parseTagValue: true` par défaut

**Effet.** `<Colonne id="1">00</Colonne>` produit un `#text` de type `number` valant `0`, perdant les zéros de tête.

**Règle pour la Phase 2.** Forcer `parseTagValue: false` dans la configuration du `XMLParser`. Convertir explicitement les valeurs numériques en `Decimal` dans le code, sans jamais passer par une étape intermédiaire `number`.

### BUG 3 — Normalisation asymétrique (annexes + colonnes normalisées, rubriques non)

**Effet.** La CellMatrix mixte stocke des clés normalisées à deux niveaux (annexe, colonne) et non normalisées au niveau intermédiaire (rubrique). Comportement incohérent, source d'erreurs de lookup difficile à diagnostiquer.

**Règle pour la Phase 2.** Une politique **unique** pour toutes les clés : préservation exacte des chaînes issues du XML, à tous les niveaux.

### BUG 4 — Crash silencieux sur colonne auto-fermante

**Effet.** `<Colonne id="1"/>` provoque `new Decimal("undefined")` qui lève une exception non gérée.

**Règle pour la Phase 2.** Ignorer explicitement les colonnes vides ou auto-fermantes (pas de clé dans la Map), comme le fait déjà l'evaluator dans ses cas spéciaux documentés. Tester ce cas dans le golden.

### BUG 5 — Fusion silencieuse d'annexes dupliquées

**Effet.** Si deux `<Annexe id="X">` apparaissent dans le même document après normalisation, leurs rubriques fusionnent silencieusement.

**Règle pour la Phase 2.** Soit lever une erreur de validation structurelle (dimension D4 déjà gérée par `structure-validator` qui exige exactement un `<Annexe>`), soit produire un warning explicite. Jamais de fusion silencieuse.

---

## Points à préserver dans la réécriture Phase 2

Malgré les bugs, plusieurs éléments du parser AS-IS sont corrects et doivent être conservés.

1. **Précision Decimal globale 38 digits ROUND_HALF_EVEN.** Contrat absolu avec l'evaluator et le moteur Python. Voir `as-is-evaluator-algorithm.md` §"Précision Decimal — contrat absolu".

2. **Structure de sortie `CellMatrix`.** Le schéma `Map<annexeCode, Map<rubriqueCode, Map<colonneId, Decimal>>>` est le contrat consommé par la Phase A de l'evaluator. Il doit rester inchangé.

3. **Extraction de `bankCode`, `dateAnnexe`, `annexeCode` depuis l'entête.** Ces trois champs sont utilisés par la FSM T0 pour la pré-validation. Ils doivent rester disponibles en sortie du parser.

4. **Configuration `isArray` sur `Rubrique`, `Colonne`, `Annexe`.** Simplifie l'itération, aucune raison de la changer.

5. **Pas de parsing à la volée, pas de flux.** Le parser AS-IS lit tout le XML en mémoire et produit l'AST d'un coup. Pour les XML BCT (taille max observée ~10 Mo sur l'annexe 483 historique avec 23K valeurs), c'est suffisant. Pas de besoin de streaming en Phase 2 sauf si profilage démontre un problème.

---

## Support dual-nomenclature en Phase 2 — via `@regflow/bct-xml-parser` (Livrable 4)

Le Livrable 4 fourni par ALGORIA Factory apporte le support des trois nomenclatures identifiées dans le corpus golden :

- **Nomenclature moderne** — celle gérée par le parser AS-IS (la plupart des annexes).
- **Nomenclature legacy** — annexe 810 `historical/2025-12-01` (position de change en ancien format).
- **Nomenclature specialized** — annexe 781 `structural-references` (référence taux sans date).

Le package `@regflow/bct-xml-parser` expose la **même interface** `parseBctXml → ParsedXml` que le parser AS-IS, mais en détectant automatiquement la nomenclature en entête et en appliquant le bon algorithme de parsing. En conséquence, la Phase 2 de l'evaluator peut directement consommer `@regflow/bct-xml-parser` sans connaissance des nomenclatures.

---

## Ce qui n'est pas couvert et doit être pensé en Phase 2

- **Support complet des sentinelles D1-D6** (rubriques répétées par société/membre/instrument) — le parser AS-IS fusionnait silencieusement les occurrences. Voir `as-is-evaluator-algorithm.md` §"Ce qui n'existe pas dans l'AS-IS".
- **Gestion des namespaces XML** — aucun XML BCT actuel n'utilise de namespaces, mais si cela change, `fast-xml-parser` doit être configuré avec `removeNSPrefix: true` ou équivalent.
- **Métriques de parsing** — temps de parsing, nombre de cellules extraites, compteur d'erreurs silencieuses. À exposer via Prometheus en Phase 6.
- **Validation fine des types** — actuellement, toute valeur non convertible en `Decimal` crashe. La Phase 2 peut préférer un verdict `SKIPPED_INVALID_VALUE` propagé à l'evaluator.

---

## Pointeur vers le code original

Le code AS-IS supprimé en Phase 0 vit dans le tag Git `pre-refactoring-backup-2026-04-22`. Pour consultation :

```bash
git show pre-refactoring-backup-2026-04-22:apps/api/src/agents/ingestor/bct-xml-parser.ts
```

Ce fichier est à **lire pour compréhension**, jamais à copier dans le nouveau monorepo. La Phase 2 réécrit tout depuis la spécification fonctionnelle capturée ici + Livrable 4.

---

*Fin du document de capture AS-IS — parser XML BCT*
