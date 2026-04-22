# REGFlow — Plateforme de Conformité BCT par Intelligence Artificielle

## Document 8 — State machines du workflow utilisateur

**Version :** 1.0
**Date :** avril 2026
**Périmètre :** formalisation complète des state machines qui régissent le cycle de vie d'une session de validation, des transitions autorisées, des événements déclencheurs, des TTL et des gardes d'intégrité
**Auteur :** Équipe REGFlow
**Statut :** référence canonique pour Claude Code
**Dépendances :** Document 4 (workflow utilisateur), Document 6 (schéma SQL)

---

## Sommaire

**Partie I — Principes de modélisation**

1. Pourquoi quatre state machines
2. Principes communs à toutes les FSM
3. Persistance et audit

**Partie II — FSM T0 — Pré-validation**

4. États et transitions
5. Événements et gardes
6. TTL et expiration
7. Actions d'entrée et de sortie

**Partie III — FSM T1 — Validation BCT en 3 étapes**

8. États et transitions
9. Sous-états des trois étapes BCT
10. Gestion des erreurs techniques

**Partie IV — FSM T2/T3 — Post-validation**

11. États et transitions
12. Cycle d'itération correction
13. Mode Signature avec révocation contrôlée
14. Archivage automatique

**Partie V — FSM 4-yeux — Gouvernance métier**

15. États et transitions
16. Types d'entités supportées
17. Règles d'intégrité

**Partie VI — Interactions entre FSM**

18. Transition T0 vers T1
19. Transition T1 vers T2/T3
20. Réouverture depuis T2 vers T0 pour itération

**Partie VII — Contrats TypeScript**

21. Enums des états et événements
22. Fonctions de transition
23. Type guards

**Partie VIII — Complément SQL au Document 6**

24. Table `validation_run_state_transitions`
25. Table `validation_run_signature_revocations`
26. Adaptations du trigger d'immutabilité

---

# Partie I — Principes de modélisation

## 1. Pourquoi quatre state machines

Le workflow utilisateur REGFlow traverse des phases fonctionnellement distinctes qui opèrent sur des acteurs différents, avec des durées de vie différentes, et des règles métier différentes. Une state machine monolithique couvrant T0 à T3 dans un seul graphe produirait entre quinze et vingt états et plusieurs dizaines de transitions, ce qui la rendrait illisible et difficile à tester exhaustivement.

Le choix retenu est d'éclater le workflow en **quatre state machines emboîtées** qui se passent le relais par événements explicites.

**FSM T0 — Pré-validation.** Gouverne la phase préparatoire entre l'ouverture d'un nouveau workspace et le lancement effectif de la validation. Les acteurs principaux sont les fichiers XML uploadés et le mécanisme de détection des compagnes. Durée typique : de quelques secondes à quelques heures selon la complexité du batch.

**FSM T1 — Validation BCT.** Gouverne les trois étapes officielles du contrôle BCT (XSD, embarqué, RDG) exécutées synchroniquement par le moteur. L'acteur principal est la ligne `validation_runs`. Durée typique : de quelques secondes à moins de trois secondes en p95 conformément à l'invariant du Document 3.

**FSM T2/T3 — Post-validation.** Gouverne la phase conversationnelle d'investigation, la boucle d'itération correction, le déblocage de T3 analytics, et le Mode Signature. L'acteur principal est la ligne `validation_runs` déjà complétée, associée à une `conversations`. Durée typique : de quelques minutes à plusieurs semaines.

**FSM 4-yeux — Gouvernance métier.** Gouverne le cycle de vie des demandes de modification de règles, référentiels, prompts. C'est une FSM orthogonale aux trois autres, déclenchée par les actions de saisie dans la Bibliothèque, pas par la validation d'un reporting. Durée typique : de quelques minutes à plusieurs jours selon la disponibilité du valideur.

## 2. Principes communs à toutes les FSM

**Déterminisme strict.** Chaque FSM est une machine à états finis classique sans états parallèles, sans régions concurrentes, sans garde conditionnelle ambiguë. Une transition est définie par le triplet `(état source, événement, état cible)`. Si deux transitions sortantes existent depuis le même état sur le même événement, l'une est éliminée par une garde explicite booléenne évaluée avant la transition.

**Absence de framework.** Les FSM sont implémentées en TypeScript pur avec des objets de transition et des fonctions de type guard. Aucune dépendance à xstate, robot3, ou autre framework. Cette contrainte découle de la doctrine de stack gelée et simplifie le débogage.

**Exhaustivité testée.** Chaque transition autorisée doit avoir un test unitaire qui vérifie que la transition s'exécute correctement avec les préconditions respectées. Chaque transition interdite doit avoir un test unitaire qui vérifie que la transition est rejetée. Une couverture de 100 % des transitions est exigée en CI.

**Atomicité transactionnelle.** Toute transition d'état qui modifie la base PostgreSQL est exécutée dans une transaction unique qui comprend : la mise à jour de la colonne `status`, l'insertion dans `validation_run_state_transitions`, les effets secondaires métier (écriture de fichiers, appels de services), et l'émission d'événements Socket.IO. Si une étape échoue, l'ensemble roll back.

**Observabilité native.** Chaque transition produit un log structuré JSON avec les champs `fsm`, `from_state`, `to_state`, `event`, `actor_user_id`, `run_id`, `duration_ms`. Les métriques agrégées alimentent des histogrammes Prometheus par FSM pour détecter les goulets d'étranglement.

## 3. Persistance et audit

**Colonne `status` pour la lecture rapide.** Chaque FSM a sa colonne `status` dans la table principale concernée : `xml_uploads.xsd_validation_status` pour l'étape 1 BCT au sein de T1, `validation_runs.status` pour T1 et T2/T3, `four_eyes_approvals.decision` pour le 4-yeux. Ces colonnes permettent des requêtes rapides sur l'état courant sans jointure.

**Table `validation_run_state_transitions` pour l'audit complet.** Toute transition de la FSM T1 ou T2/T3 est journalisée dans cette table dédiée au Document 8 (voir §24). Elle enrichit le trigger d'audit automatique générique du Document 6 en capturant spécifiquement les transitions d'état avec leur événement déclencheur et leur durée. Elle permet les analyses de funnel (temps moyen par étape, taux d'abandon par transition).

**Table `validation_run_signature_revocations` pour le Mode Signature.** Chaque révocation de signature est journalisée dans cette table dédiée avec auteur, motif, référence au run, conformément à l'ajustement décidé pour la conformité aux pratiques des banques tunisiennes.

---

# Partie II — FSM T0 — Pré-validation

## 4. États et transitions

La FSM T0 gouverne le cycle de vie d'une session de pré-validation depuis l'ouverture d'un workspace vide jusqu'au moment où l'utilisateur peut lancer T1.

### États

| État | Description | Terminal ? |
|---|---|---|
| `initiated` | L'utilisateur a ouvert un nouveau workspace, aucun fichier uploadé encore | non |
| `primary_uploaded` | Le fichier de l'annexe principale est uploadé, IngestorXML a extrait l'entête | non |
| `companions_requested` | DependencyAgent a détecté des compagnes requises, alerte UI visible | non |
| `companions_complete` | Toutes les compagnes nécessaires sont présentes dans le batch | non |
| `coherence_checked` | TemporalAgent a validé la cohérence temporelle inter-XML | non |
| `ready_for_t1` | Tous les prérequis sont verts, l'utilisateur peut lancer T1 | non |
| `expired` | Inactivité prolongée, la session T0 a été expirée automatiquement | oui |
| `aborted` | L'utilisateur a explicitement annulé la session | oui |

### Transitions

```
                         ┌─────────────┐
                         │  initiated  │
                         └──────┬──────┘
                                │ event.primary_xml_uploaded
                                ▼
                      ┌───────────────────┐
                      │ primary_uploaded  │
                      └──────┬────────────┘
                             │ event.companions_detected
                             ▼
                  ┌──────────────────────┐
                  │ companions_requested │◄────────┐
                  └──────┬───────────────┘         │
                         │                         │ event.companion_uploaded
                         │ event.all_companions_ok │ (si batch toujours incomplet)
                         ▼                         │
                 ┌────────────────────┐            │
                 │ companions_complete│────────────┘
                 └──────┬─────────────┘
                        │ event.coherence_validated
                        ▼
               ┌──────────────────┐
               │ coherence_checked│
               └──────┬───────────┘
                      │ event.precheck_all_green
                      ▼
              ┌────────────────┐
              │ ready_for_t1   │ ─────────► (transition vers FSM T1)
              └────────────────┘

   États terminaux possibles depuis TOUT état non-terminal :
   - event.ttl_exceeded           ──► expired
   - event.user_aborted           ──► aborted
```

### Table des transitions autorisées

| État source | Événement | État cible | Garde |
|---|---|---|---|
| `initiated` | `event.primary_xml_uploaded` | `primary_uploaded` | XML structurellement valide, annexe reconnue |
| `primary_uploaded` | `event.companions_detected` | `companions_requested` | DependencyAgent liste au moins une compagne manquante |
| `primary_uploaded` | `event.precheck_all_green` | `ready_for_t1` | Aucune compagne requise (annexe autonome) ET cohérence OK |
| `companions_requested` | `event.companion_uploaded` | `companions_requested` | Il reste des compagnes manquantes |
| `companions_requested` | `event.all_companions_ok` | `companions_complete` | Toutes les compagnes requises sont présentes |
| `companions_complete` | `event.coherence_validated` | `coherence_checked` | TemporalAgent valide l'homogénéité d'arrêté |
| `coherence_checked` | `event.precheck_all_green` | `ready_for_t1` | Tous les contrôles T0 verts |
| `*` (non-terminal) | `event.ttl_exceeded` | `expired` | Délai d'inactivité dépassé |
| `*` (non-terminal) | `event.user_aborted` | `aborted` | Action explicite utilisateur |

## 5. Événements et gardes

**`event.primary_xml_uploaded`** : émis par le backend à la réception d'un upload XML qui passe la validation structurelle minimale. Payload : `{ upload_id: UUID, annexe_code: string, date_annexe: Date, tenant_id: UUID }`. Garde : le code annexe existe dans `referentials_annexes` en version active à la date de la session.

**`event.companions_detected`** : émis par DependencyAgent après appel synchrone. Payload : `{ missing_annexes: string[], dependency_source: string }`. Garde : la liste `missing_annexes` est non vide.

**`event.companion_uploaded`** : émis à chaque upload d'une annexe compagne. Payload identique à `primary_xml_uploaded`. Garde : le code annexe est effectivement dans la liste des compagnes attendues.

**`event.all_companions_ok`** : calculé automatiquement après chaque `event.companion_uploaded` par vérification que l'intersection entre `missing_annexes` et les codes uploadés couvre l'ensemble requis. Pas de payload.

**`event.coherence_validated`** : émis par TemporalAgent après appel synchrone. Garde : tous les XML du batch ont la même `DateAnnexe` OU les divergences sont couvertes par les mentions `ZONE_TEXTE` explicites (T-1, N-1). Payload : `{ coherence_level: "strict" | "explicit_deviation", details: object }`.

**`event.precheck_all_green`** : événement synthétique qui matérialise le feu vert final. Émis uniquement quand tous les sous-contrôles T0 sont passés. Prépare la transition vers T1.

**`event.ttl_exceeded`** : événement système émis par un job périodique qui scanne les sessions T0 inactives depuis plus d'une heure.

**`event.user_aborted`** : événement utilisateur émis à la fermeture explicite du workspace ou au clic sur "Annuler la session".

## 6. TTL et expiration

**Durée d'inactivité T0 : 1 heure.**

Justification. Une session T0 représente un acte de préparation qui mobilise des XML figés à un instant donné dans le SI bancaire. Au-delà d'une heure sans activité, la probabilité que les XML uploadés soient obsolètes (régénération côté source, nouvelle extraction comptable) devient non négligeable. Plutôt que de laisser l'utilisateur poursuivre avec des fichiers périmés, le système expire la session proprement et invite à redémarrer avec des XML frais.

**Job d'expiration.** Un job `pg_cron` planifié toutes les 10 minutes exécute :

```sql
UPDATE validation_runs
SET status = 'expired_t0',
    completed_at = NOW()
WHERE status IN ('initiated', 'primary_uploaded', 'companions_requested',
                 'companions_complete', 'coherence_checked', 'ready_for_t1')
  AND COALESCE((
    SELECT MAX(event_at)
    FROM validation_run_state_transitions
    WHERE validation_run_id = validation_runs.id
  ), initiated_at) < NOW() - INTERVAL '1 hour';
```

Chaque ligne mise à jour déclenche l'insertion correspondante dans `validation_run_state_transitions` via trigger.

**Notification utilisateur.** Quand une session T0 expire, une notification de type `attention` est créée dans la table `notifications` pour le propriétaire de la session, lui indiquant que la session a expiré et proposant d'en démarrer une nouvelle.

## 7. Actions d'entrée et de sortie

Chaque état de la FSM T0 déclenche des actions d'entrée (`on_enter`) et de sortie (`on_exit`) qui encapsulent les effets secondaires métier.

**État `initiated` — on_enter.** Création d'une ligne dans `validation_runs` avec `status = 'initiated'`, `initiated_by_user_id = current_user`, `initiated_at = NOW()`. Création d'une `conversations` liée avec message de bienvenue Regalica.

**État `primary_uploaded` — on_enter.** Parsing de l'XML par IngestorXML. Enrichissement des champs `primary_annexe_code` et `arrete_date` dans `validation_runs`. Appel asynchrone à DependencyAgent pour détecter les compagnes.

**État `companions_requested` — on_enter.** Émission Socket.IO d'un événement `companions_needed` vers le frontend, qui affiche la liste des annexes manquantes dans le panneau d'upload. Message Regalica synthétique listant les compagnes attendues.

**État `companions_complete` — on_enter.** Appel asynchrone à TemporalAgent pour valider la cohérence inter-XML.

**État `coherence_checked` — on_enter.** Si divergences détectées, message Regalica explicatif. Si tout OK, émission automatique de `event.precheck_all_green`.

**État `ready_for_t1` — on_enter.** Activation du bouton "Lancer la validation" dans le frontend. Aucune transition automatique vers T1. L'utilisateur doit acter explicitement le lancement.

**États terminaux — on_enter.** Persistance finale, fermeture de la conversation liée si l'utilisateur quitte, émission notification le cas échéant.

---

# Partie III — FSM T1 — Validation BCT en 3 étapes

## 8. États et transitions

La FSM T1 démarre exclusivement depuis l'état `ready_for_t1` de T0, sur événement `event.user_clicks_start_validation`. Elle est synchrone et rapide (p95 < 3 secondes).

### États

| État | Description | Terminal ? |
|---|---|---|
| `running` | T1 en cours d'exécution, une des trois étapes BCT est active | non |
| `completed` | Les trois étapes se sont terminées avec succès ou échec métier | oui |
| `failed` | Erreur technique a interrompu T1 (moteur crash, Gemini indisponible, DB timeout) | oui |
| `aborted` | L'utilisateur a annulé pendant l'exécution | oui |

### Transitions

```
       (depuis T0: ready_for_t1)
              │
              │ event.user_clicks_start_validation
              ▼
        ┌────────────┐
        │  running   │
        └─────┬──────┘
              │
              ├──► event.all_steps_finished ─────────► completed
              │
              ├──► event.technical_error ────────────► failed
              │
              └──► event.user_aborted ────────────────► aborted
```

### Table des transitions autorisées

| État source | Événement | État cible | Garde |
|---|---|---|---|
| (externe T0 ready_for_t1) | `event.user_clicks_start_validation` | `running` | Utilisateur a le rôle `compliance_officer` |
| `running` | `event.all_steps_finished` | `completed` | Les 3 étapes BCT ont toutes un statut final |
| `running` | `event.technical_error` | `failed` | Exception non récupérable levée par le moteur |
| `running` | `event.user_aborted` | `aborted` | Action explicite utilisateur |

## 9. Sous-états des trois étapes BCT

L'état `running` de T1 est en fait orchestré par trois sous-étapes séquentielles dont les statuts individuels sont portés par les colonnes `step1_xsd_status`, `step2_embedded_status`, `step3_rdg_status` dans `validation_runs` (définies au Document 6).

Chaque sous-étape a son propre micro-cycle :

```
pending ──► running ──► passed
                   │
                   └──► failed
```

**Règles de séquence.**

- L'étape 2 (embarqué) ne démarre que si l'étape 1 (XSD) est en `passed` ou `failed` mais sans erreur bloquante structurelle (la BCT ne rejette pas structurellement, elle passe en contrôle embarqué qui lèvera les erreurs de contenu).
- Règle stricte appliquée par REGFlow : si l'étape 1 XSD est en `failed`, l'étape 2 est mise en `skipped_upstream_failed` et l'étape 3 idem. Le run termine en `completed` avec une conformité à 0 %.
- Si l'étape 2 embarqué est en `failed`, l'étape 3 RDG peut quand même s'exécuter pour donner un diagnostic complet au Compliance Officer (à la différence du SED BCT qui s'arrête à la première étape en échec).

**Émission d'événements intermédiaires.** Pendant `running`, le backend émet via Socket.IO :

- `step_started` : `{ step: 1 | 2 | 3, started_at }` au début de chaque étape.
- `step_completed` : `{ step, status, duration_ms, details }` à la fin de chaque étape.
- `rule_verdict` : `{ rule_id, status, annexe, num_regle }` pendant l'étape 3 au fil de l'évaluation RDG pour les règles individuelles (permet un affichage progressif dans le frontend).

## 10. Gestion des erreurs techniques

**Classification des erreurs.**

| Type d'erreur | État cible | Récupération |
|---|---|---|
| Timeout moteur Python (>30s) | `failed` | Invite à réessayer |
| Erreur parsing XML sur un compagne déjà validé en T0 | `failed` | Exception à investiguer (incohérence T0/T1) |
| Gemini indisponible pour InvestigatorAgent en post-complétion | `completed` avec flag `investigator_degraded = true` | Continue en mode dégradé, pas d'enrichissement causal |
| Ollama fallback indisponible si Gemini down | `completed` avec flag `llm_fully_unavailable = true` | Continue sans enrichissement IA |
| DB timeout pendant écriture verdicts | `failed` | Retry automatique avec backoff exponentiel, puis abandon |
| Exception non capturée dans le code moteur | `failed` | Sentinelle bug, alerte équipe plateforme |

**Principe fondamental.** Une erreur technique ne doit jamais compromettre la cohérence des données. Si T1 échoue après avoir écrit partiellement des verdicts dans `validation_fail_details`, la transaction roll back entièrement et la table reste cohérente avec le `status = 'failed'` du run.

**Invite utilisateur.** Dans l'état `failed`, l'UI affiche un bouton "Relancer la validation" qui crée un nouveau run (nouvel UUID) en mode identique, pas un redémarrage du run en échec. Le run échoué reste en base pour audit.

---

# Partie IV — FSM T2/T3 — Post-validation

## 11. États et transitions

La FSM T2/T3 gouverne tout ce qui se passe après que T1 est en `completed`. Elle couvre la conversation d'investigation, l'itération correction, le déblocage T3, le Mode Signature.

### États

| État | Description | Terminal ? |
|---|---|---|
| `in_investigation` | Conversation T2 active, utilisateur consulte les livrables et dialogue avec Regalica | non |
| `awaiting_correction` | Utilisateur a accepté le diagnostic, part corriger dans son SI source | non |
| `iteration_awaited` | Une correction est en cours, attente d'un nouveau run avec XML mis à jour | non |
| `zero_fail_reached` | Conformité à 100 % sur les FAIL sévères, T3 analytics déverrouillé | non |
| `signed_internally` | Mode Signature activé, XML conforme téléchargé, traçabilité complète | non |
| `signature_revoked` | Une signature précédente a été révoquée avec motif | non |
| `archived_stale` | 30 jours sans activité, archivage automatique | oui |
| `abandoned` | Utilisateur a explicitement renoncé à cette soumission | oui |

### Transitions

```
   (depuis T1: completed)
           │
           │ event.t1_finished_with_fails  ou  event.t1_finished_zero_fail
           ▼
  ┌─────────────────┐
  │ in_investigation│◄──────────────────────────┐
  └──────┬──────────┘                           │
         │                                      │
         │ event.user_accepts_diagnosis         │ event.user_revisits
         ▼                                      │
  ┌────────────────────┐                        │
  │ awaiting_correction│────────────────────────┤
  └──────┬─────────────┘                        │
         │ event.user_starts_iteration          │
         ▼                                      │
  ┌──────────────────┐                          │
  │ iteration_awaited│                          │
  └──────┬───────────┘                          │
         │                                      │
         │ event.new_run_completed ─────────────┘
         │   │
         │   └──► (nouveau run en in_investigation si FAIL restants)
         │
         │ event.zero_fail_reached (si 0 FAIL sévère)
         ▼
  ┌────────────────────┐
  │ zero_fail_reached  │
  └──────┬─────────────┘
         │ event.user_signs
         ▼
  ┌────────────────────┐
  │ signed_internally  │──────┐
  └──────┬─────────────┘      │
         │                    │ event.user_revokes_signature
         │                    ▼
         │       ┌──────────────────────┐
         │       │ signature_revoked    │
         │       └──────┬───────────────┘
         │              │ event.user_re_signs (après nouvelle validation)
         │              │
         └──────────────┤
                        ▼
                   (retour signed_internally)

   États terminaux depuis tout état non-terminal :
   - event.ttl_exceeded (30j)     ──► archived_stale
   - event.user_abandons          ──► abandoned
```

### Table des transitions autorisées

| État source | Événement | État cible | Garde |
|---|---|---|---|
| (externe T1 completed) | `event.t1_finished_with_fails` | `in_investigation` | `fail_severe > 0` |
| (externe T1 completed) | `event.t1_finished_zero_fail` | `zero_fail_reached` | `fail_severe == 0` |
| `in_investigation` | `event.user_accepts_diagnosis` | `awaiting_correction` | Aucune |
| `awaiting_correction` | `event.user_starts_iteration` | `iteration_awaited` | Aucune |
| `awaiting_correction` | `event.user_revisits` | `in_investigation` | Aucune |
| `iteration_awaited` | `event.new_run_completed` | `in_investigation` | `new_run.fail_severe > 0` |
| `iteration_awaited` | `event.new_run_completed` | `zero_fail_reached` | `new_run.fail_severe == 0` |
| `zero_fail_reached` | `event.user_signs` | `signed_internally` | Utilisateur a le rôle `compliance_officer` ou `compliance_director` |
| `signed_internally` | `event.user_revokes_signature` | `signature_revoked` | Utilisateur a le rôle `compliance_director` |
| `signature_revoked` | `event.user_re_signs` | `signed_internally` | Nouveau run validé en zero_fail, pas la signature précédente |
| `signature_revoked` | `event.user_starts_iteration` | `iteration_awaited` | Après révocation, utilisateur souhaite repasser par un nouveau cycle |
| `*` (non-terminal) | `event.ttl_exceeded` | `archived_stale` | 30 jours sans activité |
| `*` (non-terminal) | `event.user_abandons` | `abandoned` | Action explicite utilisateur |

## 12. Cycle d'itération correction

Le cycle d'itération correction est le cœur opérationnel du produit. Une session T2 peut traverser plusieurs itérations avant d'atteindre `zero_fail_reached`.

**Mécanique.** Quand l'utilisateur est en `iteration_awaited`, il repart dans son SI source, corrige la rubrique ou la ventilation qui a causé le FAIL, régénère le XML, et revient dans REGFlow pour un nouveau run. Le nouveau run est une nouvelle ligne dans `validation_runs` avec son propre UUID. La conversation de la session initiale reste attachée à l'ancien run, mais une **référence croisée** est maintenue via la colonne `iteration_of_run_id` ajoutée à `validation_runs` (complément au Document 6).

**Persistance de la conversation.** L'utilisateur retrouve sa conversation Regalica intacte. Regalica peut faire le diff avec la validation précédente grâce à DiffAgent et confirmer que la correction a bien résolu la grappe G1 ou révélé un autre problème.

**Limite de profondeur.** Aucune limite technique sur le nombre d'itérations, mais au-delà de 5 itérations sur la même session, Regalica propose proactivement d'ouvrir un ticket de support interne à la Direction Conformité parce qu'il y a probablement un problème systémique dans le SI source.

## 13. Mode Signature avec révocation contrôlée

**Décision produit révisée.** Contrairement à la formulation initiale qui imposait une signature irrévocable, la pratique des banques tunisiennes exige la possibilité de révoquer une signature avec traçabilité complète. Cette révision est motivée par les cas métier suivants :

- Signature effectuée par erreur sur un mauvais batch ou un mauvais arrêté.
- Signature effectuée avant complétion d'un complément de donnée tardif qui modifie le reporting.
- Nouvelle circulaire BCT publiée après la signature qui modifie rétroactivement les règles applicables et nécessite une re-validation.
- Décision de la Direction Conformité après contrôle interne qui identifie une anomalie non détectée par le moteur.

**Procédure de signature (état `zero_fail_reached` → `signed_internally`).**

Sur `event.user_signs`, le backend exécute une procédure stockée `sp_sign_validation_run(run_id, user_id, signature_context)` qui dans une transaction unique :

1. Vérifie que l'utilisateur a le rôle `compliance_officer` ou `compliance_director`.
2. Vérifie que le run est en `status = 'completed'` et `fail_severe == 0`.
3. Calcule le hash SHA-256 du XML concaténé des annexes du batch en ordre déterministe.
4. Met à jour `validation_runs` avec `is_signed = TRUE`, `signed_at = NOW()`, `signed_by_user_id = user_id`, `signed_xml_hash = hash`.
5. Insère une ligne dans `validation_run_state_transitions` avec `event = 'user_signs'`.
6. Génère le fichier XML concaténé téléchargeable dans un bucket objet temporaire accessible via URL signée 24h.
7. Marque la ligne en transition vers `signed_internally`.

**Procédure de révocation (état `signed_internally` → `signature_revoked`).**

Sur `event.user_revokes_signature`, le backend exécute `sp_revoke_signature(run_id, user_id, revocation_reason, revocation_context)` qui :

1. Vérifie que l'utilisateur a le rôle `compliance_director` (restriction plus forte que la signature).
2. Vérifie que le run est en `status = 'signed_internally'`.
3. Insère une ligne dans `validation_run_signature_revocations` avec toutes les métadonnées.
4. Met à jour `validation_runs` avec `is_signed = FALSE`, `signed_at = NULL`, `signed_by_user_id = NULL`, `signed_xml_hash = NULL`, `last_revocation_at = NOW()`.
5. Insère une ligne dans `validation_run_state_transitions`.
6. Invalide l'URL temporaire du fichier XML téléchargé.
7. Émet une notification au signataire original l'informant de la révocation et du motif.

**Motifs de révocation codifiés.**

| Code | Libellé | Description |
|---|---|---|
| `signed_wrong_batch` | Mauvais batch signé | Erreur d'identification du reporting concerné |
| `data_update_required` | Complément de donnée tardif | Une rubrique doit être corrigée avant soumission |
| `regulation_changed` | Évolution réglementaire rétroactive | Nouvelle circulaire BCT change les règles applicables |
| `internal_control_finding` | Constat de contrôle interne | Audit interne a détecté une anomalie |
| `other` | Autre motif | Texte libre obligatoire |

**Auditabilité.** Toutes les révocations sont lisibles via une vue SQL `v_signature_history_per_run(run_id)` qui présente la chronologie complète : signatures, révocations, re-signatures avec les acteurs et les motifs.

## 14. Archivage automatique

**Durée d'inactivité : 30 jours.**

Une session T2/T3 qui n'a connu aucune activité pendant 30 jours consécutifs est automatiquement archivée. Activité définie comme : nouveau message dans la conversation, nouveau run d'itération, signature, révocation, consultation par l'utilisateur propriétaire.

**Job d'archivage.** Un job `pg_cron` quotidien exécute :

```sql
UPDATE validation_runs
SET status = 'archived_stale'
WHERE status IN ('in_investigation', 'awaiting_correction', 'iteration_awaited',
                 'zero_fail_reached', 'signed_internally', 'signature_revoked')
  AND COALESCE(
    (SELECT MAX(event_at) FROM validation_run_state_transitions
     WHERE validation_run_id = validation_runs.id),
    completed_at
  ) < NOW() - INTERVAL '30 days'
  AND is_signed = FALSE;
```

**Note importante.** Les runs signés (`is_signed = TRUE`) ne sont jamais archivés automatiquement car ils constituent des certifications internes avec valeur de traçabilité long terme. Leur rétention est de 10 ans conformément à l'invariant produit.

**Désarchivage.** Un run en `archived_stale` peut être désarchivé par son propriétaire via action explicite. Le run repasse alors en `in_investigation` pour reprendre l'investigation. Tous les messages et verdicts restent consultables.

---

# Partie V — FSM 4-yeux — Gouvernance métier

## 15. États et transitions

La FSM 4-yeux gouverne toute modification des tables de vérité métier (`rules`, `prompt_bank`, `referentials_*`). Elle est orthogonale aux FSM T0/T1/T2/T3 et s'applique à des entités différentes.

### États

| État | Description | Terminal ? |
|---|---|---|
| `pending` | Une modification a été soumise, en attente de revue par un second expert | non |
| `approved` | La modification est approuvée et activée en base | oui |
| `rejected` | La modification est rejetée avec motif, la version précédente reste active | oui |
| `withdrawn` | L'auteur a retiré sa demande avant décision | oui |

### Transitions

```
  (soumission initiale depuis UI Bibliothèque ou Admin)
           │
           │ event.modification_submitted
           ▼
      ┌─────────┐
      │ pending │────────┬─────────┬────────────┐
      └─────────┘        │         │            │
                         │         │            │
      event.validator_approves     │            │
                         │         │            │
                         ▼         │            │
                    ┌──────────┐   │            │
                    │ approved │   │            │
                    └──────────┘   │            │
                                   │            │
                         event.validator_rejects│
                                   │            │
                                   ▼            │
                              ┌──────────┐      │
                              │ rejected │      │
                              └──────────┘      │
                                                │
                                 event.author_withdraws
                                                │
                                                ▼
                                         ┌───────────┐
                                         │ withdrawn │
                                         └───────────┘
```

### Table des transitions autorisées

| État source | Événement | État cible | Garde |
|---|---|---|---|
| (hors FSM) | `event.modification_submitted` | `pending` | Auteur authentifié, schéma de changement valide |
| `pending` | `event.validator_approves` | `approved` | Validateur ≠ auteur, a le rôle requis |
| `pending` | `event.validator_rejects` | `rejected` | Validateur ≠ auteur, motif non vide |
| `pending` | `event.author_withdraws` | `withdrawn` | Acteur = auteur initial |

## 16. Types d'entités supportées

La FSM 4-yeux s'applique aux entités suivantes :

| Type d'entité | Rôle requis pour soumettre | Rôle requis pour valider |
|---|---|---|
| `rule` | `compliance_officer` ou `referential_admin` | `compliance_director` ou `referential_admin` (≠ auteur) |
| `referential_annexe` | `referential_admin` | `compliance_director` (≠ auteur) |
| `referential_rubrique` | `referential_admin` | `compliance_director` ou autre `referential_admin` (≠ auteur) |
| `referential_colonne` | `referential_admin` | `compliance_director` ou autre `referential_admin` (≠ auteur) |
| Autres `referential_*` | `referential_admin` | `compliance_director` ou autre `referential_admin` (≠ auteur) |
| `prompt` | `platform_owner` (ALGORIA Factory) | `platform_owner` (≠ auteur) |

**Règle absolue.** Dans tous les cas, `decided_by_user_id != requested_by_user_id`. Cette contrainte est renforcée au niveau applicatif **et** au niveau SQL via le check `fea_ck_distinct_users` du Document 6.

## 17. Règles d'intégrité

**Activation atomique.** Quand une demande passe de `pending` à `approved`, la transition inclut dans la même transaction :

1. Mise à jour de `four_eyes_approvals` avec `decision = 'approved'`, `decided_by_user_id`, `decided_at`.
2. Insertion d'une nouvelle ligne dans la table cible (`rules`, `referentials_*`, `prompt_bank`) avec `valid_from = NOW()`, `status = 'active'`.
3. Si une version active précédente existe, mise à jour de son `valid_to = NOW()` et `status = 'deprecated'`.
4. Insertion dans `audit_log` via le trigger automatique.

Si n'importe quelle étape échoue, l'ensemble roll back et la transition n'a pas lieu.

**Rejet propre.** Quand une demande passe de `pending` à `rejected`, aucune modification n'est propagée. La transition met à jour `four_eyes_approvals` avec le motif et point final.

**Retrait par l'auteur.** Possible tant que la demande est en `pending`. Une fois décidée (approuvée ou rejetée), le retrait n'est plus possible. Pour revenir sur une approbation, il faut soumettre une nouvelle demande de modification inverse qui passe à nouveau le cycle 4-yeux.

---

# Partie VI — Interactions entre FSM

## 18. Transition T0 vers T1

La transition T0 → T1 est la seule transition inter-FSM explicitement modélisée comme un événement utilisateur. Elle se produit quand :

- L'état T0 est `ready_for_t1`.
- L'utilisateur clique explicitement sur le bouton "Lancer la validation".
- L'événement `event.user_clicks_start_validation` est émis.

La FSM T0 passe dans un état terminal implicite (la ligne n'évolue plus) et la FSM T1 prend le relais sur la même ligne `validation_runs.id` avec `status = 'running'`.

**Pas de retour arrière.** Une fois T1 démarré, on ne peut pas revenir à T0 sur le même run. Si le batch est finalement incomplet ou incorrect, l'utilisateur doit abandonner T1 (`event.user_aborted`) et créer un nouveau run T0.

## 19. Transition T1 vers T2/T3

La transition T1 → T2/T3 est automatique et immédiate à la fin de T1. Elle se produit quand :

- L'état T1 est `completed`.
- Les événements `event.t1_finished_with_fails` ou `event.t1_finished_zero_fail` sont émis automatiquement.

**Pas de décision utilisateur requise.** Le passage de T1 à T2 est un enchaînement naturel pour que l'utilisateur commence immédiatement son investigation.

**Cas `failed` et `aborted`.** Si T1 termine en `failed` ou `aborted`, il n'y a pas de transition vers T2/T3. Le run reste en état terminal et l'utilisateur doit soit relancer un nouveau run soit abandonner.

## 20. Réouverture depuis T2 vers T0 pour itération

Quand l'utilisateur est en `iteration_awaited` et qu'il uploade un nouveau XML corrigé, un **nouveau run T0 est créé** (nouvel UUID dans `validation_runs`) avec `iteration_of_run_id` pointant vers le run précédent. Le nouveau run traverse T0, T1, T2/T3 comme un run normal, mais sa conversation peut être "fusionnée" visuellement avec la conversation du run parent pour donner une continuité utilisateur.

Cette approche permet de :

- Garder l'historique complet auditable de chaque itération.
- Permettre le diff entre deux runs consécutifs via DiffAgent.
- Éviter d'avoir à modifier un run existant, conformément à l'invariant d'immutabilité.

---

# Partie VII — Contrats TypeScript

## 21. Enums des états et événements

```typescript
// packages/state-machines/src/fsm-t0.ts

export enum T0State {
  INITIATED = "initiated",
  PRIMARY_UPLOADED = "primary_uploaded",
  COMPANIONS_REQUESTED = "companions_requested",
  COMPANIONS_COMPLETE = "companions_complete",
  COHERENCE_CHECKED = "coherence_checked",
  READY_FOR_T1 = "ready_for_t1",
  EXPIRED = "expired",
  ABORTED = "aborted",
}

export enum T0Event {
  PRIMARY_XML_UPLOADED = "event.primary_xml_uploaded",
  COMPANIONS_DETECTED = "event.companions_detected",
  COMPANION_UPLOADED = "event.companion_uploaded",
  ALL_COMPANIONS_OK = "event.all_companions_ok",
  COHERENCE_VALIDATED = "event.coherence_validated",
  PRECHECK_ALL_GREEN = "event.precheck_all_green",
  TTL_EXCEEDED = "event.ttl_exceeded",
  USER_ABORTED = "event.user_aborted",
}

// packages/state-machines/src/fsm-t1.ts

export enum T1State {
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  ABORTED = "aborted",
}

export enum T1Event {
  USER_CLICKS_START_VALIDATION = "event.user_clicks_start_validation",
  ALL_STEPS_FINISHED = "event.all_steps_finished",
  TECHNICAL_ERROR = "event.technical_error",
  USER_ABORTED = "event.user_aborted",
}

export enum T1StepStatus {
  PENDING = "pending",
  RUNNING = "running",
  PASSED = "passed",
  FAILED = "failed",
  SKIPPED_UPSTREAM_FAILED = "skipped_upstream_failed",
}

// packages/state-machines/src/fsm-t23.ts

export enum T23State {
  IN_INVESTIGATION = "in_investigation",
  AWAITING_CORRECTION = "awaiting_correction",
  ITERATION_AWAITED = "iteration_awaited",
  ZERO_FAIL_REACHED = "zero_fail_reached",
  SIGNED_INTERNALLY = "signed_internally",
  SIGNATURE_REVOKED = "signature_revoked",
  ARCHIVED_STALE = "archived_stale",
  ABANDONED = "abandoned",
}

export enum T23Event {
  T1_FINISHED_WITH_FAILS = "event.t1_finished_with_fails",
  T1_FINISHED_ZERO_FAIL = "event.t1_finished_zero_fail",
  USER_ACCEPTS_DIAGNOSIS = "event.user_accepts_diagnosis",
  USER_STARTS_ITERATION = "event.user_starts_iteration",
  USER_REVISITS = "event.user_revisits",
  NEW_RUN_COMPLETED = "event.new_run_completed",
  USER_SIGNS = "event.user_signs",
  USER_REVOKES_SIGNATURE = "event.user_revokes_signature",
  USER_RE_SIGNS = "event.user_re_signs",
  TTL_EXCEEDED = "event.ttl_exceeded",
  USER_ABANDONS = "event.user_abandons",
}

// packages/state-machines/src/fsm-4eyes.ts

export enum FourEyesState {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  WITHDRAWN = "withdrawn",
}

export enum FourEyesEvent {
  MODIFICATION_SUBMITTED = "event.modification_submitted",
  VALIDATOR_APPROVES = "event.validator_approves",
  VALIDATOR_REJECTS = "event.validator_rejects",
  AUTHOR_WITHDRAWS = "event.author_withdraws",
}
```

## 22. Fonctions de transition

```typescript
// packages/state-machines/src/transitions.ts

export interface TransitionResult<S, E> {
  success: boolean;
  fromState: S;
  toState: S | null;
  event: E;
  reason: string | null;
  durationMs: number;
}

export type TransitionGuard<S, E, C> = (
  currentState: S,
  event: E,
  context: C,
) => { allowed: boolean; reason: string | null };

export interface TransitionDefinition<S, E, C> {
  from: S;
  event: E;
  to: S;
  guard?: TransitionGuard<S, E, C>;
  onEnter?: (context: C) => Promise<void>;
  onExit?: (context: C) => Promise<void>;
}

export async function attemptTransition<S, E, C>(
  transitions: TransitionDefinition<S, E, C>[],
  currentState: S,
  event: E,
  context: C,
): Promise<TransitionResult<S, E>> {
  const start = Date.now();

  const matching = transitions.filter(
    (t) => t.from === currentState && t.event === event,
  );

  if (matching.length === 0) {
    return {
      success: false,
      fromState: currentState,
      toState: null,
      event,
      reason: `No transition defined from ${currentState} on ${event}`,
      durationMs: Date.now() - start,
    };
  }

  for (const t of matching) {
    const guardResult = t.guard?.(currentState, event, context);
    if (guardResult && !guardResult.allowed) {
      continue;
    }

    try {
      await t.onExit?.(context);
      await t.onEnter?.(context);

      return {
        success: true,
        fromState: currentState,
        toState: t.to,
        event,
        reason: null,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        fromState: currentState,
        toState: null,
        event,
        reason: `Transition side-effect failed: ${(err as Error).message}`,
        durationMs: Date.now() - start,
      };
    }
  }

  return {
    success: false,
    fromState: currentState,
    toState: null,
    event,
    reason: "All matching transitions failed their guards",
    durationMs: Date.now() - start,
  };
}
```

## 23. Type guards

```typescript
// packages/state-machines/src/guards.ts

export function isT0TerminalState(state: T0State): boolean {
  return state === T0State.EXPIRED || state === T0State.ABORTED;
}

export function isT1TerminalState(state: T1State): boolean {
  return (
    state === T1State.COMPLETED ||
    state === T1State.FAILED ||
    state === T1State.ABORTED
  );
}

export function isT23TerminalState(state: T23State): boolean {
  return state === T23State.ARCHIVED_STALE || state === T23State.ABANDONED;
}

export function canSignRun(
  state: T23State,
  userRole: string,
  failSevere: number,
): { allowed: boolean; reason: string | null } {
  if (state !== T23State.ZERO_FAIL_REACHED && state !== T23State.SIGNATURE_REVOKED) {
    return { allowed: false, reason: "Run is not in a signable state" };
  }
  if (failSevere > 0) {
    return { allowed: false, reason: "Cannot sign a run with severe FAILs" };
  }
  if (userRole !== "compliance_officer" && userRole !== "compliance_director") {
    return { allowed: false, reason: "Insufficient role for signature" };
  }
  return { allowed: true, reason: null };
}

export function canRevokeSignature(
  state: T23State,
  userRole: string,
): { allowed: boolean; reason: string | null } {
  if (state !== T23State.SIGNED_INTERNALLY) {
    return { allowed: false, reason: "Run is not currently signed" };
  }
  if (userRole !== "compliance_director") {
    return { allowed: false, reason: "Only compliance_director can revoke a signature" };
  }
  return { allowed: true, reason: null };
}
```

---

# Partie VIII — Complément SQL au Document 6

## 24. Table `validation_run_state_transitions`

Cette table est ajoutée en migration 038, en complément du schéma du Document 6.

```sql
CREATE TABLE validation_run_state_transitions (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  validation_run_id     UUID NOT NULL REFERENCES validation_runs(id),

  fsm                   VARCHAR(20) NOT NULL,
  from_state            VARCHAR(50),
  to_state              VARCHAR(50) NOT NULL,
  event                 VARCHAR(50) NOT NULL,
  event_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id         UUID REFERENCES users(id),
  actor_session_id      UUID REFERENCES sessions(id),

  duration_ms           INTEGER,
  guard_reason          TEXT,
  side_effect_details   JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vrst_ck_fsm CHECK (fsm IN ('T0', 'T1', 'T2_T3', '4eyes'))
);

CREATE INDEX vrst_idx_run ON validation_run_state_transitions (validation_run_id, event_at);
CREATE INDEX vrst_idx_tenant ON validation_run_state_transitions (tenant_id, event_at DESC);
CREATE INDEX vrst_idx_fsm_event ON validation_run_state_transitions (fsm, event);
CREATE INDEX vrst_idx_actor ON validation_run_state_transitions (actor_user_id, event_at DESC);
```

**Immutabilité.** Table insert-only, aucun UPDATE ou DELETE autorisé. Trigger d'immutabilité équivalent à celui de `validation_runs`.

## 25. Table `validation_run_signature_revocations`

```sql
CREATE TABLE validation_run_signature_revocations (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  validation_run_id     UUID NOT NULL REFERENCES validation_runs(id),

  original_signed_at    TIMESTAMPTZ NOT NULL,
  original_signed_by_user_id UUID NOT NULL REFERENCES users(id),
  original_signed_xml_hash VARCHAR(64) NOT NULL,

  revoked_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by_user_id    UUID NOT NULL REFERENCES users(id),
  revocation_reason_code VARCHAR(40) NOT NULL,
  revocation_reason_text TEXT NOT NULL,
  revocation_context    JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vrsr_ck_reason CHECK (revocation_reason_code IN (
    'signed_wrong_batch',
    'data_update_required',
    'regulation_changed',
    'internal_control_finding',
    'other'
  )),
  CONSTRAINT vrsr_ck_distinct_users CHECK (revoked_by_user_id IS NOT NULL)
);

CREATE INDEX vrsr_idx_run ON validation_run_signature_revocations (validation_run_id, revoked_at DESC);
CREATE INDEX vrsr_idx_tenant ON validation_run_signature_revocations (tenant_id, revoked_at DESC);
```

**Immutabilité.** Table insert-only. Aucune modification possible d'une révocation après son enregistrement.

## 26. Adaptations du trigger d'immutabilité

Le trigger `prevent_validation_runs_modification` défini au Document 6 interdisait la transition `is_signed = TRUE → FALSE`. Il doit être assoupli pour permettre la révocation contrôlée.

**Nouveau comportement.**

```sql
CREATE OR REPLACE FUNCTION prevent_validation_runs_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'validation_runs is insert-only; DELETE is forbidden on run %', OLD.id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Champs strictement immuables
    IF NEW.id != OLD.id OR NEW.tenant_id != OLD.tenant_id
       OR NEW.primary_annexe_code != OLD.primary_annexe_code
       OR NEW.arrete_date != OLD.arrete_date
       OR NEW.primary_upload_id != OLD.primary_upload_id
       OR NEW.initiated_by_user_id != OLD.initiated_by_user_id
       OR NEW.initiated_at != OLD.initiated_at
       OR NEW.created_at != OLD.created_at
       OR (NEW.rules_version_snapshot::TEXT != OLD.rules_version_snapshot::TEXT)
       OR (NEW.referentials_version_snapshot::TEXT != OLD.referentials_version_snapshot::TEXT)
    THEN
      RAISE EXCEPTION 'validation_runs immutable fields cannot be modified';
    END IF;

    -- Révocation de signature : autorisée UNIQUEMENT si une ligne existe dans
    -- validation_run_signature_revocations datée de moins de 5 secondes.
    -- Cette contrainte force le passage par la procédure stockée sp_revoke_signature
    -- qui écrit l'historique avant de mettre à jour validation_runs.
    IF OLD.is_signed = TRUE AND NEW.is_signed = FALSE THEN
      IF NOT EXISTS (
        SELECT 1 FROM validation_run_signature_revocations
        WHERE validation_run_id = NEW.id
          AND revoked_at > NOW() - INTERVAL '5 seconds'
      ) THEN
        RAISE EXCEPTION 'Signature revocation requires prior entry in validation_run_signature_revocations';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Effet.** Une révocation directe via `UPDATE validation_runs SET is_signed = FALSE` est rejetée. Seule la procédure stockée `sp_revoke_signature` qui insère d'abord dans `validation_run_signature_revocations` puis met à jour `validation_runs` est autorisée. Traçabilité garantie, immutabilité relâchée sur le seul cas métier légitime.

---

*Fin du Document 8 — State machines du workflow utilisateur*
*Prochain document : Plan d'exécution Phase 0 pour Claude Code*
