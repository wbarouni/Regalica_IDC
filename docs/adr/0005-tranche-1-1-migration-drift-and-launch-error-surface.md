# ADR 0005 — Tranche 1.1 : drift de migrations + surface d'erreur de lancement (silent-swallow close)

- **Status** : Accepted
- **Date** : 2026-05-04
- **Tranche** : 1.1 (hotfix bouton « Lancer la validation » + dette UX silent-swallow)
- **Branche** : `phase-0/brute-refactoring`
- **Commits** : `19da87f` (logger pino-pretty dev-only), `a7381b5` (cet ADR + LaunchErrorArtefact)

## Contexte

L'opérateur rapporte que le bouton « LANCER LA VALIDATION » de Workspace.tsx ne déclenche rien à l'écran. Audit network du preview Vite :

```
494: POST /api/tenants/d3a7c6e6-…/uploads        → 200 OK
495: OPTIONS /api/tenants/d3a7c6e6-…/runs        → 204 No Content
496-500: POST /api/tenants/d3a7c6e6-…/runs       → 501 Not Implemented (×4)
```

Le bouton émet bien la requête. L'API renvoie 501. `apps/api/src/db/errors.ts:36-52` ne retourne 501 que sur les SQLSTATE Postgres `42P01` (undefined_table) ou `42703` (undefined_column). L'INSERT de la route `runs.ts:154-172` référence `correlation_id` (colonne ajoutée par migration 073).

Inspection schéma :

| Item attendu                      | État observé                     |
| --------------------------------- | -------------------------------- |
| `schema_migrations` (last id)     | 063 (au lieu de 073 attendu)     |
| `validation_runs.correlation_id`  | ABSENT                           |
| `validation_runs.error_code`      | ABSENT                           |
| `run_error_codes` (table)         | ABSENT                           |
| `intent_specialists` (table)      | PRÉSENT (10 rows seedées active) |
| `intent_specialist_bearers` (tbl) | PRÉSENT (3 rows)                 |

Diagnostic : drift majeur. Les migrations 064-072 ont été partiellement appliquées hors-runner (objets et data en place pour 064/065/066), tandis que 068-073 sont strictement absentes. La cause originelle de cette divergence (commit Claude antérieur, intervention manuelle psql, migration runner contournée) n'est pas réimputable depuis le repo et n'est pas tranchée par cet ADR — la décision documentée ici porte sur la résolution.

Côté frontend, indépendamment du 501 backend, deux chemins masquent toute erreur de lancement :

```tsx
// apps/web/src/pages/Workspace.tsx:414-416 (avant patch)
.catch(() => {
  // useStartRun stored the error code.
});

// apps/web/src/pages/Workspace.tsx:771 (avant patch)
{!uploading && pending === null && error !== null && ( ... )}
```

Le `.catch` est silencieux. Le rendu d'erreur dans `<UploadStagedRow>` est gated sur `pendingUpload === null` — or `pendingUpload` reste non-null tant que `setPendingUpload(null)` n'est pas appelé dans le `.then()`. Donc en cas d'échec : zéro feedback visuel à l'opérateur.

## Décision

Tranche 1.1 livre **deux fixes atomiques** qui ferment la cause racine ET la dette UX :

### Décision A — Synchronisation DB locale par back-fill catalog + migrate:up

**Étape 1** — back-fill `schema_migrations` pour 064/065/066 avec checksums calculés depuis disque (sha256 du contenu de fichier). Ces 3 migrations ont leurs effets schéma+data déjà en place (vérifié : 10 intents seedés `status='active'`, 3 bearers, table+policy+index présents). Re-jouer leur SQL via le runner échoue sur les non-idempotences (`CREATE POLICY` sans `IF NOT EXISTS` PG <16). Inscription catalog uniquement.

**Étape 2** — `pnpm --filter @regflow/api migrate:up` applique 068, 069, 070, 071, 072, 073 proprement. Toutes idempotentes (vérifié pré-flight : `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `ON CONFLICT DO UPDATE`, `WHERE NOT EXISTS`). Aucune ne touche aux données déjà présentes.

**Vérification fonctionnelle** post-migration via script smoke ad-hoc :

```
POST http://localhost:3000/api/tenants/<tenant>/runs
status 201
body {"data":{"run_id":"019df381-5850-7fc4-bcc8-008fd3a03539","status":"running"}}
```

Bouton débloqué end-to-end.

**Note explicite — items GUC-gated non promus** : migrations 072-A et 072-C insèrent `intent_specialists/launch_validation` et `prompt_bank/regalica/aggregate_t1_result` mais sont gated sur les operator GUCs `app.seed_author_user_id`, `app.seed_tenant_id`, `app.seed_valid_from`. Le runner ne les pose pas (no-op silencieux par `RAISE NOTICE` — by-design pour CI). Ces deux items concernent le chat-driven dispatch (« lance la validation » via Regalica), **pas** le bouton click upload. Hors scope hotfix. Promotion via session psql opérateur avec les GUCs canoniques, traçable dans l'audit log de migration 072.

### Décision B — Fermeture silent-swallow par `<LaunchErrorArtefact>` cousin de `<EngineErrorArtefact>` (Option A du brief)

Mirror du pattern Tranche 1 fix #3 (commit `6b2c0e1`) :

- **Composant nouveau** `apps/web/src/components/LaunchErrorArtefact.tsx` — vermilion variant tokens, `<Artefact type="notification">`, `role="alert"`, i18n via `error.launch.<code>` avec fallback sur `error.launch.unknown`.
- **Rendu dans le thread** Workspace (et non dans `<UploadStagedRow>`) → visible **indépendamment** de `pendingUpload`. C'est précisément le point de fermeture de la dette : la condition `pending === null` du staged row n'a plus aucun rôle dans la surface d'erreur de lancement.
- **Refactor `useStartRun.error`** : `string | null` → `{ code, message } | null`. Le code seul (machine-readable) ne suffit pas à un opérateur qui rédige un report ; le message brut est conservé en preuve technique sans surfacer comme primary copy.
- **CODE TABLE documenté** dans le docblock `useStartRun.ts` — 10 codes audit-traceable : `MISSING_TENANT_ID/API_URL/USER_ID` (config frontend), `INVALID_BODY/PRIMARY_NOT_IN_LIST/UPLOAD_NOT_OWNED/TABLE_NOT_IMPLEMENTED/COLUMN_NOT_FOUND/INTERNAL` (route `runs.ts` POST), `HTTP_ERROR` (transport `fetchApi`), `UNKNOWN` (catch-all).

**Choix Option A vs Option B (élévation `startError` avec suppression de la condition `pending === null`)** : Option A retenue. Justifications :

1. Cohérence stricte avec le pattern existant `EngineErrorArtefact` — même primitive, même variant tokens, même role=alert, même mécanisme i18n+fallback. Zéro nouveau pattern UI introduit.
2. Persistance dans le thread (l'opérateur peut scroller son historique de session pour voir ce qui a échoué quand) versus rendu transient dans le staged row.
3. Découplage strict de `<UploadStagedRow>` qui reste focused sur le file UX (drag/drop staté, progress bar, cancel/launch buttons). Single responsibility.

### Décision C — Pas d'alignement `error.launch.*` sur `run_error_codes.json`

Le brief mentionne « 6 codes minimum si `useStartRun` est aligné sur run_error_codes ». Audit lecture : aucun chevauchement réel.

| Sphère                                              | Codes                                                                                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `error.engine.*` (engine T0/T1 outcomes)            | `t0_xsd_invalid`, `t0_embedded_fail`, `t0_parse_error`, `t1_engine_exception`, `t1_no_verdicts`, `t1_timeout`                                            |
| `error.launch.*` (route /runs + config + transport) | `MISSING_*`, `INVALID_BODY`, `PRIMARY_NOT_IN_LIST`, `UPLOAD_NOT_OWNED`, `TABLE_NOT_IMPLEMENTED`, `COLUMN_NOT_FOUND`, `INTERNAL`, `HTTP_ERROR`, `UNKNOWN` |

Les codes engine sont des résultats de validation produits par le moteur RDG en aval ; les codes launch sont des erreurs de bootstrap (HTTP route + zod + schéma) avant même que le moteur ne tourne. Un alignement éditorial créerait un faux échafaudage. La source of truth `apps/api/seeds/run_error_codes.json` reste exclusivement pour `error.engine.*`.

## Conséquences

### Positives

- Bouton « Lancer la validation » fonctionnel end-to-end sur la base locale (vérifié smoke 201 Created).
- `schema_migrations` synchronisée à 82 rows, 0 drift (verify catalog OK).
- Aucune erreur de lancement future ne peut plus être silencieusement avalée — l'artefact rendu dans le thread est observable même en présence d'un fichier staged.
- 10 nouveaux tests vitest (LaunchErrorArtefact × 9 + useStartRun shape × 1), couverture FR/EN/AR + fallback + role=alert.
- Doctrine REGFlow respectée : zéro hardcoding, zéro mock production, zéro nouvelle dépendance, zéro régression (150 vitest, 193 jest, 1142 pytest préservés ailleurs).

### Négatives

- Le drift initial (064-072 hors-runner, 073 absent) reste un risque structurel non couvert par cette tranche. Cf. section « Prochaine étape » ci-dessous.
- Les items GUC-gated `launch_validation` intent + `aggregate_t1_result` prompt restent à promouvoir manuellement par session psql opérateur. Documenté ci-dessus, pas de couverture automatisée dans cette PR.
- L'opérateur peut continuer à recevoir des erreurs 501 si le drift se reproduit lors d'un futur reset DB sans reapply complet — mais désormais il les voit via `<LaunchErrorArtefact code="COLUMN_NOT_FOUND">` et peut agir (label localisé : « Schéma base de données désynchronisé — migration manquante. Contactez votre administrateur. »).

### Neutres

- L'amplification du shape `useStartRun.error` de `string` à `{code, message}` casse l'API publique du hook. Aucun consommateur externe (le hook est interne au monorepo, audit `Grep`) ; les 2 sites internes (`Workspace.tsx`, `useStartRun.test.ts`) sont mis à jour dans le même commit.

## Prochaine étape — Tranche 1.2 Environment parity guard (PR séparée)

Trois mécanismes structurels doivent être ajoutés pour éliminer la classe de bug « drift de migrations local » :

1. **Auto-migration au démarrage** (opt-in via env var `REGFLOW_AUTO_MIGRATE_ON_BOOT=true`) — si activé, `apps/api/src/index.ts` exécute `runUp()` avant `app.listen()`. Empêche l'opérateur de booter un serveur sur un schéma désynchronisé.
2. **Garde-fou serveur boot** : si `migrate:status` détecte des pending au démarrage ET `REGFLOW_REQUIRE_CLEAN_SCHEMA=true`, échec process avec exit code 1 et message structurel pointant l'opérateur vers `pnpm migrate:up`. Évite le 501 silent.
3. **Health check `/api/health/migrations`** — endpoint qui retourne `{ applied: number, pending: string[], drifted: string[] }` pour monitoring/CI/ops. Permet à n'importe quel orchestrateur (docker-compose healthcheck, k8s readinessProbe) de bloquer le rollout tant que la base n'est pas à jour.

Scope plus large que ce hotfix UX (touche le démarrage serveur, le workflow CI, les contrats Docker). PR séparée.

## Vérification

Local :

- `pnpm --filter @regflow/web test --run` → 20 files / 150 tests passed (was 140, +10 net : 9 LaunchErrorArtefact + 1 useStartRun).
- `pnpm --filter @regflow/web typecheck` → green.
- `pnpm format:check` → green.
- `pnpm -r --if-present lint` → green.
- `bash tools/check-no-hardcoding.sh` → `[OK] No hardcoding in applicative code.`
- `bash tools/check-no-residual-debt.sh` → `[OK] No residual debt found.`
- `bash tools/check-forbidden-deps.sh` → `[OK] No forbidden dependency found.`
- POST /runs smoke (curl-equivalent ts script) → 201 Created.

CI (commit `a7381b5`) : 14/14 vert.

## Documents liés

- ADR 0001 — Finalize route + idempotence (Tranche 0).
- ADR 0003 — Synthesis artifact aggregator (Tranche 0.7).
- ADR 0004 — Tranche 1 réduite, pas de re-skin.
- `apps/api/migrations/073_finalize_pipeline.sql` — la migration enfin appliquée.
- `apps/api/src/db/errors.ts` — `handleDbError` qui transforme 42P01/42703 en 501 (intentionnel : signal de drift).
- `apps/web/src/components/EngineErrorArtefact.tsx` (commit `6b2c0e1`) — pattern source mirroré.
- `apps/web/src/locales/__tests__/keys-coverage.test.ts` — garde-fou parité fr/en/ar (les 33 nouvelles leaves `error.launch.*` sont validées par lui).
