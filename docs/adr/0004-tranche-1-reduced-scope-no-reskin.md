# ADR 0004 — Tranche 1 réduite : pas de re-skin, focus sur 4 dettes ciblées

- **Status** : Accepted
- **Date** : 2026-05-03
- **Tranche** : 1 (réduite, Option C)
- **Branche** : `phase-0/brute-refactoring`
- **Commits** : `a5a4692`, `4ff1841`, `6b2c0e1`, `b9723e9`, ce commit

## Contexte

Le plan initial Tranche 1 (rédigé après Tranche 0.7) postulait que les primitives CSS BEM `.pill`, `.cite`, `.conf` (et leurs modifiers `.pill--fail`, `.pill--pass`, `.pill--rounding`, `.pill--sentinel-c`, `.pill--sentinel-d`, `.conf--high`, `.conf--medium`, `.conf--low`) **manquaient** dans `apps/web/src/styles/primitives.css` et qu'il fallait donc « porter » la maquette `docs/mockups/regalica-workspace-v5.html` vers `Workspace.tsx` en livrant ces classes plus le câblage React associé.

Pré-flight read-only Tranche 1 (verbatim) :

```
grep -nE '^\.(pill|cite|conf)\b' apps/web/src/styles/primitives.css
```

Résultat :

| Selecteur                 | Ligne primitives.css | État    |
| ------------------------- | -------------------- | ------- |
| `.cite`                   | 945                  | Présent |
| `.conf`                   | 955                  | Présent |
| `.conf__dot`              | 964                  | Présent |
| `.conf--high`             | 969                  | Présent |
| `.conf--medium`           | 972                  | Présent |
| `.conf--low`              | 975                  | Présent |
| `.pill`                   | 979                  | Présent |
| `.pill__dot`              | 991                  | Présent |
| `.pill__count` + variants | suivants             | Présent |

Les primitives sont entrées dans le repo via le commit **`0668438`** (`fix(phase-4): primitives.css verbatim from workspace-v5 mockup (commit 38-fix)`), avant Tranche 0.5 — la maquette v5 a été extraite verbatim, classes de mockup comprises. Au total, `primitives.css` contient 1892 lignes et 215 selecteurs des familles BEM mockup-mirror (`persona`, `cmd`, `ribbon`, `agent`, `artefact`, `cite`, `conf`, `pill`, `dock`, `inspector`, `decomp`, `msg`, `thread`, `brief`, `inv`, `proof`, `calc`, `ledger`, etc.).

**Conclusion pré-flight** : la prémisse « primitives manquantes » du plan Tranche 1 initial est fausse. Aucune justification n'existe pour porter du CSS déjà livré.

## Décision

**Tranche 1 réduite (Option C)** : remplacer la portée « re-skin Workspace v5 » par 4 fixes ciblés de dette résiduelle Tranche 0/0.5/0.7 que l'opérateur peut prouver en quelques minutes en navigation locale. Les 4 fixes sont, dans l'ordre committé :

| #   | Commit  | Concern                                                                                                                                                                                                                                                                                                                                      |
| --- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | a5a4692 | Fix i18n AR : `kpi.conformity` et `kpi.pass` traduisaient au même string « المطابقة » → React duplicate-key warning sur `KpiGrid`. Désambigué via `kpi.pass = "القواعد المطابقة"` (les règles conformes), distinct de `kpi.conformity = "المطابقة"` (le taux de conformité).                                                                 |
| 2   | 4ff1841 | Filet de sécurité i18n : `apps/web/src/locales/__tests__/keys-coverage.test.ts` impose la parité stricte du jeu de clés FR/EN/AR (mêmes dotted-keys à plat), zéro doublon, zéro feuille vide. Empêche un futur edit locale de réintroduire la classe de bug fix #1.                                                                          |
| 3   | 6b2c0e1 | SSE error listener : Tranche 0 émettait `{code, message}` sur `/finalize` mais aucun listener frontend ne le consommait. Ajout du composant `EngineErrorArtefact`, des clés i18n `error.engine.<code>` × 6 codes canoniques (mirror seed JSON) + fallback `unknown`, et de la souscription `sse.subscribe('error', …)` dans `Workspace.tsx`. |
| 4   | b9723e9 | `useCurrentRun.refetch()` : avant ce commit, le hook fire-once gardait un snapshot stale `status='running'` après SSE `complete`, masquant les KPIs/totaux post-finalize sur la persona side. Ajout de `refetch()` (mirror `useRunSummary` pattern), wiring dans le handler SSE `complete` à côté de `refetchSummary()`.                     |

**Hors scope explicitement** : aucun changement de rendu visuel Workspace v5, aucun nouveau composant `Inspector` / `Brief` / `Ledger`, aucune extension `primitives.css`.

## Justification

### Pourquoi pas de re-skin

1. **Le re-skin n'aurait rien livré que le commit `0668438` ne livre déjà.** Les classes BEM utilisées par Workspace.tsx aujourd'hui (`.persona__*`, `.cmd__*`, `.ribbon__*`, `.artefact*`) viennent toutes de `primitives.css` et matchent verbatim la maquette v5 sur ces régions.

2. **Les régions « manquantes » dans Workspace.tsx vs maquette v5 sont des composants Phase 2/3.** L'audit read-only de la maquette (cf. document compagnon `docs/audits/2026-05-03-mockup-v5-gap-audit.md` produit par ce même commit) liste les 142 selecteurs BEM uniques du mockup ; le sous-ensemble absent de `primitives.css` (`.fail__row`, `.brief__*`, `.ledger__*`, `.inv__*`, `.calc__*`, `.proof__*`, `.band`, `.block`, `.gap`) appartient sans exception aux livrables `Investigator` / `Sanction` / `Brief` / `Plan` documentés Phases 2-3 (cf. `docs/PRD-REGFLOW.md` §6 roadmap).

3. **Les 4 fixes choisis adressent des dettes user-visible.** Chacun a une preuve d'observation directe : warning console (#1, #2 indirect), `engine.ts:1072` SSE émis sans consommateur (#3), KPI grid stale (#4). Le re-skin aurait été un reformatage cosmétique sans bug à fermer.

### Pourquoi un commit atomique par fix

Tranche 0 a établi le pattern « single-writer / single-emitter » sur le pipeline `/finalize` et un test d'intégration HTTP-level par scénario. Tranche 1 réduite hérite la même rigueur : un commit = un concern observable + tests qui le couvrent + CI verte avant le suivant. Cela permet à l'opérateur de bisecter trivialement si un commit déclenche une régression invisible (les 4 commits sont tous CI 14/14 verts indépendamment).

### Pourquoi un test keys-coverage en plus du fix AR

Le bug #1 (collision `kpi.conformity` / `kpi.pass` en AR) n'aurait pas été détecté par la CI existante. Le test ad-hoc `kpi-labels-distinct.test.ts` ferme le cas KPI précisément, mais le test générique `keys-coverage.test.ts` pose une invariant structurelle (parité stricte FR/EN/AR + non-vide + non-doublon) qui empêche **n'importe quelle classe de régression i18n du même type** dans le futur. Le coût de maintenance est nul (aucune mise à jour requise tant que les fichiers JSON respectent l'invariant).

### Pourquoi pas de scope « SSE error → toast notification »

L'`EngineErrorArtefact` se rend en place dans le thread Workspace (à côté du `<NotificationsArtefact>`). Une UX toast/snackbar serait un changement de pattern UI sans précédent dans le repo (aucun toast n'existe ailleurs). Le maintien du pattern « tout-est-artefact » respecte la doctrine Edition One sans introduire de nouveau primitif visuel.

## Conséquences

### Positives

- Tranche 1 réduite mergeable en 5 commits atomiques, CI 14/14 verte à chaque commit, **zéro nouvelle dépendance**, zéro nouveau fichier CSS.
- Les 4 dettes ferment 4 surfaces de bug user-observable.
- Le filet i18n empêche la classe AR-duplicate de revenir.
- Le pré-flight read-only (qui a permis de refuser le scope re-skin) devient le mode opératoire de référence pour les futures tranches : valider chaque assertion de plan avant écriture.

### Négatives

- Les régions Workspace v5 « advanced » (Inspector, Sanction Calculator, Brief, Ledger) restent non-portées tant que les Phases 2-3 ne livrent pas leur backend. Le risque est nul car ces régions n'ont **pas de données réelles à afficher** aujourd'hui (les agents Investigator/Citation/Reporter sont prompts seedés mais non câblés à un endpoint UI).
- L'audit mockup v5 (compagnon de cet ADR) liste `~30` classes BEM mockup-only mais Workspace.tsx n'utilise actuellement qu'un sous-ensemble. Tranche 1.5 ou 2 devra décider quoi porter en fonction des livrables backend disponibles à ce moment.

## Vérification

- 4 commits poussés successivement, chacun CI 14/14 vert :
  - `a5a4692` — fix i18n AR
  - `4ff1841` — keys-coverage test
  - `6b2c0e1` — SSE error listener + EngineErrorArtefact + 9 tests
  - `b9723e9` — useCurrentRun.refetch + 4 tests
- Total nouveau code TS/TSX : 4 fichiers (1 composant, 3 fichiers de tests, 1 hook étendu).
- Total nouveaux strings i18n : 8 clés × 3 langues = 24 entrées (toutes mirror du seed `apps/api/seeds/run_error_codes.json` pour `engine.*`, plus `engineErrorTitle` éditorial).
- Aucun changement `primitives.css`, `tailwind.config.ts`, ou autre fichier de design tokens.

## Documents liés

- `docs/audits/2026-05-03-mockup-v5-gap-audit.md` — audit read-only complémentaire de la maquette v5 (livré par le même commit que cet ADR), liste exhaustive des écarts observés entre `Workspace.tsx` et la maquette.
- ADR 0001 — Finalize route + idempotence (Tranche 0).
- ADR 0003 — Synthesis artifact aggregator (Tranche 0.7).
- `apps/web/src/styles/primitives.css` — primitives BEM verbatim mockup v5, livrées commit `0668438` Phase 4.
- `apps/api/seeds/run_error_codes.json` — source of truth des 6 codes canoniques referencés par `error.engine.*` i18n.
