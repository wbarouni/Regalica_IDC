# ADR 0003 — Peuplement de `validation_runs.synthesis_artifact` via aggregator `regalica/aggregate_t1_result`

- **Status** : Accepted
- **Date** : 2026-05-04
- **Tranche** : 0.7 — synthèse Regalica visible côté Compliance Officer
- **Branche** : `phase-0/brute-refactoring`

## Contexte

Tranche 0.5 a livré côté frontend `T1Deliverables` qui rend `validation_runs.synthesis_artifact.markdown` via ReactMarkdown (orch.py extractMarkdownFromArtifact). Tranche 0 a câblé la route `/finalize` qui accepte `synthesis_artifact` JSONB. Mais entre les deux : chatbot-py POSTe `synthesis_artifact: null` sur chaque finalize, donc la synthèse Regalica ne touche jamais la DB et le Compliance Officer ne voit qu'une `FailsTable` brute après chaque run.

Or la valeur ajoutée différenciante de REGFlow vs un validateur classique est précisément cette synthèse : _« Validation terminée. 935 règles conformes. 2 sévères, 1 arrondi. Le Mode Signature reste verrouillé. »_ — produite par le prompt `regalica/aggregate_t1_result` (seedé migration 072-C, promu actif 072-B).

Cet ADR documente la décision architecturale qui ferme ce dernier gap user-facing.

## Décision

`_call_t1_runner` invoque l'aggregator `regalica/aggregate_t1_result` **après** le succès de `/evaluate` et **avant** le POST `/finalize`. Le markdown produit est inclus dans le payload `synthesis_artifact: { markdown, totals }`.

### 1. Réutilisation du `meta` existant

Le specialist `t1_runner` reçoit déjà via `_invoke_specialist` le `PromptMeta` du bearer (= `regalica/aggregate_t1_result`). Avant Tranche 0.7, ce `meta` était immédiatement `del`-é (« bearer formality »). Tranche 0.7 le réutilise pour appeler le LLM — **zéro nouveau roundtrip DB** vers `prompt_bank`.

### 2. Double appel LLM aggregator (accepté)

Le pipeline `orchestrate()` (orch.py:1228 step 4) appelle déjà `_invoke_aggregator` avec le même prompt pour produire la réponse chat. Tranche 0.7 ajoute un **deuxième appel** dans `_call_t1_runner` pour persister la même markdown en DB.

**Justification du choix (vs refactor du pipeline)** :

- Refactor `orchestrate()` pour finaliser AVANT l'aggregator step casserait le single-emitter pattern Tranche 0 (la responsabilité de finalize reste dans `_call_t1_runner`).
- Différer le finalize via un état partagé entre specialist et aggregator step introduirait du couplage temporel fragile.
- Le coût LLM est négligeable : `gemini-2.5-flash`, 2-3 phrases, output_contract='string'. Le prompt cache côté Gemini absorbe partiellement le coût.

**Coût accepté** : ~150-200 tokens supplémentaires par run, ~50ms latence supplémentaire. À comparer aux ~1200ms de l'évaluation BCT.

### 3. Best-effort sur exception aggregator

Si l'aggregator échoue (Gemini 503, JSON malformé, timeout réseau) :

- `_invoke_t1_synthesis_aggregator` retourne `None`
- Log structuré `synthesis_aggregator_failed run_id=... error=...`
- `_finalize_t1_success_best_effort` reçoit `synthesis_markdown=None` → ne pose pas la clé `synthesis_artifact` dans le payload (garde le défaut `None` du builder)
- Le run finalise quand même `status='completed'` avec KPIs + fail_details intacts

**Raison** : la valeur ajoutée principale (KPIs, FailsTable, status terminal, SSE complete) reste intacte. Une synthèse manquante est un défaut visuel mineur, pas un blocker workflow.

### 4. Shape JSON canonique

```json
{
  "markdown": "Validation terminée. 935 règles conformes...",
  "totals": {
    "pass": 935,
    "fail_severe": 2,
    "fail_rounding": 1,
    "conformity_rate": 0.9968
  }
}
```

- `markdown` : sortie brute de l'aggregator, jamais transformée. Si `output_contract='string'` (cas actuel), filtrée via `_clean_thought_leakage` pour parité avec le step downstream.
- `totals` : 4 champs canoniques. `conformity_rate` calculé localement (pas relu du résultat moteur — pour rester self-contained).
- `conformity_rate = None` quand `pass + fail_severe + fail_rounding == 0` (pas de règle évaluée — cas T1_NO_VERDICTS).
- Arrondi 4 décimales (matche la précision NUMERIC(5,4) de `validation_runs.conformity_rate`).

### 5. Cas T1_NO_VERDICTS

Quand `rules_applicable_total == 0`, `_finalize_t1_success_best_effort` finalise avec `status='failed'` et `error_code='t1_no_verdicts'` (Tranche 0). Dans ce cas, **`synthesis_artifact` reste null** même si l'aggregator a produit du markdown — pas de synthèse pertinente quand le moteur n'a évalué aucune règle.

### 6. Cas T0 KO et T1RejectionError / EvaluationError

`_call_t1_runner` court-circuite avant d'invoquer l'aggregator :

- T0 KO (no_active_run / no_api_client) : pas d'aggregator call
- T1RejectionError : `_finalize_t1_failure_best_effort` finalise sans synthesis_artifact
- EvaluationError / Timeout : idem

Cohérent avec Tranche 0 — pas de synthèse à produire si pas de verdicts.

## Code

Trois symboles publics dans `apps/chatbot-py/app/services/orchestrator.py` :

- `_invoke_t1_synthesis_aggregator(meta, ctx, t1_output) -> str | None` — appel LLM, gestion exception, retour markdown ou None
- `_build_synthesis_artifact(markdown, result) -> dict` — construit le JSON canonique
- `_finalize_t1_success_best_effort(ctx, result, synthesis_markdown=None)` — étend la signature existante avec un kwarg optionnel

Deux fichiers de tests :

- `apps/chatbot-py/tests/test_aggregator_synthesis.py` (NEW, 11 tests) — couverture pure du helper et du builder
- `apps/chatbot-py/tests/test_t1_runner_finalize.py` (EXTEND, +2 tests) — vérifie que finalize_run reçoit synthesis_artifact peuplé en happy path et stays null sur aggregator failure

## Anti-règles respectées (Tranche 0.7)

- **Zéro hardcoding** : modèle Gemini, température, max_tokens, thinking_enabled, template body tous lus depuis le `PromptMeta` row. Le seul littéral en code est `"launch_validation"` (intent_type doctrinal qui doit matcher le seed migration 072 — non configurable par essence).
- **Zéro fallback markdown en code** : pas de "if synthesis is None: synthesis = '...'". `None` reste `None`, le builder ne pose pas la clé.
- **Zéro régression** : 1142 pytest passed (vs 1130 prior), 113 vitest, 193 jest préservés.
- **Zéro nouveau prompt** : réutilise `regalica/aggregate_t1_result` existant.
- **Zéro modification du contrat `/finalize` Tranche 0** : zod `synthesis_artifact: z.record(z.unknown()).nullable().optional()` accepte la nouvelle shape sans changement.

## Conséquences

### Positives

- Le Compliance Officer voit une synthèse markdown rendue (titres, gras, listes) après chaque run réussi.
- La démo Attijari montre la synthèse Regalica en français bancaire.
- Persistence DB → audit trail + replay possible (la synthèse historique est rejouable même si l'aggregator change).
- Pas de couplage temporel entre specialist et aggregator step — Tranche 0 single-writer pattern préservé.

### Négatives / acceptées

- Double appel LLM aggregator par run (~150-200 tokens supplémentaires, ~50ms).
- Si l'aggregator change de prompt entre les 2 appels (ex: hot reload), le markdown DB peut diverger de la réponse chat. Probabilité quasi-nulle (le `meta` est capturé au début de `_call_t1_runner`).

### Hors scope (Tranche 1+)

- Investigator → `deliverable_c_artifact` (Tranche 2)
- Synthèse multi-langue (FR/EN/AR) — la synthèse actuelle est FR uniquement (langue du prompt seed)
- Streaming markdown vers le frontend pendant la génération (Tranche 1+ refonte SSE)

## Vérification end-to-end manuelle

1. Apply migration 073 + restart full stack (`pnpm dev`)
2. Upload XML 2026-02-28 → click "Lancer"
3. Attendre T0 done (ribbon)
4. Chat : "lance la validation"
5. **Attendu Tranche 0.7** :
   - DB : `SELECT synthesis_artifact FROM validation_runs WHERE id=$run_id` → `{"markdown": "Validation terminée...", "totals": {...}}`
   - Frontend : T1Deliverables affiche le markdown rendu (Livrable A)

## Références

- Plan Tranche 0.7 : prompt utilisateur 2026-05-04
- ADR 0001 : single-writer/single-emitter `/finalize`
- ADR 0002 : (réservé)
- Migration 072-C : seed `regalica/aggregate_t1_result`
- Migration 072-B : promotion à `status='active'`
- Code : `apps/chatbot-py/app/services/orchestrator.py:_invoke_t1_synthesis_aggregator + _build_synthesis_artifact + _finalize_t1_success_best_effort`
- Frontend lecteur : `apps/web/src/pages/Workspace.tsx:T1Deliverables` (Tranche 0.5)

## Signataires

- **Auteur** : Claude Opus 4.7 (1M context) sur instruction CEO ALGORIA Factory.
- **Validateur métier** : Wissem Barouni (CEO ALGORIA Factory, Head of Financial & Regulatory Reporting).
- **Date d'acceptation** : 2026-05-04 (commit Tranche 0.7).
