# ADR 0001 — `POST /api/engine/runs/:runId/finalize` : single-writer, single-emitter, idempotence canonique

- **Status** : Accepted
- **Date** : 2026-05-04
- **Tranche** : 0 — fermeture transactionnelle E2E T0+T1
- **Branche** : `phase-0/brute-refactoring`
- **Migration de référence** : `apps/api/migrations/073_finalize_pipeline.sql`

## Contexte

Avant Tranche 0, un `validation_run` lancé depuis l'UI atteignait correctement la fin du T0 (3 agents `ingestor_xml` / `dependency` / `temporal`, ribbon SSE animée), puis **restait bloqué `status='running'` indéfiniment**. Trois causes structurelles étaient prouvées par audit :

1. **Aucun chemin de code n'UPDATE `validation_runs`** post-création (grep production = 0 hit).
2. **`_SpecialistContext.api_client = None`** au site de construction de `orchestrate()` → `_call_t1_runner` court-circuitait à `error="no_api_client"`. La conversation « lance la validation » répondait toujours « Le client moteur n'est pas configuré ».
3. **`emitComplete` / `emitError` n'avaient aucun caller**. Le frontend écoutait l'événement SSE `complete` (Workspace.tsx:301) mais le signal ne partait jamais.

Cet ADR documente la décision architecturale qui ferme ces trois gaps en une route unique.

## Décision

Introduire une route unique `POST /api/engine/runs/:runId/finalize` (engineAuth) responsable de **trois invariants absolus** :

### 1. Single-writer pattern (validation_runs)

Seule cette route peut faire transitionner `validation_runs.status` hors de `'running'`. Toute autre tentative d'`UPDATE validation_runs SET status` dans le code applicatif est interdite (vérifié par grep + revue de code).

L'UPDATE est complet et atomique dans une transaction : `status`, `total_pass`, `total_fail_severe`, `total_fail_rounding`, `total_rules_evaluated`, `conformity_rate`, `execution_time_ms`, `completed_at`, `step1/2/3_*_status`, `step1/2/3_*_duration_ms`, `error_code`, `synthesis_artifact`. Le bulk INSERT `validation_fail_details` (single-statement multi-row, jamais en boucle) accompagne le UPDATE dans la même transaction.

### 2. Single-emitter pattern (SSE complete / error)

Seule cette route émet `emitComplete(runId, payload)` ou `emitError(runId, payload)`. L'événement `agent_step` reste émis par `POST /api/engine/runs/:runId/agent-steps/:stepId` (existant, inchangé).

Conséquence : un client SSE recevra **exactement un seul** événement terminal par run.

### 3. Idempotence canonique

Mécanique stricte basée sur un verrou ligne PostgreSQL et une comparaison sur 5 champs canoniques.

#### 3.1 Verrou ligne

```sql
SELECT status, total_pass, total_fail_severe, total_fail_rounding, error_code
  FROM validation_runs WHERE id = $1 AND tenant_id = $2 FOR UPDATE
```

`SELECT ... FOR UPDATE` sérialise les retries concurrents sur la même run. Sans lui, deux POST simultanés depuis chatbot-py (retry réseau collision) pourraient soit double-UPDATE soit déclencher deux SSE.

#### 3.2 Branchement post-lock

| État stocké                                              | Décision                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `status = 'running'`                                     | Apply UPDATE complet + bulk INSERT fail_items + emit SSE complete/error → **200**                               |
| `status` terminal AND 5 champs canoniques **identiques** | **200 no-op silencieux** (pas de SSE re-émis, pas de fail_details ré-insérés). Log `finalize.idempotent.no_op`. |
| `status` terminal AND ≥1 champ canonique **divergent**   | **409 Conflict** avec body listant les divergences `{stored, requested}`                                        |

#### 3.3 Champs canoniques

La comparaison d'idempotence porte exclusivement sur ces 5 champs :

```
(status, total_pass, total_fail_severe, total_fail_rounding, error_code)
```

Tout autre champ (`completed_at`, `conformity_rate`, totaux skipped*\*, `step1/2/3*\*`, `synthesis_artifact`, `correlation_id`, `duration_ms`) est **EXCLU** du diff canonique.

### 4. Idempotence canonique — exclusion de `correlation_id` du diff

> **Le diff de comparaison entre payload reçu et état stocké porte exclusivement sur les 5 champs `(status, total_pass, total_fail_severe, total_fail_rounding, error_code)`. `correlation_id` est metadata de traçabilité, exclu du diff canonique.** Un retry réseau avec même `correlation_id` et même payload → 200 no-op. Un nouveau client avec `correlation_id` différent et même payload canonique → 200 no-op également (pas de double émission SSE). Cette règle est implémentée dans `apps/api/src/domain/finalize.ts` fonction `isCanonicallyIdentical()`.

**Justification.** Un retry depuis chatbot-py réutilise le même `correlation_id` — il aurait toujours matché. Mais un _autre_ client (rejoue manuel par opérateur avec une nouvelle UUID) re-finalisant avec le même payload DOIT aussi être un no-op — sinon on double-émet le frame SSE `complete` et on confond le frontend. Traiter `correlation_id` comme metadata (et non comme identité) est la seule règle cohérente.

Le code (`apps/api/src/domain/finalize.ts`) :

- Le type `CanonicalState` ne contient **pas** `correlation_id` (compile-time guard).
- `projectCanonicalFromPayload(body)` retourne uniquement les 5 champs.
- `isCanonicallyIdentical(stored, requested)` compare strictement ces 5 champs.
- Test unitaire dédié (`apps/api/test/finalize.test.ts`) : « _a payload with a different correlation_id but identical 5 canonical fields projects to the same state_ » → assert TRUE.

### 5. Registre `run_error_codes` data-driven

`error_code` est un enum DB seedé via JSON canonique (`apps/api/seeds/run_error_codes.json`). 6 codes Tranche 0 :

- `t0_xsd_invalid`, `t0_embedded_fail`, `t0_parse_error` (T0 KO)
- `t1_engine_exception`, `t1_no_verdicts`, `t1_timeout` (T1 KO)

Migration 073 crée la table `run_error_codes(code PK, label_fr/en/ar, severity)` + FK `validation_runs.error_code → run_error_codes(code) ON DELETE RESTRICT`. RLS open SELECT, REVOKE DML hors superuser.

**Anti-règle « zéro if/elif sur valeurs métier dispersé »** : toute résolution `error_code` passe par `apps/chatbot-py/app/domain/error_resolver.py` (`ErrorResolver.from_t1_exception`, `from_t0_agent`, etc.). Aucun switch hardcodé sur des strings d'erreur ailleurs.

## Validation cross-field zod (au niveau `/finalize`)

Le payload subit une refinement zod stricte avant la transaction :

- `status='completed'` ⇒ `step3_rdg_status='pass'` ET aucune step antérieure `'fail'` ET `error_code IS NULL` ET `totals` non-null
- `status='failed'` ⇒ `error_code IS NOT NULL` (FK validée downstream contre `run_error_codes`)
- BCT statuses ∈ `{'pass','fail'}` strict (jamais `'skipped'` — décision CEO Tranche 0 #3)
- `aborted` hors scope cette tranche (CEO #1)

Échec → `422 INVALID_FINALIZE_BODY` avec `details: [{path, message}]`.

## Propagation `correlation_id`

Header `X-Correlation-Id` propagé end-to-end :

- Generated by `correlationIdMiddleware` (Node) ou `CorrelationIdMiddleware` (chatbot-py) si absent côté client.
- Stocké dans `res.locals.correlationId` (Node) ou `request.state.correlation_id` (chatbot-py).
- Persisté en colonne `validation_runs.correlation_id UUID NULL` (migration 073) au moment du `INSERT validation_runs` dans `runs.ts`.
- Inclus dans les payloads SSE et les logs JSON via `req.log.child()` / `structlog.contextvars.bind_contextvars`.
- UUID v4 strict — UUID v7 (timestamp-bearing) rejeté pour ne pas leaker l'horloge serveur.

## Choix de tests : HTTP-level, pas Playwright

Trois scénarios E2E sont validés par `jest + supertest + EventSource client + asserts SQL` (pattern `setupRoutesContext` + DB réelle déjà éprouvé dans `engine.evaluate.test.ts`) :

- **Scénario A** — happy completed : POST /finalize avec status='completed' → DB UPDATE complet + SSE `complete` UNIQUE.
- **Scénario B** — T0 KO : POST /finalize avec status='failed', error_code='t0_xsd_invalid' → DB UPDATE + SSE `error`.
- **Scénario C** — T1 exception : POST /finalize avec status='failed', error_code='t1_engine_exception' → DB UPDATE + SSE `error`.
- **Idempotence dual-call** : 2 POST identiques → 200 + 200 no-op, SSE émis une seule fois.
- **Conflict** : 2 POST divergents → 200 + 409 avec body diff explicite.
- **Canonical exclusion correlation_id** : 2 POST avec `X-Correlation-Id` différents mais 5 champs identiques → 200 + 200 no-op.

Playwright n'est PAS introduit cette tranche (CEO Q2). Ajout = nouveau framework + browser binaries en CI + Docker headless + workflow job. Ce coût d'infra (~1-2 jours) sort du scope « fermeture transactionnelle ». Les tests HTTP-level apportent la même preuve mécanique end-to-end (HTTP → DB → SSE → DB) sans pixel.

## Conséquences

### Positives

- Un run lancé atteint _vraiment_ `status='completed'` ou `status='failed'`, avec verdict KPIs visibles côté frontend.
- L'idempotence pratique tolère les retries réseau sans bruit opérationnel (no-op silencieux).
- Le 409 Conflict surface explicitement les bugs d'orchestration (deux finalisations divergentes pour la même run).
- L'enum `run_error_codes` est data-driven : ajouter un code = (1) entrée seed JSON + (2) nouvelle migration + (3) extension du `_T0_AGENT_TO_CODE` ou ajout méthode `ErrorResolver.from_*`. Aucun switch dispersé.
- L'observabilité socle (correlation_id end-to-end + logs JSON) prépare le terrain pour Tranche 0.5 (Prometheus métriques) et Tranche 1+ (corrélation Grafana / Loki).

### Négatives / acceptées

- chatbot-py charge maintenant `run_error_codes` au démarrage (1 SELECT, cache process-life). Une mise à jour du registre exige un redéploiement — accepté car les codes sont seed-only.
- Un finalize POST échoué (réseau) côté chatbot-py est best-effort : log `finalize_run_post_*_failed`, jamais re-raise. Le run reste `'running'` jusqu'au prochain retry. Garantie : la canonical-diff côté Node garantit qu'un retry ultérieur reconverge.
- Les tests `runs.test.ts` et `engine.agent-steps.test.ts` montent désormais en `setupRoutesContext(73)` au lieu de 55. Pas de régression mais coût CI marginal.

### Hors scope (Tranche 0.5+)

- `messages.run_id` colonne (audit trail chat ↔ run)
- Persistence des messages utilisateur (chat est aujourd'hui one-sided : seules les réponses Regalica sont persistées)
- Notifications INSERT (B11 audit)
- Idempotency-Key header pattern (le verrou ligne suffit)
- Prometheus `/metrics` endpoint
- Playwright E2E pixel-perfect

## Références

- Plan Tranche 0 : `C:\Users\wisse\.claude\plans\ouvrir-polished-pixel.md`
- Audit E2E pré-Tranche 0 (chat) : sections « EXECUTIVE VERDICT » + « PROOF-BASED END-TO-END MAP » du tour précédent
- Migration : `apps/api/migrations/073_finalize_pipeline.sql`
- Seed : `apps/api/seeds/run_error_codes.json`
- Modules pure : `apps/api/src/domain/conformity.ts`, `apps/api/src/domain/finalize.ts`
- Handler : `apps/api/src/routes/engine.ts` (route `router.post('/runs/:runId/finalize', ...)`)
- Tests intégration : `apps/api/tests/routes/engine.finalize.test.ts` (11 tests)
- chatbot-py wiring : `apps/chatbot-py/app/services/orchestrator.py:_call_t1_runner` + `_finalize_t1_*_best_effort`
- chatbot-py error resolver : `apps/chatbot-py/app/domain/error_resolver.py`
- Frontend : `apps/web/src/hooks/useChat.ts` (signature `useChat({ runId })`)

## Signataires

- **Auteur** : Claude Opus 4.7 (1M context) sur instruction CEO ALGORIA Factory.
- **Validateur métier** : Wissem Barouni (CEO ALGORIA Factory, Head of Financial & Regulatory Reporting).
- **Date d'acceptation** : 2026-05-04 (commit Tranche 0).
