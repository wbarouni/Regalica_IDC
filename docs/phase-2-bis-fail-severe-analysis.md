# Phase 2-bis — Analyse des 63 FAIL severe baseline

## Contexte

REGFlow détecte des écarts réels dans les données golden BCT. La BCT a accepté ces déclarations sans les bloquer (contrôle RDG non bloquant côté régulateur). REGFlow les signale correctement comme FAIL severe — c'est sa valeur ajoutée.

Le baseline a été figé au commit `d8f2d1b` (`fix(phase-2-bis): capture expected_fails in golden framework`) qui a étendu `maybeCapture` pour sérialiser chaque verdict FAIL severe dans `expected_verdicts.json`. Le contrat de non-régression est désormais strict : 63 entries, valeurs `lhs`/`rhs`/`gap` à précision Decimal 38, ROUND_HALF_EVEN.

## Taxonomie des 63 FAIL severe (baseline `d8f2d1b`)

### Catégorie 1 — Données XML incohérentes (annexe 139, batch 2024-09-30)

4 FAIL severe sur règles `139/r3`, `139/r4`, `139/r5`, `139/r7`.

Cause : totaux déclarés en rubrique `13006470000000` ne correspondent pas à la somme des sous-rubriques `13006410000000..13006460000000`.

Pipeline XLSX → seed vérifié sur `139/r3` : 7 termes, fidèles au XLSX (mêmes rangs, opérateurs, rubriques, colonnes, num_seq). Aucune dérive d'ingestion.

| règle  | op  | lhs (calc) | rhs (déclaré) | gap    |
| ------ | --- | ---------- | ------------- | ------ |
| 139/r3 | =   | 1 966      | 8 232         | 6 266  |
| 139/r4 | =   | 8 232      | 9 674         | 1 442  |
| 139/r5 | =   | 523        | 1 388         | 865    |
| 139/r7 | =   | 21 845     | 11 578        | 10 267 |

Les règles voisines `139/r1`, `139/r2`, `139/r6` (mêmes rubriques, colonnes 1, 2, 6) **passent** parfaitement avec `lhs=rhs`. Le bug est strictement local aux colonnes 3, 4, 5 et 7 du batch.

**Conclusion** : écarts dans les données soumises par la banque, pas dans le moteur.

### Catégorie 2 — Contraintes de borne dépassées (batch 2026-03-31)

2 FAIL severe sur règles `47/r88` et `47/r90`.

Cause : sentinelle C correctement traitée depuis le commit 21 (mapping `kind='literal'` + `literalValue=Decimal(rubrique)`). Les données déclarées de la banque dépassent les limites réglementaires BCT.

| règle  | op  | lhs            | rhs        | gap            | sémantique                                                                                               |
| ------ | --- | -------------- | ---------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| 47/r88 | =   | -154 994.211…  | 0          | 154 994.211…   | Contrainte non-négativité violée (LHS issu d'un ratio sentinelle C `/100`, précision Decimal 38 visible) |
| 47/r90 | =   | 279 994.694 25 | 90 255.654 | 189 739.040 25 | Limite réglementaire dépassée d'un facteur 3.1×                                                          |

### Catégorie 3 — Série de règles même borne (batch 2024-12-31)

57 FAIL severe au total sur 45 annexes du batch 2024-12-31. Pattern dominant : règles `134/r1..r5` partagent un RHS uniforme `54 583`, LHS variable.

| règle   | op  | lhs         | rhs    | gap         |
| ------- | --- | ----------- | ------ | ----------- |
| 130/r19 | <=  | 282 947.344 | 13 041 | 269 906.344 |
| 134/r1  | =   | 70 316      | 54 583 | 15 733      |
| 134/r2  | =   | 93 433      | 54 583 | 38 850      |
| 134/r3  | =   | 63 123      | 54 583 | 8 540       |
| 134/r5  | =   | 107 819     | 54 583 | 53 236      |
| ...     |     |             |        | (52 autres) |

Cause : données déclarées ne satisfont pas les identités comptables encodées dans le RDG BCT. La récurrence du RHS = 54 583 sur `134/r1..r5` suggère qu'une rubrique unique sert de borne pour plusieurs sous-totaux qui devraient lui être égaux par construction.

## Décision doctrinale

Ces 63 FAIL sont documentés comme **baseline de non-régression**. Toute modification du moteur, des seeds ou des données XML produira un diff mesurable sur `expected_fails[]` (count + per-entry equality sur `lhs`/`rhs`/`gap`/`operRegle`/`severity`).

Ils seront communiqués à la banque pilote comme recommandations de correction de données avant soumission BCT — c'est la promesse-produit principale de REGFlow : « savoir avant de soumettre ».

## Prochaines étapes

- **Phase 3** : agents IA (Regalica orchestre le diagnostic, InvestigatorAgent itère sur chaque FAIL severe pour produire un narratif business)
- **Phase 2-bis-suite** : investigation approfondie si la banque pilote conteste un verdict spécifique (re-vérification XLSX → JSON sur la règle contestée, comparaison avec circulaire BCT source, possible amendement du seed avec re-capture explicite)
- **Cluster detection** (P3 ou plus tôt) : détection de causes racine communes entre plusieurs FAIL (ex. la série `134/r1..r5` partageant RHS=54 583 est un cluster naturel)
