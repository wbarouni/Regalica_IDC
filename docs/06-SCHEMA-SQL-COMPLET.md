# REGFlow — Plateforme de Conformité BCT par Intelligence Artificielle

## Document 6 sur 6 — Schéma SQL complet et migrations

**Version :** 1.0
**Date :** avril 2026
**Périmètre :** schéma de base de données complet, politiques RLS, triggers d'intégrité, partitions, migrations numérotées
**Auteur :** Équipe REGFlow
**Statut :** référence canonique pour Claude Code

---

## Sommaire

**Partie I — Fondations**

1. Principes de modélisation
2. Extensions PostgreSQL requises
3. Conventions de nommage et de typage

**Partie II — Modèle conceptuel**

4. Les quatre familles de tables
5. Graphe des relations principales
6. Stratégie d'historisation bitemporelle

**Partie III — Tables de vérité métier**

7. Table `rules`
8. Table `prompt_bank`
9. Les quatorze tables `referentials_*`

**Partie IV — Tables transactionnelles**

10. Table `xml_uploads`
11. Table `validation_runs`
12. Table `validation_fail_details`
13. Table `clusters`

**Partie V — Tables de gouvernance**

14. Table `tenants`
15. Tables `users`, `roles`, `user_roles`, `sessions`
16. Table `four_eyes_approvals`
17. Table `audit_log` avec partitionnement

**Partie VI — Tables transverses**

18. Table `feature_flags`
19. Table `notifications`
20. Tables `conversations` et `messages`
21. Tables `rag_documents` et `rag_chunks`

**Partie VII — Politiques de sécurité et triggers**

22. Politiques Row-Level Security par table
23. Triggers d'immutabilité
24. Triggers d'audit automatique

**Partie VIII — Migrations**

25. Organisation des fichiers de migration
26. Séquence canonique des migrations

---

# Partie I — Fondations

## 1. Principes de modélisation

Le schéma SQL de REGFlow obéit à cinq principes de modélisation qui ne sont jamais violés, quelle que soit la table concernée.

**Historisation bitemporelle universelle.** Toute table de vérité métier porte deux colonnes temporelles systémiques : `valid_from` qui indique le début de validité fonctionnelle de la ligne, et `valid_to` qui indique la fin (ou `NULL` si la ligne est active). Cette approche permet de reconstituer à tout moment l'état de la vérité métier à une date passée, en appliquant une clause de sélection temporelle standard : `WHERE valid_from <= :date AND (valid_to IS NULL OR valid_to > :date)`. Les lignes actives ne sont jamais modifiées en place ; toute évolution produit une nouvelle ligne dont la version précédente est clôturée par la mise à jour de son `valid_to` vers la date de bascule.

**Identifiants UUID v7 synthétiques.** Toutes les clés primaires sont des `UUID` générés par la fonction `uuidv7()` qui produit des identifiants ordonnés par timestamp. Ce choix garantit une distribution chronologique naturelle des lignes dans les indexes, une compatibilité native avec les réplications multi-sites, une absence totale de collision lors des exports entre environnements, et une lisibilité métier préservée via des contraintes d'unicité séparées sur les clés naturelles. Les clés naturelles conservent leur rôle fonctionnel (par exemple `(ax_term, num_regle, valid_from)` pour `rules`) mais ne portent jamais la clé primaire physique.

**Multi-tenant dès le départ.** Toutes les tables qui portent des données fonctionnelles ou opérationnelles incluent une colonne `tenant_id UUID NOT NULL` qui référence la table `tenants`. En version 1, REGFlow est déployé en mono-tenant par installation on-premises, mais la colonne est présente et indexée dès le départ, ce qui rend l'extension multi-tenant ultérieure (mutualisation cloud, SaaS) possible sans migration systémique. Les politiques RLS utilisent cette colonne pour isoler les données entre tenants.

**Soft-delete universel.** Toute table métier porte une colonne `deleted_at TIMESTAMPTZ NULL`. La suppression logique consiste à renseigner cette colonne avec la date courante. Les requêtes applicatives filtrent par défaut `WHERE deleted_at IS NULL` via des vues ou via le filtrage backend. La suppression physique (`DELETE`) est réservée aux cas RGPD où l'obligation légale de rétention ne s'applique pas, et fait l'objet d'une procédure séparée documentée.

**Auditabilité native.** Toute modification d'une ligne d'une table sensible (rules, prompt*bank, referentials*\*, users, roles) déclenche un enregistrement automatique dans `audit_log` via un trigger `AFTER INSERT OR UPDATE OR DELETE`. Cet enregistrement contient l'ancienne valeur et la nouvelle valeur au format JSONB, l'identifiant de l'utilisateur responsable de l'opération (via `current_setting('app.current_user_id')`), l'horodatage précis, et l'adresse IP source si disponible. Cette journalisation est elle-même immuable.

## 2. Extensions PostgreSQL requises

REGFlow utilise les extensions PostgreSQL suivantes, activées lors de la migration initiale :

| Extension            | Rôle                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `pgcrypto`           | Génération de UUID v4 de secours, chiffrement des champs sensibles |
| `uuid-ossp`          | Génération de UUID v1/v4, complément à pgcrypto                    |
| `pg_trgm`            | Recherche fuzzy par trigrammes sur les libellés métier             |
| `btree_gin`          | Indexes GIN sur les colonnes JSONB requêtées par champ             |
| `vector` (pgvector)  | Stockage et recherche des embeddings RAG, dimension 768            |
| `pg_stat_statements` | Télémétrie des requêtes pour observabilité                         |

La génération de UUID v7, non native en PostgreSQL 16, est implémentée via une fonction SQL documentée en annexe 26.4 et déployée en migration 001.

## 3. Conventions de nommage et de typage

**Nommage des tables.** Toujours au pluriel, en `snake_case`, préfixe thématique quand applicable (`referentials_*`, `audit_*`). Les tables de jointure suivent le pattern `a_b` dans l'ordre alphabétique (exemple `user_roles`). Les tables historisées ne portent pas de suffixe `_history` parce que l'historisation est bitemporelle dans la table elle-même.

**Nommage des colonnes.** Toujours en `snake_case`, singulier. Les clés étrangères sont nommées `<table_cible>_id`. Les timestamps sont toujours typés `TIMESTAMPTZ` et nommés par leur sémantique (`created_at`, `updated_at`, `valid_from`, `valid_to`, `deleted_at`, `last_login_at`). Les booléens commencent par `is_` ou `has_` (exemple `is_active`, `has_four_eyes_validation`).

**Typage.**

- Identifiants et clés : `UUID`.
- Codes métier courts : `VARCHAR(N)` avec N dimensionné au réel (codes annexe sur 8, codes rubrique sur 14, codes devise sur 3).
- Libellés : `TEXT` sans limite arbitraire.
- Horodatages : `TIMESTAMPTZ`, stockage en UTC, affichage en fuseau local côté applicatif.
- Dates métier : `DATE` pour les arrêtés comptables, `TIMESTAMPTZ` pour les horodatages techniques.
- Montants : `NUMERIC(20, 3)` pour les valeurs TND avec trois décimales, jamais `FLOAT` ni `DOUBLE PRECISION`.
- Structures semi-structurées : `JSONB` avec indexation GIN sur les champs requêtés.
- Vecteurs d'embedding : `vector(768)` de pgvector.
- Textes longs avec recherche : `TEXT` avec index `gin_trgm_ops`.

**Contraintes nominales.** Toutes les contraintes sont nommées explicitement selon le pattern `<table>_<type>_<colonnes>`, par exemple `rules_pk` pour la clé primaire, `rules_uk_natural` pour l'unicité sur la clé naturelle, `rules_fk_tenant_id` pour la foreign key vers `tenants`, `rules_ck_valid_dates` pour le check `valid_to IS NULL OR valid_to > valid_from`.

---

# Partie II — Modèle conceptuel

## 4. Les quatre familles de tables

Le schéma REGFlow s'organise en quatre familles fonctionnelles strictement distinctes, chacune avec ses invariants et ses politiques d'accès.

**Famille A — Tables de vérité métier.** Elles portent la connaissance réglementaire saisie par les Compliance Officers avec assistance IA. Elles sont bitemporalement historisées, versionnées, validées en 4-yeux. Elles sont au centre du principe zéro-hardcoding. Cette famille comprend `rules`, `prompt_bank`, et les quatorze tables `referentials_*`.

**Famille B — Tables transactionnelles.** Elles portent les événements produits par l'usage du produit : uploads de XML, runs de validation, FAIL détaillés, grappes identifiées. Les lignes sont immuables une fois écrites. La rétention est de dix ans conformément à l'invariant produit. Cette famille comprend `xml_uploads`, `validation_runs`, `validation_fail_details`, `clusters`.

**Famille C — Tables de gouvernance.** Elles portent les utilisateurs, leurs rôles, leurs sessions actives, leurs actions soumises à validation 4-yeux, et le journal d'audit global. Cette famille comprend `tenants`, `users`, `roles`, `user_roles`, `sessions`, `four_eyes_approvals`, `audit_log`.

**Famille D — Tables transverses.** Elles portent les fonctionnalités transverses du produit : les feature flags pour le déploiement progressif, les notifications proactives, les conversations Regalica avec leurs messages, la GED vectorielle du RAG documentaire. Cette famille comprend `feature_flags`, `notifications`, `conversations`, `messages`, `rag_documents`, `rag_chunks`.

## 5. Graphe des relations principales

Les relations principales du schéma sont les suivantes, décrites en prose structurée pour éviter la dépendance à un outil de diagrammation.

`tenants` est la racine logique. Toutes les autres tables fonctionnelles référencent `tenants.id` via `tenant_id`. En mono-tenant la table `tenants` ne contient qu'une ligne ; en multi-tenant elle en contient autant que de banques clientes.

`users` appartient à un `tenant` et peut avoir plusieurs `roles` via `user_roles`. Les rôles distincts sont `compliance_officer`, `referential_admin`, `compliance_director`, `platform_owner`, `support_readonly`. Chaque rôle confère un ensemble de permissions codifiées dans le backend et renforcées par des politiques RLS quand la sensibilité le justifie.

`rules` référence `tenants.id` et porte des références textuelles vers les annexes (via `ax_term`) qui sont elles-mêmes définies dans `referentials_annexes`. La cohérence entre `rules.ax_term` et `referentials_annexes.code` est maintenue par contrat applicatif, non par foreign key physique, parce que `rules` peut contenir des règles saisies avec un AX_TERM qui n'existe pas encore dans le référentiel (cas de l'ingestion anticipée d'une circulaire future).

`prompt_bank` est strictement isolé : aucune foreign key sortante vers d'autres tables métier. Son seul lien est vers `tenants.id` pour le multi-tenant, et vers `users.id` pour `author_user_id` et `validator_user_id`.

`xml_uploads` est une table feuille en écriture : les XML uploadés y sont stockés en bytea compressé, avec métadonnées structurées. `validation_runs` référence `xml_uploads.id` via la colonne `primary_upload_id` pour l'annexe principale, et via une table de jointure `validation_run_uploads` pour les annexes compagnes.

`validation_runs` est le cœur transactionnel. Chaque run référence le tenant, l'utilisateur initiateur, la liste des uploads impliqués, le snapshot des versions de règles utilisées (colonne `rules_version_snapshot` en JSONB), et les métriques agrégées. Les FAIL détaillés sont dans `validation_fail_details` avec une foreign key vers `validation_runs.id`. Les grappes identifiées sont dans `clusters` avec une foreign key vers `validation_runs.id`, et chaque FAIL dans `validation_fail_details` peut référencer le `cluster_id` auquel il appartient.

`conversations` appartient à un utilisateur et à un tenant, et peut être liée à un `validation_run_id` si elle concerne un run précis. Les `messages` appartiennent à une conversation avec un ordre monotone et un rôle (`user`, `assistant`, `agent_internal`).

`rag_documents` et `rag_chunks` sont la GED vectorielle. Un document (circulaire, CC-tech, maquette) se décompose en chunks, chaque chunk ayant son embedding `vector(768)` et ses métadonnées. Les requêtes de similarité cosinus utilisent l'index HNSW.

`audit_log` n'est référencée par aucune autre table. Elle est en écriture pure, alimentée exclusivement par triggers, partitionnée par mois, avec rétention dix ans.

## 6. Stratégie d'historisation bitemporelle

Le modèle bitemporel appliqué à REGFlow simplifie le bitemporal strict de la littérature pour ne garder que la dimension fonctionnelle (valid_from, valid_to). La dimension système (transaction_from, transaction_to) est remplacée par le couple (created_at, audit_log) qui fournit l'équivalent en pratique sans le coût d'une seconde dimension temporelle universelle.

**Règles d'écriture.**

- **Insertion d'une nouvelle ligne** (nouvelle règle, nouveau référentiel, nouveau prompt) : `valid_from` prend la date de bascule souhaitée, `valid_to` est `NULL`. La ligne devient la version active à partir de `valid_from`.
- **Modification d'une ligne existante** : on n'écrase jamais. Deux opérations transactionnelles dans la même transaction : (a) l'ancienne ligne active voit son `valid_to` mis à la date de bascule, (b) une nouvelle ligne est insérée avec la nouvelle valeur et `valid_from` égal à la date de bascule. Les deux opérations sont atomiques.
- **Suppression logique** : on met à jour `deleted_at` de la ligne active. La ligne reste consultable en audit et en historique, mais elle est exclue des requêtes nominales.
- **Suppression physique** : interdite sauf procédure RGPD documentée, avec trace permanente dans `audit_log` de l'acte de suppression (identifiant, date, motif juridique, approbateur).

**Règles de lecture.**

- **État actuel** : `WHERE valid_to IS NULL AND deleted_at IS NULL`.
- **État à une date passée** : `WHERE valid_from <= :as_of_date AND (valid_to IS NULL OR valid_to > :as_of_date) AND (deleted_at IS NULL OR deleted_at > :as_of_date)`.
- **Historique complet d'une clé naturelle** : `WHERE natural_key = :key ORDER BY valid_from ASC`.

Toutes les requêtes applicatives passent par des fonctions SQL paramétrées ou des query builders qui rendent ces clauses implicites selon le mode de lecture. Les développeurs ne les réécrivent pas à la main.

---

# Partie III — Tables de vérité métier

## 7. Table `rules`

La table `rules` porte toutes les règles de gestion RDG saisies et validées. Elle est le cœur du patrimoine métier de REGFlow.

```sql
CREATE TABLE rules (
  id                    UUID PRIMARY KEY DEFAULT uuidv7()
    CONSTRAINT rules_pk PRIMARY KEY,
  tenant_id             UUID NOT NULL
    CONSTRAINT rules_fk_tenant_id REFERENCES tenants(id),

  -- Clé naturelle métier
  ax_term               VARCHAR(10) NOT NULL,
  num_regle             INTEGER NOT NULL,
  version               INTEGER NOT NULL DEFAULT 1,

  -- Contenu de la règle
  type_ctrl_declared    VARCHAR(20),
  type_ctrl_computed    VARCHAR(20) NOT NULL,
  operator              VARCHAR(10) NOT NULL,
  condition_expression  TEXT,
  zone_texte            TEXT,
  natural_language      TEXT NOT NULL,

  -- Termes de la règle en JSONB structuré
  terms                 JSONB NOT NULL,
  terms_count           INTEGER NOT NULL,
  is_inter_annexe       BOOLEAN NOT NULL,
  involved_annexes      TEXT[] NOT NULL,

  -- Source documentaire
  source_circulaire     VARCHAR(50),
  source_article        VARCHAR(50),
  source_page           INTEGER,
  source_rag_chunk_id   UUID REFERENCES rag_chunks(id),

  -- Temporalité bitemporelle
  valid_from            TIMESTAMPTZ NOT NULL,
  valid_to              TIMESTAMPTZ,

  -- Gouvernance 4-yeux
  author_user_id        UUID NOT NULL
    CONSTRAINT rules_fk_author REFERENCES users(id),
  validator_user_id     UUID
    CONSTRAINT rules_fk_validator REFERENCES users(id),
  validated_at          TIMESTAMPTZ,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',

  -- Audit systémique
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,

  -- Contraintes
  CONSTRAINT rules_uk_natural UNIQUE (tenant_id, ax_term, num_regle, valid_from),
  CONSTRAINT rules_ck_valid_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT rules_ck_status CHECK (status IN ('draft', 'pending_review', 'active', 'deprecated', 'rejected')),
  CONSTRAINT rules_ck_type_ctrl CHECK (type_ctrl_computed IN ('intra_ax', 'inter_ax')),
  CONSTRAINT rules_ck_operator CHECK (operator IN ('=', '>=', '<=', '>', '<', 'MAX', 'MIN')),
  CONSTRAINT rules_ck_four_eyes CHECK (
    (status IN ('draft', 'pending_review', 'rejected') AND validator_user_id IS NULL) OR
    (status IN ('active', 'deprecated') AND validator_user_id IS NOT NULL AND validator_user_id != author_user_id)
  )
);

CREATE INDEX rules_idx_tenant_active ON rules (tenant_id) WHERE valid_to IS NULL AND deleted_at IS NULL;
CREATE INDEX rules_idx_ax_term ON rules (tenant_id, ax_term) WHERE valid_to IS NULL AND deleted_at IS NULL;
CREATE INDEX rules_idx_involved_annexes ON rules USING GIN (involved_annexes);
CREATE INDEX rules_idx_terms_gin ON rules USING GIN (terms);
CREATE INDEX rules_idx_valid_from ON rules (tenant_id, valid_from);
CREATE INDEX rules_idx_status ON rules (tenant_id, status) WHERE deleted_at IS NULL;
```

**Structure de la colonne `terms`.** Chaque term est un objet JSON conforme au schéma suivant, stocké dans un tableau JSONB :

```json
{
  "rang": 1,
  "oper": "plus",
  "ax_origine": "630",
  "rubrique": "PA030202000000",
  "colonne": "2",
  "sequence": 1,
  "is_sentinel_c": false,
  "is_sentinel_d": false,
  "sentinel_code": null,
  "literal_value": null
}
```

La distinction entre lecture d'annexe, constante C et itération D est portée par les champs booléens et le code sentinelle. Cette représentation permet au moteur d'évaluation de traiter uniformément les termes sans recherche externe.

**Indexes stratégiques.** L'index partiel `rules_idx_tenant_active` est le plus sollicité : il couvre les lectures de règles actives pour un tenant donné. L'index GIN sur `involved_annexes` permet de trouver en temps constant les règles qui impliquent une annexe donnée, utile pour la pré-validation T0. L'index GIN sur `terms` permet les recherches par rubrique ou par colonne au sein des termes.

## 8. Table `prompt_bank`

La table `prompt_bank` porte tous les prompts des agents IA. Son accès en lecture est strictement restreint au rôle `platform_owner` via RLS, parce qu'elle constitue le patrimoine intellectuel de REGFlow.

```sql
CREATE TABLE prompt_bank (
  id                    UUID PRIMARY KEY DEFAULT uuidv7()
    CONSTRAINT prompt_bank_pk PRIMARY KEY,
  tenant_id             UUID NOT NULL
    CONSTRAINT prompt_bank_fk_tenant_id REFERENCES tenants(id),

  -- Clé naturelle
  agent_type            VARCHAR(50) NOT NULL,
  function_name         VARCHAR(100) NOT NULL,
  version               INTEGER NOT NULL,

  -- Contenu du prompt
  template              TEXT NOT NULL,
  input_schema          JSONB NOT NULL,
  output_schema         JSONB NOT NULL,
  temperature           NUMERIC(3, 2) NOT NULL DEFAULT 0.3,
  max_tokens            INTEGER NOT NULL DEFAULT 4096,
  thinking_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  target_model          VARCHAR(50) NOT NULL DEFAULT 'gemini-2.5-flash',

  -- Statut et cycle de vie
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',

  -- Métriques de performance
  success_rate          NUMERIC(5, 4),
  avg_latency_ms        INTEGER,
  avg_cost_tokens       INTEGER,
  quality_score         NUMERIC(3, 2),
  sample_size           INTEGER,

  -- Temporalité bitemporelle
  valid_from            TIMESTAMPTZ NOT NULL,
  valid_to              TIMESTAMPTZ,

  -- Gouvernance 4-yeux
  author_user_id        UUID NOT NULL
    CONSTRAINT prompt_bank_fk_author REFERENCES users(id),
  validator_user_id     UUID
    CONSTRAINT prompt_bank_fk_validator REFERENCES users(id),
  validated_at          TIMESTAMPTZ,

  -- Audit systémique
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,

  -- Contraintes
  CONSTRAINT prompt_bank_uk_natural UNIQUE (tenant_id, agent_type, function_name, version),
  CONSTRAINT prompt_bank_ck_valid_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT prompt_bank_ck_status CHECK (status IN ('draft', 'in_review', 'active', 'deprecated', 'ab_test_a', 'ab_test_b')),
  CONSTRAINT prompt_bank_ck_temperature CHECK (temperature >= 0 AND temperature <= 2),
  CONSTRAINT prompt_bank_ck_four_eyes CHECK (
    (status IN ('draft', 'in_review') AND validator_user_id IS NULL) OR
    (status IN ('active', 'deprecated', 'ab_test_a', 'ab_test_b') AND validator_user_id IS NOT NULL AND validator_user_id != author_user_id)
  )
);

CREATE UNIQUE INDEX prompt_bank_idx_unique_active
  ON prompt_bank (tenant_id, agent_type, function_name)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX prompt_bank_idx_agent_function
  ON prompt_bank (tenant_id, agent_type, function_name)
  WHERE deleted_at IS NULL;
```

**Contrainte d'activité unique.** L'index unique partiel `prompt_bank_idx_unique_active` garantit qu'une seule ligne avec le statut `active` existe pour un couple `(agent_type, function_name)` à un instant donné, sauf en mode A/B test où deux variantes peuvent coexister avec les statuts `ab_test_a` et `ab_test_b`.

**Validation du schéma d'entrée et de sortie.** Les colonnes `input_schema` et `output_schema` contiennent des JSON Schema valides. Une fonction SQL `validate_prompt_schema()` est déployée en migration 002 et vérifie au moment de l'insertion que les schémas sont conformes à la spécification JSON Schema Draft 2020-12 et que tous les emplacements de variable du template sont couverts par l'input_schema.

## 9. Les quatorze tables `referentials_*`

Les quatorze tables de référentiels partagent une structure commune. Elles se différencient par les colonnes métier spécifiques à chaque type de référentiel.

### 9.1 Structure commune

Chaque table `referentials_*` hérite du même squelette conceptuel :

```sql
-- Pattern commun à toutes les tables referentials_*
-- Exemple instancié sur referentials_annexes
CREATE TABLE referentials_annexes (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),

  -- Clé naturelle métier
  code                  VARCHAR(20) NOT NULL,
  label                 TEXT NOT NULL,

  -- Colonnes spécifiques au référentiel (exemple annexes)
  domain                VARCHAR(50),
  periodicity           VARCHAR(20),
  reporting_deadline_days INTEGER,
  xml_structure_type    INTEGER,
  has_detail_sentinel   BOOLEAN NOT NULL DEFAULT FALSE,

  -- Source documentaire
  source_circulaire     VARCHAR(50),
  source_article        VARCHAR(50),
  source_page           INTEGER,

  -- Temporalité bitemporelle
  valid_from            TIMESTAMPTZ NOT NULL,
  valid_to              TIMESTAMPTZ,

  -- Gouvernance 4-yeux
  author_user_id        UUID NOT NULL REFERENCES users(id),
  validator_user_id     UUID REFERENCES users(id),
  validated_at          TIMESTAMPTZ,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',

  -- Audit systémique
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,

  -- Contraintes
  CONSTRAINT ref_annexes_uk_natural UNIQUE (tenant_id, code, valid_from),
  CONSTRAINT ref_annexes_ck_valid_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT ref_annexes_ck_status CHECK (status IN ('draft', 'pending_review', 'active', 'deprecated')),
  CONSTRAINT ref_annexes_ck_four_eyes CHECK (
    (status IN ('draft', 'pending_review') AND validator_user_id IS NULL) OR
    (status IN ('active', 'deprecated') AND validator_user_id IS NOT NULL AND validator_user_id != author_user_id)
  ),
  CONSTRAINT ref_annexes_ck_periodicity CHECK (periodicity IN ('monthly', 'quarterly', 'semi_annual', 'annual', 'ad_hoc')),
  CONSTRAINT ref_annexes_ck_xml_type CHECK (xml_structure_type BETWEEN 1 AND 10)
);

CREATE INDEX ref_annexes_idx_active ON referentials_annexes (tenant_id, code) WHERE valid_to IS NULL AND deleted_at IS NULL;
CREATE INDEX ref_annexes_idx_domain ON referentials_annexes (tenant_id, domain) WHERE valid_to IS NULL AND deleted_at IS NULL;
```

### 9.2 Spécificités des quatorze tables

Les quatorze tables se spécialisent sur le même squelette. Voici les colonnes métier propres à chacune, au-delà du squelette commun :

**referentials_annexes** : `domain`, `periodicity`, `reporting_deadline_days`, `xml_structure_type`, `has_detail_sentinel`.

**referentials_rubriques** : `annexe_code`, `parent_rubrique_code` (pour hiérarchies), `is_aggregate`, `is_detail`, `level` (dans l'arborescence).

**referentials_colonnes** : `annexe_code`, `column_number`, `data_type` (numeric / alphanumeric / date / text), `semantic_label`.

**referentials_xml_structures** : `structure_type_number` (1 à 10), `description`, `sample_xml_template`, `affected_annexes` (`TEXT[]`).

**referentials_sentinels** : `sentinel_code` (C, D1, D2, D3, D4, D5, D6), `semantic`, `iteration_element_xpath`, `applicable_annexes` (`TEXT[]`).

**referentials_banks** : `bct_bank_code`, `legal_name`, `short_name`, `bank_type` (residential / non_residential / leasing).

**referentials_currencies** : `iso_code`, `iso_numeric_code`, `name_fr`, `name_en`, `name_ar`, `symbol`.

**referentials_sectors** : `sector_code`, `sector_label`, `hierarchy_level`, `parent_sector_code`.

**referentials_identifier_types** : `type_code` (1 à 13), `label`, `format_regex`, `validation_rules`.

**referentials_consolidation_methods** : `method_code`, `label`, `perimeter_type` (comptable / prudentiel), `description`.

**referentials_instruments** : `instrument_code`, `label`, `applicable_annexes`.

**referentials_contract_types** : `contract_type_code`, `label`, `applicable_annexes`.

**referentials_error_codes** : `error_code`, `severity` (severe / warning / info), `label`, `description_fr`, `description_en`, `description_ar`.

**referentials_annexe_dependencies** : `source_annexe_code`, `target_annexe_code`, `dependency_type` (structural / temporal / conditional), `condition_expression`, `source_reference` (article CC-tech).

Cette dernière table matérialise la matrice CC-tech §9.5 et sera traitée en détail dans l'item 4 de l'enrichissement documentaire.

---

# Partie IV — Tables transactionnelles

## 10. Table `xml_uploads`

La table `xml_uploads` stocke les XML uploadés par les utilisateurs, avec leurs métadonnées parsées et leur contenu binaire compressé.

```sql
CREATE TABLE xml_uploads (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),

  -- Métadonnées parsées
  code_banque           VARCHAR(10) NOT NULL,
  code_annexe           VARCHAR(10) NOT NULL,
  date_annexe           DATE NOT NULL,
  xml_structure_type    INTEGER,

  -- Contenu binaire
  file_name             TEXT NOT NULL,
  file_size_bytes       BIGINT NOT NULL,
  file_hash_sha256      VARCHAR(64) NOT NULL,
  content_compressed    BYTEA NOT NULL,
  compression_algo      VARCHAR(20) NOT NULL DEFAULT 'zstd',
  encoding_detected     VARCHAR(20) NOT NULL DEFAULT 'utf-8',

  -- Contexte utilisateur
  uploaded_by_user_id   UUID NOT NULL REFERENCES users(id),
  uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Validation structurelle (étape 1 BCT)
  xsd_validation_status VARCHAR(20),
  xsd_validation_errors JSONB,

  -- Audit systémique
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,

  CONSTRAINT xml_uploads_ck_xsd_status CHECK (xsd_validation_status IN ('pending', 'passed', 'failed')),
  CONSTRAINT xml_uploads_ck_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 104857600)
);

CREATE INDEX xml_uploads_idx_tenant_annexe ON xml_uploads (tenant_id, code_annexe, date_annexe);
CREATE INDEX xml_uploads_idx_user ON xml_uploads (tenant_id, uploaded_by_user_id, uploaded_at DESC);
CREATE INDEX xml_uploads_idx_hash ON xml_uploads (tenant_id, file_hash_sha256);
```

**Limite de taille.** La contrainte `xml_uploads_ck_size` plafonne un upload à 100 Mo décompressé. Au-delà, l'Ingestor XML refuse l'upload avec un message applicatif clair.

**Déduplication par hash.** La colonne `file_hash_sha256` permet de détecter qu'un utilisateur uploade un XML identique à un précédent, même si le nom de fichier diffère. Le backend peut afficher un avertissement pour éviter les doublons accidentels.

## 11. Table `validation_runs`

La table `validation_runs` est le cœur transactionnel du produit. Elle est immuable une fois écrite.

```sql
CREATE TABLE validation_runs (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),

  -- Contexte du run
  batch_label           TEXT,
  primary_annexe_code   VARCHAR(10) NOT NULL,
  arrete_date           DATE NOT NULL,
  primary_upload_id     UUID NOT NULL REFERENCES xml_uploads(id),

  -- Initiateur et horodatage
  initiated_by_user_id  UUID NOT NULL REFERENCES users(id),
  initiated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,

  -- Snapshot des versions utilisées
  rules_version_snapshot JSONB NOT NULL,
  referentials_version_snapshot JSONB NOT NULL,
  engine_version        VARCHAR(20) NOT NULL,

  -- Résultats agrégés
  status                VARCHAR(20) NOT NULL DEFAULT 'running',
  total_rules_evaluated INTEGER,
  total_pass            INTEGER,
  total_fail_severe     INTEGER,
  total_fail_rounding   INTEGER,
  conformity_rate       NUMERIC(5, 4),
  execution_time_ms     INTEGER,

  -- Étapes BCT
  step1_xsd_status      VARCHAR(20),
  step1_xsd_duration_ms INTEGER,
  step2_embedded_status VARCHAR(20),
  step2_embedded_duration_ms INTEGER,
  step3_rdg_status      VARCHAR(20),
  step3_rdg_duration_ms INTEGER,

  -- Livrables produits (références aux artéfacts)
  synthesis_artifact    JSONB,
  deliverable_c_artifact JSONB,

  -- Lien vers la conversation d'investigation
  conversation_id       UUID REFERENCES conversations(id),

  -- Mode de signature interne
  is_signed             BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at             TIMESTAMPTZ,
  signed_by_user_id     UUID REFERENCES users(id),
  signed_xml_hash       VARCHAR(64),

  -- Audit systémique (immuable)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT validation_runs_ck_status CHECK (status IN ('running', 'completed', 'failed', 'aborted')),
  CONSTRAINT validation_runs_ck_signed_coherence CHECK (
    (is_signed = FALSE AND signed_at IS NULL AND signed_by_user_id IS NULL) OR
    (is_signed = TRUE AND signed_at IS NOT NULL AND signed_by_user_id IS NOT NULL AND total_fail_severe = 0)
  ),
  CONSTRAINT validation_runs_ck_completion CHECK (
    (status = 'running' AND completed_at IS NULL) OR
    (status IN ('completed', 'failed', 'aborted') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX validation_runs_idx_tenant_date ON validation_runs (tenant_id, arrete_date DESC);
CREATE INDEX validation_runs_idx_user ON validation_runs (tenant_id, initiated_by_user_id, initiated_at DESC);
CREATE INDEX validation_runs_idx_annexe ON validation_runs (tenant_id, primary_annexe_code, arrete_date DESC);
CREATE INDEX validation_runs_idx_status ON validation_runs (tenant_id, status) WHERE status = 'running';

-- Table de jointure pour les annexes compagnes
CREATE TABLE validation_run_uploads (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  validation_run_id     UUID NOT NULL REFERENCES validation_runs(id),
  xml_upload_id         UUID NOT NULL REFERENCES xml_uploads(id),
  role                  VARCHAR(20) NOT NULL,

  CONSTRAINT vru_uk UNIQUE (validation_run_id, xml_upload_id),
  CONSTRAINT vru_ck_role CHECK (role IN ('primary', 'companion'))
);

CREATE INDEX vru_idx_run ON validation_run_uploads (validation_run_id);
```

**Snapshot des versions.** Les colonnes `rules_version_snapshot` et `referentials_version_snapshot` stockent la liste des identifiants UUID des versions de règles et de référentiels qui ont été utilisées lors du run. Cette information garantit qu'on peut **rejouer** un run passé avec les mêmes règles, même si celles-ci ont évolué depuis, et qu'on peut **reconstituer** exactement le contexte qui a produit un verdict historique.

**Immutabilité.** La table n'a pas de colonne `updated_at` ni `deleted_at`. Un trigger (défini en §23) lève une exception sur toute tentative d'`UPDATE` ou `DELETE`. Seuls les champs de signature peuvent être mis à jour via une procédure stockée dédiée qui contourne le trigger de manière contrôlée.

## 12. Table `validation_fail_details`

```sql
CREATE TABLE validation_fail_details (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  validation_run_id     UUID NOT NULL REFERENCES validation_runs(id),

  -- Identification de la règle
  rule_id               UUID NOT NULL REFERENCES rules(id),
  ax_term               VARCHAR(10) NOT NULL,
  num_regle             INTEGER NOT NULL,

  -- Itération sentinelle D (si applicable)
  is_sentinel_iteration BOOLEAN NOT NULL DEFAULT FALSE,
  iteration_index       INTEGER,
  iteration_xpath       TEXT,
  iteration_label       TEXT,

  -- Verdict détaillé
  severity              VARCHAR(20) NOT NULL,
  expected_value        NUMERIC(20, 3),
  computed_value        NUMERIC(20, 3),
  gap_absolute          NUMERIC(20, 3),
  gap_relative          NUMERIC(10, 6),

  -- Décomposition du calcul
  calculation_trace     JSONB NOT NULL,

  -- Grappe d'appartenance (livrable C)
  cluster_id            UUID REFERENCES clusters(id),

  -- Audit systémique
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vfd_ck_severity CHECK (severity IN ('severe', 'rounding')),
  CONSTRAINT vfd_ck_sentinel_coherence CHECK (
    (is_sentinel_iteration = FALSE AND iteration_index IS NULL) OR
    (is_sentinel_iteration = TRUE AND iteration_index IS NOT NULL)
  )
);

CREATE INDEX vfd_idx_run ON validation_fail_details (validation_run_id);
CREATE INDEX vfd_idx_rule ON validation_fail_details (tenant_id, rule_id);
CREATE INDEX vfd_idx_cluster ON validation_fail_details (cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX vfd_idx_severity ON validation_fail_details (validation_run_id, severity);
```

## 13. Table `clusters`

```sql
CREATE TABLE clusters (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  validation_run_id     UUID NOT NULL REFERENCES validation_runs(id),

  -- Identification
  cluster_label         VARCHAR(20) NOT NULL,
  priority              VARCHAR(10) NOT NULL,
  impact_level          VARCHAR(10) NOT NULL,

  -- Cause racine
  root_cause_hypothesis TEXT NOT NULL,
  business_explanation  TEXT NOT NULL,
  recommended_action    TEXT NOT NULL,
  pointed_sector_si     TEXT,

  -- Corrélations détectées
  correlation_type      VARCHAR(30) NOT NULL,
  correlation_evidence  JSONB,

  -- Métriques
  fail_count            INTEGER NOT NULL,
  confidence_level      VARCHAR(20) NOT NULL,
  confidence_score      NUMERIC(3, 2),

  -- Agent source
  produced_by_agent     VARCHAR(50) NOT NULL DEFAULT 'InvestigatorAgent',
  prompt_version_used   UUID REFERENCES prompt_bank(id),

  -- Audit systémique
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT clusters_uk_label_run UNIQUE (validation_run_id, cluster_label),
  CONSTRAINT clusters_ck_priority CHECK (priority IN ('P1', 'P2', 'P3')),
  CONSTRAINT clusters_ck_impact CHECK (impact_level IN ('high', 'medium', 'low')),
  CONSTRAINT clusters_ck_confidence CHECK (confidence_level IN ('high', 'medium', 'low', 'insufficient_data'))
);

CREATE INDEX clusters_idx_run ON clusters (validation_run_id);
CREATE INDEX clusters_idx_priority ON clusters (validation_run_id, priority);
```

---

# Partie V — Tables de gouvernance

## 14. Table `tenants`

```sql
CREATE TABLE tenants (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),

  -- Identification
  slug                  VARCHAR(50) NOT NULL UNIQUE,
  legal_name            TEXT NOT NULL,
  bct_bank_code         VARCHAR(10),

  -- Configuration
  default_language      VARCHAR(5) NOT NULL DEFAULT 'fr',
  timezone              VARCHAR(50) NOT NULL DEFAULT 'Africa/Tunis',
  deployment_mode       VARCHAR(20) NOT NULL DEFAULT 'on_premises',

  -- SSO
  sso_provider          VARCHAR(50),
  sso_config            JSONB,

  -- Cycle de vie
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  activated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  suspended_at          TIMESTAMPTZ,

  -- Audit systémique
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT tenants_ck_language CHECK (default_language IN ('fr', 'en', 'ar')),
  CONSTRAINT tenants_ck_deployment CHECK (deployment_mode IN ('on_premises', 'cloud_dedicated', 'cloud_shared'))
);
```

## 15. Tables `users`, `roles`, `user_roles`, `sessions`

```sql
CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),

  -- Identité
  external_sso_id       TEXT NOT NULL,
  email                 CITEXT NOT NULL,
  full_name             TEXT NOT NULL,
  preferred_language    VARCHAR(5),
  timezone              VARCHAR(50),

  -- Cycle de vie
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at         TIMESTAMPTZ,
  disabled_at           TIMESTAMPTZ,
  disabled_reason       TEXT,

  -- Audit systémique
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,

  CONSTRAINT users_uk_sso UNIQUE (tenant_id, external_sso_id),
  CONSTRAINT users_uk_email UNIQUE (tenant_id, email),
  CONSTRAINT users_ck_language CHECK (preferred_language IS NULL OR preferred_language IN ('fr', 'en', 'ar'))
);

CREATE INDEX users_idx_active ON users (tenant_id) WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE TABLE roles (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  code                  VARCHAR(50) NOT NULL,
  label_fr              TEXT NOT NULL,
  label_en              TEXT NOT NULL,
  label_ar              TEXT NOT NULL,
  permissions           JSONB NOT NULL,
  is_system_role        BOOLEAN NOT NULL DEFAULT FALSE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT roles_uk UNIQUE (tenant_id, code)
);

-- Pré-remplissage des rôles système
INSERT INTO roles (tenant_id, code, label_fr, label_en, label_ar, permissions, is_system_role) VALUES
  /* rempli par migration 007 pour chaque tenant */;

CREATE TABLE user_roles (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  user_id               UUID NOT NULL REFERENCES users(id),
  role_id               UUID NOT NULL REFERENCES roles(id),
  assigned_by_user_id   UUID REFERENCES users(id),
  assigned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at            TIMESTAMPTZ,

  CONSTRAINT user_roles_uk UNIQUE (user_id, role_id, assigned_at)
);

CREATE INDEX user_roles_idx_active ON user_roles (user_id) WHERE revoked_at IS NULL;

CREATE TABLE sessions (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  user_id               UUID NOT NULL REFERENCES users(id),
  token_hash            VARCHAR(64) NOT NULL,
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL,
  revoked_at            TIMESTAMPTZ,
  ip_address            INET,
  user_agent            TEXT,

  CONSTRAINT sessions_uk_token UNIQUE (token_hash)
);

CREATE INDEX sessions_idx_user_active ON sessions (user_id) WHERE revoked_at IS NULL AND expires_at > NOW();
```

## 16. Table `four_eyes_approvals`

```sql
CREATE TABLE four_eyes_approvals (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),

  -- Objet de la validation
  entity_type           VARCHAR(50) NOT NULL,
  entity_id             UUID NOT NULL,
  entity_version        INTEGER NOT NULL,

  -- Requête
  requested_by_user_id  UUID NOT NULL REFERENCES users(id),
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_reason        TEXT,
  requested_change      JSONB NOT NULL,

  -- Décision
  decision              VARCHAR(20) NOT NULL DEFAULT 'pending',
  decided_by_user_id    UUID REFERENCES users(id),
  decided_at            TIMESTAMPTZ,
  decision_reason       TEXT,

  -- Audit systémique
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fea_ck_entity_type CHECK (entity_type IN (
    'rule', 'referential_annexe', 'referential_rubrique', 'referential_colonne',
    'referential_xml_structure', 'referential_sentinel', 'referential_bank',
    'referential_currency', 'referential_sector', 'referential_identifier_type',
    'referential_consolidation_method', 'referential_instrument', 'referential_contract_type',
    'referential_error_code', 'referential_annexe_dependency', 'prompt'
  )),
  CONSTRAINT fea_ck_decision CHECK (decision IN ('pending', 'approved', 'rejected')),
  CONSTRAINT fea_ck_distinct_users CHECK (decided_by_user_id IS NULL OR decided_by_user_id != requested_by_user_id),
  CONSTRAINT fea_ck_decision_coherence CHECK (
    (decision = 'pending' AND decided_by_user_id IS NULL AND decided_at IS NULL) OR
    (decision IN ('approved', 'rejected') AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE INDEX fea_idx_entity ON four_eyes_approvals (tenant_id, entity_type, entity_id);
CREATE INDEX fea_idx_pending ON four_eyes_approvals (tenant_id, decision, requested_at) WHERE decision = 'pending';
CREATE INDEX fea_idx_requester ON four_eyes_approvals (tenant_id, requested_by_user_id, requested_at DESC);
```

## 17. Table `audit_log` avec partitionnement

La table `audit_log` est partitionnée mensuellement par `created_at` pour maintenir des performances d'écriture et de lecture stables sur dix ans de rétention.

```sql
CREATE TABLE audit_log (
  id                    UUID NOT NULL DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL,

  -- Qui
  actor_user_id         UUID,
  actor_session_id      UUID,
  actor_ip_address      INET,
  actor_user_agent      TEXT,

  -- Quoi
  action                VARCHAR(50) NOT NULL,
  entity_type           VARCHAR(50) NOT NULL,
  entity_id             UUID NOT NULL,

  -- Comment
  old_value             JSONB,
  new_value             JSONB,
  change_summary        TEXT,

  -- Contexte technique
  request_id            UUID,
  transaction_id        BIGINT,

  -- Temporalité
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Partitions créées dynamiquement par pg_cron ou par application
-- Exemple pour avril 2026
CREATE TABLE audit_log_2026_04 PARTITION OF audit_log
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE INDEX audit_log_idx_tenant_entity ON audit_log (tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX audit_log_idx_actor ON audit_log (tenant_id, actor_user_id, created_at DESC);
CREATE INDEX audit_log_idx_action ON audit_log (tenant_id, action, created_at DESC);
```

**Création automatique des partitions.** Un job `pg_cron` mensuel (défini en migration 025) crée automatiquement la partition du mois suivant. Un autre job trimestriel détache les partitions plus vieilles que dix ans pour archivage froid externe.

---

# Partie VI — Tables transverses

## 18. Table `feature_flags`

```sql
CREATE TABLE feature_flags (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),

  -- Identification
  flag_key              VARCHAR(100) NOT NULL,
  description           TEXT,

  -- Configuration
  is_enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_for_user_ids  UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  enabled_for_roles     VARCHAR(50)[] NOT NULL DEFAULT ARRAY[]::VARCHAR[],
  rollout_percentage    INTEGER NOT NULL DEFAULT 0,

  -- Cycle de vie
  created_by_user_id    UUID NOT NULL REFERENCES users(id),
  activated_at          TIMESTAMPTZ,
  deactivated_at        TIMESTAMPTZ,

  -- Audit systémique
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT feature_flags_uk UNIQUE (tenant_id, flag_key),
  CONSTRAINT feature_flags_ck_rollout CHECK (rollout_percentage BETWEEN 0 AND 100)
);
```

## 19. Table `notifications`

```sql
CREATE TABLE notifications (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  user_id               UUID NOT NULL REFERENCES users(id),

  -- Contenu
  event_type            VARCHAR(50) NOT NULL,
  urgency_level         VARCHAR(20) NOT NULL,
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL,
  suggested_action      TEXT,
  resource_link         TEXT,

  -- Agent source
  produced_by_agent     VARCHAR(50) NOT NULL DEFAULT 'NotificationAgent',

  -- Cycle de vie
  is_read               BOOLEAN NOT NULL DEFAULT FALSE,
  read_at               TIMESTAMPTZ,
  dismissed_at          TIMESTAMPTZ,

  -- Temporalité
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ,

  CONSTRAINT notif_ck_urgency CHECK (urgency_level IN ('info', 'attention', 'action_required')),
  CONSTRAINT notif_ck_event CHECK (event_type IN (
    'new_circular_detected',
    'referential_updated',
    'rules_pending_validation',
    'deadline_approaching',
    'retention_expiring',
    'conversation_pending'
  ))
);

CREATE INDEX notifications_idx_user_unread ON notifications (tenant_id, user_id, created_at DESC) WHERE is_read = FALSE;
CREATE INDEX notifications_idx_user_all ON notifications (tenant_id, user_id, created_at DESC);
```

## 20. Tables `conversations` et `messages`

```sql
CREATE TABLE conversations (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  user_id               UUID NOT NULL REFERENCES users(id),

  -- Contexte
  title                 TEXT,
  linked_validation_run_id UUID REFERENCES validation_runs(id),
  language              VARCHAR(5) NOT NULL DEFAULT 'fr',

  -- Compression de contexte
  context_summary       TEXT,
  summary_updated_at    TIMESTAMPTZ,
  messages_count        INTEGER NOT NULL DEFAULT 0,
  tokens_total          INTEGER NOT NULL DEFAULT 0,

  -- Cycle de vie
  is_archived           BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at           TIMESTAMPTZ,

  -- Audit systémique
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,

  CONSTRAINT conv_ck_language CHECK (language IN ('fr', 'en', 'ar'))
);

CREATE INDEX conv_idx_user_recent ON conversations (tenant_id, user_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX conv_idx_run ON conversations (linked_validation_run_id) WHERE linked_validation_run_id IS NOT NULL;

CREATE TABLE messages (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  conversation_id       UUID NOT NULL REFERENCES conversations(id),

  -- Ordre et rôle
  sequence_number       INTEGER NOT NULL,
  role                  VARCHAR(30) NOT NULL,

  -- Contenu
  content_markdown      TEXT NOT NULL,
  content_json          JSONB,
  attachments           JSONB,

  -- Métadonnées IA
  produced_by_agent     VARCHAR(50),
  prompt_version_used   UUID REFERENCES prompt_bank(id),
  thinking_trace        JSONB,
  citations             JSONB,
  confidence_level      VARCHAR(20),

  -- Coût et performance
  tokens_input          INTEGER,
  tokens_output         INTEGER,
  tokens_thinking       INTEGER,
  latency_ms            INTEGER,

  -- Temporalité
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT msg_uk_sequence UNIQUE (conversation_id, sequence_number),
  CONSTRAINT msg_ck_role CHECK (role IN (
    'user',
    'regalica_response',
    'regalica_thinking',
    'agent_internal',
    'system_notification'
  )),
  CONSTRAINT msg_ck_confidence CHECK (confidence_level IS NULL OR confidence_level IN ('high', 'medium', 'low', 'insufficient_data'))
);

CREATE INDEX msg_idx_conv_seq ON messages (conversation_id, sequence_number);
CREATE INDEX msg_idx_tenant_created ON messages (tenant_id, created_at DESC);
```

## 21. Tables `rag_documents` et `rag_chunks`

```sql
CREATE TABLE rag_documents (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),

  -- Identification
  document_type         VARCHAR(50) NOT NULL,
  title                 TEXT NOT NULL,
  source_reference      VARCHAR(100),
  publication_date      DATE,
  effective_date        DATE,

  -- Fichier source
  file_name             TEXT NOT NULL,
  file_hash_sha256      VARCHAR(64) NOT NULL,
  file_size_bytes       BIGINT NOT NULL,
  content_compressed    BYTEA,

  -- Ingestion
  ingested_by_user_id   UUID NOT NULL REFERENCES users(id),
  ingested_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chunks_count          INTEGER NOT NULL DEFAULT 0,
  ingestion_status      VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Audit systémique
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,

  CONSTRAINT rag_doc_ck_type CHECK (document_type IN ('circulaire_bct', 'cc_tech', 'maquette_bct', 'rdg_excel', 'internal_note')),
  CONSTRAINT rag_doc_ck_status CHECK (ingestion_status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX rag_doc_idx_type ON rag_documents (tenant_id, document_type, publication_date DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX rag_doc_uk_hash ON rag_documents (tenant_id, file_hash_sha256) WHERE deleted_at IS NULL;

CREATE TABLE rag_chunks (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  document_id           UUID NOT NULL REFERENCES rag_documents(id),

  -- Position dans le document
  chunk_index           INTEGER NOT NULL,
  page_number           INTEGER,
  section_title         TEXT,
  article_reference     VARCHAR(50),

  -- Contenu
  content               TEXT NOT NULL,
  content_tokens        INTEGER NOT NULL,
  embedding             VECTOR(768) NOT NULL,

  -- Audit systémique
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT rag_chunks_uk_index UNIQUE (document_id, chunk_index)
);

CREATE INDEX rag_chunks_idx_embedding ON rag_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX rag_chunks_idx_document ON rag_chunks (document_id, chunk_index);
CREATE INDEX rag_chunks_idx_content_trgm ON rag_chunks USING GIN (content gin_trgm_ops);
```

**Index HNSW.** L'index `rag_chunks_idx_embedding` utilise l'opérateur `vector_cosine_ops` de pgvector avec l'algorithme HNSW, qui offre un bon compromis entre précision et latence pour les recherches par similarité cosinus. Les paramètres par défaut (`m = 16`, `ef_construction = 64`) conviennent à des volumes jusqu'à plusieurs millions de chunks.

---

# Partie VII — Politiques de sécurité et triggers

## 22. Politiques Row-Level Security par table

Les politiques RLS sont activées sur les tables sensibles. Chaque politique utilise la variable de session `app.current_user_id` définie par le backend Node.js au début de chaque requête via `SET LOCAL app.current_user_id = :user_id` dans la transaction.

### 22.1 Fonction utilitaire de contexte

```sql
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS UUID AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_app_tenant_id() RETURNS UUID AS $$
  SELECT nullif(current_setting('app.current_tenant_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION current_user_has_role(role_code TEXT) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = current_app_user_id()
      AND r.code = role_code
      AND ur.revoked_at IS NULL
  );
$$ LANGUAGE SQL STABLE;
```

### 22.2 Politiques sur `prompt_bank`

Seul le rôle `platform_owner` peut lire ou écrire dans `prompt_bank`. Cette restriction protège le patrimoine intellectuel des prompts REGFlow.

```sql
ALTER TABLE prompt_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY prompt_bank_select ON prompt_bank
  FOR SELECT
  USING (current_user_has_role('platform_owner'));

CREATE POLICY prompt_bank_insert ON prompt_bank
  FOR INSERT
  WITH CHECK (current_user_has_role('platform_owner'));

CREATE POLICY prompt_bank_update ON prompt_bank
  FOR UPDATE
  USING (current_user_has_role('platform_owner'))
  WITH CHECK (current_user_has_role('platform_owner'));

CREATE POLICY prompt_bank_delete ON prompt_bank
  FOR DELETE
  USING (current_user_has_role('platform_owner'));
```

### 22.3 Politiques sur `validation_runs`, `validation_fail_details`, `clusters`

Un utilisateur ne voit que les runs de son propre tenant. Les Compliance Officers peuvent voir tous les runs de leur tenant (usage collaboratif). Le rôle `support_readonly` voit en lecture seule.

```sql
ALTER TABLE validation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY validation_runs_select ON validation_runs
  FOR SELECT
  USING (tenant_id = current_app_tenant_id());

CREATE POLICY validation_runs_insert ON validation_runs
  FOR INSERT
  WITH CHECK (
    tenant_id = current_app_tenant_id()
    AND initiated_by_user_id = current_app_user_id()
  );

-- Pas de politique UPDATE/DELETE : trigger d'immutabilité en §23
```

### 22.4 Politiques sur `conversations` et `messages`

Chaque Compliance Officer ne voit que ses propres conversations, sauf s'il a le rôle `compliance_director` qui peut voir celles de son équipe en lecture.

```sql
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select ON conversations
  FOR SELECT
  USING (
    tenant_id = current_app_tenant_id()
    AND (
      user_id = current_app_user_id()
      OR current_user_has_role('compliance_director')
      OR current_user_has_role('support_readonly')
    )
  );

CREATE POLICY conversations_insert ON conversations
  FOR INSERT
  WITH CHECK (
    tenant_id = current_app_tenant_id()
    AND user_id = current_app_user_id()
  );

CREATE POLICY conversations_update ON conversations
  FOR UPDATE
  USING (
    tenant_id = current_app_tenant_id()
    AND user_id = current_app_user_id()
  );

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.tenant_id = current_app_tenant_id()
        AND (
          c.user_id = current_app_user_id()
          OR current_user_has_role('compliance_director')
          OR current_user_has_role('support_readonly')
        )
    )
  );
```

### 22.5 Politiques sur `audit_log`

Le rôle `support_readonly` et `platform_owner` peuvent lire. Les Compliance Officers et Directeurs voient leurs propres actions. Personne ne peut écrire directement (uniquement via triggers).

```sql
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select ON audit_log
  FOR SELECT
  USING (
    tenant_id = current_app_tenant_id()
    AND (
      actor_user_id = current_app_user_id()
      OR current_user_has_role('platform_owner')
      OR current_user_has_role('support_readonly')
      OR current_user_has_role('compliance_director')
    )
  );

-- Pas de politique INSERT/UPDATE/DELETE : accès exclusif via triggers internes
```

### 22.6 Tables sans RLS

Les tables suivantes ne portent pas de RLS parce qu'elles sont soit publiques au sein d'une installation, soit systémiques : `tenants`, `roles`, toutes les `referentials_*`, `feature_flags`. Elles sont néanmoins protégées par le filtrage `tenant_id` au niveau applicatif.

## 23. Triggers d'immutabilité

### 23.1 Immutabilité de `validation_runs`

```sql
CREATE OR REPLACE FUNCTION prevent_validation_runs_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'validation_runs is insert-only; DELETE is forbidden on run %', OLD.id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Autoriser uniquement la mise à jour des champs de signature via une clé applicative dédiée
    IF NEW.id != OLD.id OR NEW.tenant_id != OLD.tenant_id
       OR NEW.primary_annexe_code != OLD.primary_annexe_code
       OR NEW.arrete_date != OLD.arrete_date
       OR NEW.primary_upload_id != OLD.primary_upload_id
       OR NEW.initiated_by_user_id != OLD.initiated_by_user_id
       OR NEW.initiated_at != OLD.initiated_at
       OR NEW.created_at != OLD.created_at
       OR (NEW.completed_at IS DISTINCT FROM OLD.completed_at AND OLD.completed_at IS NOT NULL)
       OR (NEW.rules_version_snapshot::TEXT != OLD.rules_version_snapshot::TEXT)
       OR (NEW.referentials_version_snapshot::TEXT != OLD.referentials_version_snapshot::TEXT)
    THEN
      RAISE EXCEPTION 'validation_runs immutable fields cannot be modified';
    END IF;

    -- Transition signature autorisée uniquement dans un sens
    IF OLD.is_signed = TRUE AND NEW.is_signed = FALSE THEN
      RAISE EXCEPTION 'validation_runs signature cannot be revoked';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validation_runs_immutability
  BEFORE UPDATE OR DELETE ON validation_runs
  FOR EACH ROW EXECUTE FUNCTION prevent_validation_runs_modification();

-- Révocation des GRANT UPDATE/DELETE en complément
REVOKE UPDATE, DELETE ON validation_runs FROM PUBLIC;
REVOKE UPDATE, DELETE ON validation_runs FROM regflow_app;
-- Seul le rôle de signature peut faire UPDATE partiel via une procédure stockée
GRANT UPDATE (is_signed, signed_at, signed_by_user_id, signed_xml_hash, completed_at, total_rules_evaluated, total_pass, total_fail_severe, total_fail_rounding, conformity_rate, execution_time_ms, status, step1_xsd_status, step1_xsd_duration_ms, step2_embedded_status, step2_embedded_duration_ms, step3_rdg_status, step3_rdg_duration_ms, synthesis_artifact, deliverable_c_artifact, conversation_id) ON validation_runs TO regflow_engine;
```

### 23.2 Immutabilité de `audit_log`

```sql
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'audit_log is insert-only; % is forbidden', TG_OP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutability
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
REVOKE UPDATE, DELETE ON audit_log FROM regflow_app;
```

### 23.3 Immutabilité de `messages`

Les messages d'une conversation sont immuables une fois écrits. Seule la conversation peut être archivée.

```sql
CREATE OR REPLACE FUNCTION prevent_messages_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'messages is insert-only; % is forbidden', TG_OP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_immutability
  BEFORE UPDATE OR DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION prevent_messages_modification();
```

## 24. Triggers d'audit automatique

Chaque modification sur une table sensible déclenche un enregistrement automatique dans `audit_log`.

```sql
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_id UUID;
  v_tenant_id UUID;
  v_old JSONB;
  v_new JSONB;
BEGIN
  v_actor_id := current_app_user_id();
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  IF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  ELSE -- DELETE
    v_old := to_jsonb(OLD);
    v_new := NULL;
  END IF;

  INSERT INTO audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    old_value, new_value, created_at
  ) VALUES (
    v_tenant_id, v_actor_id, TG_OP, TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id), v_old, v_new, NOW()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Attachement aux tables sensibles
CREATE TRIGGER rules_audit AFTER INSERT OR UPDATE OR DELETE ON rules
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER prompt_bank_audit AFTER INSERT OR UPDATE OR DELETE ON prompt_bank
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER referentials_annexes_audit AFTER INSERT OR UPDATE OR DELETE ON referentials_annexes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Répété pour toutes les referentials_*, users, roles, user_roles, four_eyes_approvals, feature_flags
```

---

# Partie VIII — Migrations

## 25. Organisation des fichiers de migration

Les migrations SQL sont numérotées séquentiellement et appliquées dans l'ordre strict de leur préfixe numérique. Chaque migration est atomique (enveloppée dans une transaction) et idempotente dans la mesure du possible (utilisation de `IF NOT EXISTS`).

Les migrations résident dans `apps/api/migrations/` côté backend Node.js. Un runner de migration dédié (`node-pg-migrate` ou équivalent natif) les applique au démarrage du serveur API ou via une commande CLI explicite.

Chaque fichier de migration porte un en-tête standard qui décrit son objet, son auteur, sa date, et les dépendances aux migrations précédentes.

## 26. Séquence canonique des migrations

La séquence complète des migrations pour atteindre le schéma v1 est la suivante :

| #   | Fichier                                      | Objet                                                                                                       |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 001 | `001_extensions.sql`                         | Activation des extensions PostgreSQL et fonction `uuidv7()`                                                 |
| 002 | `002_schema_helpers.sql`                     | Fonctions `current_app_user_id`, `current_app_tenant_id`, `current_user_has_role`, `validate_prompt_schema` |
| 003 | `003_tenants.sql`                            | Table `tenants`                                                                                             |
| 004 | `004_users_roles.sql`                        | Tables `users`, `roles`, `user_roles`, `sessions`                                                           |
| 005 | `005_audit_log.sql`                          | Table `audit_log` partitionnée + première partition + trigger d'immutabilité                                |
| 006 | `006_audit_trigger_function.sql`             | Fonction `audit_trigger_function`                                                                           |
| 007 | `007_seed_system_roles.sql`                  | Insertion des rôles système par tenant                                                                      |
| 008 | `008_referentials_annexes.sql`               | Table `referentials_annexes` + trigger d'audit                                                              |
| 009 | `009_referentials_rubriques.sql`             | Table `referentials_rubriques`                                                                              |
| 010 | `010_referentials_colonnes.sql`              | Table `referentials_colonnes`                                                                               |
| 011 | `011_referentials_xml_structures.sql`        | Table `referentials_xml_structures`                                                                         |
| 012 | `012_referentials_sentinels.sql`             | Table `referentials_sentinels`                                                                              |
| 013 | `013_referentials_banks.sql`                 | Table `referentials_banks`                                                                                  |
| 014 | `014_referentials_currencies.sql`            | Table `referentials_currencies`                                                                             |
| 015 | `015_referentials_sectors.sql`               | Table `referentials_sectors`                                                                                |
| 016 | `016_referentials_identifier_types.sql`      | Table `referentials_identifier_types`                                                                       |
| 017 | `017_referentials_consolidation_methods.sql` | Table `referentials_consolidation_methods`                                                                  |
| 018 | `018_referentials_instruments.sql`           | Table `referentials_instruments`                                                                            |
| 019 | `019_referentials_contract_types.sql`        | Table `referentials_contract_types`                                                                         |
| 020 | `020_referentials_error_codes.sql`           | Table `referentials_error_codes`                                                                            |
| 021 | `021_referentials_annexe_dependencies.sql`   | Table `referentials_annexe_dependencies`                                                                    |
| 022 | `022_rules.sql`                              | Table `rules` + trigger d'audit                                                                             |
| 023 | `023_prompt_bank.sql`                        | Table `prompt_bank` + RLS platform_owner + trigger d'audit                                                  |
| 024 | `024_xml_uploads.sql`                        | Table `xml_uploads`                                                                                         |
| 025 | `025_validation_runs.sql`                    | Tables `validation_runs`, `validation_run_uploads` + trigger d'immutabilité + RLS                           |
| 026 | `026_validation_fail_details.sql`            | Table `validation_fail_details`                                                                             |
| 027 | `027_clusters.sql`                           | Table `clusters`                                                                                            |
| 028 | `028_four_eyes_approvals.sql`                | Table `four_eyes_approvals`                                                                                 |
| 029 | `029_feature_flags.sql`                      | Table `feature_flags`                                                                                       |
| 030 | `030_notifications.sql`                      | Table `notifications`                                                                                       |
| 031 | `031_conversations.sql`                      | Table `conversations` + RLS                                                                                 |
| 032 | `032_messages.sql`                           | Table `messages` + RLS + trigger d'immutabilité                                                             |
| 033 | `033_rag_documents.sql`                      | Table `rag_documents`                                                                                       |
| 034 | `034_rag_chunks.sql`                         | Table `rag_chunks` + index HNSW                                                                             |
| 035 | `035_pg_cron_partitions.sql`                 | Job pg_cron pour création automatique des partitions `audit_log`                                            |
| 036 | `036_grants_regflow_app.sql`                 | Rôles PostgreSQL applicatifs (`regflow_app`, `regflow_engine`, `regflow_readonly`) et GRANTs                |
| 037 | `037_views_active_versions.sql`              | Vues SQL pour lecture des versions actives (`rules_active`, `referentials_annexes_active`, etc.)            |

Chaque migration est suivie d'un test d'intégration qui vérifie que la migration a effectivement créé les objets attendus, appliqué les contraintes, et que les tests de non-régression du schéma passent. Ces tests vivent dans `apps/api/tests/migrations/`.

---

_Fin du Document 6 sur 6 — Schéma SQL complet et migrations_
_Prochain document à produire : Document 7 — State machine du workflow utilisateur (item 2 de l'enrichissement)_
