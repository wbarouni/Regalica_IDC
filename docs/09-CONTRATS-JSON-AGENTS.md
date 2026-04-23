# REGFlow — Plateforme de Conformité BCT par Intelligence Artificielle

## Document 9 — Contrats JSON des 14 agents

**Version :** 1.0
**Date :** avril 2026
**Périmètre :** spécification exhaustive des 14 agents IA (Regalica orchestratrice + 13 spécialistes), leurs contrats JSON input/output validés par Pydantic, leurs températures LLM, leurs garde-fous et leurs cas d'erreur
**Auteur :** Équipe REGFlow
**Statut :** référence canonique pour Claude Code
**Dépendances :** Documents 5 (agents et prompt_bank), 6 (schéma SQL), 8 (state machines)

---

## Sommaire

**Partie I — Principes communs**

1. Architecture à 14 agents
2. Contrats JSON comme interface canonique
3. Validation Pydantic runtime
4. Température, modèle, latence, confiance
5. Gestion des erreurs et fallbacks

**Partie II — Agent orchestrateur**

6. Regalica — agent de façade unique

**Partie III — Agents de pré-validation (T0)**

7. IngestorXMLAgent
8. DependencyAgent
9. TemporalAgent

**Partie IV — Agents de gouvernance référentielle (4-yeux)**

10. RuleExcelAssistAgent
11. RuleFormAssistAgent
12. ReferentialIngestorAgent

**Partie V — Agents de post-validation (T2/T3)**

13. InvestigatorAgent
14. HistoricalAgent
15. ReporterAgent
16. VisualizerAgent
17. CitationAgent
18. DiffAgent

**Partie VI — Agents d'infrastructure conversationnelle**

19. NotificationAgent
20. GedAgent

**Partie VII — Matrice d'invocation**

21. Quel agent pour quel besoin
22. Chaînage inter-agents typique
23. Températures consolidées

---

# Partie I — Principes communs

## 1. Architecture à 14 agents

REGFlow expose une architecture à 14 agents spécialisés. Un agent de façade, **Regalica**, est le seul point de contact avec l'utilisateur. Les 13 autres agents sont des spécialistes invisibles à l'utilisateur qui produisent du JSON typé jamais affiché brut. Regalica orchestre les appels aux spécialistes selon le besoin détecté et agrège leurs sorties en réponses en langage naturel.

Ce choix architectural produit plusieurs bénéfices mesurables.

**Lisibilité de l'interface utilisateur.** L'utilisateur voit une seule persona (Regalica) avec un ton cohérent, une voix homogène, une personnalité stable. Les 13 spécialistes derrière elle peuvent évoluer indépendamment sans casser l'expérience.

**Séparation des responsabilités.** Chaque spécialiste a un périmètre fonctionnel strict et un contrat JSON input/output précis. L'InvestigatorAgent ne fait pas d'historique. L'HistoricalAgent ne fait pas de diagnostic causal. Le CitationAgent ne génère pas de rapport.

**Observabilité.** Chaque appel à un spécialiste produit un log structuré avec son agent_id, son input_hash, son latency_ms, son token_count, son confidence_score. L'équipe plateforme peut analyser les performances agent par agent et prioriser les optimisations.

**Testabilité.** Chaque spécialiste a un jeu de tests unitaires avec des inputs canoniques et des outputs attendus validés par snapshot. Le chaînage inter-agents est testé séparément via des fixtures d'intégration.

**Gouvernance des prompts.** Chaque agent a son ou ses prompts dans la table `prompt_bank` (Document 6 §14). Les modifications passent par la procédure 4-yeux (Document 8 §15). Aucun prompt n'est codé en dur.

Le décompte exact est **1 orchestratrice + 13 spécialistes = 14 agents**. Dans la liste des 14 noms ci-dessous, RuleExcelAssist et RuleFormAssist sont considérés comme deux modes opérationnels d'un même agent `RuleAssistAgent` pour atteindre le décompte de 13 spécialistes conforme à la doctrine établie.

## 2. Contrats JSON comme interface canonique

Chaque agent définit deux contrats en Pydantic.

**Contrat d'entrée.** Un modèle `<Agent>Input` qui décrit exactement ce que l'agent attend pour pouvoir exécuter sa tâche. Tout appelant (Regalica, backend API, autre agent) doit produire un objet conforme à ce contrat ou l'appel est rejeté avant même d'atteindre le LLM.

**Contrat de sortie.** Un modèle `<Agent>Output` qui décrit exactement ce que l'agent produit. Le LLM est systématiquement invoqué en **JSON mode** (`response_mime_type: "application/json"`) avec le schéma Pydantic comme spécification de contrainte. Tout output non conforme est rejeté et re-tenté une fois avant escalade en erreur.

**Avantage.** L'appelant peut consommer l'output avec une confiance de 100% dans la structure. Pas de défense programmative contre des formats imprévus. Le moteur de validation JSON empêche structurellement les hallucinations de format.

**Limite.** Les contrats sont du schéma statique. Un agent peut toujours produire des valeurs sémantiquement fausses dans des champs bien typés. La qualité sémantique est contrôlée par d'autres moyens (guardrails de confidence, citations obligatoires, validation humaine pour actions critiques).

## 3. Validation Pydantic runtime

Tous les contrats sont implémentés en Pydantic v2 avec validation stricte à l'exécution.

```python
from pydantic import BaseModel, Field, field_validator
from typing import Literal

class InvestigatorInput(BaseModel):
    """Input contract pour InvestigatorAgent."""
    rule_id: str = Field(..., min_length=1, max_length=100)
    annexe_code: str = Field(..., pattern=r"^\d{1,4}$")
    num_regle: int = Field(..., ge=1)
    oper_regle: Literal["=", ">=", "<=", ">", "<", "SUM", "MAX", "MIN", "VA"]
    lhs: str = Field(..., description="Left-hand side value as Decimal string")
    rhs: str = Field(..., description="Right-hand side value as Decimal string")
    gap: str = Field(..., description="Gap LHS - RHS as Decimal string")
    rubrique_codes: list[str] = Field(default_factory=list, max_length=50)
    rule_text: str | None = Field(None, max_length=2000)
    context_snippets: list[str] = Field(default_factory=list, max_length=20)
    tenant_id: str = Field(..., min_length=1)
    session_id: str = Field(..., min_length=1)

    @field_validator("lhs", "rhs", "gap")
    @classmethod
    def validate_decimal_format(cls, v: str) -> str:
        """Ensure the value parses as a Decimal."""
        from decimal import Decimal, InvalidOperation
        try:
            Decimal(v)
        except InvalidOperation as e:
            raise ValueError(f"Not a valid decimal: {v}") from e
        return v
```

Les contrats peuvent être auto-générés vers TypeScript via `pydantic-to-typescript` pour partage avec le frontend sans divergence de schéma.

## 4. Température, modèle, latence, confiance

Les choix de température suivent une règle simple : déterminisme pour les agents techniques, souplesse mesurée pour les agents conversationnels.

**Température 0.1** pour les agents déterministes qui doivent produire un output strictement fonction de l'input. IngestorXML, Dependency, Temporal, Diff, Citation, Visualizer.

**Température 0.3** pour les agents qui produisent du texte explicatif à partir de données structurées. Investigator, Reporter, Historical.

**Température 0.7** pour Regalica uniquement, qui porte la voix conversationnelle. Plus de naturel sans basculer dans l'imprévisible.

**Modèle par défaut.** `gemini-2.5-flash` pour tous les agents. Fallback `qwen2.5:3b` via Ollama en Phase 6 pour les cas où Gemini est indisponible. La bascule est transparente pour le code appelant grâce à la couche d'abstraction `LLMClient` (Document 5).

**Cibles de latence.** Investigator, Citation, Diff : p95 < 2 secondes. Reporter, Historical : p95 < 5 secondes. Visualizer : p95 < 3 secondes. Regalica : p95 < 3 secondes. Les agents déterministes qui n'appellent pas de LLM (IngestorXML, Dependency, Temporal) ont une cible p95 < 200 ms.

**Confiance.** Chaque output LLM porte un champ `confidence: float (0.0 - 1.0)` calculé à partir des logprobs Gemini si disponibles, sinon 0.97 par défaut pour les formats bien cadrés. Seuil critique 0.95 pour les investigations causales. En dessous, Regalica n'affiche pas la réponse générée et retourne un message standardisé invitant l'utilisateur à reformuler.

## 5. Gestion des erreurs et fallbacks

Trois classes d'erreurs sont gérées explicitement.

**Erreur de validation d'input.** Pydantic rejette avant l'appel LLM. L'appelant reçoit une `ValidationError` avec les champs fautifs. Pas de retry, pas de fallback, c'est un bug applicatif.

**Erreur de validation d'output.** Le LLM a produit un JSON invalide selon le schéma Pydantic. Retry unique automatique avec prompt correctif ("the previous output was invalid, please produce a valid JSON matching this schema"). Si le retry échoue, escalade en `AgentExecutionError` que Regalica intercepte et traduit en message utilisateur invitant à réessayer.

**Erreur technique LLM.** Timeout, 5xx, rate limit. Retry exponentiel 3 fois (200ms, 600ms, 1.8s). Puis bascule vers Ollama si activé. Puis escalade en mode dégradé : Regalica signale à l'utilisateur que l'enrichissement IA est indisponible mais que les résultats déterministes (validation moteur) restent accessibles.

**Mode dégradé global.** Si tous les appels LLM échouent pendant plus de 5 minutes, un circuit breaker coupe les appels pendant 60 secondes. L'utilisateur peut consulter les résultats du moteur d'évaluation (verdicts PASS/FAIL/SKIP) sans les explications causales générées par les LLM.

---

# Partie II — Agent orchestrateur

## 6. Regalica — agent de façade unique

### Rôle

Regalica est la **seule persona IA** que l'utilisateur voit et entend. Elle reçoit les messages utilisateur, analyse l'intention, choisit les spécialistes à invoquer, agrège leurs sorties JSON typées, et produit une réponse en langage naturel respectueuse du design système Edition One et du ton produit validé (vouvoiement, sans emoji, sans superlatif).

Regalica n'écrit jamais de code SQL, ne calcule jamais de règle RDG, ne produit jamais de diagramme. Elle **délègue** à des spécialistes et agrège.

### Contrat d'entrée

```python
class RegalicaInput(BaseModel):
    user_message: str = Field(..., min_length=1, max_length=8000)
    session_id: str = Field(..., min_length=1)
    tenant_id: str = Field(..., min_length=1)
    user_id: str = Field(..., min_length=1)
    user_role: Literal[
        "compliance_officer",
        "compliance_director",
        "referential_admin",
        "platform_owner",
        "readonly",
    ]
    current_run_id: str | None = Field(None, description="Run de validation actif si T2/T3")
    current_fsm_state: str | None = Field(
        None,
        description="État courant de la FSM (voir Document 8)"
    )
    conversation_history: list[ConversationTurn] = Field(
        default_factory=list,
        max_length=8,
        description="Sliding window des 8 derniers tours"
    )
    kb_snippets: list[KbSnippet] = Field(
        default_factory=list,
        max_length=10,
        description="Chunks RAG pertinents pré-récupérés"
    )

class ConversationTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    timestamp: str

class KbSnippet(BaseModel):
    source_ref: str
    chunk_text: str
    similarity_score: float = Field(..., ge=0.0, le=1.0)
```

### Contrat de sortie

```python
class RegalicaOutput(BaseModel):
    response_text: str = Field(..., min_length=1, max_length=8000)
    citations: list[Citation] = Field(
        default_factory=list,
        description="Citations obligatoires pour toute affirmation factuelle"
    )
    confidence: float = Field(..., ge=0.0, le=1.0)
    format_type: Literal[
        "factuelle",
        "comparative",
        "enumerative",
        "analytique",
        "technique",
        "regle_bct",
        "ambigue"
    ]
    agents_invoked: list[AgentInvocation] = Field(
        default_factory=list,
        description="Trace des spécialistes appelés pour audit"
    )
    suggested_actions: list[SuggestedAction] = Field(
        default_factory=list,
        max_length=3,
        description="Actions proposées à l'utilisateur (boutons UI)"
    )
    tokens_used: int
    latency_ms: int

class Citation(BaseModel):
    source_type: Literal["circulaire_bct", "cc_tech", "rule_rdg", "internal_doc"]
    source_ref: str
    excerpt: str | None = None
    url_or_path: str | None = None

class AgentInvocation(BaseModel):
    agent_id: str
    invoked_at: str
    latency_ms: int
    confidence: float

class SuggestedAction(BaseModel):
    label: str = Field(..., max_length=50)
    action_type: Literal[
        "open_overlay_simulation",
        "open_overlay_sanction",
        "open_overlay_plan_optimal",
        "iterate_correction",
        "sign_run",
        "revoke_signature",
        "view_historical_trend",
    ]
    action_payload: dict
```

### LLM et température

| Paramètre               | Valeur                                   |
| ----------------------- | ---------------------------------------- |
| Modèle                  | `gemini-2.5-flash`                       |
| Température             | 0.7                                      |
| Max tokens output       | 2048                                     |
| Seuil confiance minimum | 0.90 (seuil 0.95 dur sur faits chiffrés) |
| Cible latence p95       | 3 secondes                               |

### Gardes et guardrails

- **Citations obligatoires** pour toute affirmation factuelle. Si Regalica doit dire "selon la circulaire BCT 2018-06", la citation est insérée en structured output. Pas de citation → pas d'affirmation.
- **Vouvoiement systématique**. Le prompt système l'impose. Un post-traitement détecte les dérives ("tu") et rejette la sortie.
- **Pas d'emoji**. Post-traitement rejette toute sortie contenant des emoji.
- **Pas de phrase servile** ("excellente question", "ravi de vous aider", "n'hésitez pas"). Dictionnaire de phrases interdites, détection et rejet.
- **Pas de superlatif marketing** ("révolutionnaire", "exceptionnel", "unique en son genre").
- **Français par défaut**. Locale `en` ou `ar` utilisée uniquement si l'utilisateur a changé sa préférence dans son profil.

### Cas d'erreur

| Cas                           | Comportement                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Confidence < 0.90             | Sortie rejetée, Regalica répond "Je ne suis pas suffisamment certaine de ma réponse. Pourriez-vous reformuler ?"             |
| Spécialiste invoqué en erreur | Regalica dégrade en continuant sans cette source ou signale l'indisponibilité selon criticité                                |
| Tous les LLM indisponibles    | Regalica répond "L'assistance IA est momentanément indisponible. Les résultats du moteur d'évaluation restent consultables." |
| User message > 8000 chars     | Rejet avec message demandant de scinder la question                                                                          |

---

# Partie III — Agents de pré-validation (T0)

## 7. IngestorXMLAgent

### Rôle

Parse un XML BCT uploadé, extrait les métadonnées (CodeBanque, DateAnnexe, CodeAnnexe), détecte la nomenclature (moderne / legacy / specialized), produit la CellMatrix. **Agent déterministe sans appel LLM.** Délègue au package `@regflow/bct-xml-parser` (Livrable 4).

### Contrat d'entrée

```python
class IngestorXMLInput(BaseModel):
    upload_id: str
    xml_content_base64: str = Field(..., max_length=20_000_000)
    tenant_id: str
    session_id: str
```

### Contrat de sortie

```python
class IngestorXMLOutput(BaseModel):
    success: bool
    nomenclature: Literal["modern", "legacy", "specialized", "unknown"]
    header: XmlHeaderExtracted | None
    cell_matrix_summary: CellMatrixSummary | None
    warnings: list[ParseWarning] = Field(default_factory=list)
    error: ParseErrorDetail | None = None

class XmlHeaderExtracted(BaseModel):
    code_banque: str | None
    date_annexe: str | None
    code_annexe: str | None

class CellMatrixSummary(BaseModel):
    rubriques_count: int
    values_count: int
    annexes_covered: list[str]
```

### LLM et température

Pas d'appel LLM. Agent purement déterministe, latence p95 < 200 ms pour un XML jusqu'à 10 MB.

## 8. DependencyAgent

### Rôle

Détermine quelles annexes compagnes sont requises par l'annexe principale uploadée selon la matrice CC-tech §9.5 et les circulaires 2018-06/2018-10. **Agent déterministe sans appel LLM.** Lit la matrice depuis la table `referentials_annexe_dependencies` du Document 6.

### Contrat d'entrée

```python
class DependencyInput(BaseModel):
    primary_annexe_code: str
    arrete_date: str
    tenant_id: str
```

### Contrat de sortie

```python
class DependencyOutput(BaseModel):
    required_companions: list[CompanionRequirement]
    autonomous: bool = Field(
        description="True si l'annexe primaire n'a aucune dépendance"
    )

class CompanionRequirement(BaseModel):
    annexe_code: str
    required_by_source: Literal[
        "cc_tech_9_5",
        "circ_2018_06_solvabilite",
        "circ_2018_10_credit_depots",
        "circ_2018_06_lcr",
    ]
    dependency_type: Literal["structural", "computational"]
    strictness: Literal["blocking", "warning"]
```

### LLM et température

Pas d'appel LLM. Requête SQL sur `referentials_annexe_dependencies`. Latence p95 < 50 ms.

## 9. TemporalAgent

### Rôle

Vérifie la cohérence temporelle entre les XML d'un batch. Tous les XML doivent partager la même `DateAnnexe` sauf divergences explicitement justifiées par une mention `ZONE_TEXTE` (T-1, N-1). **Agent déterministe avec analyse de règles sémantiques.**

### Contrat d'entrée

```python
class TemporalInput(BaseModel):
    batch_files: list[BatchFile]
    active_rules_zone_texte: dict[str, str] = Field(
        description="Map rule_id -> zone_texte if present"
    )

class BatchFile(BaseModel):
    annexe_code: str
    date_annexe: str
    upload_id: str
```

### Contrat de sortie

```python
class TemporalOutput(BaseModel):
    coherence_level: Literal["strict", "explicit_deviation", "inconsistent"]
    reference_date: str | None = Field(
        description="Date commune majoritaire ou None si incohérent"
    )
    deviations: list[TemporalDeviation] = Field(default_factory=list)

class TemporalDeviation(BaseModel):
    annexe_code: str
    observed_date: str
    expected_date: str
    justification: Literal[
        "zone_texte_t_minus_1",
        "zone_texte_n_minus_1",
        "none",
    ]
    blocking: bool
```

### LLM et température

Pas d'appel LLM direct. Règles sémantiques codées en dur (T-1 = mois précédent, N-1 = année précédente). Latence p95 < 100 ms.

---

# Partie IV — Agents de gouvernance référentielle (4-yeux)

## 10. RuleExcelAssistAgent

### Rôle

Assiste l'import d'un fichier Excel contenant des règles RDG (format maquette BCT). Parse l'Excel, propose un mapping colonne-à-champ, valide la cohérence, génère une PR 4-yeux. **Agent LLM avec JSON strict pour le mapping.**

### Contrat d'entrée

```python
class RuleExcelAssistInput(BaseModel):
    file_base64: str
    sheet_name: str | None = None
    tenant_id: str
    requested_by_user_id: str
```

### Contrat de sortie

```python
class RuleExcelAssistOutput(BaseModel):
    success: bool
    detected_rules_count: int
    proposed_mapping: ColumnMapping
    rules_preview: list[RuleDraft] = Field(max_length=10)
    warnings: list[str] = Field(default_factory=list)
    pr_payload: FourEyesRequestPayload | None

class ColumnMapping(BaseModel):
    ax_term_column: str
    num_regle_column: str
    oper_regle_column: str
    terms_start_column: str
    confidence: float

class RuleDraft(BaseModel):
    ax_term: str
    num_regle: int
    oper_regle: str
    terms: list[dict]
    issues: list[str] = Field(default_factory=list)
```

### LLM et température

Modèle `gemini-2.5-flash`, température 0.1 pour déterminisme du mapping. Latence p95 < 4 secondes pour un Excel jusqu'à 2 000 lignes.

## 11. RuleFormAssistAgent

### Rôle

Assiste la saisie manuelle d'une règle via formulaire UI. L'utilisateur dicte ou tape une règle en langage naturel ("la somme des rubriques X et Y de l'annexe 630 doit égaler la rubrique Z de l'annexe 00"). L'agent structure en format (AX_TERM, NUM_REGLE, termes, opérateur). **Agent LLM avec JSON strict.**

### Contrat d'entrée

```python
class RuleFormAssistInput(BaseModel):
    natural_language_rule: str = Field(..., min_length=10, max_length=4000)
    target_annexe_code: str | None = None
    hints: dict | None = None
    tenant_id: str
```

### Contrat de sortie

```python
class RuleFormAssistOutput(BaseModel):
    structured_rule: RuleDraft
    confidence: float
    ambiguities: list[Ambiguity] = Field(default_factory=list)
    followup_questions: list[str] = Field(default_factory=list, max_length=3)

class Ambiguity(BaseModel):
    field: str
    possible_values: list[str]
    recommended_value: str
```

### LLM et température

Modèle `gemini-2.5-flash`, température 0.3. Latence p95 < 3 secondes.

## 12. ReferentialIngestorAgent

### Rôle

Import un référentiel (annexes, rubriques, colonnes, xml_structures, zones_texte, sentinelles, dépendances) depuis un fichier PDF ou XLSX BCT. Parse, structure, propose pour validation 4-yeux. **Agent LLM pour extraction depuis PDF, déterministe pour XLSX.**

### Contrat d'entrée

```python
class ReferentialIngestorInput(BaseModel):
    source_type: Literal["pdf", "xlsx"]
    file_base64: str
    target_referential: Literal[
        "annexes",
        "rubriques",
        "colonnes",
        "xml_structures",
        "zones_texte",
        "sentinelles",
        "annexe_dependencies",
    ]
    tenant_id: str
    requested_by_user_id: str
```

### Contrat de sortie

```python
class ReferentialIngestorOutput(BaseModel):
    success: bool
    extracted_records: list[dict]
    confidence: float
    warnings: list[str] = Field(default_factory=list)
    pr_payload: FourEyesRequestPayload | None
```

### LLM et température

PDF : `gemini-2.5-flash` multimodal, température 0.1. XLSX : déterministe, pas de LLM. Latence p95 < 10 secondes pour un PDF jusqu'à 50 pages.

---

# Partie V — Agents de post-validation (T2/T3)

## 13. InvestigatorAgent

### Rôle

Génère une explication causale en français pour un verdict FAIL produit par le moteur. L'utilisateur sélectionne un FAIL dans la liste, Regalica appelle InvestigatorAgent qui analyse la règle, les rubriques impliquées, les valeurs, et produit une hypothèse de cause racine avec suggestion d'action corrective. **Agent LLM critique.**

### Contrat d'entrée

```python
class InvestigatorInput(BaseModel):
    rule_id: str
    annexe_code: str
    num_regle: int
    oper_regle: Literal["=", ">=", "<=", ">", "<", "SUM", "MAX", "MIN", "VA"]
    lhs: str
    rhs: str
    gap: str
    rubrique_codes: list[str]
    colonne_codes: list[str] = Field(default_factory=list)
    rule_text: str | None = None
    context_snippets: list[str] = Field(default_factory=list)
    cluster_hint: str | None = Field(
        None,
        description="Grappe détectée par le moteur si le FAIL fait partie d'un cluster"
    )
    tenant_id: str
    session_id: str
```

### Contrat de sortie

```python
class InvestigatorOutput(BaseModel):
    explanation_fr: str = Field(..., min_length=50, max_length=2000)
    severity: Literal["severe", "rounding"]
    suggested_actions: list[SuggestedCorrection] = Field(max_length=3)
    probable_root_cause: Literal[
        "ventilation_sectorielle_incorrecte",
        "rubrique_mal_alimentee",
        "ecart_arrondi_consolidation",
        "mapping_comptable_errone",
        "donnee_manquante_source",
        "convention_temporalite_non_respectee",
        "autre",
    ]
    confidence: float = Field(..., ge=0.0, le=1.0)
    citations: list[Citation]

class SuggestedCorrection(BaseModel):
    action_label: str
    target_system: Literal["core_banking", "general_ledger", "risk_system", "other"]
    estimated_effort: Literal["trivial", "moderate", "high"]
    rubrique_to_correct: str | None
```

### LLM et température

Modèle `gemini-2.5-flash`, température 0.3. Cible latence p95 < 2 secondes. Seuil confiance critique 0.95 — en dessous, Regalica affiche une réponse standardisée.

### Guardrails

- Citations obligatoires vers la règle RDG et optionnellement circulaire source.
- Pas de suggestion d'action hors du périmètre métier (pas de "contactez votre DSI", pas de "ouvrez un ticket").
- Le champ `probable_root_cause` est un enum fermé pour forcer une catégorisation.

## 14. HistoricalAgent

### Rôle

Analyse capitalisée sur l'historique des runs d'un tenant. Tendances, variations arrêté à arrêté, anomalies statistiques, récurrence de FAIL sur même rubrique. **Agent déterministe principal avec LLM pour la narration finale.**

### Contrat d'entrée

```python
class HistoricalInput(BaseModel):
    tenant_id: str
    analysis_type: Literal[
        "trend_per_rubrique",
        "fail_recurrence",
        "arrete_variation",
        "cluster_evolution",
    ]
    annexe_code: str | None = None
    rubrique_code: str | None = None
    date_from: str
    date_to: str
    max_runs: int = Field(default=24, ge=1, le=120)
```

### Contrat de sortie

```python
class HistoricalOutput(BaseModel):
    analysis_type: str
    data_points: list[HistoricalDataPoint]
    statistical_summary: HistoricalStats
    narrative_fr: str
    anomalies_detected: list[Anomaly] = Field(default_factory=list)
    confidence: float

class HistoricalDataPoint(BaseModel):
    run_id: str
    arrete_date: str
    value: str  # Decimal stringified
    status: str

class HistoricalStats(BaseModel):
    count: int
    mean: str
    median: str
    stddev: str
    min: str
    max: str
    trend_slope: str | None

class Anomaly(BaseModel):
    run_id: str
    arrete_date: str
    type: Literal["outlier_high", "outlier_low", "sudden_change", "pattern_break"]
    description_fr: str
    z_score: float | None
```

### LLM et température

Calculs statistiques déterministes. Narration finale par `gemini-2.5-flash` température 0.3. Latence p95 < 5 secondes.

### Doctrine stricte

L'HistoricalAgent ne peut être invoqué **qu'après** une validation RDG complète du run courant. Il ne remplace jamais la validation par un calcul historique. Règle structurelle appliquée au niveau de Regalica : l'agent historique n'est jamais invoqué si `current_run.status != 'completed'`.

## 15. ReporterAgent

### Rôle

Génère le rapport de conformité final pour un run terminé. Agrège les verdicts, les investigations causales, les clusters, les compagnes manquantes, produit un document structuré téléchargeable en DOCX ou PDF.

### Contrat d'entrée

```python
class ReporterInput(BaseModel):
    run_id: str
    tenant_id: str
    format: Literal["docx", "pdf", "json"]
    audience: Literal["compliance_officer", "compliance_director", "board"]
    include_sections: list[str] = Field(
        default_factory=lambda: [
            "synthesis",
            "cause_racine",
            "fail_detail",
            "full_listing",
        ]
    )
    language: Literal["fr", "en", "ar"] = "fr"
```

### Contrat de sortie

```python
class ReporterOutput(BaseModel):
    report_url: str
    report_sha256: str
    sections_generated: list[str]
    total_pages: int
    generation_latency_ms: int
```

### LLM et température

Agrégation principalement déterministe. Narration des sections par `gemini-2.5-flash` température 0.3. Latence p95 < 10 secondes pour un run de taille moyenne (~50 FAIL investigués).

## 16. VisualizerAgent

### Rôle

Génère des visualisations (graphiques, tableaux, heatmaps, dashboards) à partir de données structurées. **Agent déterministe principalement, avec LLM uniquement pour le titre et la légende.**

### Contrat d'entrée

```python
class VisualizerInput(BaseModel):
    chart_type: Literal[
        "bar",
        "line",
        "heatmap",
        "stacked_bar",
        "pie",
        "table",
        "sankey",
    ]
    data_series: list[DataSeries]
    x_axis_label: str | None = None
    y_axis_label: str | None = None
    color_palette: Literal["edition_one_mono", "edition_one_marigold"] = "edition_one_mono"
    language: Literal["fr", "en", "ar"] = "fr"

class DataSeries(BaseModel):
    name: str
    data: list[DataPoint]

class DataPoint(BaseModel):
    x: str | float
    y: float
    label: str | None = None
```

### Contrat de sortie

```python
class VisualizerOutput(BaseModel):
    svg_content: str
    png_base64: str | None = None
    title: str
    legend: str
    accessibility_description: str = Field(
        description="Description textuelle pour lecteurs d'écran"
    )
```

### LLM et température

Rendu SVG déterministe via bibliothèque graphique (chart.js server-side ou équivalent). Titre et légende générés par `gemini-2.5-flash` température 0.3. Latence p95 < 3 secondes.

## 17. CitationAgent

### Rôle

Trouve les citations réglementaires pertinentes pour une règle RDG donnée. Lit la table `referentials_rule_citations` et le RAG documentaire pgvector. Retourne les extraits de circulaires BCT qui justifient la règle. **Agent hybride déterministe + RAG.**

### Contrat d'entrée

```python
class CitationInput(BaseModel):
    rule_id: str
    annexe_code: str
    num_regle: int
    max_citations: int = Field(default=3, ge=1, le=10)
    language: Literal["fr", "en", "ar"] = "fr"
```

### Contrat de sortie

```python
class CitationOutput(BaseModel):
    citations: list[ResolvedCitation]

class ResolvedCitation(BaseModel):
    source_type: Literal["circulaire_bct", "cc_tech", "rdg_annexe"]
    source_ref: str
    article_or_section: str | None
    excerpt_fr: str
    similarity_score: float
    page_number: int | None
    source_url: str | None
```

### LLM et température

Recherche pgvector déterministe. Reformulation d'extrait optionnelle par `gemini-2.5-flash` température 0.1. Latence p95 < 1 seconde.

## 18. DiffAgent

### Rôle

Compare deux runs du même tenant sur la même annexe et produit un diff structuré. Quelles règles ont changé de verdict ? Quels écarts se sont creusés ou résorbés ? **Agent déterministe sans appel LLM** sauf pour la synthèse finale.

### Contrat d'entrée

```python
class DiffInput(BaseModel):
    run_id_baseline: str
    run_id_current: str
    tenant_id: str
    scope: Literal["all_annexes", "single_annexe"] = "all_annexes"
    annexe_code: str | None = None
```

### Contrat de sortie

```python
class DiffOutput(BaseModel):
    runs_compared: tuple[str, str]
    verdict_transitions: VerdictTransitions
    gap_evolutions: list[GapEvolution] = Field(default_factory=list)
    rules_unchanged_count: int
    narrative_fr: str

class VerdictTransitions(BaseModel):
    pass_to_fail: int
    fail_to_pass: int
    fail_to_fail_widened: int
    fail_to_fail_narrowed: int
    new_skips: int
    resolved_skips: int

class GapEvolution(BaseModel):
    rule_id: str
    annexe_code: str
    num_regle: int
    baseline_gap: str
    current_gap: str
    delta_absolute: str
    delta_relative_percent: str | None
    direction: Literal["widened", "narrowed", "resolved"]
```

### LLM et température

Comparaison déterministe en SQL. Narration de synthèse par `gemini-2.5-flash` température 0.1 (faible pour éviter l'interprétation). Latence p95 < 2 secondes.

---

# Partie VI — Agents d'infrastructure conversationnelle

## 19. NotificationAgent

### Rôle

Gère les notifications proactives vers l'utilisateur. Pré-alertes avant validation (annexe compagne manquante, incohérence temporelle), alertes en cours de run (FAIL sévère détecté), notifications post-run (archivage imminent, signature révoquée). **Agent déterministe.**

### Contrat d'entrée

```python
class NotificationInput(BaseModel):
    target_user_id: str
    notification_type: Literal[
        "companion_missing",
        "temporal_incoherence",
        "severe_fail_detected",
        "archive_imminent",
        "signature_revoked_by_director",
        "new_circulaire_published",
        "rule_activated_by_peer",
    ]
    severity: Literal["info", "attention", "warning", "critical"]
    context: dict
    locale: Literal["fr", "en", "ar"] = "fr"
```

### Contrat de sortie

```python
class NotificationOutput(BaseModel):
    notification_id: str
    persisted: bool
    delivery_channels: list[Literal["in_app", "email", "webhook"]]
    title: str
    body: str
    cta_label: str | None
    cta_action: dict | None
```

### LLM et température

Pas d'appel LLM. Templates fixes pour chaque type de notification (internationalisés). Latence p95 < 100 ms.

## 20. GedAgent

### Rôle

Gestion Électronique des Documents. Stocke et récupère les pièces justificatives jointes par l'utilisateur à un run (circulaire interne, mail BCT, extrait comptable, etc.). **Agent déterministe.**

### Contrat d'entrée

```python
class GedInput(BaseModel):
    operation: Literal["upload", "fetch", "list", "delete"]
    run_id: str | None = None
    document_id: str | None = None
    file_base64: str | None = None
    filename: str | None = None
    metadata: dict | None = None
    tenant_id: str
```

### Contrat de sortie

```python
class GedOutput(BaseModel):
    success: bool
    document_id: str | None
    documents: list[GedDocument] | None
    download_url: str | None
    sha256: str | None

class GedDocument(BaseModel):
    document_id: str
    filename: str
    uploaded_at: str
    size_bytes: int
    mime_type: str
    sha256: str
```

### LLM et température

Pas d'appel LLM. Stockage objet local (pas de cloud). Latence p95 < 500 ms pour upload, < 100 ms pour fetch.

---

# Partie VII — Matrice d'invocation

## 21. Quel agent pour quel besoin

| Besoin utilisateur                  | Agent(s) invoqué(s)                                            |
| ----------------------------------- | -------------------------------------------------------------- |
| Uploader un XML                     | `IngestorXMLAgent` puis `DependencyAgent` puis `TemporalAgent` |
| Importer règles depuis Excel        | `RuleExcelAssistAgent` puis cycle 4-yeux                       |
| Saisir règle au formulaire          | `RuleFormAssistAgent` puis cycle 4-yeux                        |
| Importer référentiel depuis PDF BCT | `ReferentialIngestorAgent` puis cycle 4-yeux                   |
| Comprendre un FAIL                  | `InvestigatorAgent` + `CitationAgent`                          |
| Voir tendance historique            | `HistoricalAgent` + `VisualizerAgent`                          |
| Générer rapport final               | `ReporterAgent` + `VisualizerAgent`                            |
| Comparer deux runs                  | `DiffAgent` + `VisualizerAgent`                                |
| Recevoir une alerte                 | `NotificationAgent`                                            |
| Joindre une pièce                   | `GedAgent`                                                     |

## 22. Chaînage inter-agents typique

**Scénario 1 — Upload complet en T0.**

```
user uploads XML
  └─> IngestorXMLAgent (détection nomenclature, métadonnées, CellMatrix)
       └─> DependencyAgent (compagnes requises)
            └─> si compagnes manquantes:
                 └─> NotificationAgent (pré-alerte dans UI)
            └─> TemporalAgent (cohérence inter-XML)
                 └─> si incohérent:
                      └─> NotificationAgent (avertissement)
```

**Scénario 2 — Investigation d'un FAIL en T2.**

```
user clicks on FAIL row
  └─> Regalica analyses intent = "understand this FAIL"
       ├─> InvestigatorAgent (explication causale)
       ├─> CitationAgent (circulaire de référence)
       └─> HistoricalAgent (cette règle a-t-elle déjà échoué ?)
            └─> VisualizerAgent (timeline récurrence)
  └─> Regalica agrège et produit réponse conversationnelle
```

**Scénario 3 — Clôture avec signature.**

```
user clicks "Sign run"
  └─> (pas d'agent IA, procédure stockée sp_sign_validation_run)
  └─> NotificationAgent (notification d'acte au compliance_director)
```

## 23. Températures consolidées

| Agent               | Température | Modèle                                   | LLM     |
| ------------------- | ----------- | ---------------------------------------- | ------- |
| Regalica            | 0.7         | `gemini-2.5-flash`                       | Oui     |
| IngestorXML         | N/A         | N/A                                      | Non     |
| Dependency          | N/A         | N/A                                      | Non     |
| Temporal            | N/A         | N/A                                      | Non     |
| RuleExcelAssist     | 0.1         | `gemini-2.5-flash`                       | Oui     |
| RuleFormAssist      | 0.3         | `gemini-2.5-flash`                       | Oui     |
| ReferentialIngestor | 0.1         | `gemini-2.5-flash` (multimodal pour PDF) | Oui     |
| Investigator        | 0.3         | `gemini-2.5-flash`                       | Oui     |
| Historical          | 0.3         | `gemini-2.5-flash`                       | Hybride |
| Reporter            | 0.3         | `gemini-2.5-flash`                       | Hybride |
| Visualizer          | 0.3         | `gemini-2.5-flash`                       | Hybride |
| Citation            | 0.1         | `gemini-2.5-flash`                       | Hybride |
| Diff                | 0.1         | `gemini-2.5-flash`                       | Hybride |
| Notification        | N/A         | N/A                                      | Non     |
| Ged                 | N/A         | N/A                                      | Non     |

**14 agents : 1 orchestratrice + 13 spécialistes.** L'unification de RuleExcelAssist et RuleFormAssist sous un agent `RuleAssistAgent` avec deux modes peut être envisagée en Phase 4 pour strictement atteindre 13 spécialistes. Le présent document les documente séparément pour clarté des contrats.

---

_Fin du Document 9 — Contrats JSON des 14 agents_
_Prochain document : Document 10 — Orchestration Regalica et 7 types de questions_
