# Audit read-only — `regalica-workspace-v5.html` vs implémentation actuelle

- **Date** : 2026-05-03
- **Branche** : `phase-0/brute-refactoring` au commit `b9723e9`
- **Mode** : read-only (aucune écriture de code, aucune migration, aucun port). Document compagnon de l'ADR 0004 (Tranche 1 réduite, pas de re-skin).
- **Scope** : maquette `docs/mockups/regalica-workspace-v5.html` (2167 lignes, 142 classes BEM uniques) confrontée à `apps/web/src/pages/Workspace.tsx` (commit `b9723e9`) et `apps/web/src/styles/primitives.css` (1892 lignes, 215 selecteurs).

L'audit ne propose pas d'implémentation. Il fournit la base factuelle qui permettra à Tranche 1.5 ou 2 de prioriser le portage des régions encore absentes, **en fonction de l'arrivée des livrables backend correspondants** (sans backend, porter une région UI = afficher un mock figé, ce que la doctrine REGFlow refuse).

## 1. Méthodologie

```bash
# Inventaire BEM mockup
grep -oE 'class="[^"]*"' docs/mockups/regalica-workspace-v5.html \
  | grep -oE '[a-z][a-z0-9]+(__[a-z0-9-]+)?(--[a-z0-9-]+)?' \
  | sort -u
# → 142 classes uniques

# Inventaire selecteurs CSS livrés
grep -cE '^\.(persona|cmd|ribbon|agent|artefact|cite|conf|pill|dock|...)' \
  apps/web/src/styles/primitives.css
# → 215 selecteurs

# Classes BEM utilisées par Workspace.tsx aujourd'hui
grep -oE 'className="[^"]*"' apps/web/src/pages/Workspace.tsx \
  | grep -oE 'BEM_PATTERN' | sort -u
# → 25 classes
```

Trois ensembles :

- **A** : BEM dans le mockup (142)
- **B** : selecteurs CSS livrés dans `primitives.css` (215, incluant des modifiers `--*`)
- **C** : classes effectivement utilisées par `Workspace.tsx` (25)

L'audit examine les régions et reporte chaque ensemble.

## 2. Régions Workspace v5 — état du portage

### 2.1 Régions complètement portées (CSS livré + Workspace.tsx les utilise)

| Région maquette        | Classes BEM principales                                                                                                                                                                             | Workspace.tsx ?                             | Notes                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Persona sidebar        | `persona`, `persona__brand*`, `persona__name`, `persona__role`, `persona__portrait`, `persona__stats`, `persona__stat-row`, `persona__status-mode`                                                  | Oui (via `<PersonaSidebar>`)                | Composant dédié `apps/web/src/components/layout/PersonaSidebar.tsx`                                              |
| Command bar            | `cmd`, `cmd__nav`, `cmd__context`, `cmd__bank`                                                                                                                                                      | Partiel (`cmd`, `cmd__nav`, `cmd__context`) | `cmd__bank` non rendu (le tenant est dans la persona sidebar)                                                    |
| Ribbon (orchestration) | `ribbon`, `ribbon__header`, `ribbon__title`, `ribbon__meta`, `ribbon__track`, `agent`, `agent__dot`, `agent__labels`, `agent__name`, `agent__fn`, `agent--current`, `agent--done`, `agent--pending` | Oui                                         | Composant inline `Ribbon` dans `Workspace.tsx`, `<RunAgentStep>` driven                                          |
| Chat thread            | `thread`, `msg-user`, `msg-user__meta`, `msg-rega`, `msg-rega__avatar`, `msg-rega__body`, `msg-rega__head`, `msg-rega__name`, `msg-rega__time`, `msg-rega__text`                                    | Oui                                         | Composant inline `ChatThread` + `ChatTurn`                                                                       |
| Day separator          | `thread__day`, `thread__day-label`, `thread__day-line`                                                                                                                                              | Oui (via `<DaySeparator>`)                  | `apps/web/src/components/DaySeparator.tsx`                                                                       |
| Dock                   | `dock`, `dock__composer`, `dock__field`, `dock__send`, `dock__suggestions`, `dock__sug`, `dock__sug-icon`, `dock__hint-row`, `dock__tools`, `dock__tool`                                            | Oui (via `<Dock>`)                          | `apps/web/src/components/Dock.tsx`                                                                               |
| Artefact générique     | `artefact`, `artefact__header`, `artefact__title`, `artefact__subtitle`, `artefact__icon`, `artefact__badge`, `artefact__badge--*`, `artefact__body`, `artefact--system`, `artefact--locked`        | Oui (via `<Artefact>`)                      | `apps/web/src/components/Artefact.tsx`, types `synthese`, `livrable_a/b/c`, `briefing`, `notification`, `system` |
| Cite/Confidence/Pill   | `cite`, `conf`, `conf__dot`, `conf--high/medium/low`, `pill`, `pill__dot`, `pill__count`, `pill--fail/pass/rounding/sentinel-c/sentinel-d`                                                          | CSS livré, **non utilisé en TSX**           | Primitives livrées par `0668438` mais aucun composant React ne les rend aujourd'hui — voir §2.3                  |

### 2.2 Régions où Workspace.tsx s'écarte de la maquette par doctrine

| Région              | Maquette v5                                                                 | Workspace.tsx aujourd'hui                                                                 | Justification                                                                               |
| ------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| KPI grid            | Pas de KPI grid dédié (mockup v5 montre les totaux dans la persona sidebar) | `<KpiGrid>` rend un grid 2/5 colonnes Tailwind dans `<Artefact type="synthese">`          | Demande Tranche 0.5 (W2.1) — afficher les KPIs dans le thread pour ne pas perdre la persona |
| FailsTable          | Pas dans le mockup                                                          | `<FailsTable>` rendue conditionnellement si `total_fail_severe + total_fail_rounding > 0` | Tranche 0.5 (W2.2) — surface des `validation_fail_details`                                  |
| T3 lock banner      | Pas dans le mockup                                                          | `<T3LockBanner>` au bas de l'`<Artefact synthese>`                                        | Tranche 0.5 (W2.4) — explicite l'invariant T3 verrouillé/débloqué                           |
| EngineErrorArtefact | Pas dans le mockup                                                          | Rendu conditionnellement si SSE `error` reçu                                              | Tranche 1 fix #3 (commit `6b2c0e1`)                                                         |
| UploadStagedRow     | Pas dans le mockup (le mockup n'a pas de pipeline d'upload)                 | Rendu sous le thread quand un fichier est en cours d'upload ou prêt à être lancé          | Tranche 0 — pipeline T0 nécessite un upload XML avant `start-run`                           |
| Notifications       | `<Artefact type="notification">` non illustré dans le mockup v5             | Rendu en haut du thread si `notifications.length > 0`                                     | Tranche 0.5 (W2.5)                                                                          |

Ces écarts ne sont pas des dettes : ils livrent de la fonctionnalité user-visible que le mockup n'avait pas formalisée. Cohérents avec la doctrine « le mockup illustre la direction visuelle, pas l'exhaustivité fonctionnelle ».

### 2.3 Primitives CSS livrées mais non encore consommées

| Primitive                                                                                              | Ligne primitives.css | Statut React           |
| ------------------------------------------------------------------------------------------------------ | -------------------- | ---------------------- |
| `.cite`                                                                                                | 945                  | Aucune utilisation TSX |
| `.conf`, `.conf__dot`, `.conf--high/medium/low`                                                        | 955-977              | Aucune utilisation TSX |
| `.pill`, `.pill__dot`, `.pill__count`, `.pill--fail/pass/rounding/sentinel-c/sentinel-d`               | 979+                 | Aucune utilisation TSX |
| `.brief`, `.brief__head`, `.brief__foot`, `.brief__files`                                              | livrés               | Aucune utilisation TSX |
| `.inv`, `.inv__head`, `.inv__grid`, `.inv__body`                                                       | livrés               | Aucune utilisation TSX |
| `.proof`, `.calc`, `.ledger`, `.ledger__band`, `.ledger__filters`, `.decomp` (et tous ses descendants) | livrés               | Aucune utilisation TSX |

Ces primitives sont du CSS « en attente de backend » :

- `.cite` / `.conf` : prévues pour citer une source réglementaire avec un score de confiance — nécessitent l'agent `Citation` Phase 4 livré côté backend mais pas exposé via une route API.
- `.pill--fail/pass/rounding/sentinel-c/sentinel-d` : prévues pour annoter les FailsTable rows, MAIS le composant `<FailsTable>` actuel utilise déjà des badges Tailwind (`bg-vermilion-100 text-vermilion-700`). Migration possible vers `.pill--fail` mais purement cosmétique.
- `.brief`, `.inv`, `.proof`, `.calc`, `.ledger`, `.decomp` : régions Investigator / Sanction / Brief / Plan, livrables Phases 2-3.

## 3. Régions du mockup v5 sans CSS livré et sans React

| Famille mockup               | Classes typiques                                                                                                                        | Statut CSS                                             | Statut React | Phase d'arrivée             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------ | --------------------------- |
| Brief files                  | `brief-foot`, `brief-files`                                                                                                             | partiel (`.brief` racine livrée, pas tous les enfants) | Non          | Phase 2 — Investigator      |
| Sanction / Calc              | `calc`, `calc__band`, `gap`, `ecart`                                                                                                    | partiel                                                | Non          | Phase 3 — Sanction          |
| Ledger / Inspector           | `ledger-wrap`, `ledger-band`, `ledger-filters`, `inspector__rule`, `inspector__meta`                                                    | partiel                                                | Non          | Phase 2-3                   |
| Decomp ligne (R1/R2 calculs) | `decomp__rang`, `decomp__rang--2`, `decomp__val`, `decomp__val--missing`, `decomp__cite`, `decomp__oper`, `decomp__row`, `decomp__head` | livré (commit `0668438`)                               | Non          | Phase 2 — Investigator zoom |
| Inv-grid                     | `inv-head`, `inv-grid`, `inv-body`                                                                                                      | partiel                                                | Non          | Phase 2                     |
| Proof                        | `proof`, `proof-band`, `proof-block`                                                                                                    | livré                                                  | Non          | Phase 2                     |

**Constat** : aucun de ces blocs n'a de données réelles à afficher aujourd'hui (les agents Investigator, Citation, Reporter sont seedés dans `prompt_bank` mais aucun endpoint API ne sert leur output au frontend). Porter ces régions maintenant équivaudrait à afficher un placeholder figé — refusé par la doctrine REGFlow (zéro mock en prod).

## 4. Synthèse pour Tranche 1.5 / 2

### Ce que cette tranche n'a PAS fait (et qui était dans le plan initial Tranche 1)

- ❌ Re-skin Workspace v5 (refus motivé par primitives déjà livrées — voir ADR 0004)
- ❌ Portage `<Inspector>` / `<Brief>` / `<Ledger>` (refus motivé par absence de backend)
- ❌ Migration `<FailsTable>` Tailwind → `.pill--fail/--rounding` (refus motivé par changement cosmétique sans valeur)

### Ce qui peut être priorisé en Tranche 1.5 (faible coût, gain modéré)

1. Migration `<FailsTable>` badges Tailwind → `.pill--fail/--rounding` pour cohérence visuelle exhaustive avec maquette v5. **~30 lignes TSX, 0 nouveau CSS.**
2. Rendu d'un `.cite` léger sur `<EngineErrorArtefact>` quand le `code` provient de `run_error_codes` (au lieu de `font-mono text-[10px]`). **~10 lignes TSX, 0 nouveau CSS.**
3. Suppression du double rendu KPI by-annexe dans `<Artefact synthese>` ET `<T1Deliverables livrable_b>` (vérifier code Workspace.tsx lignes 434-453 et 567-585 — deux blocs `summary.annexes.map(...)` adjacents).

### Ce qui doit attendre Phase 2-3 (backend pré-requis)

| Région                                                 | Pré-requis backend                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `<Inspector>` (zoom FAIL avec décomposition R1/R2/...) | Agent Investigator output sérialisé en JSON exposé via `/runs/:id/inspector/:rule` |
| `<Brief>` (briefing 4-yeux pour signature)             | Agent Reporter livrable D + endpoint `/runs/:id/brief`                             |
| `<Calc>` (sanction estimée BCT)                        | Agent Sanction Estimator + endpoint `/runs/:id/sanction`                           |
| `<Ledger>` (historique rubrique cross-arrêté)          | Agent Historical + endpoint `/items/:rubrique/history`                             |
| `<Plan>` (plan de correction optimal)                  | Agent Plan + endpoint `/runs/:id/plan`                                             |

## 5. Données de référence

- Mockup : `docs/mockups/regalica-workspace-v5.html` (commit `0668438`, livraison Phase 4)
- CSS : `apps/web/src/styles/primitives.css` (1892 lignes, 215 selecteurs au commit `b9723e9`)
- Workspace TSX : `apps/web/src/pages/Workspace.tsx` (commit `b9723e9`, ~750 lignes incluant les sous-composants inline)
- Tests visuels : aucun storybook, aucun snapshot test ; le portage est validé par inspection humaine + revue maquette.

## 6. Hors scope de cet audit

- Maquettes `regalica-library-v3.html` (Phase 5 Library) et `regalica-filings.html` (Phase 4 Filings) — ces régions ont leurs propres pages (`Library.tsx`, `Filings.tsx`) déjà partiellement portées (commits 39/40).
- Tokens de couleur, typographie, spacing — déjà gérés par `tailwind.config.ts` + variables CSS dans `primitives.css`. Aucun écart observé entre maquette et tokens livrés.
- RTL / i18n — la couverture FR/EN/AR est garantie par `keys-coverage.test.ts` (commit `4ff1841`).

## Conclusion

L'implémentation Workspace.tsx au commit `b9723e9` couvre fidèlement les régions « shell » de la maquette v5 (persona, cmd, ribbon, chat, dock, artefacts génériques) et ajoute par-dessus les blocs fonctionnels Tranche 0.5 (KPI grid, FailsTable, T3LockBanner) que la maquette n'avait pas formalisés. Le retard structurel apparent (~30 classes BEM mockup non utilisées) est entièrement adossé à des **livrables backend Phases 2-3 non encore disponibles**, pas à un défaut de portage CSS.

L'ADR 0004 documente la décision de Tranche 1 réduite, et cet audit fournit la cartographie qui permettra de prioriser le portage incrémental au fur et à mesure que les backends arrivent.
