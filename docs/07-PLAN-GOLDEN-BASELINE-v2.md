# REGFlow — Plateforme de Conformité BCT par Intelligence Artificielle

## Document 7 — Plan opérationnel Golden Baseline (v2)

**Version :** 2.0
**Date :** avril 2026
**Périmètre :** construction du golden baseline fonctionnel depuis les 58 XML QNB Tunisia, plan de normalisation, expected_verdicts.json, analyse des dépendances inter-annexes, références structurelles
**Auteur :** Équipe REGFlow
**Statut :** référence canonique pour Claude Code
**Supersedes :** version 1.0 (obsolète, pré-ajout des 5 XML manquants)

---

## Changements vs v1

La version 1.0 décrivait un batch 2024-12-31 incomplet avec 12 annexes en dépendance manquante (absence de RCM00 et RCM01). Après ajout des 5 XML manquants (`12_2024_RCM00.xml`, `12_2024_RCM01.xml`, `620-0014247W-12-2024.xml`, `630-0014247W-12-2024.xml`, `640-0014247W-12-2024.xml`), le batch 2024-12-31 est désormais **complet avec toutes les dépendances inter-annexes satisfaites**. La présente version 2.0 reflète cette nouvelle réalité et devient la référence canonique.

---

## Sommaire

**Partie I — Matière première disponible**

1. Inventaire final des 58 XML
2. Classification par batch et par complétude
3. Zones de données détectées par nomenclature

**Partie II — Structure cible des fixtures**

4. Arborescence finale
5. Règles de renommage canoniques
6. Politique de confidentialité et accès

**Partie III — Vérité terrain et expected_verdicts.json**

7. Schéma canonique du fichier
8. Template par batch
9. Champs à renseigner par le Compliance Officer

**Partie IV — Matrice de dépendances inter-annexes**

10. Sources canoniques (CC-tech §9.5, circulaires)
11. Matrice complète
12. Analyse par batch avec dépendances satisfaites ou non

**Partie V — Livrables exécutifs**

13. Script de normalisation
14. Script de seeding des référentiels
15. Test golden refactorisé
16. Traitement du dual-parsing

---

# Partie I — Matière première disponible

## 1. Inventaire final des 58 XML

Après analyse exhaustive incluant toutes les nomenclatures (moderne `<Entete>`, ancienne `<ENTETE>`, spécialisée `<TauxCrediteurs>` pour 781, `<RECAP_POS>` pour 810), le corpus final se compose de **58 fichiers XML** provenant de QNB Tunisia (CodeBanque 23).

**51 fichiers remplis avec données exploitables.**
**7 fichiers structurellement vides** correspondant aux annexes 133, 136, 137, 140, 141, 142, 830 à la date 31/12/2024 (annexes non applicables à QNB Tunisia, soumises vides pour respecter le formalisme BCT).

La distinction entre "rempli" et "vide" est faite par comptage exhaustif de toutes les feuilles XML portant une valeur non vide, toutes nomenclatures confondues.

## 2. Classification par batch et par complétude

Le corpus se répartit en neuf batches distincts identifiés par la date d'arrêté comptable déclarée.

| Batch | Date | Fichiers | Remplis | Vides | Volume (valeurs) | Dépendances | Statut |
|---|---|---|---|---|---|---|---|
| **Principal annuel** | **2024-12-31** | **45** | **38** | **7** | **~9 680** | **Satisfaites** | **Golden primaire** |
| Mensuel | 2026-02-28 | 5 | 5 | 0 | 2 723 | Satisfaites | Golden secondaire |
| LCR | 2026-03-31 | 1 | 1 | 0 | 148 | Manquantes (00, 01, 51) | Golden LCR isolé |
| T3 2024 | 2024-09-30 | 1 | 1 | 0 | 77 | Autonome | Golden T3 unitaire |
| Mensuel historique | 2025-12-01 | 1 | 1 | 0 | 2 466 | Autonome | Historique nomenclature ancienne |
| Relations détaillées | 2025-12-31 | 2 | 2 | 0 | 188 | Autonomes | Historique 2025 |
| Historique 2022 | 2022-12-31 | 1 | 1 | 0 | 35 | Autonome | Historique unitaire |
| Historique 2021 | 2021-12-31 | 1 | 1 | 0 | 28 577 | Manquantes (00, 01) | Historique gros volume |
| Sans date | — | 1 | 1 | 0 | 36 | N/A | Référence structurelle 781 |

**Le batch 2024-12-31 est désormais le cœur du golden baseline.** Il contient 45 annexes (38 remplies + 7 structurellement vides), toutes les dépendances inter-annexes sont satisfaites grâce à la présence de RCM00, RCM01, RSM620, RSM630 et RSM640 annuels. Aucune annexe ne produira de SKIPPED_MISSING_ANNEXE sur ses règles inter-annexes.

## 3. Zones de données détectées par nomenclature

Trois nomenclatures XML coexistent dans le corpus.

**Nomenclature moderne** avec `<Entete>` et `<Annexe id="X">` contenant `<Rubrique>` et `<Colonne>`. Standard BCT actuel. **56 fichiers** suivent ce standard.

**Nomenclature ancienne** avec `<ENTETE>` majuscules, `<DATE_DECLAR>`, `<BQ>`, `<CODE_ANNEXE>`, et balises métier spécialisées pour la position de change (`<RECAP_POS>`, `<MAV_VEIL>`, `<MENG_VEIL>`, `<ACHAT>`, `<VENTE>`, `<COURS>`, `<CONTREVAL>`, `<FPN_PR>`). **1 fichier** : `810-0014247W-01-12-2025.xml` pour l'annexe RNLPQ810 Position de change au 01/12/2025.

**Nomenclature spécialisée** avec des balises métier propres au contenu déclaratif. **1 fichier** : `781_31-12-2024.xml` utilise `<TauxCrediteurs>`, `<TauxDebiteurs>`, `<Produit>`, `<Operation>`, `<CodeNatureCompte>`, `<CodeSegmentClient>` pour les taux créditeurs et débiteurs.

Les annexes à détail par relation (100, 110, 130 à 142, 210, 220, 230, 250, 310) incluent les balises `<Societe>`, `<Membre>`, ou `<Instrument>` selon le type 2 à 10 de structure XML défini au CC-tech partie II. Elles restent dans la nomenclature moderne mais avec des sous-structures spécifiques.

Le parser REGFlow doit supporter les trois nomenclatures en mode dual-parsing avec détection automatique du format au moment de l'ingestion.

---

# Partie II — Structure cible des fixtures

## 4. Arborescence finale

```
tests/fixtures/
├── golden/
│   └── qnb-tunisia/
│       ├── 2024-12-31/
│       │   ├── filled/
│       │   │   ├── 00-2024-12-31.xml
│       │   │   ├── 01-2024-12-31.xml
│       │   │   ├── 51-2024-12-31.xml
│       │   │   ├── 130-2024-12-31.xml
│       │   │   ├── 131-2024-12-31.xml
│       │   │   ├── 132-2024-12-31.xml
│       │   │   ├── 134-2024-12-31.xml
│       │   │   ├── 135-2024-12-31.xml
│       │   │   ├── 138-2024-12-31.xml
│       │   │   ├── 139-2024-12-31.xml
│       │   │   ├── 210-2024-12-31.xml
│       │   │   ├── 220-2024-12-31.xml
│       │   │   ├── 230-2024-12-31.xml
│       │   │   ├── 250-2024-12-31.xml
│       │   │   ├── 310-2024-12-31.xml
│       │   │   ├── 360-2024-12-31.xml
│       │   │   ├── 481-2024-12-31.xml
│       │   │   ├── 482-2024-12-31.xml
│       │   │   ├── 485-2024-12-31.xml
│       │   │   ├── 486-2024-12-31.xml
│       │   │   ├── 510-2024-12-31.xml
│       │   │   ├── 520-2024-12-31.xml
│       │   │   ├── 530-2024-12-31.xml
│       │   │   ├── 540-2024-12-31.xml
│       │   │   ├── 550-2024-12-31.xml
│       │   │   ├── 560-2024-12-31.xml
│       │   │   ├── 620-2024-12-31.xml
│       │   │   ├── 630-2024-12-31.xml
│       │   │   ├── 640-2024-12-31.xml
│       │   │   ├── 720-2024-12-31.xml
│       │   │   ├── 730-2024-12-31.xml
│       │   │   ├── 760-2024-12-31.xml
│       │   │   ├── 820-2024-12-31.xml
│       │   │   ├── 840-2024-12-31.xml
│       │   │   ├── 850-2024-12-31.xml
│       │   │   ├── 860-2024-12-31.xml
│       │   │   ├── 870-2024-12-31.xml
│       │   │   └── 910-2024-12-31.xml
│       │   ├── structurally-valid-empty/
│       │   │   ├── 133-2024-12-31.xml
│       │   │   ├── 136-2024-12-31.xml
│       │   │   ├── 137-2024-12-31.xml
│       │   │   ├── 140-2024-12-31.xml
│       │   │   ├── 141-2024-12-31.xml
│       │   │   ├── 142-2024-12-31.xml
│       │   │   └── 830-2024-12-31.xml
│       │   └── expected_verdicts.json
│       ├── 2026-02-28/
│       │   ├── filled/
│       │   │   ├── 00-2026-02-28.xml
│       │   │   ├── 01-2026-02-28.xml
│       │   │   ├── 620-2026-02-28.xml
│       │   │   ├── 630-2026-02-28.xml
│       │   │   └── 640-2026-02-28.xml
│       │   └── expected_verdicts.json
│       ├── 2026-03-31/
│       │   ├── filled/
│       │   │   └── 47-2026-03-31.xml
│       │   └── expected_verdicts.json
│       ├── 2024-09-30/
│       │   ├── filled/
│       │   │   └── 139-2024-09-30.xml
│       │   └── expected_verdicts.json
│       └── historical/
│           ├── 2025-12-31/
│           │   ├── 100-2025-12-31.xml
│           │   ├── 110-2025-12-31.xml
│           │   └── expected_verdicts.json
│           ├── 2025-12-01/
│           │   ├── 810-2025-12-01.xml
│           │   └── expected_verdicts.json
│           ├── 2022-12-31/
│           │   ├── 880-2022-12-31.xml
│           │   └── expected_verdicts.json
│           └── 2021-12-31/
│               ├── 483-2021-12-31.xml
│               └── expected_verdicts.json
└── structural-references/
    ├── 781-taux-crediteurs-debiteurs.xml
    └── README.md
```

## 5. Règles de renommage canoniques

Chaque XML est renommé selon le pattern strict `<code_annexe>-<YYYY>-<MM>-<DD>.xml`.

- La date est celle du contenu XML via `<DateAnnexe>` ou `<DATE_DECLAR>`, jamais le nom de fichier source.
- Format de date : YYYY-MM-DD avec tirets, minuscules. Conversion automatique des dates au format `DD/MM/YYYY` des nomenclatures anciennes.
- Format de code annexe : conservé tel quel dans la balise, sans zéro-padding. L'annexe `00` reste `00`, l'annexe `51` reste `51`.
- Extension toujours en minuscules `.xml`.
- Collision : si même date + même annexe + deux contenus différents, le normaliseur bloque avec erreur et demande arbitrage humain.

## 6. Politique de confidentialité et accès

Les fixtures golden contiennent des données réelles QNB Tunisia. **Jamais** dans un dépôt public, **jamais** d'export.

**Règles d'accès.** Dépôt Git privé avec accès restreint. Fichiers en clair dans le dépôt (choix validé). Liste des personnes habilitées tenue à jour par le CEO ALGORIA Factory. Copies locales sur machines avec chiffrement au repos (FileVault, LUKS, BitLocker). Aucune fixture uploadée sur service tiers (pas de Copilot cloud, pas de Claude.ai en développement).

**Règles de gestion.** Fixtures versionnées comme le code. Modification via pull request avec revue. Script `tools/verify-golden-integrity.py` en CI pour checksum SHA-256 par fichier golden.

**Règles de disposition.** Si QNB retire consentement : suppression via `git rm`, réécriture historique `git filter-branch`, nouveau dépôt. Copies locales supprimées sur instruction écrite.

---

# Partie III — Vérité terrain et expected_verdicts.json

## 7. Schéma canonique du fichier

Le fichier `expected_verdicts.json` est présent dans chaque batch. Il contient la vérité terrain validée par vous, Wissem Barouni, CEO ALGORIA Factory et Head of Financial & Regulatory Reporting QNB Tunisia.

**Schéma structuré.**

```json
{
  "$schema": "https://regflow.algoria.factory/schemas/expected_verdicts.v1.json",

  "batch_metadata": {
    "batch_id": "string",
    "tenant_slug": "qnb-tunisia",
    "bank_code_bct": "23",
    "arrete_date": "YYYY-MM-DD",
    "arrete_type": "monthly | quarterly | semi_annual | annual | ad_hoc",
    "files_count_filled": "integer",
    "files_count_structurally_valid_empty": "integer",
    "total_annexes_covered": "integer"
  },

  "bct_submission": {
    "has_been_submitted": "boolean",
    "submission_date": "YYYY-MM-DD or null",
    "bct_response_status": "accepted | rejected | pending | not_filed",
    "bct_response_file_available": "boolean",
    "bct_response_file_path": "string or null",
    "notes": "string or null"
  },

  "validation_author": {
    "name": "Wissem Barouni",
    "role": "CEO ALGORIA Factory / Head of Financial & Regulatory Reporting QNB Tunisia",
    "validation_date": "YYYY-MM-DD",
    "validation_method": "manual_review_as_compliance_officer | bct_return_file_exact | hybrid",
    "confidence_level": "high | medium | low"
  },

  "expected_totals": {
    "rules_applicable_total": "integer or null (capture on first run)",
    "pass": "integer or null",
    "fail_severe": "integer or null",
    "fail_rounding": "integer or null",
    "skipped_missing_annexe": "integer or null",
    "skipped_missing_rubrique": "integer or null",
    "skipped_missing_colonne": "integer or null",
    "skipped_missing_data": "integer or null",
    "skipped_conditional": "integer or null",
    "skipped_unsupported_op": "integer or null",
    "skipped_literal_text": "integer or null",
    "capture_mode": "boolean"
  },

  "expected_fails": [
    {
      "annexe": "string",
      "num_regle": "integer",
      "severity": "severe | rounding",
      "expected_gap_absolute": "string (Decimal as string)",
      "expected_gap_relative": "string or null",
      "rubrique": "string",
      "colonne": "string or null",
      "business_reason": "string",
      "confirmed_by_bct_return": "boolean",
      "cluster_hint": "string or null"
    }
  ],

  "expected_skips_by_annexe": {
    "<annexe_code>": "skipped_missing_data | skipped_conditional | bct_accepted_empty"
  },

  "companion_annexes_missing_in_batch": [
    {
      "annexe_code": "string",
      "required_by": ["list of annexe codes"],
      "dependency_source": "CC-tech §9.5 | circ. 2018-06 LCR | etc.",
      "consequence": "string",
      "justification_for_absence": "string"
    }
  ],

  "annexes_in_scope": ["list of annexe codes in this batch"],
  "annexes_out_of_scope": ["list of annexe codes known out of scope for this tenant"]
}
```

## 8. Template par batch

**Template 2024-12-31 (golden primaire complet) :**

```json
{
  "batch_metadata": {
    "batch_id": "qnb-tunisia-2024-12-31",
    "tenant_slug": "qnb-tunisia",
    "bank_code_bct": "23",
    "arrete_date": "2024-12-31",
    "arrete_type": "annual",
    "files_count_filled": 38,
    "files_count_structurally_valid_empty": 7,
    "total_annexes_covered": 45
  },

  "bct_submission": {
    "has_been_submitted": true,
    "submission_date": null,
    "bct_response_status": "accepted",
    "bct_response_file_available": false,
    "bct_response_file_path": null,
    "notes": "Soumission annuelle QNB Tunisia 2024, acceptée par BCT, batch complet avec RCM00, RCM01, et toutes annexes SM 620/630/640"
  },

  "validation_author": {
    "name": "Wissem Barouni",
    "role": "CEO ALGORIA Factory / Head of Financial & Regulatory Reporting QNB Tunisia",
    "validation_date": "2026-04-22",
    "validation_method": "manual_review_as_compliance_officer",
    "confidence_level": "high"
  },

  "expected_totals": {
    "rules_applicable_total": null,
    "pass": null,
    "fail_severe": 0,
    "fail_rounding": null,
    "skipped_missing_annexe": 0,
    "skipped_missing_rubrique": null,
    "skipped_missing_colonne": null,
    "skipped_missing_data": null,
    "skipped_conditional": null,
    "skipped_unsupported_op": null,
    "skipped_literal_text": null,
    "capture_mode": true
  },

  "expected_fails": [],

  "expected_skips_by_annexe": {
    "133": "bct_accepted_empty",
    "136": "bct_accepted_empty",
    "137": "bct_accepted_empty",
    "140": "bct_accepted_empty",
    "141": "bct_accepted_empty",
    "142": "bct_accepted_empty",
    "830": "bct_accepted_empty"
  },

  "companion_annexes_missing_in_batch": [],

  "annexes_in_scope": ["00", "01", "51", "130", "131", "132", "133", "134", "135", "136", "137",
                      "138", "139", "140", "141", "142", "210", "220", "230", "250", "310", "360",
                      "481", "482", "485", "486", "510", "520", "530", "540", "550", "560",
                      "620", "630", "640", "720", "730", "760", "820", "830", "840", "850",
                      "860", "870", "910"],
  "annexes_out_of_scope": ["02", "47", "480", "483", "484", "740", "750"]
}
```

**Template 2026-02-28 (golden secondaire mensuel) :**

```json
{
  "batch_metadata": {
    "batch_id": "qnb-tunisia-2026-02-28",
    "tenant_slug": "qnb-tunisia",
    "bank_code_bct": "23",
    "arrete_date": "2026-02-28",
    "arrete_type": "monthly",
    "files_count_filled": 5,
    "files_count_structurally_valid_empty": 0,
    "total_annexes_covered": 5
  },

  "bct_submission": {
    "has_been_submitted": true,
    "submission_date": null,
    "bct_response_status": "accepted",
    "bct_response_file_available": false,
    "bct_response_file_path": null,
    "notes": "Arrêté mensuel février 2026 accepté, batch complet RCM00 + RCM01 + SM 620/630/640"
  },

  "validation_author": {
    "name": "Wissem Barouni",
    "role": "CEO ALGORIA Factory / Head of Financial & Regulatory Reporting QNB Tunisia",
    "validation_date": "2026-04-22",
    "validation_method": "manual_review_as_compliance_officer",
    "confidence_level": "high"
  },

  "expected_totals": {
    "rules_applicable_total": null,
    "pass": null,
    "fail_severe": 0,
    "fail_rounding": null,
    "skipped_missing_annexe": 0,
    "skipped_missing_rubrique": null,
    "skipped_missing_colonne": null,
    "skipped_missing_data": null,
    "skipped_conditional": null,
    "skipped_unsupported_op": null,
    "skipped_literal_text": null,
    "capture_mode": true
  },

  "expected_fails": [],
  "expected_skips_by_annexe": {},
  "companion_annexes_missing_in_batch": [],
  "annexes_in_scope": ["00", "01", "620", "630", "640"],
  "annexes_out_of_scope": []
}
```

## 9. Champs à renseigner par le Compliance Officer

**Immédiatement par vous.**
- `bct_submission.submission_date` : date de soumission SED si connue.
- `validation_author.confidence_level` : auto-évaluation.
- `expected_fails` : FAIL légitimes connus.

**Capturés au premier run.**
- Tous les champs de `expected_totals` de `null` vers entiers observés.
- `capture_mode` bascule à `false` après validation humaine.

**Après validation.**
- Tout FAIL non listé dans `expected_fails` au premier run → arbitrage : faux positif moteur, ou ajout à `expected_fails`.

---

# Partie IV — Matrice de dépendances inter-annexes

## 10. Sources canoniques

**CC-tech partie II section 9.5** — Tableau officiel BCT. Validation RSM620/630/640 et RPLA510, RPTA910 subordonnées à RCM00 même date.

**Circulaire BCT 2018-06** — Solvabilité et fonds propres. Cohérence bilan (RCM00, RCM01) avec annexes 48x.

**Circulaire BCT 2018-10** — Ratio crédits/dépôts. Cohérence RCT51 avec RCM00.

**Circulaire BCT 2018-06 LCR** — Cohérence RPLM47 avec bilan et annexes liquidité 51x.

## 11. Matrice complète

| Annexe | Dépend de | Source | Type |
|---|---|---|---|
| 00 (RCM00 Bilan) | — | Racine | autonome |
| 01 (RCM01 Comptes de résultats) | 00 | CC-tech §9.5 | structural |
| 02 (RCM02 Hors bilan) | 00, 01 | CC-tech §9.5 | structural |
| 47 (RPLM47 LCR) | 00, 01, 51 | circ. 2018-06 LCR | structural |
| 51 (RCT51 Crédits/Dépôts) | 00 | CC-tech §9.5 + circ. 2018-10 | structural |
| 100, 110 (Filiales, Participations) | — | Autonomes sentinelles D | autonome |
| 130-142 (RNLPT relations détaillées) | — | Autonomes sentinelles D1-D6 | autonome |
| 210 (Gouvernance Administrateurs) | — | Autonome sentinelle D1 | autonome |
| 220, 230, 250 (Gouvernance) | — | Autonomes | autonome |
| 310 (Structure du capital) | — | Autonome sentinelle D | autonome |
| 360 | — | Autonome | autonome |
| 480-486 (Solvabilité) | 00, 01 | circ. 2018-06 + CC-tech §9.5 | structural |
| 510 (RPLA510 Liquidité) | 00 | CC-tech §9.5 | structural |
| 520, 530 (Liquidité compl.) | 00, 51 | CC-tech §9.5 | structural |
| 540, 550, 560 (Liquidité détails) | 00 | CC-tech §9.5 | structural |
| 620, 630, 640 (Situation Mensuelle) | 00 | CC-tech §9.5 | structural |
| 720-760 (Sectoriel) | — | Autonomes | autonome |
| 781 (Taux créditeurs/débiteurs) | — | Autonome taux | autonome |
| 810 (Position de change) | — | Autonome | autonome |
| 820-880 (NLPT) | — | Autonomes | autonome |
| 910 (RPTA910 Crédits/Dépôts) | 00 | CC-tech §9.5 | structural |

## 12. Analyse par batch

### Batch 2024-12-31 — toutes les dépendances sont satisfaites

Grâce aux 5 XML ajoutés (RCM00, RCM01, RSM620, RSM630, RSM640 arrêtés annuels 2024), ce batch couvre 45 annexes sans aucune dépendance structurelle manquante. Aucun SKIPPED_MISSING_ANNEXE attendu sur les règles inter-annexes. C'est le **golden primaire** du produit.

### Batch 2026-02-28 — toutes les dépendances sont satisfaites

RCM00, RCM01, RSM620/630/640 présents. Golden secondaire pleinement exploitable pour tester les règles inter-annexes mensuelles.

### Batch 2026-03-31 — LCR isolé avec 3 dépendances manquantes

Le fichier 47 dépend de RCM00, RCM01 et RCT51. Aucun présent. Règles inter-annexes du LCR en SKIPPED_MISSING_ANNEXE. Seules les règles intra-47 évaluables.

### Batch 2024-09-30 — autonome

Annexe 139 RNLPT relations détaillées autonome avec sentinelles D. Toutes règles évaluables.

### Batches historiques

- **2021-12-31 avec 483** : dépend 00, 01. SKIPPED inévitable.
- **2022-12-31 avec 880** : autonome. Toutes règles évaluables.
- **2025-12-31 avec 100, 110** : autonomes. Toutes règles évaluables.
- **2025-12-01 avec 810** : autonome nomenclature ancienne. Toutes règles évaluables.

### Batch sans date avec 781

Autonome en principe mais sans DateAnnexe donc impossible de sélectionner la version temporelle des règles. Non évaluable en l'état. En attente d'un 781 daté réel.

---

# Partie V — Livrables exécutifs

## 13. Script de normalisation

**Livrable 1 — `tools/golden-normalizer/normalize.py`**

Script Python 3.12 packagé avec `uv` et `pyproject.toml` autonome. Prend en entrée le répertoire des XML sources et produit la structure cible `tests/fixtures/` complète.

**Fonctionnalités.**

- Scan récursif du répertoire source.
- Détection nomenclature moderne / ancienne / spécialisée.
- Extraction métadonnées toutes nomenclatures (CodeBanque, DateAnnexe, CodeAnnexe).
- Normalisation date `DD/MM/YYYY` vers `YYYY-MM-DD`.
- Classification par batch et par `filled` / `structurally-valid-empty` / `structural-references`.
- Renommage canonique `<code>-<date>.xml`.
- Création arborescence cible avec copies.
- Génération `expected_verdicts.json` squelettes pré-remplis.
- Détection anomalies (doublons, collisions, métadonnées manquantes) bloquantes.
- Checksum SHA-256 source et cible, rapport JSON de normalisation.

**Invocation.**

```bash
uv run python tools/golden-normalizer/normalize.py \
  --source-dir /path/to/uploaded/xmls \
  --target-dir ./tests/fixtures \
  --tenant-slug qnb-tunisia \
  --validation-author "Wissem Barouni" \
  --report-file ./tools/golden-normalizer/reports/normalization-2026-04-22.json
```

Livré simultanément avec le présent document.

## 14. Script de seeding des référentiels

**Livrable 2 — `tools/seed-referentials-from-xml.py`**

Script Python qui parse les 58 XML pour extraire exhaustivement rubriques et colonnes par annexe, génère migrations SQL pour `referentials_rubriques`, `referentials_colonnes`, `referentials_xml_structures`.

**Gain estimé.** Environ 51 annexes × 15 rubriques × 10 colonnes = 765 lignes rubriques et 510 lignes colonnes générées automatiquement. Plusieurs jours de saisie manuelle évités.

**Limite.** Libellés métier et descriptions non disponibles dans XML, à enrichir manuellement dans un second temps par expert réglementaire.

## 15. Test golden refactorisé

**Livrable 3 — `packages/evaluator/test/golden.test.ts`**

Test Jest qui remplace l'ancien 5 XML / 937 PASS / 2 FAIL / 3672 SKIP.

**Nouveau comportement.** Itération sur tous les batches `tests/fixtures/golden/<tenant>/`. Chargement `filled/` et `structurally-valid-empty/`. Exécution moteur. Comparaison avec `expected_verdicts.json`.

**Modes.**
- **Capture** : si `capture_mode: true`, observe et figera les valeurs pour commit manuel.
- **Assert** : si `capture_mode: false`, comparaison stricte et échec sur divergence.

**Cas de test par batch.** Total pass+fail+skipped = total règles, chaque FAIL attendu présent avec bonne rubrique/colonne/gap, chaque annexe manquante produit bon nombre de SKIPPED_MISSING_ANNEXE, aucun FAIL inattendu.

**Timeout.** 120s par batch. Le batch 2024-12-31 avec 38 fichiers prendra le plus de temps.

## 16. Traitement du dual-parsing

**Livrable 4 — `packages/bct-xml-parser/src/dual-parser.ts`**

Parser étendu pour gérer les trois nomenclatures du corpus.

**Détection.** Balise `<Entete>` → moderne. Balise `<ENTETE>` → ancienne. Ni l'un ni l'autre → vérifier balises spécialisées `<TauxCrediteurs>`, `<Produit>` → spécialisée 781.

**Extraction par nomenclature.**

| Nomenclature | CodeBanque | DateAnnexe | CodeAnnexe |
|---|---|---|---|
| Moderne | `<CodeBanque>` | `<DateAnnexe>` YYYYMMDD | `<CodeAnnexe>` |
| Ancienne (810) | `<BQ>` | `<DATE_DECLAR>` DD/MM/YYYY | `<CODE_ANNEXE>` |
| Spécialisée (781) | `<CodeBanque>` | `<DateAnnexe>` peut être vide | `<CodeAnnexe>` |

**Interface unifiée.** Structure `CellMatrix : Map<annexeCode, Map<rubrique, Map<colonne, Decimal>>>`. Pour les nomenclatures non tabulaires (810, 781), mapping via `referentials_xml_structures` vers une structure virtuelle colonne/rubrique.

**Tests unitaires.** Un test par nomenclature avec échantillon du corpus : `00-2026-02-28.xml`, `810-2025-12-01.xml`, `781-taux-crediteurs-debiteurs.xml`.

---

# Feuille de route d'exécution

**Étape 1** — Relecture du présent document par vous, corrections ponctuelles.

**Étape 2** — Livraison immédiate du script de normalisation (accompagne ce document).

**Étape 3** — Exécution du script sur les 58 XML localement pour produire la structure cible `tests/fixtures/` testable.

**Étape 4** — Import dans le nouveau monorepo REGFlow en Phase 0 du plan brute. Commit unique `feat: golden baseline v1 qnb-tunisia (58 xml, 9 batches)` taggé `golden-baseline-v1`.

**Étape 5** — Premier run moteur en mode capture après Phase 2 du plan brute.

**Étape 6** — Bascule mode assert après validation humaine.

---

*Fin du Document 7 v2 — Plan opérationnel Golden Baseline révisé*
*Prochain document à produire : Document 8 — State machines du workflow utilisateur (item 2)*
