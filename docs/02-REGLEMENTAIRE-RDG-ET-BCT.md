# REGFlow — Plateforme de Conformité BCT par Intelligence Artificielle

## Document 2 — Cadre réglementaire, RDG et processus BCT

**Version :** 1.0
**Date :** avril 2026
**Périmètre :** cadre réglementaire BCT applicable aux banques résidentes, structure du référentiel RDG, nomenclatures XML historiques et courantes, dépendances inter-annexes, cycle de reporting et régime de sanctions
**Auteur :** Équipe REGFlow
**Statut :** référence canonique pour Claude Code — **les détails réglementaires non explicitement confirmés sont marqués `TODO(@wbarouni)` et ne doivent pas être inventés**
**Dépendances :** Document 1 (vision produit), Document 7 (golden baseline et dépendances inter-annexes pratiquées sur QNB Tunisia)

---

## Sommaire

**Partie I — Cadre BCT**

1. Rôle de la Banque Centrale de Tunisie dans le reporting bancaire
2. Le SED comme canal unique
3. Signature électronique du responsable Reporting

**Partie II — RDG — Référentiel Données et Gestion**

4. Définition, périmètre, statut
5. Volumétrie canonique
6. Structure d'une règle
7. Les trois contrôles BCT

**Partie III — Nomenclatures XML**

8. Nomenclature moderne
9. Nomenclature ancienne
10. Nomenclature spécialisée

**Partie IV — Dépendances inter-annexes**

11. Matrice CC-tech §9.5
12. Circulaires 2018-06 et 2018-10
13. Implications fonctionnelles

**Partie V — Cycle de reporting et sanctions**

14. Fréquences de soumission
15. Régime de sanctions
16. Exposition juridique du délai asynchrone

**Partie VI — Références**

17. Liste des circulaires citées
18. Renvoi vers le corpus golden QNB Tunisia

---

# Partie I — Cadre BCT

## 1. Rôle de la Banque Centrale de Tunisie dans le reporting bancaire

La Banque Centrale de Tunisie (BCT) exerce la tutelle prudentielle sur les banques résidentes opérant sur le territoire. Dans le cadre de cette tutelle, elle impose un dispositif de reporting périodique couvrant :

- Les états financiers normalisés (bilan, situations mensuelles).
- Les ratios prudentiels (solvabilité, liquidité, concentration).
- Les états détaillés par catégorie de contrepartie, secteur économique, devise, durée.
- Les déclarations spécifiques (position de change, LCR, encours crédit).

La BCT publie les règles de contrôle applicables sous forme de **circulaires** et de **référentiels techniques**. Le principal référentiel de contrôle de qualité des reportings est le **RDG** (Référentiel Données et Gestion), détaillé en Partie II.

## 2. Le SED comme canal unique

Le **Système d'Échange de Données (SED)** est le canal électronique unique par lequel les banques soumettent leurs reportings à la BCT. Toute soumission emprunte ce canal ; aucune transmission parallèle (e-mail, support physique, autre portail) n'est acceptée pour les reportings sous dispositif.

Le SED applique un contrôle en trois étapes (voir §7). Son retour est **asynchrone** : la banque soumet, puis reçoit ultérieurement un retour qui peut être :

- Une **acceptation** (le reporting est valide, stocké en base BCT).
- Un **rejet structurel** (XSD invalide), non accompagné d'analyse RDG.
- Un **rejet de contrôle embarqué** (règles critiques de cohérence), bloquant.
- Un **rapport de contrôle qualité RDG** listant les règles échouées avec `(attendu, calculé)` par règle.

TODO(@wbarouni) : préciser le délai SLA officiel du retour BCT, s'il est documenté dans une circulaire.

## 3. Signature électronique du responsable Reporting

Toute soumission au SED porte la **signature électronique** du responsable Reporting de la banque (référence : circulaire 2017-06 article 8). Cette signature engage :

- La **personne physique signataire** sur l'exactitude et la complétude des données.
- La **banque** sur le respect des délais réglementaires.

Le responsable Reporting est un rôle nominé, distinct en général du Compliance Officer opérationnel. REGFlow ne remplace pas cette signature : il prépare, analyse, valide localement, mais la signature au SED reste une action manuelle hors système.

Implication pour REGFlow : la responsabilité juridique finale reste à la banque. REGFlow fournit des moyens de preuve (audit log, decomposition, citation réglementaire) mais ne se substitue pas à la décision du signataire.

---

# Partie II — RDG — Référentiel Données et Gestion

## 4. Définition, périmètre, statut

Le **RDG (Référentiel Données et Gestion)** est le référentiel normatif BCT qui code les contrôles de qualité attendus sur les reportings XML des banques résidentes.

**Périmètre** :

- Règles de **cohérence interne** à une annexe (totaux par ligne, totaux par colonne, contraintes de signe, totaux déclaratifs).
- Règles de **cohérence inter-annexes** (par exemple un agrégat dans l'annexe 47 doit égaler la somme d'un bloc ventilé dans l'annexe 51, modulo tolérance d'arrondi).
- Règles de **cohérence référentielle** (codes pays, codes secteur, codes rubrique alignés sur les référentiels BCT).

**Statut.** Le RDG est publié sous forme de classeur Excel (`RDG.xlsx`) par la BCT. Il évolue selon un cycle d'amendement piloté par la Direction Reporting BCT.

**Source canonique dans REGFlow.** Le `RDG.xlsx` est importé en base via la procédure 4-yeux documentée au Document 5 §12-14. Aucune règle RDG n'est codée en dur dans le code applicatif (invariant zéro-hardcoding, Document 3 §7).

## 5. Volumétrie canonique

Le RDG dans sa version de référence pour REGFlow (voir PRD §6) a la volumétrie suivante :

- **4 611 règles** identifiées par le couple `(AX_TERM, NUM_REGLE)`.
- **18 452 terms** au total — moyenne d'environ 4 termes par règle, avec des règles de cohérence simple à 2 termes et des règles d'agrégation longue jusqu'à plusieurs dizaines.
- **52 annexes** couvertes.
- **208 zones de texte** (rubriques narratives non numériques).
- **17 single-term** (règles à terme unique, typiquement contrainte de signe ou tolérance).

Cette volumétrie est le contrat de complétude du moteur d'évaluation (Document 3 §15 `packages/evaluator`). Une divergence après une modification du moteur est un bug bloquant.

## 6. Structure d'une règle

Chaque règle RDG est identifiée par `(AX_TERM, NUM_REGLE)` et se compose de :

- **`AX_TERM`** — annexe porteuse principale de la règle. Là où la règle est déclarée au RDG, et où son verdict est rattaché dans le reporting.
- **`NUM_REGLE`** — identifiant local à l'annexe.
- **Une formule** combinant plusieurs `terms`. Chaque term est une lecture de cellule avec un signe et un coefficient.
- **Une opération d'agrégation** (somme, égalité, inégalité, égalité modulo tolérance d'arrondi).
- **Une tolérance** éventuelle (arrondi réglementaire, sentinelles).
- **Un type de contrôle** `TYPE_CTRL` — attention : ce champ est **non fiable** (taux d'erreur observé ~13 %). La classification effective doit être **reconstruite** via analyse de `AX_ORIGINE` par term (voir §11-13).

Chaque **term** lit une cellule d'annexe identifiée par `AX_ORIGINE` :

1. **Numérique** : le term lit une cellule dans une annexe donnée (peut différer de `AX_TERM` → règle inter-annexe).
2. **Sentinelle C** : constante de rubrique — valeur fixe définie par le RDG, pas lue d'un XML source.
3. **Sentinelles D1-D6** : itération sur rubrique détail — la règle s'applique répétée par société, membre, instrument, etc.

Une règle est **inter-annexe** dès qu'au moins un `AX_ORIGINE` numérique diffère de `AX_TERM`. Environ **5 %** des règles sont inter-annexes. Ces 5 % sont **critiques** pour la pré-validation T0 (détection des annexes compagnes requises) et pour la détection de grappes de cause racine en T2.

## 7. Les trois contrôles BCT

Le SED applique trois contrôles séquentiels, tous reproduits localement par REGFlow en T1 (Document 4 §7-9) :

- **Étape 1 — Structure XSD.** Validation par schéma XSD publié par la BCT. Vérifie la grammaire XML : balises attendues, cardinalités, types de données. Un rejet XSD est bloquant et ne donne pas accès aux étapes suivantes.
- **Étape 2 — Contrôles embarqués.** Contrôles de cohérence critique intégrés directement dans le flux SED. Typiquement : format des codes rubrique, unicité des codes annexe dans le batch, cohérence du code banque avec le compte signataire. Bloquant en cas d'échec.
- **Étape 3 — Contrôles qualité RDG.** Application des 4 611 règles du RDG au reporting soumis. Produit un rapport de contrôle listant les règles en succès, en échec, ou non applicables (voir verdicts au §6 du Document 1).

REGFlow rejoue les trois étapes dans le même ordre et avec la même sémantique pour garantir qu'un reporting vert localement sera également vert côté BCT.

---

# Partie III — Nomenclatures XML

Le corpus de reportings historique manipule trois nomenclatures XML qui coexistent. Le parser REGFlow (`@regflow/bct-xml-parser`, Document 3 §14) détecte la nomenclature et produit une structure unifiée `ParsedXml` avec `CellMatrix` commun.

## 8. Nomenclature moderne

**Balises racines caractéristiques** : `<Entete>`, `<Annexe>`, `<Rubrique>`, `<Colonne>`.

**Volume dans le corpus QNB Tunisia** : 56 fichiers sur 58 (voir Document 7).

**Métadonnées extraites** :

- `<CodeBanque>` — code BCT de la banque déclarante (QNB = 23).
- `<DateAnnexe>` — date d'arrêté au format `YYYYMMDD`.
- `<CodeAnnexe>` — code de l'annexe (00, 01, 47, 51, 620, 630, 640, etc.).

**Structure des données** : arborescence `Rubrique > Colonne > valeur Decimal`. Les valeurs sont préservées en précision Decimal 38 digits (voir Document 3 §7).

## 9. Nomenclature ancienne

**Balises racines caractéristiques** : `<ENTETE>`, `<DATE_DECLAR>`, `<BQ>`, `<CODE_ANNEXE>`, `<RECAP_POS>`, `<DET_PSC>`.

**Volume dans le corpus QNB Tunisia** : 1 fichier — annexe 810 position de change arrêté 2025-12-01.

**Métadonnées extraites** :

- `<BQ>` — code banque.
- `<DATE_DECLAR>` au format `DD/MM/YYYY` (normalisé en `YYYY-MM-DD` par le parser).
- `<CODE_ANNEXE>` — code de l'annexe.

**Structure des données** : regroupement par `<RECAP_POS>` (récapitulation positions) et `<DET_PSC>` (détail par société / position).

**Préservation.** La nomenclature ancienne doit continuer à être supportée pour la rétrocompatibilité — certaines banques ou certaines annexes conservent ce format. Pas de conversion agressive vers la nomenclature moderne.

## 10. Nomenclature spécialisée

**Balises racines caractéristiques** : `<TauxCrediteurs>`, `<TauxDebiteurs>`, `<Produit>`, `<Operation>`.

**Volume dans le corpus QNB Tunisia** : 1 fichier — annexe 781 taux créditeurs et débiteurs, sans date d'arrêté (référence structurelle).

**Usage** : cette nomenclature couvre les déclarations de taux d'intérêt applicables aux produits et opérations bancaires. Elle n'est pas temporalisée au sens habituel (pas de `DateAnnexe`), ce qui la range dans la catégorie `structural-reference` du golden baseline (voir Document 7 §6 structure cible).

**Détection** : `<Entete>` + présence de `<TauxCrediteurs>` ou `<TauxDebiteurs>` → nomenclature spécialisée. Sans `<Entete>` : fallback sur la détection des balises spécialisées seules.

---

# Partie IV — Dépendances inter-annexes

## 11. Matrice CC-tech §9.5

La **matrice de dépendances inter-annexes** recense, pour chaque annexe déclarée, les annexes **compagnes** qui doivent être présentes dans le même batch pour que la validation RDG soit complète.

**Source canonique** : cahier des charges technique (CC-tech) BCT §9.5, et circulaires 2018-06 et 2018-10 (voir §12).

**Exemples documentés** (voir Document 7 §11 pour la matrice complète pratiquée) :

| Annexe | Compagnes attendues | Nature de la dépendance                                |
| ------ | ------------------- | ------------------------------------------------------ |
| 01     | 00                  | Bilan doit porter totaux cohérents avec situation mère |
| 47     | 00, 01, 51          | Règles inter-annexes ventilation comptes clientèle     |
| 51     | 00                  | Situation mensuelle détaillée vs situation mère        |
| 620    | 00                  | État sectoriel dérivant du bilan                       |
| 481-86 | 00, 01              | États détaillés dépôts vs bilan et situation           |

L'absence d'une compagne dans le batch ne produit pas un FAIL : elle produit un **SKIP** catégorisé `skipped_missing_annexe` sur toutes les règles qui lisaient la compagne. REGFlow détecte cette situation en T0 (pré-validation) et alerte l'utilisateur avant lancement du T1.

## 12. Circulaires 2018-06 et 2018-10

**Circulaire 2018-06.** Référence citée dans le corpus pour la cohérence bilan-situation mensuelle et la structure des annexes SM (Situation Mensuelle). Typiquement référencée par les règles inter-annexes entre 00/01 et la série 51x.

TODO(@wbarouni) : préciser le titre exact et la date de publication de la circulaire 2018-06.

**Circulaire 2018-10.** Référence citée pour les contrôles supplémentaires sur la ventilation sectorielle et les états détaillés dépôts.

TODO(@wbarouni) : préciser le titre exact et la date de publication de la circulaire 2018-10.

Ces deux circulaires, combinées au CC-tech §9.5, forment le socle de la matrice de dépendances inter-annexes utilisée par le `DependencyAgent` (Document 9 §8) et par le `golden-normalizer` (Phase 0, Livrable 1).

## 13. Implications fonctionnelles

La matrice de dépendances inter-annexes a **trois implications fonctionnelles majeures** :

- **Pré-validation T0.** Avant de lancer la validation RDG, REGFlow détecte les compagnes manquantes et prévient l'utilisateur. Cela évite un T1 dont une grande part des verdicts serait `SKIP` par manque de données.
- **Analyse T2.** En investigation, la connaissance de la matrice permet de proposer à l'utilisateur les batches historiques complets si une compagne récente manque.
- **Golden baseline.** Le `golden-normalizer` (Livrable 1, Phase 0) embarque la matrice pour générer les métadonnées `companion_annexes_missing_in_batch` dans chaque `expected_verdicts.json`. Voir Document 7 §12 analyse par batch.

---

# Partie V — Cycle de reporting et sanctions

## 14. Fréquences de soumission

Les reportings BCT suivent plusieurs fréquences, documentées dans les circulaires dédiées :

- **Annuel** — arrêté au 31 décembre. Exemples : RCM00, RCM01 dans leur version annuelle ; états consolidés.
- **Trimestriel** — arrêtés aux 31 mars, 30 juin, 30 septembre, 31 décembre. Exemples : ratios prudentiels, états détaillés certaines annexes.
- **Mensuel** — arrêtés en fin de mois civil. Exemples : Bilan mensuel, série 51x (Situation Mensuelle).
- **LCR** — cycle spécifique au ratio de liquidité à court terme. Arrêtés selon périodicité imposée (voir circulaire LCR, TODO à confirmer).
- **Ad hoc** — dates non calendaires (milieu de mois, dates exceptionnelles). Inférées par REGFlow via la classe `ArreteType.AD_HOC` du `golden-normalizer`.

Le Document 7 §2 détaille la classification effective appliquée au corpus QNB Tunisia (9 batches, nature de chacun).

## 15. Régime de sanctions

Le régime de sanctions BCT pour défaut de reporting est fondé sur la **circulaire 2017-06 articles 11-12** (grille progressive).

TODO(@wbarouni) : documenter ici le barème exact de la grille progressive :

- Retard de soumission court vs long.
- Reporting incomplet vs reporting incorrect.
- Récidive.
- Plafonds et planchers.

Ces montants alimentent la **question de type 6** (estimation de sanction BCT) documentée au Document 10 §10. Tant que les montants ne sont pas confirmés, l'agent concerné retourne des fourchettes prudentes avec citation explicite de l'incertitude.

## 16. Exposition juridique du délai asynchrone

L'exposition juridique vient de la combinaison de :

- **Retour BCT asynchrone** (§2) : la banque ne sait pas si son envoi tiendra.
- **Délai de correction contraint** après rejet BCT : le calendrier BCT impose une resoumission dans une fenêtre limitée.
- **Grille de sanctions progressive** (§15) : plus le délai de correction est long, plus la sanction est lourde.

Un envoi fait trop près de l'échéance, rejeté par la BCT, avec correction en deux jours, peut déjà déclencher une sanction. REGFlow neutralise ce risque en validant localement avant envoi : un FAIL sévère détecté avant soumission est une sanction évitée par définition.

Voir **Document 1 §7** pour la valeur ajoutée produit correspondante.

---

# Partie VI — Références

## 17. Liste des circulaires citées

Les circulaires BCT explicitement citées dans le corpus REGFlow et ses fixtures :

- **Circulaire 2017-06** — cadre de soumission SED, signature électronique du responsable Reporting (article 8), régime de sanctions (articles 11-12).
- **Circulaire 2018-06** — cohérence bilan-SM et structure des annexes SM (TODO(@wbarouni) : titre exact).
- **Circulaire 2018-10** — ventilation sectorielle et états détaillés dépôts (TODO(@wbarouni) : titre exact).

Toute nouvelle circulaire référencée dans le corpus ou dans les prompts `prompt_bank` (Document 5) doit être ajoutée à cette liste et citée avec sa date de publication et son numéro exact.

## 18. Renvoi vers le corpus golden QNB Tunisia

Le corpus golden de non-régression est documenté exhaustivement dans **Document 7 — Plan opérationnel Golden Baseline (v2)** :

- **Document 7 §1** — inventaire des 58 XMLs.
- **Document 7 §2** — classification par batch et complétude.
- **Document 7 §11** — matrice de dépendances complète.
- **Document 7 §12** — analyse par batch avec dépendances satisfaites ou manquantes.

L'arborescence in-repo : `tests/fixtures/golden/qnb-tunisia/` et `tests/fixtures/structural-references/`.

Le contrat de non-régression : `pnpm --filter @regflow/evaluator test` doit produire **73 passed, 32 skipped (Phase 2), 0 failed** sur cette baseline. Voir également `CLAUDE.md` §8.

---

**Document suivant :** `03-ARCHITECTURE-ET-ZERO-HARDCODING.md` — stack gelée, doctrine zéro-hardcoding, topologie on-premises, décomposition monorepo, invariants non négociables consolidés.
