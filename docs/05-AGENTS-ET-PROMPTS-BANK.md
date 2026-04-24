# REGFlow — Plateforme de Conformité BCT par Intelligence Artificielle

## Document 5 — Agents et `prompt_bank`

**Version :** 1.0
**Date :** avril 2026
**Périmètre :** couche prompts en base, invariant anti-hardcoding, cycle de vie des prompts avec gouvernance 4-yeux, mapping des 14 agents vers leurs `agent_key` dans `prompt_bank`, règles de rédaction. Ce document est la source of truth des prompts ; les contrats JSON input/output des agents sont au Document 9, l'orchestration Regalica au Document 10, le schéma SQL de la table au Document 6 §8.
**Auteur :** Équipe REGFlow
**Statut :** référence canonique pour Claude Code
**Dépendances :** Document 3 (doctrine zéro-hardcoding), Document 6 (schéma SQL, en particulier §8 `prompt_bank`), Document 9 (contrats JSON des 14 agents), Document 10 (orchestration Regalica)

---

## Sommaire

**Partie I — Principe fondateur**

1. Pourquoi une `prompt_bank` en base et pas en code
2. Invariant produit : aucun prompt hardcodé
3. Conséquences architecturales

**Partie II — Structure de `prompt_bank`**

4. Renvoi vers le schéma SQL exact (Document 6 §8)
5. Champs clés et sémantique
6. Cycle de vie `draft → in_review → active → deprecated`

**Partie III — Les 14 agents et leurs `agent_key`**

7. Regalica orchestratrice — trois sous-agents
8. Agents de pré-validation T0 (déterministes)
9. Agents de gouvernance 4-yeux (LLM)
10. Agents de post-validation T2/T3 (LLM critiques et hybrides)
11. Agents d'infrastructure conversationnelle

**Partie IV — Gouvernance 4-yeux des prompts**

12. Proposition par un auteur
13. Validation par un reviewer distinct
14. Déploiement progressif par feature flag
15. Rollback instantané

**Partie V — Versioning et audit**

16. Historisation bitemporelle
17. Audit log obligatoire
18. Capture des outputs pour régression

**Partie VI — Stratégie de cold-start**

19. Pas de `prompt_bank` en Phase 0
20. Seed initial en Phase 4
21. Matrice Document 5 ↔ Document 9 ↔ Document 10

**Partie VII — Règles de rédaction des prompts**

22. Pas d'emoji, pas de formules serviles
23. Vouvoiement systématique côté Regalica
24. Citations obligatoires pour toute affirmation factuelle
25. Budget de tokens maîtrisé par type de question

---

# Partie I — Principe fondateur

## 1. Pourquoi une `prompt_bank` en base et pas en code

Les prompts LLM de REGFlow vivent dans une table PostgreSQL (`prompt_bank`) et jamais dans le code TypeScript ou Python. Ce choix structurant découle de cinq contraintes produit et réglementaires :

1. **Auditabilité.** Chaque modification de prompt doit être retraçable dans `audit_log` avec auteur, reviewer, timestamp et justification. Un prompt dans le code serait tracé par Git, mais pas par l'audit trail réglementaire que les banques exigent.

2. **Gouvernance 4-yeux applicative.** PRD invariant n°9 (Document 3 §25 invariant 10) impose `requested_by_user_id != decided_by_user_id` sur toute modification de règle, référentiel ou prompt. Cette contrainte s'applique au niveau SQL via `four_eyes_approvals` et est donc impossible à porter en Git sans passer par la DB.

3. **Hot-reload.** Un correctif de prompt doit être actif en quelques secondes, sans redéploiement applicatif. Un prompt en base est rechargé au prochain appel LLM ; un prompt en code exige un rebuild + redeploy des conteneurs.

4. **Feature flags par tenant.** Un nouveau prompt peut être activé progressivement — d'abord sur un utilisateur pilote, puis sur un tenant complet, puis tenant-wide. Impossible proprement si le prompt est en code.

5. **Isolation multi-tenant.** Certains prompts peuvent varier par tenant (par exemple une persona de salutation localisée, un ton adapté à une culture bancaire différente). La DB porte ces variations, le code ne doit pas.

## 2. Invariant produit : aucun prompt hardcodé

C'est un invariant non négociable (Document 3 §25 invariant 1, PRD §5.5). Le code applicatif TypeScript et Python n'embarque **aucune** chaîne de caractère destinée à être envoyée comme prompt à un LLM. Toutes ces chaînes sont lues depuis `prompt_bank` par `agent_key` au moment de l'invocation.

**Conséquence opérationnelle.** Dans un sprint Phase 4 où l'on écrit un nouvel agent, le workflow est strict :

1. Créer l'entrée `prompt_bank` en `status = 'draft'` via migration SQL ou via la procédure 4-yeux.
2. Écrire le code Python de l'agent qui lit son prompt par `agent_key` + version active.
3. Valider la sortie Pydantic (contrats du Document 9).
4. Passer l'entrée en `active` via 4-yeux.

Jamais « on colle le prompt dans le code, on testera, on déplacera en DB plus tard ». Cette tentation est explicitement proscrite. Un code review qui verrait une chaîne de prompt en dur refuse le merge.

**Exception unique.** Les messages d'erreur système retournés par Regalica en cas d'indisponibilité de tous les LLM (Document 9 §5, Document 10 §19) sont des constantes applicatives — ce ne sont pas des prompts mais des réponses de fallback. Elles vivent dans le code avec localisation i18n (Phase 5).

## 3. Conséquences architecturales

La doctrine `prompt_bank` oriente plusieurs choix structurants :

- **Service `apps/chatbot-py` stateless sur les prompts.** Pas de cache applicatif long-lived. Un appel agent commence par une requête DB `SELECT prompt_template, params_schema FROM prompt_bank WHERE agent_key = $1 AND status = 'active'`. Le coût latence est négligeable (~1 ms côté Postgres local, index composite sur `(agent_key, status)`).
- **Tests unitaires agent = fixture prompt_bank.** Les tests pytest de Phase 4 injectent une entrée `prompt_bank` de fixture dans le setup, plutôt que de mocker une constante de code. Voir Document 9 §3.
- **Déploiement continu des prompts.** Une nouvelle version de prompt peut être poussée en production via une simple migration SQL ou via l'UI Library (§12-15), sans toucher au code applicatif ni aux images Docker.
- **Observabilité prompt-level.** Chaque appel LLM logge `agent_key + prompt_version` utilisés. Permet des dashboards par version de prompt, détection de régression et rollback ciblé.

---

# Partie II — Structure de `prompt_bank`

## 4. Renvoi vers le schéma SQL exact

Le schéma exhaustif de la table `prompt_bank` avec ses colonnes, types, index, contraintes et politiques RLS vit au **Document 6 §8**. Ce présent document se limite aux champs sémantiquement importants pour la gouvernance et le mapping agents. Toute discussion de colonne manquante ou de contrainte à ajouter se fait contre le Document 6 en source of truth, pas contre le Document 5.

## 5. Champs clés et sémantique

| Champ                                       | Sémantique                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `agent_key`                                 | Identifiant stable de l'agent et de sa fonction (p.ex. `regalica_router_v1`, `investigator_v1`)       |
| `version`                                   | Entier monotone croissant par `agent_key`, permet plusieurs versions coexistantes (une seule active)  |
| `prompt_template`                           | Texte du prompt avec placeholders typés (p.ex. `{{run_id}}`, `{{fail_rule_id}}`, `{{batch_context}}`) |
| `params_schema`                             | JSON Schema décrivant les paramètres attendus ; validé par Pydantic runtime avant substitution        |
| `status`                                    | `draft \| in_review \| active \| deprecated`                                                          |
| `feature_flag_key`                          | Optionnel, référence une entrée de `feature_flags` pour activation progressive                        |
| `tenant_slug`                               | Nullable ; NULL = prompt global, non-NULL = prompt spécifique à un tenant                             |
| `valid_from`, `valid_to`                    | Historisation bitemporelle (Document 6 §6)                                                            |
| `created_by_user_id`, `approved_by_user_id` | Gouvernance 4-yeux (obligatoirement distincts via contrainte SQL)                                     |

**Règle d'unicité.** Pour un `(agent_key, tenant_slug)` donné, une seule ligne peut avoir `status = 'active'` à un instant T. Les versions antérieures sont en `deprecated`, les futures en `draft` ou `in_review`.

**Placeholders typés.** Les `{{placeholder}}` dans `prompt_template` sont substitués côté `apps/chatbot-py` avant envoi au LLM. Le `params_schema` Pydantic garantit que le caller fournit exactement les bons paramètres ; un appel qui omet un placeholder requis lève une `AgentInputValidationError` avant toute invocation LLM (Document 9 §5).

## 6. Cycle de vie `draft → in_review → active → deprecated`

Un prompt traverse quatre états dans sa vie.

| État         | Qui peut créer / passer       | Conditions                                                                  | Conséquence runtime                                     |
| ------------ | ----------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| `draft`      | Auteur (rôle `prompt_editor`) | Création initiale ou évolution                                              | Jamais invoqué en prod ; utilisable en tests de dev     |
| `in_review`  | Auteur                        | Soumission à review via `four_eyes_approvals`                               | Jamais invoqué en prod ; visible dans la file d'attente |
| `active`     | Reviewer distinct             | Approbation 4-yeux + (optionnel) activation de feature flag                 | Invoqué par `apps/chatbot-py` au prochain appel agent   |
| `deprecated` | Système                       | Une nouvelle version passe en `active` ; l'ancienne bascule en `deprecated` | Plus jamais invoqué, conservé pour audit                |

**Transitions interdites.**

- Pas de `draft → active` direct. La revue 4-yeux est obligatoire via `in_review`.
- Pas de réactivation d'un `deprecated`. On crée une nouvelle version `draft` qui remonte la chaîne.
- Pas de modification en place d'un `active`. Toute correction crée une nouvelle version.

**Transitions formalisées dans la FSM 4-yeux** du Document 8 §15-17. Les triggers SQL refusent les transitions non autorisées côté DB, indépendamment du code applicatif.

---

# Partie III — Les 14 agents et leurs `agent_key`

Les 14 agents sont décrits exhaustivement au Document 9 (contrats JSON input/output, températures LLM, garde-fous, cas d'erreur). Le présent document se concentre sur leur **mapping vers `prompt_bank`** — quelles entrées `agent_key` chaque agent utilise, combien de prompts il consomme, et leurs versions initiales.

## 7. Regalica orchestratrice — trois sous-agents

Regalica n'est pas un agent unique avec un seul prompt. C'est un orchestrateur composé de trois sous-agents (Document 10 Partie IV), chacun avec son `agent_key` distinct dans `prompt_bank`.

| `agent_key`                                     | Rôle                                                                 | Version initiale | Température |
| ----------------------------------------------- | -------------------------------------------------------------------- | ---------------- | ----------- |
| `regalica_router_v1`                            | Classification d'intention parmi les 7 types + ambigu + out-of-scope | 1                | 0.0         |
| `regalica_planner_v1`                           | Sélection des spécialistes à invoquer selon l'intention détectée     | 1                | 0.0         |
| `regalica_aggregator_zoom_fail_v1`              | Composition d'une réponse pour question type 1 (zoom FAIL)           | 1                | 0.7         |
| `regalica_aggregator_grappe_cause_racine_v1`    | Composition pour question type 2 (grappe)                            | 1                | 0.7         |
| `regalica_aggregator_historique_recurrence_v1`  | Composition pour question type 3 (historique)                        | 1                | 0.7         |
| `regalica_aggregator_citation_reglementaire_v1` | Composition pour question type 4 (citation)                          | 1                | 0.3         |
| `regalica_aggregator_simulation_impact_v1`      | Composition pour question type 5 (simulation)                        | 1                | 0.5         |
| `regalica_aggregator_estimation_sanction_v1`    | Composition pour question type 6 (sanction)                          | 1                | 0.3         |
| `regalica_aggregator_plan_optimal_v1`           | Composition pour question type 7 (plan optimal)                      | 1                | 0.7         |
| `regalica_aggregator_ambiguous_v1`              | Demande de clarification sur question ambiguë                        | 1                | 0.5         |
| `regalica_aggregator_out_of_scope_v1`           | Note de limitation polie hors périmètre                              | 1                | 0.5         |
| `regalica_aggregator_general_help_v1`           | Aide générale hors T2 (p.ex. « qui êtes-vous ? »)                    | 1                | 0.5         |

**Total Regalica : 12 `agent_key`.** Le router et le planner sont à température 0.0 (classification déterministe). Les aggregators sont à température 0.7 par défaut (naturel conversationnel) sauf pour les types 4 (citation) et 6 (sanction) qui restent à 0.3 pour ne pas dériver factuellement. Voir Document 9 §6 et Document 10 pour les contrats JSON précis.

## 8. Agents de pré-validation T0 (déterministes)

Trois agents déterministes tournent en T0 (Document 9 §7-9) et **ne consomment pas `prompt_bank`** — ils sont 100 % code TypeScript ou Python sans appel LLM. Ils sont inclus ici pour complétude du mapping.

| Agent              | `agent_key` | Techno                         | Rôle                                              |
| ------------------ | ----------- | ------------------------------ | ------------------------------------------------- |
| `IngestorXMLAgent` | —           | `@regflow/bct-xml-parser` (TS) | Parse dual-nomenclature vers `CellMatrix`         |
| `DependencyAgent`  | —           | Python déterministe            | Détection annexes compagnes, matrice CC-tech §9.5 |
| `TemporalAgent`    | —           | Python déterministe            | Cohérence inter-XML de date d'arrêté              |

**Pourquoi déterministes.** Ces trois agents produisent des outputs factuels vérifiables directement (parser XML, lookup matrice, comparaison de dates). L'introduction d'un LLM ici n'apporterait aucune valeur et ajouterait de la latence et du coût. La capture AS-IS (`docs/as-is-captured/bct-xml-parser-algorithm.md`, `docs/as-is-captured/structure-validator-rules.md`) documente leurs algorithmes.

## 9. Agents de gouvernance 4-yeux (LLM)

Trois agents LLM assistent la gouvernance des référentiels et des règles (Document 9 §10-12). Ils ne sont invoqués que dans l'UI Library (Document 4 §21) et jamais dans le chemin critique de validation.

| Agent                      | `agent_key`               | Température | Rôle                                                           |
| -------------------------- | ------------------------- | ----------- | -------------------------------------------------------------- |
| `RuleExcelAssistAgent`     | `rule_excel_assist_v1`    | 0.3         | Assiste l'import de règles depuis `RDG.xlsx`                   |
| `RuleFormAssistAgent`      | `rule_form_assist_v1`     | 0.3         | Assiste la saisie manuelle d'une nouvelle règle via formulaire |
| `ReferentialIngestorAgent` | `referential_ingestor_v1` | 0.3         | Importe des référentiels depuis PDF ou XLSX                    |

**Température 0.3.** Ces agents font du mapping structurant (extraire une formule depuis une ligne Excel, typer une valeur, déduire une rubrique cible). Un peu de flexibilité est utile mais toute dérive créative est à proscrire.

**Déclencheurs.** Tous les trois sont invoqués sur action utilisateur explicite dans Library, jamais par Regalica ni par le moteur. Leurs outputs sont systématiquement proposés en brouillon à l'utilisateur, qui valide ou corrige avant soumission 4-yeux.

## 10. Agents de post-validation T2/T3 (LLM critiques et hybrides)

Six agents opèrent en T2/T3 pour enrichir les verdicts et les conversations (Document 9 §13-18).

| Agent               | `agent_key`                           | Type                     | Température | Rôle                                                 |
| ------------------- | ------------------------------------- | ------------------------ | ----------- | ---------------------------------------------------- |
| `InvestigatorAgent` | `investigator_v1`                     | LLM critique             | 0.3         | Explication causale d'un FAIL avec action suggérée   |
| `HistoricalAgent`   | `historical_v1`                       | Hybride (SQL + LLM)      | 0.5         | Tendances et récurrences sur runs historiques        |
| `ReporterAgent`     | `reporter_docx_v1`, `reporter_pdf_v1` | LLM                      | 0.5         | Génère rapports DOCX et PDF (deux prompts distincts) |
| `VisualizerAgent`   | `visualizer_v1`                       | Hybride (code + LLM)     | 0.3         | Produit graphiques et tableaux de synthèse           |
| `CitationAgent`     | `citation_v1`                         | Hybride (RAG + LLM)      | 0.3         | Trouve la citation réglementaire exacte d'une règle  |
| `DiffAgent`         | `diff_v1`                             | Déterministe + narration | 0.5         | Compare deux runs et narre les changements           |

**`InvestigatorAgent` est critique.** C'est l'agent qui produit l'explication causale d'un FAIL sévère — la valeur ajoutée n°4 du produit (Document 1 §10). Son seuil de confiance est relevé à 0.95 (Document 9 §4) : sous ce seuil, Regalica n'affiche pas la réponse et demande une reformulation. Sa température 0.3 garantit stabilité factuelle.

**`ReporterAgent` a deux prompts.** Un pour DOCX (structure managériale, scorecard), un pour PDF (mise en page Edition One pour archivage 10 ans). Même agent orchestré côté code, deux `agent_key` pour permettre de faire évoluer les formats indépendamment.

**`HistoricalAgent` exige T1 complet** (invariant documenté au Document 10 §7 et repris en §2 du Document 4).

## 11. Agents d'infrastructure conversationnelle

Deux agents déterministes gèrent la plomberie conversationnelle (Document 9 §19-20).

| Agent               | `agent_key` | Rôle                                                                    |
| ------------------- | ----------- | ----------------------------------------------------------------------- |
| `NotificationAgent` | —           | Gère pré-alertes T0 et alertes T1/T2 ; pas d'appel LLM                  |
| `GedAgent`          | —           | Stockage documentaire attaché aux runs (XML sources, exports, rapports) |

Ces agents ne consomment pas `prompt_bank` parce qu'ils ne produisent jamais de langage naturel destiné à l'utilisateur. Les textes des notifications sont des templates i18n portés par le frontend (Phase 5), pas des prompts LLM.

**Total `prompt_bank` après Phase 4 :** environ 12 (Regalica) + 3 (gouvernance) + 7 (T2/T3, dont 2 pour Reporter) = **22 entrées `agent_key` distinctes** en production initiale. Chaque `agent_key` aura sa version 1 au seed Phase 4, puis évoluera indépendamment.

---

# Partie IV — Gouvernance 4-yeux des prompts

La modification d'un prompt actif est une opération sensible : un prompt mal rédigé peut dériver le ton de Regalica, produire des affirmations non sourcées, ou ouvrir une brèche de prompt injection. La gouvernance 4-yeux applicative protège contre ces dérives en imposant deux acteurs humains distincts sur toute évolution.

## 12. Proposition par un auteur

L'auteur est un utilisateur du tenant avec le rôle `prompt_editor` (table `user_roles`, Document 6 §15). Il a accès à l'onglet « Prompts » de l'écran Library (Document 4 §21) et peut :

- **Créer une nouvelle version d'un `agent_key` existant.** Duplique la version `active` courante en `draft`, charge le `prompt_template` et le `params_schema` dans un éditeur, applique les modifications.
- **Créer un nouveau `agent_key`.** Cas rare, réservé à l'introduction d'un agent inédit. Exige une justification écrite et passe par une revue architecturale (hors périmètre 4-yeux standard).
- **Proposer une dépréciation.** Pour retirer un `agent_key` devenu inutile (p.ex. rationalisation des aggregators Regalica).

**Soumission `draft → in_review`.** L'auteur finalise son brouillon puis clique « Soumettre à revue ». L'action :

1. Passe la ligne `prompt_bank` en `status = 'in_review'`.
2. Insère une demande dans `four_eyes_approvals` avec `entity_type = 'prompt_bank'`, `entity_id = <prompt_id>`, `requested_by_user_id = <auteur>`, `payload = <diff unifié>`, `justification = <texte libre obligatoire>`.
3. Déclenche une notification `NotificationAgent` vers le pool des reviewers éligibles du tenant.

**Garde-fou d'auto-validation.** L'auteur ne peut pas ensuite s'auto-approuver — la contrainte `CHECK (requested_by_user_id != decided_by_user_id)` sur `four_eyes_approvals` est inviolable au niveau SQL (Document 6 §16). Le code applicatif double cette contrainte avec une vérification côté API, mais la DB reste l'autorité finale.

## 13. Validation par un reviewer distinct

Le reviewer est un second utilisateur portant le rôle `prompt_reviewer` ou `prompt_editor` (la distinction tenant-par-tenant, voir Document 6 §15). Il reçoit la notification de demande, ouvre la file Library « Demandes 4-yeux » et visualise :

- Le diff unifié entre la version courante `active` et la version proposée `in_review`.
- La justification de l'auteur.
- L'historique complet des versions de ce `agent_key` pour contexte.
- Les métriques d'utilisation de la version `active` sur les 30 derniers jours (nombre d'appels, taux d'erreur Pydantic, latence p95, confidence moyenne des outputs).

**Trois issues possibles.**

| Décision            | Effet DB                                                                                                                                                          | Effet runtime                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Approve**         | `four_eyes_approvals.state = 'approved'`, nouveau prompt `status = 'active'`, `valid_from = NOW()` ; ancienne version `status = 'deprecated'`, `valid_to = NOW()` | Prochain appel agent charge la nouvelle version    |
| **Reject**          | `four_eyes_approvals.state = 'rejected'` avec `reviewer_comment` obligatoire ; prompt reste en `in_review` puis repasse en `draft` côté auteur                    | Rien, la version `active` précédente reste en prod |
| **Request changes** | `four_eyes_approvals.state = 'changes_requested'` ; prompt repasse en `draft` avec le commentaire reviewer visible à l'auteur                                     | Rien, la version `active` précédente reste en prod |

**Justification obligatoire sur reject/changes_requested.** Un commentaire vide est refusé par l'UI et par l'API. L'audit trail exige la traçabilité du refus (Document 3 §20).

**Transitions atomiques.** Le passage approve est une transaction SQL unique qui met à jour deux lignes (ancienne en `deprecated`, nouvelle en `active`) dans le même statement. Impossible d'avoir deux versions simultanément `active` pour le même `agent_key`, même sous contention.

## 14. Déploiement progressif par feature flag

Le champ `feature_flag_key` optionnel de `prompt_bank` (§5) permet de dissocier la promotion en `active` de l'activation effective runtime. Cas d'usage typique :

1. Le reviewer approuve la nouvelle version → `status = 'active'` mais `feature_flag_key = 'prompt_regalica_router_v2_rollout'`.
2. Le code `apps/chatbot-py` lit `prompt_bank` pour l'agent demandé mais **vérifie le feature flag** avant substitution. Si le flag est à 0 % sur le tenant courant, il retombe sur la version précédente encore marquée pour transition.
3. L'opérateur monte progressivement le flag : 5 % des utilisateurs, puis 25 %, puis 100 %.
4. Monitoring activé : latence, erreurs Pydantic, taux de fallback, satisfaction utilisateur (via signal implicite ou explicite).

**Double promotion.** Pour un déploiement sans risque, la meilleure pratique est :

- Version N-1 : `active`, `feature_flag_key = NULL` (par défaut, 100 % des appels).
- Version N : `active`, `feature_flag_key = '...'` (contrôle progressif).
- Une fois N à 100 % sain, soit on le laisse tel quel et on retire l'ancien flag en cleanup, soit on inverse et on déprécie N-1.

**TODO(@wbarouni)** : définir précisément l'API `apps/chatbot-py` qui résout le prompt effectif en présence d'un feature flag (fallback explicite sur version précédente `active`, ou fallback sur version `deprecated` la plus récente). Phase 4.

## 15. Rollback instantané

Si une nouvelle version de prompt dérive en production (verdict qualitatif de l'opérateur sur les réponses Regalica, remontée utilisateur via signal `thumbs_down`, alerte Pydantic validation failure), le rollback se fait en **deux actions applicatives** :

1. **Désactivation du feature flag** (si la version fautive était flaggée). Effet immédiat au prochain appel : le code retombe sur la version précédente. Aucune migration, aucun redéploiement.
2. **Dépréciation forcée de la version fautive** via une procédure 4-yeux d'urgence. La version fautive passe en `status = 'deprecated'` avec `justification_rollback` obligatoire. Une version correctif entre en `draft` pour la boucle suivante.

**Garantie.** Le rollback ne supprime jamais la version fautive — elle reste visible pour audit et post-mortem. L'historisation bitemporelle garantit qu'on peut reconstruire à tout moment l'état exact de `prompt_bank` à l'instant T d'un run historique, pour expliquer pourquoi Regalica a dit ce qu'elle a dit ce jour-là (Document 6 §6).

**Priorité absolue.** Un rollback de prompt passe devant toute autre tâche en cours : la confiance utilisateur dans Regalica est l'actif le plus fragile du produit.

---

# Partie V — Versioning et audit

## 16. Historisation bitemporelle

`prompt_bank` applique le même modèle bitemporel que `rules` et `referentials_*` (Document 6 §6). Chaque ligne porte deux colonnes temporelles :

- `valid_from` — timestamp à partir duquel la version est effective en production.
- `valid_to` — timestamp à partir duquel la version n'est plus effective. NULL tant que la version reste `active`.

**Reconstruction d'état à l'instant T.** Pour toute question du type « quel prompt a été utilisé pour cet agent à la date D du run historique R ? », la requête canonique est :

```sql
SELECT prompt_template
FROM prompt_bank
WHERE agent_key = $1
  AND status IN ('active', 'deprecated')
  AND valid_from <= $2
  AND (valid_to IS NULL OR valid_to > $2)
  AND (tenant_slug IS NULL OR tenant_slug = $3);
```

Cette capacité de relecture historique est obligatoire pour l'audit réglementaire : un régulateur qui conteste une réponse de Regalica doit pouvoir reconstruire exactement le contexte prompt de cette réponse, même deux ans plus tard.

**Interaction avec `validation_runs`.** Chaque ligne de `messages` dans une conversation T2 persiste le `prompt_bank_id` utilisé pour la réponse assistant. C'est une clé étrangère vers la ligne exacte (et donc la version) du prompt — pas seulement l'`agent_key`. Voir Document 6 §20.

**Jamais de hard delete.** Une version `deprecated` ne peut pas être supprimée, même des années après. La contrainte est portée par un trigger `prompt_bank_no_delete` au niveau DB (Document 6 §23). Le cleanup s'opère par archivage à froid via partitionnement si le volume l'exige (TODO(@wbarouni) : évaluer en Phase 6 selon la taille réelle).

## 17. Audit log obligatoire

Toute opération sur `prompt_bank` produit une ligne dans `audit_log` partitionné (Document 6 §17). Schéma d'entrée type :

| Champ              | Valeur typique                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `entity_type`      | `prompt_bank`                                                                                                            |
| `entity_id`        | UUID de la ligne `prompt_bank`                                                                                           |
| `action`           | `draft_created`, `submitted_for_review`, `approved`, `rejected`, `deprecated`, `feature_flag_changed`, `rollback_forced` |
| `actor_user_id`    | UUID de l'utilisateur effectuant l'action                                                                                |
| `reviewer_user_id` | UUID du reviewer pour les actions `approved` / `rejected`                                                                |
| `payload`          | JSON avec `agent_key`, `version`, et diff complet                                                                        |
| `justification`    | Texte libre obligatoire pour `rejected` et `rollback_forced`                                                             |
| `occurred_at`      | Timestamp UTC ISO-8601                                                                                                   |

**Conservation.** Les entrées `audit_log` liées à `prompt_bank` sont conservées au minimum 10 ans (PRD §14 — conservation signatures 10 ans, étendue aux prompts parce qu'ils pilotent les signatures). Règle à valider en Phase 6 contre la politique tenant.

**Requêtes d'audit.** L'onglet « Prompts » de Library expose un lien « Audit trail » sur chaque `agent_key` qui déroule toutes les actions historiques, lisible par les rôles `auditor`, `tenant_admin`, et par l'auteur original du prompt.

## 18. Capture des outputs pour régression

Pour détecter une dérive qualitative d'un prompt après un changement de version, `apps/chatbot-py` capture pour un échantillon stratifié d'appels agents :

- Le `prompt_bank_id` exact utilisé.
- Les paramètres d'entrée (substituables pour replay).
- L'output brut LLM.
- L'output Pydantic validé.
- Le confidence score retourné.
- La latence observée.

**Utilisation en régression.** Lors du passage d'une version N-1 vers une version N d'un `agent_key`, le pipeline de test peut rejouer les captures N-1 contre N et comparer les outputs sémantiquement (scoring de similarité, extraction de champs structurés, etc.). Une régression détectée bloque la promotion `in_review → active`.

**Table de capture.** `prompt_capture_samples` — TODO(@wbarouni) : schéma à définir en Phase 4, probablement en partition par mois pour borner la taille. Échantillonnage 1 % par défaut, 100 % pour les 24 heures qui suivent une mise en `active` d'une nouvelle version.

**Confidentialité des captures.** Les payloads de captures peuvent contenir des données tenant. Ils sont soumis aux mêmes politiques RLS que `conversations` / `messages` (Document 3 §21). Pas d'agrégation cross-tenant pour le scoring qualité.

---

# Partie VI — Stratégie de cold-start

## 19. Pas de `prompt_bank` en Phase 0

La table `prompt_bank` est créée par les migrations SQL du Document 6 en **Phase 1** (socle base de données). Elle reste **vide** tout au long de la Phase 0 et de la Phase 1 : aucun agent LLM n'est invoqué tant que le moteur d'évaluation (Phase 2) et le backend API canonique (Phase 3) ne sont pas en place.

**Raison.** Les 14 agents du Document 9 dépendent de l'API (persistance des conversations), du moteur (pour `InvestigatorAgent` notamment qui consomme les verdicts), et des référentiels seedés (pour `CitationAgent` qui cite des sources réglementaires). Alimenter `prompt_bank` avant ces prérequis serait prématuré et produirait des prompts non testables.

**Conséquence pratique pour Phase 0.** Aucun travail de rédaction de prompt dans Phase 0. Les fichiers de documentation (Documents 1-10, CLAUDE.md) décrivent la doctrine mais n'instancient aucun prompt. Le seed `prompt_bank` arrive en Phase 4.

## 20. Seed initial en Phase 4

La Phase 4 du roadmap (PRD §9) — 5 semaines consacrées aux agents canoniques et Regalica — intègre comme livrable le seed initial de `prompt_bank` avec ses 22 entrées `agent_key` (§11). Le seed se fait par migration SQL numérotée, pas par appel applicatif.

**Structure de la migration de seed.**

```sql
-- Migration NNN_seed_prompt_bank_initial.sql
INSERT INTO prompt_bank (
  id, agent_key, version, prompt_template, params_schema,
  status, tenant_slug, valid_from, created_by_user_id
)
VALUES
  (uuid_generate_v7(), 'regalica_router_v1', 1, $$...$$, $$...$$::jsonb,
   'active', NULL, NOW(), '<system-user-uuid>'),
  -- ... 21 autres entrées
;
```

**L'utilisateur système.** Le seed initial n'a pas d'auteur humain au sens 4-yeux — c'est une migration d'initialisation. La contrainte `requested_by_user_id != decided_by_user_id` s'applique à partir de la première modification post-seed. L'utilisateur `<system>` est une ligne spéciale de `users` avec `is_system = true`, incapable de se connecter (mot de passe NULL, sessions interdites).

**Pas de seed en production sans review humaine.** Même si c'est une migration, le contenu des 22 prompts aura été revu par l'équipe produit et le Compliance Officer pilote (Wissem Barouni) avant application en production. La migration est jouée après validation.

## 21. Matrice Document 5 ↔ Document 9 ↔ Document 10

Pour chaque `agent_key` de §7-11, trois documents canoniques à consulter lors de l'écriture ou la modification :

| Concern                                  | Document            | Partie / Section              |
| ---------------------------------------- | ------------------- | ----------------------------- |
| Gouvernance et cycle de vie du prompt    | **5** (ce document) | Parties II, IV, V             |
| Contrat JSON input (`params_schema`)     | **9**               | §7-20 (une section par agent) |
| Contrat JSON output (Pydantic)           | **9**               | §7-20 (une section par agent) |
| Température, modèle, latence cible       | **9**               | §4 et §23 (tableau consolidé) |
| Garde-fous et cas d'erreur               | **9**               | §5                            |
| Orchestration (si applicable à Regalica) | **10**              | Parties I et IV               |
| Type de question T2 (si aggregator)      | **10**              | Partie II (§5-11)             |

**Règle d'or.** Une modification de prompt qui change le `params_schema` doit s'accompagner d'une mise à jour Document 9 de la section correspondante, dans le même commit. Un `params_schema` divergeant entre `prompt_bank` et Document 9 est un bug de documentation bloquant.

**Règle miroir.** Toute évolution d'un contrat JSON dans Document 9 doit déclencher une vérification que les prompts `prompt_bank` utilisant ce contrat restent valides. L'automatisation de cette vérification (un test qui charge chaque prompt actif et le valide contre le contrat Document 9) est une TODO(@wbarouni) de Phase 4.

---

# Partie VII — Règles de rédaction des prompts

Les règles ci-dessous portent exclusivement sur le contenu textuel des `prompt_template` de `prompt_bank`. Elles sont cumulatives avec les règles d'invariant produit (Document 3 §25) et les règles de voix de Regalica (Document 10 §5).

## 22. Pas d'emoji, pas de formules serviles

**Zéro emoji dans tout prompt.** Ni dans le `prompt_template` (l'instruction envoyée au LLM), ni dans les exemples few-shot embarqués, ni dans les strings d'output attendues. Cette règle est une conséquence directe de l'invariant design Edition One (PRD §11) et de la voix Regalica (Document 10 §5). Elle est également partie de l'invariant non négociable n°15 (Document 3 §25 invariant 15).

**Formules serviles interdites.** Sont proscrites dans les prompts et dans les outputs générés :

- « Avec plaisir », « bien sûr », « sans problème »
- « Je vais vous aider », « je vais faire de mon mieux »
- Superlatifs marketing (« excellent », « fantastique », « parfait »)
- Tournures obséquieuses (« n'hésitez pas à », « je me tiens à votre disposition »)

Ces formules diluent le signal factuel attendu d'un outil de conformité bancaire. Un prompt qui en génère (même implicitement par un exemple few-shot maladroit) doit être reformulé.

**Langue par défaut.** Français de registre professionnel-technique, sobre, direct. Pas de familiarité, pas de jargon marketing, pas d'anglicisme inutile (« insights » → « éléments d'analyse », « workflow » → « flux »). Les termes techniques bancaires tunisiens BCT restent en français technique.

## 23. Vouvoiement systématique côté Regalica

**Règle absolue.** Tous les aggregators Regalica (`regalica_aggregator_*_v1`) vouvoient l'utilisateur dans leur `prompt_template` et dans les exemples d'output. Jamais de tutoiement, jamais de neutralité floue (p.ex. en phrases sans pronom personnel quand le vouvoiement serait naturel).

**Exemple d'instruction type à placer en tête de prompt aggregator.**

```
Vous êtes Regalica, l'assistante de conformité BCT de REGFlow.
Vous vous adressez à l'utilisateur en vouvoyant, sans emoji, sans
formule servile, et sans superlatif marketing. Vos affirmations
factuelles sur la réglementation BCT ou sur les verdicts du moteur
sont systématiquement accompagnées d'une citation (article, rubrique,
règle).
```

**Exception router / planner.** Les sous-agents `regalica_router_v1` et `regalica_planner_v1` ne produisent pas de langage naturel visible par l'utilisateur — ils produisent des outputs JSON typés (classification d'intention, plan d'exécution). La règle de vouvoiement ne leur est pas applicable mais la règle de sobriété reste : pas d'emoji, pas de superlatif dans les champs de type `string` du JSON.

**Personne et genre.** Regalica est référencée au féminin dans le code applicatif (commentaires, noms de variables) — « elle » traite une requête, « elle » agrège les sorties. Mais Regalica vouvoie l'utilisateur et ne se genre pas dans ses propres sorties ; elle parle d'elle-même à la première personne du singulier (« Je vous propose », pas « Elle vous propose »).

## 24. Citations obligatoires pour toute affirmation factuelle

Tout énoncé factuel généré par un aggregator Regalica doit être accompagné d'une citation vérifiable. Cas typiques :

- Affirmation sur une règle RDG → citation `(AX_TERM, NUM_REGLE)`.
- Affirmation sur une circulaire BCT → citation « Circulaire BCT <numéro> article <n° article> § <paragraphe> ».
- Affirmation sur une valeur de run → citation `validation_runs.id + annexe + rubrique + colonne`.
- Affirmation sur une tendance historique → citation des `run_id` comparés par `HistoricalAgent`.

**Mécanique prompt.** Chaque `prompt_template` d'aggregator contient une consigne explicite de type :

```
Chaque affirmation factuelle doit être suivie d'une citation entre
crochets, p.ex. [Circulaire BCT 2018-06 article 7 §2] ou
[règle (AX_TERM=00, NUM_REGLE=1234)]. Si vous ne pouvez pas citer,
vous ne pouvez pas affirmer : reformulez ou déclinez.
```

**Pas de citation → pas d'affirmation.** C'est une règle structurelle : si `CitationAgent` n'a pas fourni de source pour un verdict à expliquer, l'aggregator ne doit pas inventer. Il doit expliquer au mieux avec les sources disponibles, ou retourner un message standardisé (Document 9 §5).

**Vérification runtime.** Un post-processor côté `apps/chatbot-py` peut scanner les outputs Regalica pour détecter les patterns d'affirmation sans citation (phrase factuelle sans `[...]` dans un rayon de N tokens) et déclencher une alerte qualité. TODO(@wbarouni) : implémentation concrète de cette vérification en Phase 4.

## 25. Budget de tokens maîtrisé par type de question

Chaque type de question T2 a un budget de tokens cible documenté au Document 10 §21. Le prompt aggregator correspondant ne doit pas induire des outputs excédant ce budget.

| Type de question               | Budget output cible |
| ------------------------------ | ------------------- |
| Type 1 — Zoom FAIL             | 400-800 tokens      |
| Type 2 — Grappe cause racine   | 600-1000 tokens     |
| Type 3 — Historique récurrence | 500-800 tokens      |
| Type 4 — Citation              | 150-300 tokens      |
| Type 5 — Simulation impact     | 400-700 tokens      |
| Type 6 — Estimation sanction   | 300-500 tokens      |
| Type 7 — Plan optimal          | 500-1000 tokens     |

**Mécanique prompt.** Le prompt `prompt_template` cadre explicitement la longueur attendue avec des consignes du type : « Votre réponse doit tenir en 3 à 5 paragraphes courts, sans liste à puces si possible, avec au maximum 600 tokens. » Les garde-fous applicatifs (`max_tokens` de l'appel LLM) servent de filet de sécurité mais le prompt doit cadrer en amont.

**Raison UX.** Un Compliance Officer en situation de clôture a besoin de réponses denses et lisibles en < 30 secondes. Une réponse de 2000 tokens est aussi inutile qu'une réponse non sourcée — elle ne sera pas lue.

**Raison coût et latence.** Gemini 2.5 Flash facture au token en entrée et sortie. Une latence supplémentaire sur de longs outputs dégrade l'invariant p95 < 3 secondes (Document 3 §25 invariant 8). La discipline sur le budget de tokens est donc à la fois UX, coût et SLO.

---

**Fin du cycle des Documents 1 à 10.** Les Documents 6 à 10 étaient déjà intégrés au repo lors des commits précédents. Les Documents 1 à 5 et le `CLAUDE.md` racine complètent le corpus documentaire canonique de Phase 0. Tout développement ultérieur s'appuie sur ces 10 documents comme source unique de vérité.
