# REGFlow — Plateforme de Conformité BCT par Intelligence Artificielle

## Document 10 — Orchestration Regalica et 7 types de questions

**Version :** 1.0
**Date :** avril 2026
**Périmètre :** algorithme d'orchestration de Regalica, détection d'intention utilisateur, choix des spécialistes à invoquer, agrégation des sorties JSON en réponses conversationnelles, traitement des 7 types de questions canoniques supportés en T2
**Auteur :** Équipe REGFlow
**Statut :** référence canonique pour Claude Code
**Dépendances :** Documents 4 (workflow), 5 (prompt_bank), 8 (state machines), 9 (contrats JSON agents)

---

## Sommaire

**Partie I — Principes d'orchestration**

1. Le rôle de Regalica dans l'architecture
2. Pipeline d'orchestration en 5 étapes
3. Détection d'intention par routage typé
4. Stratégie d'agrégation

**Partie II — 7 types de questions en T2**

5. Question de type 1 — Zoom sur un FAIL
6. Question de type 2 — Grappe de causes racines
7. Question de type 3 — Historique et récurrence
8. Question de type 4 — Citation réglementaire
9. Question de type 5 — Simulation d'impact
10. Question de type 6 — Estimation de sanction BCT
11. Question de type 7 — Plan optimal de correction

**Partie III — Questions hors T2**

12. Questions en T0 — assistance à la préparation
13. Questions en Bibliothèque — aide à la saisie
14. Questions hors contexte — aide générale

**Partie IV — Contrats d'orchestration**

15. `RegalicaRouter` — détection d'intention
16. `RegalicaPlanner` — sélection des spécialistes
17. `RegalicaAggregator` — composition de la réponse

**Partie V — Gestion de l'ambiguïté**

18. Questions ambiguës
19. Questions hors périmètre
20. Questions en état invalide

**Partie VI — Budget et performances**

21. Budget de tokens par type de question
22. Parallélisation des appels spécialistes
23. Cache et mémoization

---

# Partie I — Principes d'orchestration

## 1. Le rôle de Regalica dans l'architecture

Regalica est la **seule interface conversationnelle** entre l'utilisateur et REGFlow. Aucun autre agent n'émet directement vers l'utilisateur. Aucun composant backend ne produit de texte en langage naturel destiné à l'écran.

Cette centralisation a des conséquences importantes.

**Unicité de la persona.** L'utilisateur perçoit une seule voix, stable, avec un ton constant (vouvoiement, sans emoji, sans superlatif, directe et technique). Les 13 spécialistes derrière Regalica peuvent évoluer, être remplacés, être désactivés en mode dégradé, sans que l'expérience utilisateur ne s'en ressente.

**Responsabilité du choix éditorial.** Quand la réponse combine plusieurs sources (un FAIL diagnostiqué par Investigator, une citation de CitationAgent, une tendance historique de HistoricalAgent), c'est Regalica qui décide de l'ordre, du découpage en paragraphes, des liens entre segments, des actions proposées. Les spécialistes fournissent des données structurées, Regalica compose la narration.

**Filtrage des erreurs.** Si un spécialiste échoue ou produit un output de faible confiance, Regalica **ne transmet pas cet échec à l'utilisateur tel quel**. Elle décide soit d'omettre la source, soit de signaler gracieusement que l'enrichissement est indisponible, soit de demander une reformulation. Jamais de message d'erreur technique brut.

**Application des invariants de voix.** Les post-traitements (suppression des phrases serviles, détection des emoji, vérification des citations) s'appliquent sur la sortie finale de Regalica, pas sur les outputs des spécialistes (qui n'atteignent jamais l'utilisateur).

## 2. Pipeline d'orchestration en 5 étapes

Chaque message utilisateur traverse Regalica selon le pipeline suivant.

**Étape 1 — Router (détection d'intention).** Regalica analyse le message utilisateur en contexte (FSM state courant, run_id actif, historique conversationnel) et classifie l'intention parmi les 7 types canoniques de questions T2 ou les types T0/Bibliothèque/générales. La sortie est un objet `DetectedIntent` avec un type et un niveau de confiance.

**Étape 2 — Planner (sélection des spécialistes).** À partir de l'intention détectée, le planner choisit les spécialistes à invoquer et l'ordre des appels. Certaines questions invoquent un seul spécialiste, d'autres en orchestrent jusqu'à 4 en parallèle.

**Étape 3 — Exécution (appels parallèles ou séquentiels).** Le planner distribue les appels aux spécialistes. Les appels sans dépendance entre eux sont parallélisés (ex: Investigator + Citation + Historical sur un même FAIL). Les appels avec dépendance (VisualizerAgent qui consomme la sortie d'HistoricalAgent) sont séquentiels.

**Étape 4 — Aggregator (composition).** Regalica reçoit les JSON typés de tous les spécialistes invoqués et compose une réponse en langage naturel. Elle applique le ton produit, respecte le format attendu (factuelle, analytique, technique, etc.), intègre les citations, propose des suggested_actions pour les boutons UI.

**Étape 5 — Guardrail (post-traitement).** La réponse composée passe par une vérification finale : citations présentes pour tout fait chiffré, confiance globale >= 0.90, absence d'emoji, absence de phrases serviles, respect de la longueur maximale. Si une vérification échoue, soit la réponse est corrigée automatiquement (suppression emoji), soit elle est rejetée et remplacée par un message standardisé.

## 3. Détection d'intention par routage typé

L'étape 1 du pipeline est critique. Un mauvais routage envoie la question au mauvais spécialiste et produit une réponse à côté de la plaque.

Le routage utilise une combinaison de trois signaux.

**Signal 1 — État du workflow (FSM).** La FSM courante détermine les types de questions plausibles. En T0, les questions sur l'investigation d'un FAIL n'ont pas de sens. En T2 `in_investigation` avec un run FAIL sévère, les 7 types de questions T2 sont tous candidats.

**Signal 2 — Mots-clés et patterns dans le message.** Certains termes sont fortement associés à un type. "Pourquoi" au début → zoom ou cause racine. "Déjà arrivé" → historique. "Sanction" → estimation BCT. "Plan" → plan optimal. "Article" ou "circulaire" → citation.

**Signal 3 — Ciblage d'un verdict spécifique.** Si l'utilisateur vient de cliquer sur une ligne FAIL avant de poser sa question, le contexte UI transmet l'ID du verdict et réduit drastiquement l'espace des intentions plausibles.

Le router est implémenté comme un LLM call avec un prompt système strict qui impose la sortie au format JSON avec un enum fermé de types. Température 0.1 pour déterminisme.

```python
class DetectedIntent(BaseModel):
    intent_type: Literal[
        # Types T2
        "zoom_fail",
        "grappe_causes",
        "historique_recurrence",
        "citation_reglementaire",
        "simulation_impact",
        "estimation_sanction",
        "plan_optimal",
        # Types hors T2
        "assist_t0_precheck",
        "assist_library_saisie",
        "assist_general",
        # Ambigu
        "ambiguous",
        "out_of_scope",
    ]
    confidence: float = Field(..., ge=0.0, le=1.0)
    target_verdict_id: str | None = None
    target_annexe: str | None = None
    target_rule_id: str | None = None
    free_text_focus: str | None = None
    ambiguity_reasons: list[str] = Field(default_factory=list)
```

## 4. Stratégie d'agrégation

L'étape 4 (Aggregator) est ce qui distingue REGFlow d'un simple chatbot de rapport. La qualité de l'agrégation est le différentiateur produit.

**Principes d'agrégation.**

- **Ordre canonique des sections.** Pour une question de type "zoom FAIL", la structure imposée est : diagnostic causal court en tête (1-2 phrases), valeurs chiffrées impliquées, citation réglementaire, suggestion d'action. Pas de variation libre.
- **Citations inline.** Chaque fait chiffré est accompagné d'une citation structurée stockée dans le champ `citations` de la sortie. Aucun fait chiffré orphelin sans source.
- **Longueur calibrée par format.** Question factuelle : maximum 150 mots. Question analytique : maximum 800 mots. Question technique : maximum 500 mots. Déclenchement automatique de troncature intelligente si dépassement.
- **Actions proposées en fin de réponse.** Jusqu'à 3 actions sous forme de boutons UI, typées (overlay simulation, overlay sanction, ouvrir plan optimal, itérer correction, signer run, etc.).

---

# Partie II — 7 types de questions en T2

## 5. Question de type 1 — Zoom sur un FAIL

### Description

L'utilisateur demande à comprendre pourquoi un verdict FAIL spécifique a été produit. C'est le type de question le plus fréquent en T2.

### Déclencheurs

- Clic sur une ligne FAIL dans le tableau des verdicts.
- Message "pourquoi ce FAIL", "qu'est-ce qui cloche avec la règle 266 de 630", "explique-moi cet écart".
- Clic sur bouton "Expliquer" d'une carte de verdict.

### Spécialistes invoqués

Chaînage avec parallélisation partielle.

```
parallel [
  InvestigatorAgent(rule_id, annexe, gap, rubriques, colonnes)
  CitationAgent(rule_id)
]
  │
  └─> Regalica aggregates
```

### Output Regalica attendu

Format : `factuelle` ou `analytique` selon profondeur demandée.

Structure :
1. Phrase de diagnostic causal (cause racine probable).
2. Valeurs chiffrées : LHS, RHS, gap absolu et relatif.
3. Rubrique ou rubriques concernées avec leur libellé métier.
4. Citation réglementaire de la règle RDG.
5. Suggestion d'action (1 à 3).

### Exemple

> **User :** Pourquoi le FAIL sur la règle 266 de l'annexe 630 ?
>
> **Regalica :** L'écart provient d'une ventilation sectorielle incohérente sur la rubrique PA030202000000 (Dépôts d'épargne en devises). Le bilan RCM00 déclare 543 217,384 TND tandis que la SM 630 agrège 543 174,246 TND, soit un écart de 43,138 TND (0,008 %). La cause racine probable est une erreur de mapping comptable entre votre système de gestion centralisée des dépôts et le module de génération SM. [Circulaire BCT 2018-06 article 7 §2 sur la cohérence bilantielle des SM.]
>
> [Bouton] Voir l'impact simulation · [Bouton] Itérer la correction · [Bouton] Voir l'historique de cette rubrique

### Gardes

- Citations obligatoires. Sans citation disponible (rare), le diagnostic est affiché avec la mention "citation en cours de constitution".
- Confiance minimale 0.95 sur InvestigatorAgent.
- Pas de suggestion d'action générique (pas de "contactez votre DSI").

## 6. Question de type 2 — Grappe de causes racines

### Description

L'utilisateur demande si plusieurs FAIL ont une cause racine commune. C'est l'une des 4 valeurs ajoutées REGFlow par rapport au contrôle BCT nu (Document 1 §valeur ajoutée 3 — corrélation entre règles partageant une cause).

### Déclencheurs

- Message "y a-t-il un pattern", "ces FAILs sont-ils liés", "cause commune", "grappe".
- Clic sur une notification "5 FAILs partagent une cause racine probable".
- Déclenchement automatique par Regalica si le moteur a détecté un cluster (champ `cluster_id` dans les verdicts).

### Spécialistes invoqués

```
InvestigatorAgent(cluster_hint, list_of_related_fails)
  │
  └─> VisualizerAgent(heatmap rubrique × annexe avec densité de FAIL)
       │
       └─> Regalica aggregates
```

### Output Regalica attendu

Format : `analytique`.

Structure :
1. Affirmation de la cause racine identifiée ou du faisceau d'hypothèses.
2. Liste des FAILs appartenant à la grappe (nombre + quelques exemples représentatifs).
3. Visualisation heatmap jointe en artifact.
4. Suggestion d'action corrective unique qui résoudrait l'ensemble de la grappe.

### Exemple

> **User :** Ces FAILs sur les annexes 620, 630, 640 sont-ils liés ?
>
> **Regalica :** Les 17 FAILs détectés sur vos annexes 620, 630, 640 à l'arrêté 28/02/2026 partagent une cause racine commune : la ventilation sectorielle "Ménages" est absente de votre mapping comptable sur le périmètre des dépôts à vue en dinars. La correction de cette ventilation unique sur votre module SM résoudra l'ensemble des 17 FAILs. Le diagnostic s'appuie sur la convergence des rubriques impactées (PA030100000*, PA030101000*, PA030102000*) et sur l'absence systématique de la colonne sectorielle 8 (Ménages) dans votre extract comptable source.
>
> [Visualisation heatmap : densité FAIL par rubrique × annexe]
>
> [Bouton] Plan optimal de correction · [Bouton] Simuler après correction · [Bouton] Voir les 17 FAILs

## 7. Question de type 3 — Historique et récurrence

### Description

L'utilisateur veut savoir si une règle a déjà échoué par le passé, si une rubrique a tendance à dévier, si le batch courant est un cas atypique comparé à l'historique.

### Déclencheurs

- Message "est-ce la première fois", "déjà vu ce FAIL", "évolution sur 6 mois", "c'est récurrent".
- Bouton "Voir l'historique de cette rubrique" depuis une carte de verdict.

### Spécialistes invoqués

```
HistoricalAgent(tenant_id, analysis_type, annexe, rubrique, date_range)
  │
  └─> VisualizerAgent(line chart évolution temporelle)
       │
       └─> Regalica aggregates
```

### Doctrine stricte

L'HistoricalAgent est invoqué **uniquement après** une validation RDG complète du run courant. Jamais en remplacement. Jamais en pré-validation. Cette règle est appliquée au niveau de Regalica : le router refuse de classifier en `historique_recurrence` si `current_fsm_state` n'est pas dans T2/T3.

### Output Regalica attendu

Format : `analytique`.

Structure :
1. Constat de récurrence (oui/non, fréquence).
2. Tendance (stable, croissant, décroissant, volatil).
3. Anomalies détectées le cas échéant (z-score, changement abrupt, rupture de pattern).
4. Visualisation ligne temporelle.
5. Contextualisation si possible (changement de circulaire, de périmètre).

## 8. Question de type 4 — Citation réglementaire

### Description

L'utilisateur demande sur quoi repose juridiquement une règle ou un contrôle. Quel article de quelle circulaire justifie ce FAIL ?

### Déclencheurs

- Message "quel article", "quelle circulaire", "base réglementaire", "sur quoi repose cette règle".
- Bouton "Voir la source" depuis une règle affichée.

### Spécialistes invoqués

Invocation unique.

```
CitationAgent(rule_id, max_citations=3)
  │
  └─> Regalica aggregates
```

### Output Regalica attendu

Format : `technique`.

Structure :
1. Citation principale avec extrait, numéro d'article, numéro de circulaire, date de publication.
2. Citations secondaires éventuelles (autres circulaires qui renforcent).
3. Lien vers le document source en téléchargement.

## 9. Question de type 5 — Simulation d'impact

### Description

L'utilisateur demande "si je corrige X, qu'est-ce que ça change sur le run ?". Simulation de l'effet d'une correction avant de la faire vraiment.

### Déclencheurs

- Message "si je corrige cette rubrique", "impact si je passe 100 à 120".
- Bouton "Simuler l'impact" sur une carte de verdict FAIL.

### Spécialistes invoqués

Pas d'appel LLM principal. Le moteur d'évaluation lui-même est invoqué en mode simulation avec un clone temporaire de la CellMatrix mutée.

```
Moteur.evaluate(mutated_cellmatrix, same_rules) en mode read-only
  │
  └─> DiffAgent(baseline_run, simulated_run)
       │
       └─> VisualizerAgent(bar chart before/after)
            │
            └─> Regalica aggregates
```

### Doctrine

La simulation ne persiste jamais dans `validation_runs`. Elle produit un résultat éphémère visible à l'écran, téléchargeable en JSON si souhaité, mais sans traçabilité long terme. Si l'utilisateur veut officialiser la correction, il doit éditer son XML source, le re-uploader, et lancer une vraie itération.

### Output Regalica attendu

Format : `analytique`.

Overlay UI dédié "Simulation d'impact" (voir Document 4 maquettes Workspace v5).

Structure :
1. Récapitulatif de la modification simulée.
2. Chiffres avant / après.
3. Nombre de verdicts qui changent de statut (PASS→FAIL, FAIL→PASS).
4. Visualisation comparative.
5. Rappel : "cette simulation n'est pas persistée".

## 10. Question de type 6 — Estimation de sanction BCT

### Description

L'utilisateur demande quelle sanction BCT s'exposerait la banque si le batch était soumis en l'état avec ses FAILs. C'est la quatrième valeur ajoutée REGFlow — rendre tangible le risque juridique du FAIL non corrigé.

### Déclencheurs

- Message "combien je risque", "quelle sanction", "amende BCT", "pénalité".
- Bouton "Estimer la sanction" depuis la synthèse d'un run.

### Spécialistes invoqués

Invocation principalement déterministe avec référentiel des sanctions BCT (table `referentials_sanctions`) qui code la grille progressive de la circulaire 2017-06 articles 11-12.

```
Déterministe: calculate_sanction_estimate(fail_count, severity_distribution, arrete_type, délai_soumission)
  │
  └─> CitationAgent(circ_2017_06_art_11_12)
       │
       └─> Regalica aggregates
```

### Output Regalica attendu

Format : `factuelle` avec chiffres précis.

Overlay UI dédié "Sanction BCT estimée".

Structure :
1. Montant estimé de la sanction en TND.
2. Détail du calcul (grille par FAIL sévère, par FAIL d'arrondi, par retard de soumission).
3. Citation circulaire 2017-06 articles 11 et 12.
4. Mention obligatoire : "estimation indicative fondée sur la grille progressive publiée, la BCT se réserve le droit d'application discrétionnaire".

### Doctrine stricte

L'estimation est **indicative et informative**, jamais présentée comme un engagement ou une garantie. Le wording est strict pour éviter tout malentendu juridique.

## 11. Question de type 7 — Plan optimal de correction

### Description

L'utilisateur demande un plan ordonnancé de corrections à apporter à son SI source pour passer à zéro FAIL sévère, avec estimation d'effort par correction.

### Déclencheurs

- Message "plan de correction", "par où commencer", "quelles priorités".
- Bouton "Plan optimal" depuis la synthèse d'un run avec FAIL multiples.

### Spécialistes invoqués

Chaînage complexe.

```
parallel [
  HistoricalAgent(per fail: does this fail recur?)
  InvestigatorAgent(per cluster: deep cause analysis)
]
  │
  └─> Déterministe: rank_corrections(clusters, recurrence, effort)
       │
       └─> VisualizerAgent(gantt-like sequence)
            │
            └─> Regalica aggregates
```

### Output Regalica attendu

Format : `analytique` structuré.

Overlay UI dédié "Plan optimal" (voir maquettes).

Structure :
1. Synthèse : N corrections à faire, Y FAILs résolus en cumul.
2. Liste ordonnancée par priorité (effort moyen / impact FAIL).
3. Pour chaque correction : rubrique concernée, système source cible, effort estimé, FAILs résolus.
4. Visualisation séquence.
5. Mention des quick wins (corrections à effort trivial avec fort impact).

---

# Partie III — Questions hors T2

## 12. Questions en T0 — assistance à la préparation

En T0, les questions utilisateur portent sur la préparation du batch avant validation.

**Types canoniques.**

- "Quelles annexes dois-je ajouter ?" → `DependencyAgent` + Regalica liste les compagnes.
- "Ma date d'arrêté est-elle correcte ?" → `TemporalAgent` + Regalica explique cohérence ou divergence.
- "Quelle annexe est-ce ?" → `IngestorXMLAgent` + lecture référentiels.

## 13. Questions en Bibliothèque — aide à la saisie

Dans la surface Bibliothèque (maquettes Library v3), l'utilisateur saisit ou importe des règles et référentiels.

**Types canoniques.**

- "Aide-moi à saisir cette règle" → `RuleFormAssistAgent`.
- "Importe ce fichier Excel de règles" → `RuleExcelAssistAgent`.
- "Importe cette circulaire BCT" → `ReferentialIngestorAgent`.

Dans tous les cas, la sortie alimente le cycle 4-yeux de la FSM correspondante (Document 8 §15).

## 14. Questions hors contexte — aide générale

Quand aucun contexte spécifique ne peut être déterminé (utilisateur arrive sur la page d'accueil, pose une question générique).

**Types canoniques.**

- "Comment marche REGFlow ?" → réponse explicative depuis le prompt_bank entry dédié.
- "Qu'est-ce qu'une règle RDG ?" → réponse didactique avec citation Document 2.
- "Qui êtes-vous ?" → Regalica se présente en quelques phrases (persona).

Ces réponses sont produites par Regalica seule, sans invocation de spécialiste, avec le prompt_bank "general_help".

---

# Partie IV — Contrats d'orchestration

## 15. `RegalicaRouter` — détection d'intention

```python
class RegalicaRouter:
    """
    Prend un RegalicaInput, retourne un DetectedIntent.

    Implémenté comme un LLM call avec prompt_bank entry "regalica_router_v1".
    Température 0.1. Max tokens 512.
    """

    async def classify(self, input_: RegalicaInput) -> DetectedIntent:
        ...

    def _build_context(self, input_: RegalicaInput) -> dict:
        """Build the LLM context from FSM state + run_id + history."""
        return {
            "fsm_state": input_.current_fsm_state,
            "has_active_run": input_.current_run_id is not None,
            "is_in_t2_or_t3": input_.current_fsm_state in T2_T3_STATES,
            "last_user_messages": [t.content for t in input_.conversation_history if t.role == "user"][-3:],
        }
```

## 16. `RegalicaPlanner` — sélection des spécialistes

```python
class RegalicaPlanner:
    """
    Prend un DetectedIntent, retourne un ExecutionPlan.

    Implémenté comme une fonction pure sans appel LLM.
    La table de routage intent_type → specialists est codée en dur pour performance et déterminisme.
    """

    def plan(self, intent: DetectedIntent, input_: RegalicaInput) -> ExecutionPlan:
        match intent.intent_type:
            case "zoom_fail":
                return ExecutionPlan(
                    calls=[
                        AgentCall("investigator", parallel_group=1, input=...),
                        AgentCall("citation", parallel_group=1, input=...),
                    ]
                )
            case "grappe_causes":
                return ExecutionPlan(
                    calls=[
                        AgentCall("investigator", parallel_group=1, input=...),
                        AgentCall("visualizer", parallel_group=2, depends_on=["investigator"], input=...),
                    ]
                )
            # etc.

class ExecutionPlan(BaseModel):
    calls: list[AgentCall]
    estimated_tokens: int
    estimated_latency_ms: int

class AgentCall(BaseModel):
    agent_id: str
    parallel_group: int
    depends_on: list[str] = Field(default_factory=list)
    input: dict
```

## 17. `RegalicaAggregator` — composition de la réponse

```python
class RegalicaAggregator:
    """
    Prend les sorties JSON de tous les spécialistes invoqués et produit
    RegalicaOutput en langage naturel.

    Implémenté comme un LLM call avec prompt_bank entry spécifique par intent_type.
    Température 0.7. Max tokens selon format_type.
    """

    async def compose(
        self,
        intent: DetectedIntent,
        specialist_outputs: dict[str, BaseModel],
        input_: RegalicaInput,
    ) -> RegalicaOutput:
        prompt_key = f"regalica_aggregator_{intent.intent_type}_v1"
        prompt = await self.prompt_bank.get(prompt_key, locale=input_.locale)
        # ...
```

---

# Partie V — Gestion de l'ambiguïté

## 18. Questions ambiguës

Quand le router détecte une confiance < 0.70 sur le type d'intention, il retourne `intent_type = "ambiguous"` et Regalica répond par une question de clarification au lieu d'invoquer un spécialiste.

**Exemple.**

> **User :** pourquoi
>
> **Regalica :** Pourriez-vous préciser votre question ? Vous souhaitez comprendre pourquoi un FAIL est apparu, pourquoi une règle existe, ou pourquoi un batch a été rejeté par la BCT ?

## 19. Questions hors périmètre

Certaines questions ne relèvent pas du périmètre REGFlow : questions personnelles, demandes de conseil juridique, questions sur d'autres banques, questions sur la BCT elle-même au-delà des circulaires.

**Traitement.**

Le router retourne `intent_type = "out_of_scope"`. Regalica répond par une note de limitation polie :

> Je suis conçue pour vous assister sur la conformité BCT de vos reportings via REGFlow. Cette question dépasse ce périmètre. Souhaitez-vous que je vous aide sur un point précis d'un reporting en cours ?

## 20. Questions en état invalide

Certaines intentions n'ont pas de sens dans l'état courant. Demander une investigation FAIL alors qu'aucun run n'est actif. Demander une sanction BCT alors que le run est en succès.

**Traitement.**

Regalica explique gracieusement l'état requis et propose de naviguer.

> Pour comprendre un FAIL spécifique, il faut d'abord charger et valider un batch. Voulez-vous commencer par uploader votre annexe principale ?

---

# Partie VI — Budget et performances

## 21. Budget de tokens par type de question

| Intent | Router (in+out) | Specialists (total) | Aggregator (in+out) | Total |
|---|---|---|---|---|
| zoom_fail | 300 | 1 500 | 1 200 | 3 000 |
| grappe_causes | 300 | 3 000 | 1 500 | 4 800 |
| historique_recurrence | 300 | 2 000 | 1 200 | 3 500 |
| citation_reglementaire | 300 | 800 | 600 | 1 700 |
| simulation_impact | 300 | 1 500 | 1 000 | 2 800 |
| estimation_sanction | 300 | 500 | 1 000 | 1 800 |
| plan_optimal | 300 | 4 000 | 2 000 | 6 300 |
| assist_t0_precheck | 300 | 500 | 600 | 1 400 |
| assist_general | 300 | 0 | 600 | 900 |

**Coût moyen estimé** à `gemini-2.5-flash` (pricing grille 2026 : environ 0,075 USD / 1M tokens input et 0,30 USD / 1M tokens output). Une conversation T2 moyenne de 20 tours dont 5 questions profondes (zoom + grappe + plan optimal) consomme environ 60 000 tokens soit approximativement 0,01 USD par session complète.

## 22. Parallélisation des appels spécialistes

Les appels aux spécialistes sans dépendance sont parallélisés via `asyncio.gather()`. Les gains de latence sont significatifs : un zoom_fail en série prendrait 2 + 1 = 3 secondes, en parallèle environ 2,1 secondes.

**Limite de parallélisation.** Maximum 4 appels LLM simultanés par session pour respecter les quotas Gemini gratuits (60 RPM en 2026).

## 23. Cache et mémoization

**Cache L1 — session.** Les résultats de CitationAgent pour une règle donnée sont cachés pour toute la durée d'une session T2. Si l'utilisateur investigue plusieurs FAIL sur la même règle, une seule requête citation.

**Cache L2 — tenant.** Les références réglementaires les plus citées (articles des 3 circulaires principales BCT) sont cachés à l'échelle tenant avec TTL 24h.

**Pas de cache sur Investigator, Historical, Reporter.** Ces agents produisent des réponses contextualisées à un run et à un moment précis. Le cache serait contre-productif.

---

*Fin du Document 10 — Orchestration Regalica et 7 types de questions*
*Prochain artéfact : capture AS-IS evaluator-algorithm.md*
