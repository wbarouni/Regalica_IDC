# 06 — Agents IA existants

Deux catégories d'agents coexistent : les agents déterministes TypeScript (sans appel LLM) et les agents LLM Python (via Gemini 2.5 Flash).

---

## Agents déterministes TypeScript

Ces agents sont présents en double : dans `apps/api/src/agents/` (version Express) et dans `apps/web/src/lib/agents/` (version Next.js, copiée). La logique est identique dans les deux localisations.

### Structure Validator

| Attribut | Valeur |
|---|---|
| Localisation (api) | `apps/api/src/agents/structure-validator/index.ts` |
| Localisation (web) | `apps/web/src/lib/agents/structure-validator.ts` |
| Appel LLM | Non |
| Entrée | Contenu XML brut (string) |
| Sortie | `{ valid: boolean, errors: Array<{ dimension, message, path? }> }` |

Valide la structure d'un fichier XML BCT selon ses dimensions réglementaires (éléments requis, formats attendus).

---

### BCT XML Parser

| Attribut | Valeur |
|---|---|
| Localisation (api) | `apps/api/src/agents/ingestor/bct-xml-parser.ts` |
| Localisation (web) | `apps/web/src/lib/agents/bct-xml-parser.ts` |
| Appel LLM | Non |
| Entrée | Contenu XML brut (string) |
| Sortie | `ParsedXml` : annexeCode normalisé + matrice de cellules |

Extrait `<CodeAnnexe>` et les données tabulaires (rubrique → colonne → valeur) du XML BCT. L'`annexeCode` retourné est normalisé (zéros en tête supprimés).

---

### RDG Evaluator

| Attribut | Valeur |
|---|---|
| Localisation (api) | `apps/api/src/agents/evaluator/` (index.ts, phases.ts, types.ts) |
| Localisation (web) | `apps/web/src/lib/agents/evaluator/` (index.ts, phases.ts, types.ts) |
| Appel LLM | Non |
| Précision décimale | `Decimal.js { precision: 38, rounding: ROUND_HALF_EVEN }` |
| Entrée | `Map<filename, xmlContent>`, `RuleWithTerms[]`, `tenantId` |
| Sortie | `EvaluationResult` : runId, pass, fail, skip, verdicts[], durationMs |

#### Pipeline en 5 phases

| Phase | Fonction | Description |
|---|---|---|
| A | `phaseA(xmlFiles)` | Parse tous les XMLs → `CellMatrix` (Map annexeCode → Map rubrique → Map colonne → Decimal) |
| B | `phaseB(rules)` | Groupement et validation des règles (sans calcul) |
| — | `resolveTerms(terms, cells)` | Résolution de chaque terme vers une valeur Decimal ou un motif de skip |
| D | `phaseD(resolved)` | Agrégation des termes par rang (RHS rang 1 vs LHS rang 2+) |
| E | `phaseE(rule, aggResult)` | Comparaison LHS op RHS → verdict PASS/FAIL/SKIPPED_* |

#### Types de verdict (`VerdictStatus`)

| Status | Condition |
|---|---|
| `PASS` | La règle est vérifiée |
| `FAIL` | La règle n'est pas vérifiée (écart non nul) |
| `SKIPPED_MISSING_ANNEXE` | L'annexe source d'un terme n'est pas dans les fichiers uploadés |
| `SKIPPED_MISSING_RUBRIQUE` | La rubrique référencée n'existe pas dans la CellMatrix |
| `SKIPPED_MISSING_COLONNE` | La colonne référencée n'existe pas pour cette rubrique |
| `SKIPPED_CONDITIONAL` | Zone non interprétable sans documentation additionnelle |
| `SKIPPED_UNSUPPORTED_OP` | Opérateur de règle non supporté |
| `SKIPPED_LITERAL_TEXT` | Le terme est un texte littéral (non numérique) |

#### Baseline golden (immuable)

Sur 5 fichiers XML (bank-23/2024-03-31, annexes 00, 01, 02, 51, 640) :

| Métrique | Valeur |
|---|---|
| Total règles | 4 611 |
| PASS | 937 |
| FAIL | 2 |
| SKIP | 3 672 |

Les 2 FAIL portent sur les règles 266 et 267 de l'annexe 630 (contrôles croisés bilan PA030202000000).

---

## Agents LLM Python (`apps/chatbot-py/app/agents/`)

Tous les agents héritent de `BaseAgent` et reçoivent un `LLMClient` en injection. L'agent `OrchestratorAgent` ne fait pas d'appel LLM direct — il délègue aux agents spécialistes.

### LLM utilisé

| Paramètre | Valeur |
|---|---|
| Modèle | `gemini-2.5-flash` |
| Température | 0.1 |
| Précision décimale Python | `decimal.getcontext().prec = 38` |
| Seuil de confiance | 0.95 (critique) |

---

### BaseAgent (`agents/base.py`)

Classe abstraite. Définit :
- `execute(input_data, ctx) → AgentResult` (méthode abstraite)
- `_validate_response(resp, critical=True)` — guardrail : citations non vides + confiance ≥ 0.95
- `AgentContext` : `tenant_id`, `run_id?`, `user_id?`
- `AgentResult` : `status`, `output`, `citations`, `confidence`, `tokens_used`, `latency_ms`, `error?`

---

### InvestigatorAgent (`agents/investigator.py`)

| Attribut | Valeur |
|---|---|
| `agent_id` | `"investigator"` |
| Appel LLM | Oui (Gemini, JSON mode) |
| Entrée | `InvestigatorInput` : rule_id, annexe_code, num_regle, oper_regle, lhs, rhs, gap, rubrique_codes, rule_text?, context_snippets |
| Sortie | `{ explanation_fr, severity, suggested_action }` |

Génère une explication en français de l'écart FAIL pour une règle BCT donnée.

---

### ReporterAgent (`agents/reporter.py`)

| Attribut | Valeur |
|---|---|
| `agent_id` | `"reporter"` |
| Appel LLM | Oui (Gemini) |
| Entrée | `ValidationRunSummary` : résumé complet du run avec FAILs enrichis par InvestigatorAgent |
| Sortie | Rapport de conformité structuré |

Génère le rapport de conformité final agrégant les résultats de tous les agents.

---

### RuleLearnerAgent (`agents/rule_learner.py`)

| Attribut | Valeur |
|---|---|
| `agent_id` | `"rule_learner"` |
| Appel LLM | Zone non interprétable sans lecture complète du fichier |
| Rôle apparent | Apprentissage et formalisation de nouvelles règles RDG |

---

### SchemaInferencerAgent (`agents/schema_inferencer.py`)

| Attribut | Valeur |
|---|---|
| `agent_id` | `"schema_inferencer"` |
| Appel LLM | Zone non interprétable sans lecture complète du fichier |
| Rôle apparent | Inférence de schéma XML à partir d'exemples |

---

### OrchestratorAgent (`agents/orchestrator.py`)

| Attribut | Valeur |
|---|---|
| `agent_id` | `"orchestrator"` |
| Appel LLM | Non (délègue à InvestigatorAgent et ReporterAgent) |
| Entrée | `OrchestratorInput` : run_id, bank_name, report_date, api_base_url, kb_citations |

Séquence le pipeline en 3 étapes :
1. Fetch du résumé de run depuis `apps/api` (`GET /api/runs/{run_id}/summary`)
2. Appel `InvestigatorAgent` pour chaque verdict FAIL
3. Appel `ReporterAgent` avec le résumé complet

---

### PersonaRegalicaAgent (`agents/persona_regalica.py`)

| Attribut | Valeur |
|---|---|
| `agent_id` | `"persona_regalica"` |
| Appel LLM | Non (agent déterministe de post-traitement) |
| Entrée | `PersonaInput` : user_question, raw_response, citations, confidence, agent_id, session_id, tenant_id |
| Sortie | `PersonaOutput` : formatted_response, format_type, guardrail_passed, guardrail_violations, citations, confidence |

Audite chaque réponse IA avant affichage. Délègue à :
- `persona_formatting.py` : détection du format (7 formats adaptatifs) + application
- `persona_guardrails.py` : vérification guardrails + suppression phrases serviles

Bloqueurs durs (guardrail_passed=False) : `NO_CITATIONS`, `LOW_CONFIDENCE:<value>`  
Violations douces : `SERVILE_PHRASE:<phrase>`, `EMOJI_IN_RESPONSE`, `FORMAT_WARNING:<detail>`

---

## Stockage des prompts

| Emplacement | Description |
|---|---|
| Table `prompts_registry` (DB) | Prompts LLM versionnés par clé + locale + tenant |
| `apps/api/src/db/seeders/prompts-seed.ts` | Seeder initial pour la table `prompts_registry` |
| Code en dur dans `apps/web/src/app/api/chat/route.ts` | Prompt système Regalica en string TypeScript |
| Code en dur dans `apps/chatbot-py/app/routes/chat.py` | Prompt Q&A conformité en string Python |

Les prompts en dur dans le code coexistent avec la table `prompts_registry`. La route `/api/chat` de `apps/web` n'utilise pas la table `prompts_registry`.
