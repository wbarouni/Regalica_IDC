# Analyse comportementale — comment Regalica lit la requête utilisateur, et benchmark vs Claude

**Date** : 2026-05-08
**Auteur** : ALGORIA Factory
**Cible** : équipe REGFlow + opérateur (validation interne)
**Scope** : seul le PARSING de la demande utilisateur — pas la composition de
la réponse, pas l'orchestration des spécialistes, pas le rendu UI.

---

## 1. Le pipeline de lecture côté Regalica (état actuel)

Quand le Compliance Officer tape un message dans le dock chat, voici le
chemin EXACT qu'emprunte la requête avant qu'un seul spécialiste soit
appelé. Chiffres entre crochets renvoient aux fichiers
`apps/chatbot-py/app/services/...` :

```
1. /chat/message  (apps/chatbot-py/app/routes/chat.py:_persist_user_… si activé)
        │
        │  text + tenant_id + user_id + conversation_id (optionnel)
        │  + context.{validation_run_id, fail}  (P1 frontend)
        ▼
2. orchestrate(message, ...)  [orchestrator.py:1640+]
        │
        │  charge intent_grammar (intent_specialists DB)
        │  charge regalica/router (prompt_bank)
        │  build_run_context (router_context.py)
        ▼
3. _extract_rule_number_from_message  [orchestrator.py:215+]   ← P1 backend
        │
        │  regex (?:r[èeé]gle|regle|rule|fail|n[°o])\s*\d+
        │  → renvoie target_num_regle: int | None
        ▼
4. detect_intent (LLM Gemini, temp=0.0)  [intent_router.py]
        │
        │  system_prompt = router template avec {message, run_context, ...}
        │  user_prompt   = vide — le message est INCLUS dans le system_prompt
        │                  via {message} placeholder
        │  → JSON {"intent": "<canon>", "confidence": <0..1>, "reasoning": "..."}
        ▼
5. _load_run_fails_context  + _narrow_fail_context_to_rule
        │
        │  pre-load top_fails du run + narrow si target_num_regle ≠ null
        ▼
6. (planner conditionnel — intents listés en platform_config)
        │
        │  optional disambiguation step ; renvoie plan_type ∈ {direct, multi_step,
        │  clarification}
        ▼
7. specialists in parallel  [asyncio.gather]
        │
        │  investigator, citation, historical, etc. selon intent_specialists
        ▼
8. P6 + Bug 6 hooks  [orchestrator.py:1906-1965]
        │
        │  append synthetic dependency/check_companions outcome (si annexes
        │  manquantes)
        │  append synthetic engine/rule_breakdown outcome (si fail unique
        │  + règle multi-termes)
        ▼
9. aggregator  (regalica/aggregate_<intent>)
        │
        │  user_message JSON =
        │    {user_message, intent_type, specialist_outputs}
        ▼
10. response_markdown  → frontend
```

Points-clés :

- **Le routeur classifie en 12 intents canoniques** (zoom, cluster,
  historical, citation, simulation, sanction, plan, launch_validation,
  download_report, ambiguous, out_of_scope, general_help). Les libellés
  vivent en DB (`intent_specialists`) ; tout libellé hors enum tombe en
  `general_help` (FALLBACK).
- **Le LLM router voit** : `{run_context}` (snapshot JSON du run actif :
  primary_annexe_code, total_fail_severe, top_fails[]…), `{message}` du
  user, `{question_types_list}` (les fn_name actifs en DB).
- **Le routeur NE voit PAS** : l'historique conversationnel précédent, le
  contenu du XML, la sélection FAIL côté UI (`context.fail` est consommé
  PLUS LOIN, par les spécialistes, pas par le router).
- **Le LLM tourne en `temperature=0.0`, `thinking=false`, `max_tokens=128`** —
  un seul appel court (~50ms p50, ~150ms p99) pour produire un JSON de
  3 clés.

## 2. Comment Claude (Anthropic) lit une requête, en comparaison

Claude (claude.ai, claude-3-7-sonnet, claude-opus-4) traite la requête
comme suit :

1. **Pas de routeur explicite à 12 enums.** Le modèle gère le parsing,
   la classification implicite, la planification ET la composition dans
   un seul forward pass — un agent monolithique versus REGFlow qui
   sépare router → planner → specialists → aggregator.

2. **Contexte conversationnel intégral.** Claude voit TOUT l'historique
   de la conversation à chaque tour (jusqu'à 200k tokens), y compris les
   tool results précédents. Regalica voit le tour courant + un snapshot
   `run_context` ; aucun chaînage de raisonnement à travers les tours.

3. **Lecture de la PRESENCE d'un identifiant ne dépend pas d'une regex
   manuelle.** Claude infère par sémantique. Regalica utilise une regex
   fixe `(?:r[èeé]gle|regle|rule|fail|n[°o])\s*\d+` qui rate les
   formulations comme :
   - « parle-moi du contrôle 102 » (mot « contrôle » non couvert)
   - « le 102, c'est quoi ? » (numéro nu sans ancre canonique)
   - « 102/r3 » (séparateur custom)
   - « la première règle qui échoue » (référence relative)

4. **Tool use natif vs specialist outputs.** Claude appelle des tools
   en runtime ; Regalica fige la liste des spécialistes par intent
   dans `intent_specialists`. Aucun chemin pour qu'un spécialiste
   appelle un autre dynamiquement (pas de récursivité).

5. **Modèle de défaillance.** Sur un message mal classé, Claude se
   replie sur une réponse en prose qui souvent EXPLIQUE l'ambiguïté
   (« je peux interpréter votre message de deux manières… »). Regalica
   tombe sur `general_help` ou `ambiguous` selon `confidence < 0.65`,
   puis `aggregate_general_help` ou `aggregate_ambiguous` rendent un
   message générique sans réutiliser le contexte du run.

## 3. Diagnostic — où Regalica perd l'utilisateur

Trois angles morts identifiés dans le pipeline actuel :

### Angle mort 1 : la regex de rule extraction est trop étroite

`_RULE_NUMBER_PATTERN` ne couvre que cinq ancres canoniques. En
production le Compliance Officer utilise un vocabulaire plus riche :
« contrôle », « ligne », « item », « point », « écart », « ce
truc-là », et même des références ordinales (« le premier »,
« le quatrième »). Conséquence : la P1 narrowing échoue silencieusement,
le top-fail (gap_absolute DESC) est analysé à la place de l'élément
demandé, le banquier voit une réponse à côté de sa question.

### Angle mort 2 : pas de mémoire conversationnelle dans le router

Le routeur reçoit `{run_context}` mais PAS l'historique des messages
précédents. Si l'utilisateur a dit au tour précédent « regarde la
règle 102 » puis tape simplement « et son écart relatif ? », le
routeur n'a aucun moyen d'inférer que la règle 102 reste l'ancrage —
il classifie le message comme une question générale sur les écarts
relatifs (probablement `general_help` faute d'identifiant). La
clarification qui devrait découler ne survient pas.

### Angle mort 3 : aucun mécanisme de reformulation / clarification active

Quand le routeur n'est pas sûr (`confidence < 0.65`), l'orchestrateur
route vers `aggregate_ambiguous` qui rend un message statique. Aucun
chemin pour que Regalica DEMANDE à l'utilisateur de préciser. Claude
demande naturellement « voulez-vous l'analyse de la règle X ou Y ? »
et incorpore la réponse au tour suivant. Regalica émet un texte
générique, l'utilisateur reformule, le routeur recommence à zéro,
sans bénéficier de la première classification ratée.

## 4. Plan de correction — par ordre d'impact / coût

### Correction A — élargir le vocabulaire d'ancrage (impact: fort, coût: faible)

Étendre `_RULE_NUMBER_PATTERN` pour couvrir :

- « contrôle 102 », « ligne 102 », « item 102 », « point 102 »
- « 102/r3 », « 102 r3 », « ax 630 r 102 » (compositions ax_term/num_regle)
- Numéro nu si UNE SEULE phrase contient un nombre 1-7 chiffres ET
  pas de date, montant, ou autre nombre concurrent

Effet attendu : 3-4× plus de messages routés correctement vers la
règle nommée.

Implémentation : extension de `_RULE_NUMBER_PATTERN` + tests
paramétriques dans `tests/test_rule_filter.py`.

### Correction B — passer le N-tour précédent au routeur (impact: fort, coût: moyen)

Étendre `build_run_context` pour inclure `last_user_message` et
`last_regalica_intent` quand `conversation_id` est défini. Le routeur
voit alors un contexte du type :

```json
{
  "primary_annexe_code": "630",
  "total_fail_severe": 4,
  "top_fails": [...],
  "last_intent": "zoom",
  "last_subject": {"num_regle": 102, "ax_term": "630"}
}
```

Le prompt routeur reçoit une nouvelle règle de désambiguation :
« si le message courant est une suite (« et… », « son… », « le
même… ») ET `last_subject` est défini, classifier dans le même
intent que `last_intent` ; recopier `last_subject` comme contexte
implicite. »

Effet attendu : continuité conversationnelle sans recharger l'XML
ou re-clarifier l'identifiant à chaque tour.

Implémentation : extension de `build_run_context` ; nouveau champ
`last_subject` dérivé du dernier message Regalica persisté en DB ;
règle de désambiguation ajoutée dans le router prompt via migration.

### Correction C — clarification active (impact: moyen, coût: élevé)

Quand le routeur retourne `confidence < 0.65` ET le run a >1 FAIL,
au lieu de router vers `aggregate_ambiguous`, l'orchestrateur :

1. Détermine les 2-3 intents les plus plausibles (top-2 du LLM router
   au lieu du seul top-1)
2. Compose une question de clarification SHORT FORM
   (« Voulez-vous une vue d'ensemble du run, l'analyse d'une règle
   précise, ou la liste des annexes manquantes ? »)
3. Persiste `pending_clarification` dans `conversations.context_summary`
4. Au tour suivant, lit cette pending et ajuste l'intent en
   conséquence

Effet attendu : zéro tour perdu en navigation. L'utilisateur formule,
Regalica clarifie, l'utilisateur précise, Regalica répond — au lieu
de la boucle « réponse générique → reformulation → réponse générique ».

Implémentation : nouvelle table ou colonne JSONB
`conversations.pending_clarification` ; route `/chat/message` lit la
pending avant le router et la priorise ; router prompt étendu avec
l'option « clarification » qui RECOMMANDE des intents au lieu de les
imposer.

### Correction D — fallback sémantique sur le top-K du LLM (impact: faible-moyen, coût: faible)

Aujourd'hui `detect_intent` lit uniquement le `intent` du JSON. Si
on demande au LLM `top_3_intents` avec leurs confidences, on peut :

- En cas de top-1 confidence < 0.5, comparer top-1 et top-2 via une
  règle simple (ex. si top-1=`general_help` et top-2=`zoom` avec
  écart < 0.15, prefer top-2)
- Logger le top-3 systématiquement pour télémétrie sans changer la
  logique active

Effet attendu : meilleur recall sur les cas frontière, sans
dégradation des cas simples.

Implémentation : extension du JSON Schema de sortie du router prompt ;
extension de `IntentResult` avec `alternatives: list[(intent,
confidence)]` ; logique de tri dans `detect_intent`.

## 5. Recommandation de séquencement

| #   | Correction               | Quand          | Coût dev  | Risque                                           |
| --- | ------------------------ | -------------- | --------- | ------------------------------------------------ |
| 1   | A — élargir regex        | Sprint suivant | 1-2h      | Très faible (purement additif)                   |
| 2   | D — top-K fallback       | Sprint suivant | 3-4h      | Faible (n'altère pas le comportement par défaut) |
| 3   | B — mémoire N-1          | Sprint +1      | 1 jour    | Moyen (touche persistance + router prompt)       |
| 4   | C — clarification active | Sprint +2      | 2-3 jours | Élevé (nouvelle table, nouveau flow, prompts)    |

A + D ensemble couvrent ~70% des cas où Regalica rate aujourd'hui la
demande. B couvre les conversations multi-tours qui sont le pattern
banquier dominant après les démos. C est le polish ; sans A/B/D
préalables, il rajoute de la complexité sans capturer les gros
volumes.

## 6. Anti-recommandations explicites

- **Ne PAS supprimer le routeur DB-driven** au profit d'un appel
  Claude « monolithique ». Les 12 intents canoniques sont la base de
  la facturation, de l'audit, de la traçabilité 4-eyes des prompts.
  Un routeur LLM unique invisibiliserait ces frontières.
- **Ne PAS hardcoder les corrections A/B/C dans le code applicatif.**
  Les nouvelles règles de désambiguation, les variantes regex, les
  seuils de confidence DOIVENT vivre en DB (`platform_config`,
  `prompt_bank`, `intent_specialists`) — le canon du repo est zéro
  hardcoding (CLAUDE.md §10).
- **Ne PAS ajouter Claude comme provider alternatif.** Le doctrine
  REGFlow gèle Gemini 2.5 Flash + Ollama Qwen 2.5 3B comme fallback
  local. Toute proposition de Claude en production est refusée.

## 7. Métriques de succès post-corrections

À mesurer une fois A+D déployés (Sprint suivant) :

| Métrique                                                                    | Aujourd'hui (estimation)       | Cible post-A+D                 |
| --------------------------------------------------------------------------- | ------------------------------ | ------------------------------ |
| Taux de routage correct vers `zoom` quand l'utilisateur cite une règle      | ~70% (regex étroit)            | ≥90%                           |
| Taux de routage correct vers `cluster` sur questions broad ou inter-annexes | ~50% (avant migration 095/099) | ≥85% (après 099)               |
| Latence routage p50                                                         | ~50ms                          | ≤80ms (top-K LLM ajoute ~30ms) |
| Tours perdus en boucle de reformulation                                     | non instrumenté                | <5% des sessions               |

Instrumentation requise : log structuré
`router.classify(message_hash, intent_chosen, confidence,
alternatives, runtime_ms)` envoyé à Loki/Prometheus via
`structlog.contextvars` (déjà en place côté chatbot-py).

---

**Conclusion.** Regalica lit aujourd'hui la requête à travers un
goulot étroit (regex + 12-enum router sans contexte conversationnel).
Le rapprochement avec Claude se fait NON en remplaçant Regalica par
Claude, mais en élargissant trois axes — vocabulaire d'ancrage,
mémoire N-1, clarification active — tout en respectant le doctrine
DB-driven du repo. Les corrections A et D sont commitables dans un
sprint et capturent la majorité du gap sans toucher la stack gelée.
