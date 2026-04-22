# REGFlow — Capture AS-IS

## Règles du validateur de structure XML (structure-validator)

**Version :** 1.0
**Date :** avril 2026
**Type :** document de capture pré-suppression
**Origine :** `apps/api/src/agents/structure-validator/index.ts` de l'ancien monorepo Regalica_IDC
**Statut :** référence pour la réécriture en Phase 2 du plan brute, dans `packages/structure-validator/`
**Audience :** équipe qui écrira la version canonique du validateur en Phase 2

---

## Pourquoi ce document existe

Le code du validateur structurel XML est supprimé en Phase 0. Il sera réécrit dans `packages/structure-validator/` en Phase 2. Ce document capture **exhaustivement** les 7 dimensions de validation implémentées dans l'AS-IS, les messages d'erreur retournés, et les comportements limites.

La validation structurelle correspond à l'**étape 1 du contrôle BCT** (validation XSD) dans le workflow T1. Elle précède les contrôles embarqués (étape 2) et les contrôles qualité RDG (étape 3, en 5 phases A/B/D/E du moteur).

---

## Vue d'ensemble

**Fonction publique unique.** `validateStructure(xmlContent: string): StructureValidationResult`.

**Entrée.** Une chaîne XML UTF-8 représentant un reporting BCT.

**Sortie.**

```typescript
interface StructureError {
  dimension: number;  // 1 à 7
  message: string;
  path?: string;      // chemin XPath-like dans l'arbre, optionnel
}

interface StructureValidationResult {
  valid: boolean;     // true si errors est vide
  errors: StructureError[];
}
```

**Stratégie de collecte.** Le validateur **accumule** les erreurs dimension par dimension au lieu de s'arrêter à la première. Exception : si D1 (XML mal formé ou root absent) échoue, le validateur s'arrête immédiatement et retourne avec `valid: false`. C'est le seul early-return.

**Librairies.** `fast-xml-parser` uniquement, avec la même configuration que le parser ingestor pour garantir la cohérence du comportement d'isArray.

---

## Configuration du parser XML

Identique à celle du parser ingestor :

```typescript
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: true,
  isArray: (tagName) => tagName === 'Rubrique' || tagName === 'Colonne' || tagName === 'Annexe',
});
```

**Expressions régulières de validation.**

```typescript
const DATE_RE = /^\d{8}$/;                   // date YYYYMMDD
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;        // entier ou décimal signé
```

---

## Les 7 dimensions de validation

### Dimension D1 — XML bien formé et root `<Document>`

**Contrôles.**
1. Le parser `fast-xml-parser` arrive-t-il à parser la chaîne ? Si exception levée, erreur D1 : `"XML is not well-formed"`. **Arrêt immédiat** — aucune autre dimension ne peut être testée.
2. L'élément racine est-il `<Document>` ? Sinon erreur D1 : `"Root element must be <Document>"`. **Arrêt immédiat** également.

**Messages d'erreur.**
| Condition | Message | Path |
|---|---|---|
| XML non parsable | `"XML is not well-formed"` | — |
| Racine ≠ Document | `"Root element must be <Document>"` | — |

---

### Dimension D2 — `<Entete>` présent avec ses 3 champs obligatoires

**Contrôles.**
- L'élément `<Entete>` existe sous `<Document>`.
- `<Entete>` contient les trois champs : `CodeBanque`, `DateAnnexe`, `CodeAnnexe`.

**Messages d'erreur.**
| Condition | Message | Path |
|---|---|---|
| `<Entete>` absent | `"<Entete> element is missing"` | — |
| `<CodeBanque>` absent | `"<Entete>.<CodeBanque> is missing"` | `Entete.CodeBanque` |
| `<DateAnnexe>` absent | `"<Entete>.<DateAnnexe> is missing"` | `Entete.DateAnnexe` |
| `<CodeAnnexe>` absent | `"<Entete>.<CodeAnnexe> is missing"` | `Entete.CodeAnnexe` |

**Comportement limite.** Si `<Entete>` est absent, les contrôles D3 à D7 continuent quand même sur la partie `<Annexe>` du document si elle existe (pas d'arrêt). Donc un XML sans entête mais avec des annexes produira plusieurs erreurs accumulées : D2 (Entete manquante) + éventuellement D4 (annexe ne matche pas le CodeAnnexe absent) + D5/D6/D7 selon contenu.

---

### Dimension D3 — `DateAnnexe` au format YYYYMMDD

**Contrôle.** `DateAnnexe` doit matcher la regex `/^\d{8}$/` (exactement 8 chiffres).

**Messages d'erreur.**
| Condition | Message | Path |
|---|---|---|
| Format invalide | `"DateAnnexe must be YYYYMMDD, got: <valeur>"` | `Entete.DateAnnexe` |

**Comportement limite.** Le validateur ne vérifie **pas** la validité sémantique de la date (mois entre 01-12, jour valide pour le mois, année plausible). Par exemple `"20260230"` passe D3 alors que le 30 février n'existe pas. Cette validation sémantique est reportée en Phase 2 ou en Phase 3 (FSM T0 pré-validation).

---

### Dimension D4 — Exactement un `<Annexe>` avec id matchant `CodeAnnexe`

**Contrôles.**
1. Au moins un élément `<Annexe>` existe sous `<Document>`.
2. Il y a **exactement un** `<Annexe>` (pas plus).
3. L'attribut `id` de cet `<Annexe>` matche le `CodeAnnexe` de l'entête, **après normalisation** par `replace(/^0+/, '') || '0'` appliquée aux deux côtés pour la comparaison uniquement.

**Messages d'erreur.**
| Condition | Message | Path |
|---|---|---|
| Aucun `<Annexe>` | `"<Annexe> element is missing"` | — |
| Plusieurs `<Annexe>` | `"Expected exactly one <Annexe>, found <N>"` | — |
| Mismatch id / CodeAnnexe | `"<Annexe id=\"X\"> does not match CodeAnnexe \"Y\""` | `Annexe.@id` |

**Note importante sur la normalisation pour D4.**

Le code AS-IS contient ceci :

```typescript
const normalizeForCmp = (v: string) => v.replace(/^0+/, '') || '0';
if (normalizeForCmp(annexeId) !== normalizeForCmp(codeAnnexe)) {
  // erreur
}
```

La normalisation `replace(/^0+/, '')` est appliquée uniquement pour la **comparaison**, pas pour le stockage ni le rejet. Donc un XML avec `CodeAnnexe=00` et `<Annexe id="0">` passe D4 alors qu'il y a une divergence textuelle réelle. En Phase 2, décider si cette tolérance est souhaitable. Si le référentiel exige un matching exact des codes annexes (ce qui est recommandé pour éviter le bug de normalisation de l'ingestor, voir `bct-xml-parser-algorithm.md` §Bugs), alors la normalisation ici doit aussi être supprimée.

---

### Dimension D5 — Chaque `<Rubrique>` a un `id` non-vide

**Contrôle.** Pour chaque `<Rubrique>` rencontrée, l'attribut `id` doit être présent, non-null, non-undefined, et non-vide après trim.

**Messages d'erreur.**
| Condition | Message | Path |
|---|---|---|
| `id` absent ou vide | `"A <Rubrique> is missing a valid id attribute"` | `Rubrique.@id` |

**Comportement limite.** Le message d'erreur ne précise pas **quelle** rubrique est fautive (le path est générique). En Phase 2, enrichir le message avec l'index ou le numéro de séquence de la rubrique incriminée pour aider le debug.

---

### Dimension D6 — Chaque `<Colonne>` a un `id` numérique

**Contrôle.** Pour chaque `<Colonne>` rencontrée, l'attribut `id` doit être convertible en nombre via `Number(String(colId))` sans produire `NaN`.

**Messages d'erreur.**
| Condition | Message | Path |
|---|---|---|
| `id` non numérique | `"<Colonne> has non-numeric id: <valeur>"` | `Rubrique[<rubId>].Colonne.@id` |

**Comportement limite.** Le path inclut le `rubId` parent, ce qui est utile pour localiser l'erreur. Mais l'index de la colonne dans la rubrique n'est pas fourni — si plusieurs colonnes de la même rubrique sont fautives, l'utilisateur devra les identifier manuellement.

---

### Dimension D7 — Chaque valeur de `<Colonne>` est un décimal valide

**Contrôle.** Le contenu textuel (`#text`) de chaque `<Colonne>` doit matcher la regex `/^-?\d+(\.\d+)?$/` — entier ou décimal signé avec point comme séparateur décimal.

**Messages d'erreur.**
| Condition | Message | Path |
|---|---|---|
| Valeur non décimale | `"Column value is not a valid decimal: \"<valeur>\""` | `Rubrique[<rubId>].Colonne[<colId>]` |

**Comportement limite.**
- La regex **n'autorise pas** la notation scientifique (`1.5e3`). Aucun XML BCT observé n'en contient, mais si cela arrive, D7 échoue.
- La regex **n'autorise pas** la virgule comme séparateur décimal (`1,5`). Les XML BCT utilisent toujours le point. À maintenir en Phase 2.
- Les colonnes auto-fermantes `<Colonne id="1"/>` : le code fait `col['#text'] ?? col` en fallback, donc D7 essaie de convertir l'objet entier en chaîne. Le résultat est probablement `"[object Object]"` qui échoue la regex et produit une erreur D7 trompeuse. **Bug mineur à corriger en Phase 2 :** détecter explicitement les colonnes sans `#text` et soit les ignorer, soit retourner une erreur D7 avec un message dédié.

---

## Ordre et interactions des dimensions

**Ordre d'évaluation effectif.**

1. D1 évalué en premier. Arrêt immédiat si échec.
2. D2, D3, D4 évalués en séquence sur l'entête. Pas d'arrêt entre eux — les erreurs s'accumulent.
3. D5, D6, D7 évalués dans une boucle imbriquée sur toutes les annexes/rubriques/colonnes. Accumulation également.

**Implications.**
- Un XML avec beaucoup d'erreurs peut produire une liste d'erreurs très longue (toutes les colonnes fautives sont reportées). C'est un comportement voulu : le Compliance Officer veut voir l'ensemble des problèmes structurels d'un coup, pas un à la fois.
- Aucune dimension n'a de short-circuit sur une autre (hormis D1 qui bloque le parsing).

---

## Ce qui n'est pas couvert par la validation structurelle AS-IS

La validation structurelle est **volontairement minimaliste** — elle ne couvre que la conformité XSD de base. Les contrôles suivants sont **hors périmètre** et relèvent des étapes BCT suivantes ou d'agents séparés :

- **Cohérence inter-XML** (dates d'arrêté identiques entre annexes d'un même batch) → agent `Temporal`.
- **Complétude des annexes compagnes** (si l'annexe X référence Y, Y doit être fournie) → agent `Dependency`.
- **Contrôles embarqués BCT** (étape 2 du workflow T1) — pas implémentés dans l'AS-IS, à ajouter en Phase 3.
- **Contrôles qualité RDG** (étape 3, moteur 5 phases A/B/D/E) → `packages/evaluator`.
- **Validation des valeurs contre un XSD officiel BCT** — l'AS-IS ne charge pas de XSD, il applique des règles codées en dur. En Phase 2 ou 3, envisager le chargement des XSD BCT officiels par tenant si disponibles.

---

## Bugs et limitations à corriger en Phase 2

1. **Normalisation D4 permissive** — voir §D4 note. À aligner sur la politique d'identifiants stricte recommandée pour le parser ingestor.
2. **Message D5 non-localisé** — ne précise pas quelle rubrique est fautive.
3. **D7 trompeur sur colonne auto-fermante** — produit un message "valeur non décimale" alors que la vraie cause est l'absence de contenu.
4. **Pas de validation sémantique de DateAnnexe** — `20260230` passe D3.
5. **Pas de numéro de ligne / colonne** — les erreurs ne pointent pas vers une position dans le fichier source. Pour un Compliance Officer qui corrige un XML, c'est un manque. Envisager en Phase 2 l'utilisation d'un parser qui préserve les positions (saxes2 ou équivalent).
6. **Pas de gestion des namespaces XML** — voir note identique dans `bct-xml-parser-algorithm.md`.
7. **Pas de validation de `CodeBanque`** — aucun contrôle que `CodeBanque` est un entier plausible (codes BCT connus : 23 pour QNB Tunisia, etc.). À ajouter si la liste des codes banques est disponible en référentiel.

---

## Interface à préserver en Phase 2

La signature publique reste :

```typescript
export function validateStructure(xmlContent: string): StructureValidationResult;
```

Les types `StructureError` et `StructureValidationResult` sont stables et consommés par la FSM T0 (pré-validation) et par le rapport de validation BCT livré à l'utilisateur. Toute modification casse l'interface avec les phases suivantes.

Les dimensions D1-D7 restent identifiées par leur numéro pour la traçabilité. Si de nouveaux contrôles sont ajoutés en Phase 2 ou 3 (validation sémantique de la date, contrôles embarqués), utiliser D8+.

---

## Pointeur vers le code original

```bash
git show pre-refactoring-backup-2026-04-22:apps/api/src/agents/structure-validator/index.ts
```

Fichier à **lire pour compréhension**, jamais à copier dans le nouveau monorepo.

---

*Fin du document de capture AS-IS — validateur de structure XML*
