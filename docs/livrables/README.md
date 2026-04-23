# REGFlow — Livrables 2/3/4 Phase 0

**Date :** avril 2026
**Auteur :** ALGORIA Factory
**Statut :** prêts à l'intégration dans le nouveau monorepo REGFlow

---

## Vue d'ensemble

Ce pack contient les trois livrables exécutifs mentionnés au Document 7 v2 (partie V), complémentaires du **Livrable 1** (golden-normalizer, déjà publié séparément). Les quatre livrables forment le socle technique de la Phase 0 du plan brute de refactoring.

| Livrable       | Type                       | Localisation cible dans le monorepo            |
| -------------- | -------------------------- | ---------------------------------------------- |
| Livrable 1     | Python package             | `tools/golden-normalizer/` (publié séparément) |
| **Livrable 2** | Python package             | `tools/seed-referentials-from-xml/`            |
| **Livrable 3** | TypeScript package (tests) | `packages/evaluator/test/`                     |
| **Livrable 4** | TypeScript package         | `packages/bct-xml-parser/`                     |

---

## Séquence d'utilisation

Les livrables s'enchaînent dans cet ordre :

```
Livrable 1 (golden-normalizer)
    │  Produit tests/fixtures/golden/qnb-tunisia/
    ▼
Livrable 2 (seed-referentials-from-xml)
    │  Lit tests/fixtures/golden/
    │  Produit apps/api/src/db/migrations/009-011_seed_referentials_*.sql
    ▼
Livrable 4 (bct-xml-parser)
    │  Parse XML dual-nomenclature (moderne/legacy/specialized)
    │  Utilisé par le moteur d'évaluation en Phase 2
    ▼
Livrable 3 (golden test)
    │  Itère sur tous les batches de tests/fixtures/golden/qnb-tunisia/
    │  Phase 0 : valide parsing + métadonnées
    │  Phase 2 : compare verdicts moteur aux expected_verdicts.json
```

---

## Livrable 2 — seed-referentials-from-xml

**But.** Génère automatiquement les migrations SQL de seeding des tables `referentials_rubriques`, `referentials_colonnes`, `referentials_xml_structures` du Document 6 à partir du corpus golden.

**Testé avec succès sur les 58 XML réels QNB Tunisia :**

- **1 282 rubriques** extraites avec hiérarchie parent/enfant inférée.
- **308 combinaisons (annexe, colonne)** détectées.
- **51 annexes caractérisées** avec nomenclature et type de structure XML (1 à 10).
- **~190 KB de SQL généré** en 3 migrations numérotées.

**Usage.**

```bash
cd tools/seed-referentials-from-xml
uv run python seed.py \
  --fixtures-dir ../../tests/fixtures/golden \
  --output-dir ../../apps/api/src/db/migrations \
  --start-migration-number 9 \
  --author "ALGORIA Factory"
```

**Exécuté une seule fois** après la Phase 0 complète (fixtures golden importées, schéma SQL du Document 6 migré). Après ce seed initial, les évolutions des référentiels passent par la procédure 4-yeux applicative (Document 8 §15), jamais par réexécution du script.

---

## Livrable 3 — packages/evaluator avec golden test

**But.** Package TypeScript qui portera le moteur d'évaluation RDG en 5 phases (Phase 2 du plan brute). En Phase 0, il contient :

- Les types canoniques (`Verdict`, `RuleWithTerms`, `EvaluationResult`, `VerdictTotals`).
- Le schéma TypeScript de `expected_verdicts.json` avec sa fonction de validation.
- Le test golden refactorisé qui remplace l'ancien test 5 XML / 937 PASS / 2 FAIL / 3672 SKIP.

**Test golden testé avec succès sur le corpus :**

- **73 tests passent**, 32 skippés (bloc Phase 2 activé quand le moteur sera connecté).
- 9 batches découverts automatiquement dans `tests/fixtures/golden/qnb-tunisia/`.
- Pour chaque batch : validation métadonnées, parsing dual-nomenclature, cohérence dates et bank codes, annexes in_scope, expected_skips.

**Modes de fonctionnement :**

- **Assert** (défaut) : comparaison stricte des verdicts aux `expected_verdicts.json`.
- **Capture** (`REGFLOW_GOLDEN_MODE=capture`) : capture des totaux observés lors du premier run et réécriture du JSON.

**Usage.**

```bash
cd packages/evaluator
pnpm install  # résout @regflow/bct-xml-parser via workspace:*
pnpm test:golden  # mode assert
pnpm test:golden:capture  # mode capture
```

---

## Livrable 4 — packages/bct-xml-parser

**But.** Parser TypeScript dual-nomenclature qui gère les trois formats XML du corpus BCT et produit une interface `CellMatrix` unifiée pour le moteur d'évaluation.

**Testé avec succès sur les 58 XML réels :**

| Nomenclature    | Fichiers | Description                                                                |
| --------------- | -------- | -------------------------------------------------------------------------- |
| **Modern**      | 56       | Standard BCT actuel avec `<Entete>`, `<Annexe>`, `<Rubrique>`, `<Colonne>` |
| **Legacy**      | 1        | Annexe 810 position de change avec `<ENTETE>`, `<RECAP_POS>`, `<DET_PSC>`  |
| **Specialized** | 1        | Annexe 781 taux créditeurs/débiteurs avec `<TauxCrediteurs>`, `<Produit>`  |

- **2 097 rubriques totales extraites** (toutes occurrences comptées).
- **11 002 valeurs Decimal extraites** avec précision 38 digits.
- **0 erreur de parsing**.

**Exports du package :**

- `parseBctXml(content)` : parse un seul XML, détection nomenclature automatique.
- `parseBctBatch(xmls)` : parse plusieurs XML et fusionne leurs `CellMatrix`.
- `detectNomenclature(content)` : utilitaire de détection seul.
- `normalizeDate(raw)` : conversion `YYYYMMDD` et `DD/MM/YYYY` vers `YYYY-MM-DD`.

**Types unifiés :**

- `ParsedXml { header, cells, rawRubriquesCount, rawValuesCount, warnings }`
- `CellMatrix = Map<annexe, Map<rubrique, Map<colonne, Decimal>>>`
- `XmlHeader { codeBanque, dateAnnexe, codeAnnexe, nomenclature }`

**Corrections techniques intégrées** (apprentissages de cette itération) :

- Import Decimal par **named import** `import { Decimal } from "decimal.js"`.
- `parseTagValue: false` pour empêcher `fast-xml-parser` de convertir `"00"` en `0`.
- Code annexe **préservé tel quel** (jamais de zero-stripping) pour cohérence avec les référentiels seedés.

---

## Prochaines étapes

**Phase 2 du plan brute** : écriture du moteur d'évaluation canonique dans `packages/evaluator/src/`. Quand le moteur sera opérationnel, les 32 tests actuellement skippés (`describe.skip("Golden Baseline — Engine Evaluation (Phase 2)")` dans `test/golden.test.ts`) seront activés et compareront les verdicts produits aux `expected_verdicts.json`.

**Phase 1** : exécution du Livrable 2 pour alimenter la base avec les référentiels. Les 3 migrations SQL générées (009, 010, 011) sont prêtes à être intégrées aux 37 migrations totales du Document 6.

---

## Invariants préservés

Les trois livrables respectent scrupuleusement les invariants de la doctrine REGFlow :

- **Zéro hardcoding.** Tous les référentiels sont lus depuis le corpus golden, aucune donnée métier codée en dur.
- **Zéro tolérance dette résiduelle.** Aucun `TODO: remove`, aucun `.skip()` sauf ceux justifiés et datés pour Phase 2 activation.
- **Stack gelée.** Pas de dépendance ORM, pas de framework exotique. Python standard library + `uv` côté Python. `fast-xml-parser` + `decimal.js` seules deps externes côté TS.
- **Précision Decimal 38 digits.** Préservée dans les 3 parsers et dans les types du moteur.
- **Zéro modification sans 4-yeux.** Les référentiels seedés sont insérés avec `valid_from` et `status = 'active'`, prêts pour le cycle de vie bitemporel.
