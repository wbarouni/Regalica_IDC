# REGFlow — Plateforme de Conformité BCT par Intelligence Artificielle

## Document 4 — Workflow utilisateur complet

**Version :** 1.0
**Date :** avril 2026
**Périmètre :** parcours utilisateur complet en quatre temps T0/T1/T2/T3, livrables produits à chaque étape, cycles d'itération correction, Mode Signature avec révocation contrôlée, écrans UI et cas limites. Ce document raconte le workflow en prose ; la formalisation FSM est dans `docs/08-STATE-MACHINES-WORKFLOW.md`.
**Auteur :** Équipe REGFlow
**Statut :** référence canonique pour Claude Code
**Dépendances :** Document 1 (vision produit), Document 2 (cadre réglementaire BCT), Document 8 (state machines formalisées), Document 10 (orchestration Regalica et 7 types de questions)

---

## Sommaire

**Partie I — Vue d'ensemble**

1. Quatre temps T0, T1, T2, T3
2. Ordre canonique imposé
3. Transitions de haut niveau

**Partie II — T0 — Pré-validation**

4. Arrivée et upload XML
5. Vérifications de structure, annexes compagnes, dates
6. Sortie T0 : déclenchement T1 ou blocage avec remédiation

**Partie III — T1 — Validation BCT en 3 étapes**

7. Étape 1 — XSD
8. Étape 2 — Contrôles embarqués BCT
9. Étape 3 — Contrôles qualité RDG (5 phases A/B/D/E)
10. Verdicts et livrables produits

**Partie IV — T2 — Investigation conversationnelle**

11. Entrée dans T2 et état conversationnel
12. Les 7 types de questions canoniques
13. Cycle correction → ré-upload → ré-T0 → ré-T1 → ré-T2

**Partie V — T3 — Historique et analytics**

14. Entrée dans T3 (débloqué par zéro FAIL sévère)
15. Dialogues analytiques supportés
16. Rapports consolidés et exports

**Partie VI — Mode Signature et archivage**

17. Signature par Compliance Officer
18. Révocation contrôlée de signature
19. Archivage automatique post-SED

**Partie VII — Écrans et livrables UI**

20. Écran Workspace
21. Écran Library
22. Écran Filings

**Partie VIII — Cas limites**

23. Re-entrée après correction
24. Annulation d'un run en cours
25. Multi-utilisateurs concurrents sur un même tenant

---

# Partie I — Vue d'ensemble

## 1. Quatre temps T0, T1, T2, T3

Le parcours utilisateur REGFlow traverse quatre temps successifs, chacun gouverné par sa state machine formalisée (Document 8). Un seul run de validation occupe un unique temps à un instant donné ; les transitions sont explicites et auditables.

| Temps  | Rôle                                         | Déclenchement                           | Sortie attendue                                |
| ------ | -------------------------------------------- | --------------------------------------- | ---------------------------------------------- |
| **T0** | Pré-validation (structure, compagnes, dates) | Upload XML par le Compliance Officer    | « Prêt à valider » ou blocage avec remédiation |
| **T1** | Validation BCT en 3 étapes                   | Clic explicite « Lancer la validation » | Verdicts PASS/FAIL/SKIP, 3 livrables UI        |
| **T2** | Investigation conversationnelle              | Run T1 terminé avec FAILs présents      | Corrections ciblées, itération                 |
| **T3** | Analytics capitalisées                       | T1 complet avec zéro FAIL sévère        | Rapports, tendances, Mode Signature            |

**T0 est automatique une fois l'upload fait.** T1 est manuel (l'utilisateur valide explicitement). T2 est conversationnel et peut rebouclerer vers T0 via une correction. T3 est sur-ordre et débloque les exports et la signature.

## 2. Ordre canonique imposé

L'ordre `T0 → T1 → T2 → T3` est strict et appliqué structurellement au niveau de Regalica et des FSM (Document 8). Il ne peut pas être court-circuité par l'UI ni par un appel API. Conséquences concrètes :

- **Pas de T3 sans T1 complet.** L'analyse historique (`HistoricalAgent`, Document 9 §14) ne peut jamais être invoquée avant une validation RDG complète. La règle est appliquée au niveau Regalica : le router refuse de classifier une question en `historique_recurrence` si `current_fsm_state` n'est pas dans T2 ou T3 (Document 10 §7).
- **Pas de T2 sans T1 terminé.** Une conversation T2 n'est possible qu'après production des verdicts. Toute question posée en état T0 est traitée en assistance à la préparation (Document 10 §12), pas en investigation causale.
- **Pas de Mode Signature sans zéro FAIL sévère.** Le passage en T3 reste ouvert dès que T1 est terminé, mais la signature exige zéro FAIL sévère (Document 2 §5). Les FAIL « arrondi » restent signables sous justification explicite.

Cet ordre fait partie des invariants produit (Document 3 §25 invariant 1, PRD §7 ordre canonique imposé).

## 3. Transitions de haut niveau

Vue synthétique des transitions principales — la table exhaustive avec gardes, événements et TTL vit au Document 8.

```
┌─────────┐  upload   ┌──────────┐  "lancer"  ┌──────────┐  fail/pass ┌───────────┐
│  idle   │──────────▶│    T0    │───────────▶│    T1    │───────────▶│     T2    │
└─────────┘           └──────────┘            └──────────┘            └───────────┘
                           │                      │                        │
                           │                      │                        │
                           │  blocage             │  erreur tech           │ correction
                           ▼                      ▼                        ▼
                      ┌──────────┐          ┌──────────┐            ┌───────────┐
                      │remédiation│          │erreur_rec│            │    T0     │ (ré-entrée)
                      └──────────┘          └──────────┘            └───────────┘

                                      zéro FAIL sévère
                                             │
                                             ▼
                                      ┌──────────┐  signature  ┌──────────┐
                                      │    T3    │────────────▶│  signed  │
                                      └──────────┘             └──────────┘
                                             │                      │
                                             │ 30 j inactivité      │ révocation
                                             ▼                      ▼
                                      ┌──────────┐            ┌──────────┐
                                      │ archived │            │    T3    │ (re-ouvert)
                                      └──────────┘            └──────────┘
```

**Table des transitions autorisées** : Document 8 §4 (T0), §8 (T1), §11 (T2/T3), §15 (FSM 4-yeux).

---

# Partie II — T0 — Pré-validation

## 4. Arrivée et upload XML

Le Compliance Officer arrive sur l'écran Workspace (Partie VII §20) et dépose ses fichiers XML dans la zone d'upload. L'upload supporte le multipart HTTP standard via `apps/api` (route `POST /api/uploads`, Phase 3).

**Détection de nomenclature.** Chaque XML est inspecté par `@regflow/bct-xml-parser` (Document 3 §14) dès sa réception. Les trois nomenclatures supportées (moderne `<Entete>`, ancienne `<ENTETE>`, spécialisée 781 / 810) sont détectées automatiquement par signature root-level. Le parser extrait les métadonnées essentielles :

- `code_banque` (balise `<CodeBanque>` ou `<BQ>`)
- `date_annexe` normalisée en `YYYY-MM-DD` (accepte `YYYYMMDD` et `DD/MM/YYYY`)
- `code_annexe` préservé tel quel — jamais de zero-stripping
- Nomenclature détectée (`modern`, `legacy`, `specialized_781`, `unknown`)

**Persistance.** Chaque fichier uploadé produit une ligne dans `xml_uploads` (Document 6 §10) avec son `sha256` et son rattachement à un `validation_runs` en cours d'initialisation.

**Groupement en batch.** Tous les XML partageant la même `date_annexe` après normalisation forment un **batch** candidat. Les XML sans date exploitable (structural references comme 781 sans `DateAnnexe`) sont classés à part et ne rejoignent pas un batch daté.

## 5. Vérifications de structure, annexes compagnes, dates

Trois vérifications déterministes tournent en parallèle dès l'upload terminé, pilotées par trois agents déterministes (Document 9 §7-9) :

| Vérification      | Agent              | Question posée                                                                                                                         |
| ----------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Structure XML     | `IngestorXMLAgent` | Les XML sont-ils parsables ? La nomenclature est-elle reconnue ? Les balises racine sont-elles correctes ?                             |
| Annexes compagnes | `DependencyAgent`  | Pour chaque annexe présente, ses compagnes requises (matrice CC-tech §9.5) sont-elles aussi présentes dans le batch ?                  |
| Cohérence dates   | `TemporalAgent`    | Toutes les annexes d'un même batch partagent-elles la même date d'arrêté ? La date est-elle compatible avec le type d'arrêté détecté ? |

**Annexes compagnes manquantes.** Par exemple, un batch de fin d'exercice doit contenir `00` (Bilan) et `01` (Hors bilan) comme dépendances de 47 (LCR) ou des SM `620/630/640`. Si `00` manque, `DependencyAgent` retourne la liste des compagnes manquantes avec `dependency_source` (circulaire BCT ou CC-tech), `required_by` (annexes dépendantes), `consequence` (« règles inter-annexes produiraient des SKIPPED_MISSING_ANNEXE »). L'UI affiche proactivement ces manques avec un bouton « Ajouter les annexes manquantes ».

**Dates incohérentes.** Un XML avec `date_annexe = 2024-09-30` mélangé à d'autres à `2024-12-31` produit un warning `TemporalAgent` avec option « Corriger » ou « Séparer en deux batches ».

**Regalica en T0.** L'utilisateur peut dialoguer avec Regalica pendant T0 (Document 10 §12 — questions en T0), typiquement pour comprendre pourquoi une compagne est réclamée ou pour demander une synthèse de ce qui est attendu pour l'arrêté en cours. Pas d'investigation causale de FAIL à ce stade (T1 n'a pas tourné).

## 6. Sortie T0 : déclenchement T1 ou blocage avec remédiation

T0 produit exactement un des deux états terminaux :

- **`ready_for_T1`** — toutes les vérifications déterministes passent ou les warnings sont acceptés explicitement par l'utilisateur (décision manuelle de forcer, auditée). Le bouton « Lancer la validation » devient actif.
- **`blocked`** — une vérification critique échoue (XML inparsable, batch vide, collision de fichiers détectée par le normalizer). L'UI affiche la liste des blocages avec actions de remédiation. Aucun T1 n'est déclenchable tant que les blocages ne sont pas levés.

**Pré-alertes proactives.** Même en `ready_for_T1`, REGFlow émet des notifications push (`NotificationAgent`, Document 9 §19) si le batch semble incomplet mais non bloquant (p.ex. annexe 781 absente alors que l'arrêté est en fin d'année). L'utilisateur peut ignorer la pré-alerte ou agir.

**Persistance.** La sortie T0 vit dans `validation_runs.state` avec transition formalisée au Document 8 §4.

---

# Partie III — T1 — Validation BCT en 3 étapes

T1 se déclenche au clic explicite « Lancer la validation ». Il exécute **synchroniquement** les trois étapes officielles BCT dans l'ordre, sans parallélisation — chaque étape conditionne la suivante.

## 7. Étape 1 — XSD

**Ce qui est vérifié.** Conformité des XML au schéma XSD officiel BCT pour la nomenclature détectée. C'est la première des trois étapes de contrôle documentées au Document 2 §7 (trois contrôles BCT embarqués).

**Mécanique.** Validation XSD déterministe via le parser de `structure-validator` (Phase 3). Résultat binaire par fichier : conforme ou non conforme. Sur non-conformité, la liste des violations XSD est produite avec la balise fautive et la contrainte violée.

**Effet sur T1.** Si un seul XML du batch est non conforme XSD, l'étape 1 échoue et les étapes 2 et 3 ne s'exécutent pas. Le Compliance Officer reçoit la liste des erreurs XSD avec remédiation suggérée et doit corriger à la source (SI bancaire ou outil de production XML), puis re-uploader.

**TODO(@wbarouni)** : référence des schémas XSD BCT par nomenclature à compléter en Phase 3. Probablement hébergés par la BCT et versionnés par circulaire.

## 8. Étape 2 — Contrôles embarqués BCT

**Ce qui est vérifié.** Les contrôles embarqués BCT, distincts du RDG. Ils portent sur des règles structurelles de cohérence inter-balises et de format qui ne sont pas exprimées en XSD mais que le SED rejetterait à l'étape 2 de son propre processus de contrôle (Document 2 §7).

**Mécanique.** Règles codées dans `packages/structure-validator` (Phase 3) et alimentées par référentiel DB `referentials_controles_embarques` (TODO(@wbarouni) : nom exact de la table à confirmer contre Document 6 §9).

**Effet sur T1.** Même comportement qu'à l'étape 1 : un échec bloque l'étape 3. Le livrable produit est la liste des contrôles embarqués en échec avec leur code BCT et la rubrique concernée.

## 9. Étape 3 — Contrôles qualité RDG (5 phases A/B/D/E)

**Ce qui est vérifié.** Les 4 611 règles RDG qui constituent le cœur produit de REGFlow. C'est l'étape différenciante : la BCT ne l'applique qu'après réception au SED et son retour est asynchrone (Document 2 §3), alors que REGFlow la joue en local avant envoi.

**Mécanique.** `packages/evaluator` (Livrable 3 de Phase 0, implémentation complète Phase 2) charge toutes les règles actives depuis `rules` / `rules_terms` (lecture DB, zéro hardcoding — Document 3 §8), charge les référentiels `referentials_*`, reçoit la `CellMatrix` fusionnée du batch produite par `@regflow/bct-xml-parser`, et exécute les 5 phases documentées dans la capture AS-IS `docs/as-is-captured/as-is-evaluator-algorithm.md` :

- **Phase A** — construction des contextes de règle (résolution des `AX_ORIGINE` numériques, sentinelles C, sentinelles D1-D6).
- **Phase B** — agrégation par rang des termes (sommes ventilées, préservation Decimal 38 digits).
- **Phase D** — évaluation de la formule de la règle (comparateur `=`, `>=`, `<=`, etc., avec tolérance `epsilon` éventuelle).
- **Phase E** — production du verdict et enregistrement des détails `validation_fail_details` (expected, calculated, delta, rang, rubrique, colonne).

**Latence cible.** p95 < 3 secondes sur un batch typique de 10 annexes (invariant n°8 du Document 3 §25). Le test golden mesure cette latence à chaque exécution.

## 10. Verdicts et livrables produits

Les verdicts produits par l'étape 3 sont typés :

| Verdict                    | Sens                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `PASS`                     | Règle satisfaite, aucune action requise                                                       |
| `FAIL_SEVERE`              | Règle violée, rejet BCT probable — à corriger avant envoi SED                                 |
| `FAIL_ROUNDING`            | Règle violée par arrondi uniquement (delta dans tolérance d'arrondi) — signalable avec justif |
| `SKIPPED_MISSING_ANNEXE`   | Règle inter-annexe, annexe compagne absente du batch                                          |
| `SKIPPED_MISSING_RUBRIQUE` | Rubrique requise absente de l'annexe                                                          |
| `SKIPPED_MISSING_COLONNE`  | Colonne requise absente de la rubrique                                                        |
| `SKIPPED_MISSING_DATA`     | Cellule requise vide (différent de zéro)                                                      |
| `SKIPPED_CONDITIONAL`      | Prérequis conditionnel non satisfait (règle conditionnelle)                                   |
| `SKIPPED_UNSUPPORTED_OP`   | Opérateur de formule non supporté par le moteur (marqueur de couverture incomplète)           |
| `SKIPPED_LITERAL_TEXT`     | Terme littéral textuel non évaluable numériquement                                            |

**Trois livrables UI visibles dans l'ordre canonique** (PRD §7) :

1. **Synthèse** — totaux par type de verdict, scorecard PASS / FAIL / SKIP par annexe, temps d'exécution.
2. **Livrable C — cause racine** — sortie du `InvestigatorAgent` (Document 9 §13) sur les FAIL sévères clusterisés par cause commune. Détecté à partir des `clusters` construits en post-évaluation.
3. **Livrable A — FAIL détaillés** — liste exhaustive des FAIL avec décomposition terme-par-terme (expected, calculated, delta, rang, citation réglementaire).

Un quatrième livrable **Livrable B — exhaustif, repliable** contient toutes les lignes évaluées (PASS inclus) pour audit et analyse. Replié par défaut pour ne pas noyer l'utilisateur.

**Persistance.** Tous les verdicts atterrissent dans `validation_fail_details` (Document 6 §12) avec `rule_id`, `verdict`, `expected`, `calculated`, `delta`, `rubrique`, `colonne`, `annexe`. Le run terminé passe en état T2 si des FAIL sévères sont présents, sinon T3 est directement accessible.

---

# Partie IV — T2 — Investigation conversationnelle

## 11. Entrée dans T2 et état conversationnel

T2 démarre automatiquement dès que T1 est terminé avec au moins un `FAIL_SEVERE` ou `FAIL_ROUNDING`. Un run T1 sans aucun FAIL saute T2 et passe directement en T3 accessible.

**Création de la conversation.** L'entrée en T2 crée une ligne dans `conversations` (Document 6 §20) rattachée au `validation_runs.id`, avec un message de bienvenue synthétique de Regalica qui résume les totaux produits par le moteur et propose les premières pistes d'investigation (Document 8 §17 — action d'entrée T2).

**Persona unique.** Tout dialogue T2 passe par Regalica (Document 10). L'utilisateur ne voit jamais les 13 spécialistes — ils sont invoqués en arrière-plan selon la question posée. Chaque message utilisateur est persisté dans `messages` (Document 6 §20), puis envoyé à l'orchestration Regalica qui retourne un message assistant également persisté.

**Invariants de voix.** Regalica vouvoie systématiquement, sans emoji, sans superlatif marketing, sans formules serviles (« avec plaisir », « bien sûr »). Les affirmations factuelles sont citées (Document 10 §5). Voir Document 3 §25 invariant 15.

## 12. Les 7 types de questions canoniques

Regalica classifie chaque message utilisateur parmi sept types canoniques documentés exhaustivement au Document 10 Partie II. Chaque type invoque un sous-ensemble défini de spécialistes et applique un `agent_key` aggregator distinct dans `prompt_bank`.

| #   | Type                     | Quand                                      | Spécialistes invoqués typiquement                     |
| --- | ------------------------ | ------------------------------------------ | ----------------------------------------------------- |
| 1   | Zoom sur un FAIL         | « Pourquoi ce FAIL ? »                     | `InvestigatorAgent` + `CitationAgent`                 |
| 2   | Grappe de cause racine   | Cluster détecté de N FAILs apparents       | `InvestigatorAgent` sur le cluster + `DiffAgent`      |
| 3   | Historique et récurrence | « Ai-je déjà eu ce FAIL ? »                | `HistoricalAgent` (T1 complet requis, Document 10 §7) |
| 4   | Citation réglementaire   | « Où est écrit que ? »                     | `CitationAgent`                                       |
| 5   | Simulation d'impact      | « Si je corrige X, que se passe-t-il ? »   | `VisualizerAgent` + re-évaluation partielle           |
| 6   | Estimation de sanction   | « Combien ça coûterait en cas de rejet ? » | `HistoricalAgent` + `CitationAgent` (Document 2 §15)  |
| 7   | Plan optimal             | « Par quoi je commence ? »                 | Agrégation multi-spécialistes avec priorisation       |

Les questions hors périmètre (demandes d'aide générale non liées à la conformité, questions out-of-scope) sont détectées par le router Regalica et rejetées gracieusement (Document 10 §19). Les questions ambiguës (confiance router < 0.70) produisent une demande de clarification au lieu d'invoquer un spécialiste (Document 10 §18).

**Garde-fou confiance.** Si la sortie d'un spécialiste a une `confidence < 0.95` pour les investigations causales, Regalica ne l'affiche pas — elle retourne un message standardisé invitant à reformuler (Document 9 §4). L'UX préfère un « je ne sais pas » honnête à une réponse fausse.

## 13. Cycle correction → ré-upload → ré-T0 → ré-T1 → ré-T2

Quand l'utilisateur identifie la cause d'un FAIL et la corrige à la source (son SI bancaire ou son générateur de XML), il ré-uploade les XML corrigés **dans le même run de travail** (Document 8 §20 — transition T2 → T0).

**Préservation de la conversation.** La conversation T2 reste attachée au run et est accessible dans l'historique même après le nouveau cycle. L'utilisateur retrouve son dialogue intact (PRD §2 — continuité pédagogique).

**Comparaison inter-runs par DiffAgent.** Sur la prochaine boucle (T1 rejoué), le `DiffAgent` (Document 9 §18) compare automatiquement les verdicts au run précédent et confirme en une phrase ce que la correction a résolu (grappe G1 dissoute, ou révélation d'un autre problème sous-jacent).

**Limite de profondeur.** Aucune limite technique sur le nombre d'itérations. Au-delà de 5 itérations sur le même run, Regalica propose proactivement d'ouvrir un ticket de support interne à la Direction Conformité, signalant qu'il y a probablement un problème systémique dans le SI source (Document 8 §12 — doctrine d'itération).

---

# Partie V — T3 — Historique et analytics

## 14. Entrée dans T3 (débloqué par zéro FAIL sévère)

T3 devient accessible dans deux cas :

1. T1 terminé avec zéro FAIL sévère, potentiellement des FAIL arrondi signés sous justification.
2. T2 itéré jusqu'à zéro FAIL sévère.

Aucun passage direct T0 → T3 n'est possible — l'ordre canonique est appliqué (§2).

**Effet sur l'UI.** Les onglets « Analytics » et « Signature » apparaissent sur le run courant. Les exports (DOCX, PDF, CSV) deviennent actifs. La 4-yeux de signature est proposée.

## 15. Dialogues analytiques supportés

Deux catégories principales en T3 :

- **Analyse historique par `HistoricalAgent`.** Tendances inter-runs sur plusieurs arrêtés (p.ex. « ai-je eu ce type de FAIL sur les 4 derniers arrêtés ? », « quelle est ma dérive sur la rubrique X ? »). L'agent lit les runs archivés du tenant (contrainte RLS, Document 3 §21) et produit un `structured output` consommé par Regalica.
- **Diff inter-runs par `DiffAgent`.** Comparaison ciblée entre deux runs sélectionnés par l'utilisateur (« qu'est-ce qui a changé entre mon arrêté T3 et mon T4 ? »). Sortie : liste des verdicts qui ont basculé, valeurs avant/après.

Les 7 types de questions T2 restent utilisables en T3 si l'utilisateur revient sur une investigation ; Regalica reclassifie en continu selon le message.

## 16. Rapports consolidés et exports

Trois formats d'export produits par `ReporterAgent` (Document 9 §15) :

- **Rapport de conformité DOCX** — synthèse managériale avec scorecard, grappes identifiées, corrections appliquées, Mode Signature associé.
- **Rapport détaillé PDF** — Livrables A + B + C fusionnés avec mise en page Edition One, destiné à l'archivage interne 10 ans.
- **Export CSV des verdicts** — toutes les lignes de `validation_fail_details` pour analyse externe (BI, audit, preuves).

**TODO(@wbarouni)** : politique de nommage canonique des exports à définir en Phase 5 (probablement `<tenant>_<arrete>_<run_id>_<format>.ext`).

**Traçabilité.** Chaque export produit une ligne dans `audit_log` (Document 6 §17) avec l'utilisateur exportateur, le format et le timestamp. Le fichier lui-même peut être stocké par `GedAgent` (Document 9 §20) si demandé.

---

# Partie VI — Mode Signature et archivage

## 17. Signature par Compliance Officer

Le Mode Signature est l'acte final qui matérialise la validation du run par le responsable Reporting de la banque. C'est une transition FSM contrôlée (Document 8 §13).

**Prérequis durs.**

- Run en état T3 (donc T1 terminé complet).
- Zéro `FAIL_SEVERE`.
- Les `FAIL_ROUNDING` éventuels signalés explicitement avec justification écrite (persistée dans `validation_runs.rounding_fails_justification`).
- Utilisateur courant a le rôle `signatory` sur le tenant (rôle défini dans `user_roles`, Document 6 §15).

**Acte de signature.** L'utilisateur clique « Signer » ; un modal exige sa confirmation et, selon la politique tenant, une ré-authentification renforcée (TODO(@wbarouni) : 2FA obligatoire en production ? Décision Phase 6).

**Effet DB.** Mise à jour `validation_runs.is_signed = true`, `signed_by_user_id`, `signed_at`. Trigger d'immutabilité renforcé : à partir de cet instant, aucun champ de `validation_runs` ni de `validation_fail_details` ne peut être modifié, sauf la transition contrôlée de révocation (§18).

**Effet audit.** Ligne insérée dans `audit_log` avec niveau de criticité élevé. Conservation 10 ans minimum (Document 6 §17 — rétention à confirmer).

## 18. Révocation contrôlée de signature

La révocation est la **seule** transition qui permet de revenir en arrière sur un run signé. Elle est implémentée par la procédure stockée `sp_revoke_signature` (Document 8 §13).

**Conditions.**

- Utilisateur a le rôle `signatory` ou `auditor`.
- Justification écrite obligatoire.
- Pré-SED seulement : si le run a déjà été transmis au SED BCT (`bct_submission.has_been_submitted = true` dans les `expected_verdicts`), la révocation devient plus contraignante — TODO(@wbarouni) : policy exacte à définir en Phase 3.

**Effet DB.** Transition `is_signed TRUE → FALSE` via la procédure stockée (jamais un `UPDATE` applicatif direct, qui serait bloqué par trigger). Le run revient en T3 ouvert, signable à nouveau après correction.

**Effet audit.** Double entrée dans `audit_log` : l'acte de révocation et la raison. Obligation de traçabilité maximale.

## 19. Archivage automatique post-SED

Les runs inactifs pendant 30 jours consécutifs passent en état `archived` par un job batch nocturne (Document 8 §14). L'archivage implique :

- Marquage `validation_runs.archived_at = NOW()`.
- Déplacement logique des verdicts vers une partition d'archive dans `validation_fail_details`.
- Compression des assets attachés (XML sources, exports PDF/DOCX).
- Le run reste consultable en lecture seule, avec un badge « Archived » dans l'UI Filings.

**Règle de rétention.** Les runs signés sont conservés en archive 10 ans (exigence réglementaire BCT présumée — TODO(@wbarouni) à confirmer contre circulaire BCT). Les runs non signés sont purgés après 3 ans (TODO(@wbarouni) idem).

**Pas de suppression manuelle.** Un run ne peut jamais être supprimé par un utilisateur final. Seule une opération administrateur très encadrée (rôle `tenant_admin` avec double validation 4-yeux) peut déclencher une purge anticipée sur ordre d'autorité (TODO(@wbarouni) : scénarios de purge légaux à documenter).

---

# Partie VII — Écrans et livrables UI

Trois écrans principaux portent le workflow utilisateur. Les maquettes HTML validées sont listées dans le PRD §12 (`regalica-workspace-v5.html`, `regalica-library-v3.html`, `regalica-filings.html`). Leur implémentation React + Tailwind intervient en Phase 5. Les primitives Edition One (`artefact`, `pill`, `conf`, `cite`, `btn`) sont dans `packages/ui` (skeleton en Phase 0).

## 20. Écran Workspace

**Rôle.** Écran unique où se déroule le run courant de bout en bout (T0 → T1 → T2 → T3). C'est l'écran le plus utilisé par le Compliance Officer.

**Zones principales.**

- **Header run** — identifiant, arrêté, tenant, état FSM actuel, actions de cycle (Lancer / Annuler / Signer).
- **Zone d'upload et inventaire XML** — visible en T0, puis repliée en haut de l'écran pour les phases suivantes.
- **Zone de verdicts T1** — scorecard, Livrable C (cause racine), Livrable A (FAIL détaillés), Livrable B (exhaustif repliable).
- **Zone de conversation Regalica** — visible dès T0, devient le focus principal en T2. Messages persistés et rechargeables à chaque session.
- **Zone d'actions terminales** — export, signature, ouverture Filings pour historique.

**Responsivité.** Desktop en priorité absolue (usage bureautique). Tablette tolérée pour consultation. Pas de mobile.

## 21. Écran Library

**Rôle.** Gouvernance des actifs référentiels et des prompts. C'est l'écran administrateur des règles de conformité.

**Onglets.**

- **Règles RDG** — les 4 611 règles avec recherche, filtre par annexe, statut (active / deprecated), historique bitemporel. Propose et approuve des modifications via 4-yeux.
- **Référentiels** — les 14 `referentials_*` (rubriques, colonnes, annexes, sentinelles, dépendances, nomenclatures, XML structures). Consultation et modification 4-yeux.
- **Prompts** — `prompt_bank` filtrée par `agent_key`. Visualisation des versions, diff entre versions, promotion `in_review → active` sous 4-yeux.
- **Demandes 4-yeux** — file d'attente des demandes à approuver ou rejeter, assignée par rôle.

**Rôles requis.** Les actions de modification exigent les rôles `rule_editor`, `referential_editor`, ou `prompt_editor` selon le cas, configurés dans `user_roles`.

## 22. Écran Filings

**Rôle.** Historique et analytics cross-runs. C'est l'écran de capitalisation.

**Zones.**

- **Liste des runs** — filtrée par tenant, période, état (signé, archivé, T2 en cours, etc.). Tri chronologique.
- **Fiche run** — vue détaillée d'un run historique en lecture seule, avec ses Livrables, sa conversation T2, ses exports.
- **Analytics transverses** — tendances multi-runs, dérives par rubrique, récurrences de FAIL, alimentées par `HistoricalAgent`.
- **Comparaison inter-runs** — outil de diff visuel entre deux runs sélectionnés, alimenté par `DiffAgent`.

**Archivage visible.** Les runs `archived` apparaissent avec un badge et conservent la navigation ; ils ne sont pas déplacés dans un onglet séparé.

---

# Partie VIII — Cas limites

## 23. Re-entrée après correction

Quand l'utilisateur ré-uploade un XML corrigé pendant T2, le run bascule en T0 pour re-vérifier les prérequis (§13). Cas particuliers :

- **Ré-upload partiel** — l'utilisateur ne ré-uploade qu'un seul XML corrigé parmi le batch. REGFlow remplace cet XML dans le batch courant et rejoue T0 puis T1 sur l'ensemble.
- **Ré-upload complet** — tous les XML sont remplacés. Le run courant est conservé (même `run_id`) mais ses verdicts précédents sont archivés dans un sous-groupe `iteration_n` de `validation_fail_details` pour permettre `DiffAgent`.
- **Divergence sur l'arrêté** — si le nouvel upload contient une date différente de celle du run courant, REGFlow refuse le re-upload et propose de créer un nouveau run.

## 24. Annulation d'un run en cours

Un run en T0, T1 ou T2 peut être annulé par son créateur via l'action « Annuler le run ». Effet :

- Transition FSM vers `cancelled` (Document 8).
- Ligne `audit_log` avec raison d'annulation (optionnelle).
- Les XML uploadés restent en `xml_uploads` pour référence mais sont marqués orphelins.
- Un run `cancelled` ne peut pas être redémarré ; l'utilisateur doit créer un nouveau run.

**Pas d'annulation en T3 signé.** La seule issue sur un run signé est la révocation (§18).

## 25. Multi-utilisateurs concurrents sur un même tenant

Un tenant héberge typiquement plusieurs Compliance Officers qui peuvent travailler simultanément. Règles :

- **Un run par utilisateur à la fois** — chaque utilisateur peut avoir un seul run `active` à un instant donné ; il doit le terminer ou l'annuler avant d'en créer un autre.
- **Conversations T2 isolées** — les conversations sont attachées à `created_by_user_id`. Un utilisateur ne voit pas les conversations T2 des autres (RLS, Document 3 §21).
- **Library partagée** — les modifications de règles / référentiels / prompts sont visibles tenant-wide instantanément après approbation 4-yeux (pas d'isolement par utilisateur).
- **Filings partagé** — tous les utilisateurs d'un tenant voient l'historique des runs de leur tenant (selon rôles), pas seulement les leurs.

**Concurrence sur l'édition de règles.** Si deux utilisateurs proposent simultanément une modification sur la même règle, la première approuvée crée la nouvelle version et invalide la seconde proposition avec un message de conflit à re-soumettre. TODO(@wbarouni) : UX précise du conflit à affiner en Phase 5.

---

**Document suivant :** `05-AGENTS-ET-PROMPTS-BANK.md` — source of truth des prompts en base, gouvernance 4-yeux des prompts, cycle de vie, mapping des 14 agents vers leurs `agent_key` dans `prompt_bank`, règles de rédaction des prompts.
