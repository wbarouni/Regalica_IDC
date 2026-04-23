# REGFlow — Plateforme de Conformité BCT par Intelligence Artificielle

## Document 1 — Vision produit, positionnement, valeur ajoutée

**Version :** 1.0
**Date :** avril 2026
**Périmètre :** vision produit de REGFlow, problème adressé, acteurs concernés, promesse de valeur, identité éditeur, positionnement par rapport au SED BCT, extension géographique potentielle
**Auteur :** Équipe REGFlow
**Statut :** référence canonique pour Claude Code
**Dépendances :** aucune (porte d'entrée narrative avant tout autre document)

---

## Sommaire

**Partie I — Identité et raison d'être**

1. Une phrase pour REGFlow
2. Le problème que REGFlow résout
3. Ce que la BCT donne déjà et ce qu'elle ne donne pas

**Partie II — Acteurs et contexte**

4. Compliance Officer — acteur primaire
5. Contexte bancaire tunisien et rôle du SED
6. Cycle de reporting trimestriel, mensuel, ad hoc

**Partie III — Promesse de valeur**

7. Détection avant envoi — zéro exposition juridique
8. Preuve de calcul complète
9. Corrélation entre règles — grappes de cause racine
10. Explication causale actionnable

**Partie IV — Identité, gouvernance, business**

11. ALGORIA Factory et équipe fondatrice
12. Relation avec RegTrack — applications sœurs à stacks séparés
13. Tenant pilote QNB Tunisia
14. Modèle de déploiement on-premises

**Partie V — Ce que REGFlow n'est pas**

15. Pas un remplacement du SED BCT
16. Pas un auto-corrector
17. Pas un LLM généraliste

---

# Partie I — Identité et raison d'être

## 1. Une phrase pour REGFlow

REGFlow est une **plateforme IA on-premises de conformité BCT** pour les banques tunisiennes résidentes, qui applique localement les 4 611 règles du référentiel RDG sur les reportings XML **avant leur soumission** au SED de la Banque Centrale de Tunisie, afin d'éliminer l'exposition juridique liée au délai asynchrone du contrôle BCT.

Cette phrase est la boussole du produit. Elle tient en trois propositions :

- **Plateforme IA on-premises** — pas un SaaS cloud, pas un service partagé ; déploiement dans le datacenter du client bancaire.
- **Applique les 4 611 règles RDG avant soumission** — substitution temporelle du contrôle, pas substitution fonctionnelle : la BCT reste le juge réglementaire.
- **Élimine l'exposition juridique du délai asynchrone** — la valeur opérationnelle mesurée est le risque évité, pas la productivité brute.

Toute fonctionnalité qui ne sert pas directement cette phrase est hors périmètre produit.

## 2. Le problème que REGFlow résout

Les banques tunisiennes résidentes doivent transmettre périodiquement leurs reportings réglementaires au SED (Système d'Échange de Données) de la BCT. Le retour du contrôle BCT est **asynchrone** : la banque découvre plusieurs jours après soumission si son envoi a été rejeté, et sur quelles règles.

Un rejet BCT déclenche trois conséquences :

- **Obligation de corriger et resoumettre** dans un délai contraint par la circulaire.
- **Diagnostic manuel** du rejet : le retour BCT liste les règles échouées avec la valeur attendue et la valeur calculée, mais **sans décomposition ni cause racine**. Le Compliance Officer doit retrouver lui-même pourquoi un agrégat diffère.
- **Exposition à sanction** si la correction aboutit après l'échéance (circulaire 2017-06 articles 11-12, grille progressive).

Le diagnostic manuel d'un rejet prend plusieurs heures sur un seul FAIL isolé, et peut s'étendre sur plusieurs jours pour une grappe de FAILs partageant une cause. Pendant ce temps, l'horloge réglementaire tourne.

REGFlow s'insère **en amont** du SED et refait localement le même contrôle avant que l'envoi ne parte. L'écart asynchrone est remplacé par un écart synchrone de quelques secondes.

## 3. Ce que la BCT donne déjà et ce qu'elle ne donne pas

Le SED BCT et son contrôle embarqué fournissent trois choses :

- La **liste** des règles échouées.
- Le **couple (attendu, calculé)** pour chaque règle échouée.
- Un **code de rejet** structurel (XSD invalide, contrôle embarqué bloqué, qualité RDG rejetée).

Ce que la BCT **ne fournit pas** et que REGFlow doit fournir :

- La **décomposition terme par terme** d'un agrégat : chaque règle RDG combine jusqu'à plusieurs dizaines de termes, chacun lisant une cellule (rubrique × colonne) dans une annexe donnée. La BCT annonce le résultat, pas les intrants.
- La **cause racine probable** derrière un FAIL : mapping comptable incorrect, rubrique manquante dans le SI source, date d'arrêté désynchronisée entre modules comptables, etc.
- La **corrélation entre règles** : 17 FAILs apparents peuvent partager une seule cause — par exemple une ventilation sectorielle absente du mapping comptable qui casse toutes les règles lisant cette ventilation.
- La **citation réglementaire** précise derrière chaque règle : article de circulaire, alinéa, tableau du RDG. La BCT suppose cette connaissance ; le Compliance Officer doit la reconstruire.
- L'**historique** des FAILs récurrents sur runs passés et l'analyse de tendances.

Ces cinq manques définissent précisément les quatre valeurs ajoutées de REGFlow exposées en Partie III.

---

# Partie II — Acteurs et contexte

## 4. Compliance Officer — acteur primaire

L'acteur primaire est le **Compliance Officer en banque tunisienne résidente**. Profil type :

- **Formation** : comptable ou financière, souvent avec spécialisation contrôle interne ou risque opérationnel.
- **Position hiérarchique** : direction Conformité ou direction Risques. Parfois direction Reporting réglementaire dédiée dans les grandes banques.
- **Usage quotidien** : manipulation des reportings XML, dialogue avec la DSI sur les anomalies du SI source, préparation des soumissions BCT, suivi des retours, archivage des preuves.
- **Intensité d'usage** : plusieurs heures par jour en période de clôture (trimestre, fin d'année), usage plus ponctuel entre deux arrêtés.
- **Acheteur probable** : direction Conformité ou direction Risques en concertation avec la DSI.

L'acteur **secondaire** est le **responsable Reporting** qui signe électroniquement l'envoi au SED (circulaire 2017-06 article 8). Dans les organisations où les rôles sont séparés, le Compliance Officer prépare et le responsable Reporting valide.

REGFlow doit fournir une expérience calibrée pour un profil métier expert, non pour un profil technique. L'utilisateur n'écrit jamais de SQL, ne voit jamais d'erreur technique brute, et ne manipule jamais directement le référentiel RDG.

## 5. Contexte bancaire tunisien et rôle du SED

Le **SED (Système d'Échange de Données)** est le canal unique de transmission des reportings réglementaires entre les banques et la BCT. Toute soumission passe par lui ; aucune soumission parallèle n'est acceptée.

Le SED impose :

- **Signature électronique** du responsable Reporting (circulaire 2017-06 article 8). Cette signature engage la responsabilité de la personne physique signataire.
- **Format XML** conforme aux schémas XSD publiés par la BCT. Trois nomenclatures coexistent historiquement (voir Document 2 §8-10).
- **Contrôle en trois étapes** côté BCT : structure XSD, contrôles embarqués, contrôles qualité RDG.
- **Retour structuré** en cas de rejet, avec balise `<Erreur>` listant les règles échouées.

Le **délai de retour** du contrôle RDG est **asynchrone**. La banque soumet, puis attend. Selon la charge BCT et la complexité du reporting, le retour peut intervenir quelques heures ou plusieurs jours après envoi. Pendant cette attente, le Compliance Officer n'a aucun moyen de savoir si son envoi tiendra.

## 6. Cycle de reporting trimestriel, mensuel, ad hoc

Les reportings réglementaires suivent plusieurs fréquences :

- **Annuel** — arrêté au 31 décembre (RCM00, RCM01, et dérivés).
- **Trimestriel** — arrêtés aux 31 mars, 30 juin, 30 septembre, 31 décembre.
- **Mensuel** — arrêtés en fin de mois (28/29 février, 31 mars, etc.) pour certaines annexes (Bilan, Situation Mensuelle).
- **LCR** — quotidien/hebdomadaire/mensuel selon le dispositif, avec arrêtés spécifiques (p.ex. 31 mars pour LCR trimestriel).
- **Ad hoc** — arrêtés non calendaires (milieu de mois, dates exceptionnelles) sur demande BCT ou suite à événement réglementaire.

Chaque fréquence a son propre calendrier de soumission et sa propre fenêtre de tolérance. Le **Document 7** (golden baseline) documente la classification effective appliquée au corpus QNB Tunisia.

TODO(@wbarouni) : confirmer la liste exhaustive des fréquences et leurs échéances canoniques pour inclusion détaillée dans le Document 2.

---

# Partie III — Promesse de valeur

REGFlow apporte quatre valeurs ajoutées que la BCT ne fournit pas. Toute fonctionnalité produit se rattache à l'une de ces quatre valeurs.

## 7. Détection avant envoi — zéro exposition juridique

**Valeur n° 1 et valeur fondatrice.** Le moteur REGFlow exécute localement les trois étapes BCT (XSD, contrôles embarqués, qualité RDG) avant que l'envoi ne parte vers le SED.

Conséquence directe : si un FAIL sévère est détecté localement, l'envoi peut être bloqué ou corrigé à la source. Zéro attente asynchrone, zéro exposition juridique liée au délai.

**Objectif opérationnel mesurable** : zéro FAIL sévère avant envoi SED sur les reportings soumis. Chaque FAIL sévère détecté avant soumission est une sanction BCT évitée. C'est la métrique produit principale.

## 8. Preuve de calcul complète

**Valeur n° 2.** Pour chaque règle RDG évaluée, REGFlow produit une **décomposition complète** :

- Chaque terme de la formule avec la cellule source lue (annexe, rubrique, colonne).
- La valeur extraite du XML pour chaque cellule.
- L'agrégation par rang, avec les résultats intermédiaires.
- Le verdict final PASS, FAIL sévère, FAIL arrondi, ou SKIP catégorisé.
- La tolérance appliquée (arrondi réglementaire, sentinelles).

Cette décomposition est visible dans les livrables de validation (voir Document 4 §7-9 pour les livrables A, B, C). Elle transforme un FAIL opaque en ligne d'investigation traçable.

## 9. Corrélation entre règles — grappes de cause racine

**Valeur n° 3.** REGFlow détecte les **grappes** : ensembles de FAILs qui partagent une cause racine commune.

Exemple documenté dans le corpus QNB : 17 FAILs apparents sur les annexes 620/630/640 convergent vers une cause unique — l'absence de la ventilation sectorielle « Ménages » dans le mapping comptable source. Sans corrélation, le Compliance Officer traite 17 problèmes. Avec la détection de grappe, il traite **un** problème et les 17 FAILs disparaissent après une correction ciblée.

L'algorithme de clustering exploite la structure inter-annexe des règles (voir Document 2 §11-13) et les patterns de rubriques impactées. Il est documenté au Document 10 §6 (question de type 2 — Grappe).

## 10. Explication causale actionnable

**Valeur n° 4.** Chaque FAIL est accompagné d'une **hypothèse causale** orientée action :

- Identification de l'endroit précis du SI bancaire à corriger (module comptable source, table de mapping, règle de ventilation).
- Citation réglementaire associée (circulaire, article, alinéa, tableau).
- Suggestion d'action corrective concrète.

L'explication causale est produite par l'InvestigatorAgent (Document 9 §13) avec un seuil de confiance minimum de 0,95. En dessous, Regalica n'affiche pas d'hypothèse brute — elle propose une reformulation ou signale l'incertitude.

La promesse n'est **pas** l'auto-correction : REGFlow ne touche jamais le SI source. La promesse est de transformer un diagnostic de plusieurs heures en lecture de quelques minutes.

---

# Partie IV — Identité, gouvernance, business

## 11. ALGORIA Factory et équipe fondatrice

**Éditeur.** ALGORIA Factory, société basée à Tunis.

**CEO et fondateur.** Wissem Barouni, également Head of Financial & Regulatory Reporting chez QNB Tunisia. Cette double casquette garantit la proximité produit-métier : le concepteur du produit est aussi utilisateur expert du domaine.

**Organisation produit.** Équipe REGFlow dédiée, documents canoniques 1 à 10 maintenus à jour, cycle de revue entre la direction produit et le Compliance Officer pilote.

**Contact technique pour Claude Code.** Toute question de périmètre ou d'interprétation réglementaire qui n'est pas tranchée dans les documents canoniques doit être marquée `TODO(@wbarouni)` dans le fichier concerné, jamais résolue par invention.

## 12. Relation avec RegTrack — applications sœurs à stacks séparés

REGFlow et **RegTrack** sont deux applications sœurs d'ALGORIA Factory partageant :

- Une **stack technique commune** (voir Document 3).
- Des **conventions de code et d'architecture** alignées.
- Une **équipe de développement** mutualisée pour les choix de socle.

Elles se distinguent par :

- **Bases de données séparées.** Aucune table partagée, aucun accès croisé.
- **Codebases distincts.** Pas de package commun en runtime.
- **Releases indépendantes.** Un déploiement REGFlow ne touche jamais RegTrack et inversement.
- **Vente possible séparément.** Un client peut acheter REGFlow sans RegTrack.

**Invariant de non-contamination.** Toute évolution de REGFlow qui dégrade ou casse RegTrack (ou inversement) est rejetée au merge. La CI de REGFlow ne référence aucune partie de RegTrack et réciproquement.

## 13. Tenant pilote QNB Tunisia

**Tenant primaire pilote.** QNB Tunisia, CodeBanque BCT = 23.

**Corpus golden.** Les 58 XML qui constituent le golden baseline de non-régression proviennent de cette banque, arrêtés 2021 à 2026. Le Document 7 détaille la composition du corpus. Le Document 10 §10-11 détaille la procédure golden.

**Vérité terrain.** Le Compliance Officer pilote (Wissem Barouni) valide manuellement les `expected_verdicts.json` par batch. Les dates incluses ont toutes été validées par BCT (soumissions acceptées), ce qui donne un point d'ancrage réglementaire authentique.

**Confidentialité.** Repo privé, fixtures en clair, accès restreint aux développeurs habilités, pas d'anonymisation des données (casserait les tests de non-régression). Voir Document 7 §6.

## 14. Modèle de déploiement on-premises

**Contrainte produit non négociable.** REGFlow est déployé **on-premises** dans le datacenter bancaire du client, jamais en SaaS cloud tiers.

**Conséquences** :

- Pas de dépendance critique à un service SaaS externe. Seuls LLM et embeddings Google sont appelés depuis le datacenter via API ; un fallback local (Ollama + Qwen 2.5 3B) est prévu pour opérer en mode dégradé sans connexion Google (voir Document 3 §1).
- Pas de stockage de données bancaires dans un cloud tiers. Les XMLs uploadés, les verdicts produits, l'audit log, les conversations Regalica : tout reste dans le périmètre client.
- Architecture packagée en **Docker Compose** pour déploiement en datacenter. Base PostgreSQL, service Node API, service FastAPI chatbot-py, reverse proxy Nginx, frontend React build statique.

**Extension géographique.** Grâce à la doctrine zéro-hardcoding (Document 3 §7-11), REGFlow peut s'étendre à d'autres banques tunisiennes immédiatement par ajout de tenants. Extension Maghreb et Afrique francophone envisageable en phase ultérieure par ajout de référentiels réglementaires sans modification du code applicatif.

---

# Partie V — Ce que REGFlow n'est pas

La définition négative précise la frontière du produit. Chaque point ci-dessous écarte une confusion courante.

## 15. Pas un remplacement du SED BCT

REGFlow **n'envoie rien** à la BCT. Il ne se substitue pas au SED, il ne se connecte pas au SED, il n'automatise pas la soumission. La BCT reste le juge réglementaire unique, le SED reste le canal de transmission unique.

REGFlow se positionne comme **filtre local préalable**. Un run REGFlow vert ne garantit pas contre un rejet BCT (la BCT peut avoir modifié une règle non propagée dans le RDG, détecter une incohérence inter-run non visible au niveau d'un seul envoi, etc.), mais il rend ce rejet extrêmement improbable sur le périmètre des 4 611 règles connues.

La signature électronique du responsable Reporting reste manuelle, hors REGFlow. L'utilisateur consulte le verdict REGFlow, décide de soumettre au SED, et signe dans le SED.

## 16. Pas un auto-corrector

REGFlow **ne modifie jamais** les XMLs sources ni le SI bancaire. L'autonomie du produit s'arrête au **diagnostic**.

Pourquoi : corriger automatiquement un XML équivaudrait à réécrire un reporting réglementaire, ce qui engage la responsabilité du responsable Reporting signataire sans son contrôle explicite. Toute correction doit passer par le SI source (comptabilité, module de ventilation, table de mapping) avec la traçabilité usuelle de l'environnement bancaire.

REGFlow produit :

- Un **diagnostic causal** (quelle rubrique, quelle colonne, quelle annexe, quelle ligne).
- Une **suggestion d'action** (où intervenir dans le SI source).

REGFlow ne produit **pas** :

- Un XML corrigé prêt à soumettre.
- Une écriture comptable proposée.
- Une modification automatique d'un référentiel.

## 17. Pas un LLM généraliste

REGFlow n'est **pas** une interface de chat générique avec un LLM. L'architecture est celle d'**agents typés** (Documents 5, 9, 10) avec :

- **Contrats JSON stricts** entre agents (Pydantic côté Python, TypeScript côté Node), validés en runtime.
- **Régression garantie** par le golden baseline (Document 7).
- **Garde-fous** : seuils de confiance, retry unique avec prompt correctif, fallback local, citation obligatoire pour toute affirmation factuelle.
- **Persona unique** (Regalica, Document 10) qui orchestre les spécialistes ; jamais d'appel LLM brut exposé à l'utilisateur.

Une requête utilisateur hors domaine (p.ex. « génère-moi un tableau Excel » ou « traduis ce texte ») est rejetée gracieusement par Regalica en la reconnaissant comme `out_of_scope` (Document 10 §19). Le produit n'est pas un assistant général ; il est un outil de conformité BCT.

---

**Document suivant :** `02-REGLEMENTAIRE-RDG-ET-BCT.md` — cadre réglementaire, structure du RDG, nomenclatures XML, dépendances inter-annexes, sanctions.
