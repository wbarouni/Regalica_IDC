# REGFlow — Seed référentiels depuis XML golden

Génère automatiquement les migrations SQL de seeding des tables `referentials_rubriques`, `referentials_colonnes`, et `referentials_xml_structures` du Document 6 à partir des XML du corpus golden.

## Gain de productivité

Ce script évite la saisie manuelle de plusieurs milliers de lignes de référentiels. Sur le corpus QNB Tunisia complet :

- **1 282 rubriques** extraites automatiquement avec hiérarchie parent/enfant inférée.
- **308 combinaisons (annexe, colonne)** détectées.
- **51 annexes caractérisées** avec nomenclature (moderne/legacy/specialized), type de structure XML (1-10), présence des sentinelles D.

Ces trois migrations représentent environ 190 KB de SQL, qui auraient nécessité plusieurs jours de saisie manuelle et risqué des erreurs.

## Prérequis

- Python 3.12 ou supérieur
- `uv`
- Le dossier `tests/fixtures/golden/` déjà produit par `tools/golden-normalizer/`

## Installation

Aucune dépendance externe. Le script utilise uniquement la bibliothèque standard Python.

```bash
cd tools/seed-referentials-from-xml
uv sync  # Installe les dépendances de dev si besoin
```

## Usage

```bash
uv run python seed.py \
  --fixtures-dir ../../tests/fixtures/golden \
  --output-dir ../../apps/api/src/db/migrations \
  --start-migration-number 9 \
  --author "ALGORIA Factory"
```

### Dry-run

```bash
uv run python seed.py \
  --fixtures-dir ../../tests/fixtures/golden \
  --output-dir /tmp \
  --dry-run
```

## Sortie

Trois fichiers SQL produits :

- `009_seed_referentials_rubriques.sql` — toutes les rubriques avec hiérarchie.
- `010_seed_referentials_colonnes.sql` — toutes les colonnes par annexe.
- `011_seed_referentials_xml_structures.sql` — caractérisation structurelle par annexe.

Chaque fichier est idempotent (DELETE des versions précédentes avant INSERT) et wrappé dans une transaction BEGIN/COMMIT.

## Classification des types de structure XML (1 à 10)

Basée sur le CC-tech partie II. Le script détecte automatiquement :

| Type | Description                       | Balises détectées             |
| ---- | --------------------------------- | ----------------------------- |
| 1    | Tabular moderne standard          | Rubrique + Colonne classiques |
| 2    | Tabular avec relations détaillées | `<Societe>` présent           |
| 3    | Tabular avec ventilation devise   | `<Devise>` ou `<CODE_DEV>`    |
| 4    | Tabular avec instruments          | `<Instrument>`                |
| 5    | Tabular gouvernance               | `<Membre>`                    |
| 6    | Tabular relations multi-niveaux   | Société + devise              |
| 7    | Tabular avec sentinelles D1-D6    | Rubriques `13006*`            |
| 8    | Legacy position de change         | `<RECAP_POS>` ou `<DET_PSC>`  |
| 9    | Specialized taux                  | `<TauxCrediteurs>`            |
| 10   | Autre / hybride                   | -                             |

## Inférence de la hiérarchie rubrique

Les codes BCT suivent une convention de 14 caractères où les paires de zéros finales marquent le niveau d'agrégation :

- `PA010000000000` → niveau 1 (racine)
- `PA010100000000` → niveau 2 (enfant)
- `PA010101000000` → niveau 3 (petit-enfant)

Le script infère pour chaque rubrique son `hierarchy_level` et son `parent_code_rubrique` en analysant la position de la première paire non-zéro après la racine.

## Limites et compléments manuels

Les colonnes suivantes des référentiels sont **laissées à NULL** et doivent être enrichies manuellement par un expert réglementaire via la procédure 4-yeux (voir Document 8 §15) :

- `libelle_fr` et `libelle_ar` — libellés métier des rubriques et colonnes.
- `description` — descriptions longues.

Les libellés ne sont pas disponibles dans les XML de reporting (qui ne contiennent que les codes techniques). Ils doivent être saisis depuis les maquettes textuelles BCT ou les circulaires qui définissent chaque annexe.

## Maintenance

Ce script est exécuté **une seule fois** pour générer le seed initial. Après le seed initial, toute évolution des référentiels passe par la procédure 4-yeux applicative, jamais par réexécution de ce script.

Exception : si la BCT publie une nouvelle annexe ou modifie drastiquement une annexe existante, et si de nouveaux XML arrivent dans le corpus golden qui contiennent ces modifications, le script peut être réexécuté pour générer un seed complémentaire (migrations numérotées à la suite).
