# REGFlow Golden Normalizer

Normalise les XML BCT fournis par le Compliance Officer en une arborescence canonique `tests/fixtures/` prête pour le golden baseline REGFlow.

## Prérequis

- Python 3.12 ou supérieur
- `uv` (gestionnaire de paquets Python Astral)

## Installation

Aucune dépendance externe n'est requise en production. Le script utilise uniquement la bibliothèque standard Python.

```bash
cd tools/golden-normalizer
uv sync  # Installe les dépendances de développement si besoin
```

## Usage

### Exécution nominale

```bash
uv run python normalize.py \
  --source-dir /path/to/uploaded/xmls \
  --target-dir ../../tests/fixtures \
  --tenant-slug qnb-tunisia \
  --validation-author "Wissem Barouni" \
  --report-file ./reports/normalization-2026-04-22.json
```

### Dry-run

Pour planifier sans copier les fichiers :

```bash
uv run python normalize.py \
  --source-dir /path/to/uploaded/xmls \
  --target-dir ../../tests/fixtures \
  --tenant-slug qnb-tunisia \
  --validation-author "Wissem Barouni" \
  --dry-run
```

## Ce que fait le script

1. **Scan récursif** du répertoire source à la recherche de fichiers `.xml` et `.XML`.
2. **Détection automatique de la nomenclature** : moderne (`<Entete>`), ancienne (`<ENTETE>`), ou spécialisée (`<TauxCrediteurs>`).
3. **Extraction des métadonnées** : `CodeBanque`, `DateAnnexe`, `CodeAnnexe`, toutes nomenclatures confondues.
4. **Normalisation des dates** : conversion `DD/MM/YYYY` et `YYYYMMDD` vers `YYYY-MM-DD`.
5. **Classification par statut** : `filled`, `structurally-valid-empty`, `structural-reference`, `anomaly`.
6. **Classification par batch** : dates principales (2024-12-31, 2026-02-28, 2026-03-31, 2024-09-30) dans `golden/qnb-tunisia/<date>/`, autres dans `golden/qnb-tunisia/historical/<date>/`.
7. **Renommage canonique** : `<code_annexe>-<YYYY-MM-DD>.xml`.
8. **Copie vers la structure cible** avec création des dossiers `filled/` et `structurally-valid-empty/`.
9. **Génération des `expected_verdicts.json`** pré-remplis par batch avec métadonnées.
10. **Détection des collisions** : erreur bloquante si deux XML différents visent la même cible.
11. **Calcul des dépendances inter-annexes** via la matrice CC-tech §9.5 + circulaires BCT.
12. **Checksum SHA-256** par fichier pour traçabilité.
13. **Rapport JSON** exhaustif de la normalisation.

## Structure cible produite

```
tests/fixtures/
├── golden/
│   └── qnb-tunisia/
│       ├── 2024-12-31/
│       │   ├── filled/                       # XML avec données
│       │   ├── structurally-valid-empty/     # XML vides mais structurellement OK
│       │   └── expected_verdicts.json
│       ├── 2026-02-28/
│       ├── 2026-03-31/
│       ├── 2024-09-30/
│       └── historical/
│           ├── 2021-12-31/
│           ├── 2022-12-31/
│           ├── 2025-12-01/
│           └── 2025-12-31/
└── structural-references/                    # XML sans date (ex: 781)
```

## Matrice de dépendances intégrée

Le script embarque la matrice officielle CC-tech §9.5 et des circulaires 2018-06 / 2018-10 pour les 52 annexes RDG. Il détecte automatiquement, pour chaque batch, les annexes compagnes manquantes et les liste dans `companion_annexes_missing_in_batch` du JSON généré.

## Tests rapides

```bash
# Exécution sur fixtures locales
uv run python normalize.py \
  --source-dir ../tests/fixtures-source \
  --target-dir /tmp/fixtures-test \
  --tenant-slug qnb-tunisia \
  --validation-author "Test User" \
  --dry-run
```

## Limites connues

- L'inférence du type d'arrêté (`monthly`, `quarterly`, `annual`) est basée sur le jour du mois. Les arrêtés non calendaires (milieu de mois, dates ad hoc) sont classés `ad_hoc`.
- Les libellés métier des rubriques ne sont pas extraits (uniquement les codes techniques). L'enrichissement sémantique est fait dans un second temps par expert réglementaire.
- Les XML malformés sont signalés en anomalie mais non corrigés automatiquement.

## Maintenance

Le script est testable sans dépendance externe. Les règles de dépendance inter-annexes sont dans `DEPENDENCIES` au début du fichier `normalize.py` et doivent être synchronisées avec la table `referentials_annexe_dependencies` du Document 6 lors des évolutions.
