# REGFlow — Capture AS-IS

## Algorithme du moteur d'évaluation RDG

**Version :** 1.0
**Date :** avril 2026
**Type :** document de capture pré-suppression
**Origine :** `apps/api/src/agents/evaluator/` de l'ancien monorepo Regalica_IDC
**Statut :** référence pour la réécriture en Phase 2 du plan brute
**Audience :** équipe qui écrira `packages/evaluator` en Phase 2

---

## Pourquoi ce document existe

Le code du moteur d'évaluation RDG en 5 phases (A/B/D/E) est supprimé en Phase 0 du plan brute. Il sera réécrit propre en Phase 2 dans `packages/evaluator/src/` selon la doctrine canonique (pg natif, types Decimal explicites, tests golden stricts).

La **logique algorithmique** de ce moteur est fonctionnelle et a été validée par un test golden sur 5 XML (937 PASS / 2 FAIL / 3672 SKIP / 4611 règles). Même si le code va à la poubelle, la connaissance algorithmique ne doit pas se perdre.

Ce document capture l'algorithme tel qu'implémenté dans l'AS-IS pour que la réécriture en Phase 2 puisse reproduire exactement le comportement.

---

## Vue d'ensemble du pipeline

Le moteur prend en entrée une `Map<filename, xmlContent>` (plusieurs XML d'un batch) et un `RuleWithTerms[]` (les règles applicables à la date d'arrêté). Il produit un `EvaluationResult` avec `runId`, totaux et liste exhaustive de verdicts.

Le traitement se fait en **5 phases nommées A, B, D, E** (il y a un trou volontaire en C qui n'a jamais été implémenté).

```
Input
 │ xmlFiles: Map<filename, xmlContent>
 │ rules: RuleWithTerms[]
 │ tenantId
 ▼
┌─────────────────────────────────────┐
│ Phase A — phaseA(xmlFiles)          │
│ Parse tous les XMLs                 │
│ Output: CellMatrix                  │
└─────────────────────────────────────┘
 │
 ▼
┌─────────────────────────────────────┐
│ Phase B — phaseB(rules)             │
│ Groupement et validation des règles │
│ Sans calcul                         │
│ Output: RuleGroup[]                 │
└─────────────────────────────────────┘
 │
 ▼  (pour chaque règle)
┌─────────────────────────────────────┐
│ resolveTerms(terms, cells)          │
│ Résout chaque terme en valeur       │
│ Decimal ou skip reason              │
│ Output: ResolvedTerm[]              │
└─────────────────────────────────────┘
 │
 ▼
┌─────────────────────────────────────┐
│ Phase D — phaseD(resolved)          │
│ Agrégation par rang                 │
│ RHS rang 1, LHS rang 2+             │
│ Output: AggregatedResult            │
└─────────────────────────────────────┘
 │
 ▼
┌─────────────────────────────────────┐
│ Phase E — phaseE(rule, aggResult)   │
│ Comparaison LHS op RHS              │
│ Output: Verdict (PASS/FAIL/SKIP)    │
└─────────────────────────────────────┘
 │
 ▼
Verdict[] pour toutes les règles
```

---

## Phase A — Parsing XML vers CellMatrix

**Entrée.** `Map<filename, xmlContent>` où `xmlContent` est une chaîne UTF-8.

**Sortie.** `CellMatrix = Map<annexeCode, Map<rubriqueCode, Map<colonne, Decimal>>>`.

**Algorithme.**

Pour chaque fichier XML :

1. Parser la chaîne XML avec `fast-xml-parser` en mode préservation des attributs.
2. Extraire le `<CodeAnnexe>` de l'entête. Ce code **n'est pas normalisé** : il est conservé exactement tel qu'écrit dans le XML. L'annexe "00" reste "00", l'annexe "01" reste "01".

**Nota bene important.** L'AS-IS appliquait historiquement un `replace(/^0+(?=\d)/, "")` qui transformait "00" en "0". Cette normalisation a été identifiée comme bug en Phase 0 lors de l'exécution du test golden refactorisé qui a révélé l'écart avec les référentiels seedés. La nouvelle implémentation en Phase 2 doit **préserver le code exact** du XML.

3. Descendre dans `<Annexe id="X">` et itérer sur les `<Rubrique id="Y">`.

4. Pour chaque rubrique, itérer sur les `<Colonne id="N">`. Extraire la valeur textuelle.

5. Convertir la valeur en `Decimal` avec `new Decimal(str)`. La précision est globalement configurée à `{ precision: 38, rounding: Decimal.ROUND_HALF_EVEN }` au démarrage du moteur.

6. Les rubriques imbriquées dans des conteneurs `<Societe>`, `<Membre>`, `<Instrument>` sont collectées **récursivement**. Une même rubrique peut apparaître plusieurs fois (une par entité child) : dans ce cas, les valeurs sont écrasées en dernière victoire (comportement à revoir en Phase 2 selon besoins métier précis des sentinelles D1-D6).

7. Les colonnes auto-fermantes `<Colonne id="N"/>` ou avec contenu vide sont **ignorées** (pas de clé dans la map).

**Cas spéciaux.**

- **XML vide structurellement valide.** Si toutes les colonnes sont vides, la CellMatrix pour cette annexe contient zéro entrée. Comportement normal, pas d'erreur.
- **Valeurs non numériques.** Si `Decimal` échoue à parser, un warning est émis et la cellule est omise.
- **Nomenclatures autres que moderne.** L'AS-IS ne gérait **que** la nomenclature moderne. Les XML legacy (annexe 810 position de change) et specialized (annexe 781 taux) étaient rejetés. Le **Livrable 4 (bct-xml-parser)** de la Phase 0 fournit un dual-parser qui supporte les trois nomenclatures et produit la même interface `CellMatrix`. La Phase 2 peut directement consommer ce package.

**Précision.** La réécriture Phase 2 doit utiliser `@regflow/bct-xml-parser` pour cette phase A. Pas de re-parsing maison.

---

## Phase B — Groupement et validation des règles

**Entrée.** `RuleWithTerms[]` chargé depuis la DB (migration seed_rdg_rules en Phase 1) ou depuis le XLSX de référence en test golden.

**Sortie.** `RuleGroup[]` qui est simplement une structure qui groupe les termes de chaque règle par rang.

**Algorithme.**

Pour chaque règle :

1. Vérifier la présence d'au moins un terme. Si zéro terme, retourner un verdict `SKIPPED_CONDITIONAL` avec motif "règle sans terme".
2. Trier les termes par `rang` puis par `num_seq`.
3. Vérifier l'opérateur `oper_regle`. Supporté : `=`, `>=`, `<=`, `>`, `<`, `SUM`, `MAX`, `MIN`, `VA`. Si autre, `SKIPPED_UNSUPPORTED_OP`.
4. Grouper les termes par rang. Typiquement rang 1 = RHS (right-hand side, valeur de référence) et rang 2+ = LHS (left-hand side, valeur à vérifier).

Cette phase ne fait **aucun calcul**. Elle prépare la structure pour les phases suivantes.

---

## resolveTerms — résolution de chaque terme

**Entrée.** Liste de termes d'une règle et la `CellMatrix` du batch.

**Sortie.** Liste de `ResolvedTerm` qui est soit une valeur `Decimal` soit un motif de skip.

**Algorithme.**

Pour chaque terme :

- Si `kind == "literal"` : retourner `{ value: term.literalValue, op: term.termOp }`.
- Si `kind == "literal_text"` : retourner `{ skipReason: "SKIPPED_LITERAL_TEXT" }`. Le moteur ne sait pas comparer du texte arithmétiquement.
- Si `kind == "cell_ref"` :
  - Déterminer l'annexe source. Si `ax_origine` est numérique, utiliser cette valeur. Sinon (sentinelle C, D1-D6), c'est plus complexe : C = constante dans la rubrique, D = itération sur rubrique détail.
  - Chercher dans la `CellMatrix.get(axOrigine)` la rubrique `term.rubriqueCode`.
  - Si l'annexe source n'est pas dans la CellMatrix → `SKIPPED_MISSING_ANNEXE`.
  - Si la rubrique n'existe pas dans l'annexe → `SKIPPED_MISSING_RUBRIQUE`.
  - Si la colonne n'existe pas pour la rubrique → `SKIPPED_MISSING_COLONNE`.
  - Sinon retourner `{ value: cellValue, op: term.termOp }`.

**Sentinelles C, D1-D6.** Le traitement des sentinelles dans l'AS-IS est partiel. Les sentinelles C sont traitées comme des références à une rubrique contenant une constante. Les sentinelles D1-D6 ne sont que partiellement implémentées et sont une zone d'amélioration pour la Phase 2. Le Document 2 §RDG détaille le comportement sémantique attendu.

---

## Phase D — Agrégation par rang

**Entrée.** `ResolvedTerm[]` d'une règle.

**Sortie.** `AggregatedResult` avec un `lhs` Decimal et un `rhs` Decimal (ou skip reason).

**Algorithme.**

1. Séparer les termes par rang. Rang 1 → rhs_terms. Rang 2+ → lhs_terms.
2. Si l'un des termes est `SKIPPED_MISSING_*` → propager le skip à l'agrégation entière de son côté (LHS ou RHS).
3. Agréger les termes du RHS selon leurs opérateurs (`+`, `-`, `*`, `/`).
   - Initialiser à la valeur du premier terme.
   - Pour chaque terme suivant, appliquer son opérateur sur l'accumulateur : `acc = acc op term.value`.
   - Précision Decimal 38 ROUND_HALF_EVEN.
4. Même chose pour le LHS.

**Cas spéciaux des opérateurs `SUM`, `MAX`, `MIN`, `VA`.** L'opérateur de la règle (`oper_regle`) détermine comment le LHS entier est comparé au RHS. Mais au sein du LHS ou du RHS, les `term.termOp` individuels agrègent les termes en une seule valeur.

---

## Phase E — Comparaison et verdict

**Entrée.** `AggregatedResult { lhs, rhs }` et la règle avec son `oper_regle`.

**Sortie.** Un `Verdict`.

**Algorithme.**

1. Si `aggregatedResult.skipReason` défini → retourner `Verdict { status: skipReason }`.
2. Sinon, calculer `gap = lhs.minus(rhs)`.
3. Comparer selon `oper_regle` :
   - `=` : `gap.isZero()` → PASS sinon FAIL.
   - `>=` : `gap.gte(0)` → PASS sinon FAIL.
   - `<=` : `gap.lte(0)` → PASS sinon FAIL.
   - `>` : `gap.gt(0)` → PASS sinon FAIL.
   - `<` : `gap.lt(0)` → PASS sinon FAIL.
   - `SUM`, `MAX`, `MIN`, `VA` : comportements spécifiques documentés dans le Document 2.
4. Si FAIL, déterminer la sévérité : si `|gap| < 1 TND` → `severity: "rounding"`, sinon `severity: "severe"`. Le seuil d'arrondi 1 TND est paramétré via sentinelle dans `referentials_sentinelles`.

**Verdict enrichi.** Le Verdict final contient `lhs`, `rhs`, `gap`, rubriqueAt et colonneAt de la première cellule impliquée. Ces métadonnées servent à l'InvestigatorAgent en Phase 2.

---

## Tests golden historiques

**Fixture d'origine.** 5 XML de la banque fictive `bank-23` arrêté `2024-03-31`, annexes 00, 01, 02, 51, 640. Sans le 630.

**Résultats attendus immuables.**
- PASS : 937
- FAIL : 2 (règles 266 et 267 sur annexe 630, mais évaluables partiellement depuis les inter-annexes)
- SKIP : 3 672
- Total règles : 4 611

**Nouvelle fixture golden** (plan brute Phase 0). 58 XML QNB Tunisia sur 9 batches. Le test golden refactorisé (Livrable 3) itère sur tous les batches et compare aux `expected_verdicts.json`. Les totaux exacts seront capturés au premier run en Phase 2 puis figés.

---

## Précision Decimal — contrat absolu

La précision de tous les calculs est :

- **Précision** : 38 digits significatifs
- **Arrondi** : ROUND_HALF_EVEN (banker's rounding)
- **Initialisation** : `Decimal.set({ precision: 38, rounding: Decimal.ROUND_HALF_EVEN })` au boot du moteur

Cette précision doit être exactement la même côté Python (moteur Python envisagé en Phase 4 pour l'analyse historique) : `decimal.getcontext().prec = 38; decimal.getcontext().rounding = decimal.ROUND_HALF_EVEN`.

**Raison.** Les rubriques BCT peuvent contenir des montants allant jusqu'à plusieurs centaines de milliards de TND avec 3 décimales. 38 digits est largement suffisant et évite toute erreur d'arrondi en cascade sur les règles qui agrègent des dizaines de termes.

**Test de non-régression cross-runtime.** En Phase 4, un test compare les sorties du moteur TS et du moteur Python (s'il existe) sur le même batch. Toute divergence au-delà de 10^-30 TND est un bug.

---

## Interface consommable par les autres composants

Le moteur expose une seule fonction publique :

```typescript
export async function runEvaluation(input: EvaluationInput): Promise<EvaluationResult>;
```

C'est ce que les routes API, les tests golden, et les scripts de batch vont appeler. Les 5 phases sont des détails d'implémentation internes.

**Contrat du résultat.**

- `runId` : UUID généré à l'entrée du moteur.
- `totals` : tous les compteurs (pass, fail_severe, fail_rounding, skip_*).
- `verdicts` : liste exhaustive de tous les verdicts, dans l'ordre des règles (garanti déterministe par tri (ax_term, num_regle)).
- `durationMs` : mesure de performance.
- `engineVersion` : string pour traçabilité.
- `rulesVersionSnapshot` : hash ou timestamp de la version des règles utilisée (snapshot immutable dans `validation_runs`).
- `referentialsVersionSnapshot` : idem pour référentiels.

---

## Ce qui n'existe pas dans l'AS-IS et doit être ajouté en Phase 2

- **Détection de clusters (grappes).** Le moteur AS-IS produit des verdicts individuels. La détection de cause racine commune entre plusieurs FAIL est à construire en Phase 2. Algorithme à définir : probablement un clustering sur les rubriques impliquées + similarité d'écart.
- **Support du dual-parsing.** À faire via `@regflow/bct-xml-parser`.
- **Support complet des sentinelles D1-D6.** L'AS-IS est partiel, la Phase 2 doit compléter.
- **Cache de règles par date d'arrêté.** L'AS-IS recharge les règles à chaque run. La Phase 2 peut mémoiser le chargement des règles par `arrete_date` pour accélérer les runs successifs du même batch.
- **Métriques Prometheus.** Historogrammes par phase, compteurs de verdicts par type, latence totale.

---

## Ce qui doit être retiré et jamais réintroduit

- **Normalisation `^0+(?=\d)` sur CodeAnnexe.** Bug résolu en Phase 0, ne jamais le remettre.
- **`parseTagValue: true` par défaut de fast-xml-parser.** Convertit `"00"` en `0` ce qui casse la cohérence avec les référentiels. Toujours forcer `parseTagValue: false`.
- **Chargement des règles depuis XLSX à l'exécution.** Le test golden AS-IS lisait `tests/fixtures/rdg.xlsx` en direct dans `beforeAll()`. En Phase 2 les règles viennent de la DB uniquement, via migration seed_rdg_rules. Le XLSX reste une fixture de référence pour régénérer le seed si besoin.

---

## Pointeur vers le code original (pour Phase 2)

Le code AS-IS supprimé en Phase 0 vit encore dans le tag Git `pre-refactoring-backup-2026-04-22`. Pour consultation :

```bash
git checkout pre-refactoring-backup-2026-04-22 -- apps/api/src/agents/evaluator
# Lire les fichiers
git checkout HEAD -- apps/api/src/agents/evaluator  # Annule le checkout local
```

Fichiers :
- `apps/api/src/agents/evaluator/index.ts` (point d'entrée `runEvaluation`)
- `apps/api/src/agents/evaluator/phases.ts` (phases A, B, D, E)
- `apps/api/src/agents/evaluator/types.ts` (types RuleTerm, VerdictStatus, etc.)

Ces fichiers sont à **lire pour compréhension**, pas à copier dans le nouveau monorepo.

---

*Fin du document de capture AS-IS — algorithme du moteur d'évaluation*
