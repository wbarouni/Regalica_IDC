# 05 — Base de données actuelle

Deux sources définissent le schéma : les migrations Sequelize (`apps/api/src/db/migrations/`) qui s'appliquent en production, et le schéma Drizzle ORM (`packages/db/src/schema/`) qui est présent mais non encore utilisé par les routes actives.

---

## Moteur et extensions

| Élément | Valeur |
|---|---|
| Moteur | PostgreSQL 16 |
| Image Docker | `pgvector/pgvector:pg16` |
| Extension vectorielle | `vector` (pgvector) |
| Extension cryptographique | `pgcrypto` (`gen_random_uuid()`) |
| Extension texte | `pg_trgm` (recherche trigramme) |
| Extension index | `btree_gin` (index composites avec tableaux) |

Les extensions sont activées dans `infra/docker/postgres-init.sql` au premier démarrage.

---

## Migrations Sequelize (apps/api) — 10 tables

Les migrations s'exécutent dans l'ordre alphabétique numérique. Toutes utilisent `IF NOT EXISTS` ou `ON CONFLICT DO NOTHING` pour être idempotentes.

### Table `tenants` (migration 001)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | UUID | PK, default UUIDV4 |
| `name` | TEXT | NOT NULL |
| `parent_id` | UUID | FK → `tenants(id)`, nullable (self-reference) |
| `plan` | TEXT | NOT NULL, default `'standard'` |
| `is_active` | BOOLEAN | NOT NULL, default `true` |
| `created_at` | DATE | NOT NULL, default NOW |

Seed initial : tenant `00000000-0000-0000-0000-000000000001` (`Banque Centrale Dev`, plan `enterprise`) inséré via `ON CONFLICT DO NOTHING`.

### Table `rules` (migration 002)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK → `tenants(id)`, NOT NULL |
| `annexe_code` | TEXT | NOT NULL |
| `num_regle` | INTEGER | NOT NULL |
| `oper_regle` | TEXT | NOT NULL, CHECK IN (`=`, `>=`, `<=`, `>`, `<`, `SUM`, `MAX`, `MIN`, `VA`) |
| `type_ctrl` | TEXT | NOT NULL, CHECK IN (`intra_ax`, `inter_ax`) |
| `domaine` | TEXT | nullable |
| `lib_annexe` | TEXT | nullable |
| `zone_texte` | TEXT | nullable |
| `is_formalized` | BOOLEAN | NOT NULL, default `true` |
| `version` | INTEGER | NOT NULL, default `1` |
| `is_active` | BOOLEAN | NOT NULL, default `true` |
| `created_at` | DATE | NOT NULL |

Index : `rules_tenant_annexe_num_version_unique` (UNIQUE), `idx_rules_annexe_num` (partiel WHERE `is_active = TRUE`).

### Table `rule_terms` (migration 003)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | UUID | PK |
| `rule_id` | UUID | FK → `rules(id)`, ON DELETE CASCADE |
| `rang` | SMALLINT | CHECK IN (1, 2, 3) |
| `num_seq` | SMALLINT | — |
| `term_op` | TEXT | CHECK IN (`+`, `-`, `*`, `/`) |
| `kind` | TEXT | CHECK IN (`cell_ref`, `literal`, `literal_text`) |
| `ax_origine` | TEXT | nullable |
| `rubrique_code` | TEXT | nullable |
| `colonne` | TEXT | nullable |
| `literal_value` | DECIMAL(28,8) | nullable |
| `literal_text` | TEXT | nullable |

Index : `idx_rule_terms_rule` sur `(rule_id, rang, num_seq)`.

### Table `validation_runs` (migration 004)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK → `tenants(id)` |
| `bank_code` | TEXT | NOT NULL |
| `date_annexe` | TEXT | NOT NULL |
| `status` | TEXT | NOT NULL, default `'pending'` |
| `pass_count` | INTEGER | nullable |
| `fail_count` | INTEGER | nullable |
| `skip_count` | INTEGER | nullable |
| `created_at` | DATE | NOT NULL |

Index : `idx_validation_runs_tenant` sur `(tenant_id, created_at)`.

### Table `verdicts` (migration 005)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | UUID | PK |
| `run_id` | UUID | FK → `validation_runs(id)`, ON DELETE CASCADE |
| `rule_id` | UUID | FK → `rules(id)` |
| `annexe_code` | TEXT | NOT NULL |
| `num_regle` | INTEGER | NOT NULL |
| `oper_regle` | TEXT | NOT NULL |
| `status` | TEXT | NOT NULL |
| `lhs` | TEXT | nullable |
| `rhs` | TEXT | nullable |
| `gap` | TEXT | nullable |
| `skip_reason` | TEXT | nullable |
| `created_at` | DATE | NOT NULL |

Index : `idx_verdicts_run` sur `(run_id, status)`, `idx_verdicts_fail` (partiel WHERE `status = 'FAIL'`).

### Table `prompts_registry` (migration 006)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK → `tenants(id)`, nullable |
| `key` | TEXT | NOT NULL |
| `locale` | TEXT | NOT NULL, default `'fr'` |
| `version` | INTEGER | NOT NULL, default `1` |
| `content` | TEXT | NOT NULL |
| `variables` | JSONB | NOT NULL, default `[]` |
| `is_active` | BOOLEAN | NOT NULL, default `true` |
| `created_at` | DATE | NOT NULL |

Contrainte UNIQUE : `(tenant_id, key, locale, version)`. Index : `idx_prompts_registry_key` sur `(key, locale, is_active)`.

### Table `persona_config` (migration 007)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK → `tenants(id)`, nullable |
| `tone` | TEXT | NOT NULL, default `'precise-warm'` |
| `max_length_factual` | INTEGER | NOT NULL, default `150` |
| `max_length_analytical` | INTEGER | NOT NULL, default `800` |
| `confidence_threshold` | DECIMAL(4,3) | NOT NULL, default `0.950` |
| `locale_default` | TEXT | NOT NULL, default `'fr'` |
| `created_at` | DATE | NOT NULL |

### Table `regalica_responses_audit` (migration 008)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK → `tenants(id)`, NOT NULL |
| `session_id` | TEXT | NOT NULL |
| `prompt_key` | TEXT | NOT NULL |
| `user_input` | TEXT | nullable |
| `response_text` | TEXT | NOT NULL |
| `citations` | JSONB | NOT NULL, default `[]` |
| `confidence` | DECIMAL(4,3) | NOT NULL |
| `format_type` | TEXT | NOT NULL, CHECK IN (`factuelle`, `comparative`, `enumerative`, `analytique`, `technique`, `regle_bct`, `ambigue`) |
| `guardrail_passed` | BOOLEAN | NOT NULL, default `true` |
| `tokens_used` | INTEGER | nullable |
| `latency_ms` | INTEGER | nullable |
| `created_at` | DATE | NOT NULL |

Index : `idx_regalica_audit_tenant` sur `(tenant_id, created_at DESC)`.

### Table `kb_chunks` (migration 009)

Créée via SQL raw (pas via `createTable`) pour utiliser le type `vector(768)` de pgvector :

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | UUID | PK, default `gen_random_uuid()` |
| `tenant_id` | UUID | FK → `tenants(id)`, nullable |
| `source_ref` | TEXT | NOT NULL |
| `chunk_text` | TEXT | NOT NULL |
| `embedding` | vector(768) | nullable |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` |

Index : `idx_kb_chunks_tenant` sur `(tenant_id, source_ref)`, `idx_kb_chunks_embedding` (IVFFlat cosinus, lists=100).

### Table `design_tokens` (migration 010)

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | UUID | PK, default UUIDV4 |
| `key` | TEXT | — |
| `value` | TEXT | — |
| `category` | TEXT | CHECK IN (`color`, `spacing`, `radius`, `shadow`, `typography`, `animation`, `layout`, `blur`) |
| `description` | TEXT | nullable |
| `is_active` | BOOLEAN | NOT NULL, default `true` |
| `created_at` | DATE | NOT NULL |

Index UNIQUE : `idx_design_tokens_key_active` sur `key` WHERE `is_active = TRUE`.

---

## Rôles PostgreSQL

| Rôle | Droits | Définition |
|---|---|---|
| `regalica_app` | Propriétaire de la base | Créé par Docker Compose |
| `regalica_readonly` | CONNECT + USAGE + SELECT sur toutes les tables | Créé dans `postgres-init.sql` |

---

## Schéma Drizzle ORM (packages/db)

Le package `packages/db` définit un schéma Drizzle indépendant des migrations Sequelize. Il contient 21 fichiers de schéma exportés via un barrel `index.ts` :

| Fichier de schéma | Table correspondante |
|---|---|
| `users-profile.ts` | `users_profile` |
| `tenants.ts` | `tenants` |
| `entities.ts` | `entities` |
| `annexes.ts` | `annexes` |
| `rules.ts` | `rules` |
| `rule-terms.ts` | `rule_terms` |
| `rules-history.ts` | `rules_history` |
| `annexe-columns.ts` | `annexe_columns` |
| `bct-rubriques.ts` | `bct_rubriques` |
| `thresholds.ts` | `thresholds` |
| `reports.ts` | `reports` |
| `upload-versions.ts` | `upload_versions` |
| `validation-runs.ts` | `validation_runs` |
| `verdicts.ts` | `verdicts` |
| `prompts-registry.ts` | `prompts_registry` |
| `prompts-history.ts` | `prompts_history` |
| `persona-config.ts` | `persona_config` |
| `regalica-responses-audit.ts` | `regalica_responses_audit` |
| `kb-chunks.ts` | `kb_chunks` |
| `design-tokens.ts` | `design_tokens` |

Ce schéma n'est pas utilisé par les routes actives (`apps/api` utilise Sequelize, `apps/web` n'utilise pas de DB directement).

---

## Initialisation Postgres (`postgres-init.sql`)

Exécuté une seule fois au premier démarrage du conteneur Docker :

1. Activation des extensions : `vector`, `pgcrypto`, `pg_trgm`, `btree_gin`
2. Création du rôle `regalica_readonly` (idempotent via `DO $$ BEGIN ... END $$`)
3. Positionnement des variables de session : `app.tenant_id = ''`, `app.user_id = ''`

Les migrations Sequelize prennent le relais pour l'évolution du schéma.
