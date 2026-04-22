# ADR 0004 — Monorepo tooling : pnpm workspaces

- **Status:** Accepted
- **Date:** 2026-04-18

## Context

Le monorepo compte 4 apps (2 Node/Express, 1 Python/FastAPI, 1 Angular) et
3 packages TS partagés. Il faut un outil de workspace qui :

- Gère l'installation hoistée efficace (éviter 4× `node_modules` entiers).
- Supporte le build/test sélectif (`--filter @regalica/api`).
- Fonctionne sur Windows (environnement dev du CEO) + Linux (CI).
- Permet un `deploy --prod` pour produire des bundles Docker légers.

## Options évaluées

| Option            | Install speed | Strict deps | Windows | Deploy bundle | Remote cache |
|-------------------|---------------|-------------|---------|---------------|--------------|
| npm workspaces    | Baseline      | ❌ permissif | ✅       | ❌             | ❌            |
| **pnpm workspaces** | 2-3× plus rapide | ✅ hoisting strict | ✅ (symlinks OK) | ✅ (`pnpm deploy`) | Via pnpm.yaml |
| Yarn 4 + PnP      | Rapide         | ✅           | ⚠️ (PnP fragile sur Win) | ❌ (non natif) | ❌ |
| Turborepo + npm   | Varie          | Hérite de npm | ✅ | Via plugins | ✅ (Vercel) |
| Turborepo + pnpm  | Le plus rapide | ✅           | ✅       | ✅             | ✅            |

## Decision

**pnpm workspaces** pour Phase 0.

- Raison 1 : l'ancien repo utilisait déjà `pnpm-lock.yaml` (confort CEO).
- Raison 2 : `pnpm deploy --prod` produit un bundle self-contained idéal pour
  les Dockerfiles multi-stage.
- Raison 3 : strict `peerDependency` résolution évite les "it works on my
  machine" typiques de npm.
- Raison 4 : Turborepo en overlay **reste une option future** (posable au-dessus
  de pnpm workspaces sans refactor) — on l'ajoutera quand on aura plusieurs
  build pipelines lentes à orchestrer (Phase 3+).

## Configuration

### `pnpm-workspace.yaml`
```yaml
packages:
  - 'apps/api'
  - 'apps/chatbot-node'
  - 'apps/frontend'
  - 'packages/*'
```

Note : `apps/chatbot-py` n'est **pas** un workspace pnpm (c'est un projet
Python autonome géré par `uv`). Les deux coexistent.

### Scripts cross-workspace (root `package.json`)
```json
{
  "scripts": {
    "lint": "pnpm -r --if-present lint",
    "test": "pnpm -r --if-present test",
    "build": "pnpm -r --if-present build",
    "typecheck": "pnpm -r --if-present typecheck",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

### Dockerfiles multi-stage
Chaque app utilise `pnpm deploy --prod /deploy` dans le builder stage pour
produire un dossier self-contained copié dans la runtime image. Résultat :
images ~70 MB (Node) contre ~180 MB avec hoisting classique.

## Consequences

### Positives
- Installs rapides (avantage x2-x3 vs npm sur réseau tunisien).
- Lockfile reproductible et lisible.
- `pnpm -r --filter` permet CI sélective (only run tests for changed packages).

### Négatives
- Courbe d'apprentissage léger pour les devs qui ne connaissent que npm/yarn.
- `pnpm deploy` a quelques edge-cases avec les workspaces internes (utilisant
  `workspace:*`). À Phase 0 on n'en a pas ; à Phase 1+ il faudra vérifier que
  `@regalica/shared-types` en dep `workspace:*` se déploie correctement.

## Migration path si pnpm ne tient pas

Si on hit un wall (ex : Docker multi-stage + workspace internes casse souvent),
fallback dans cet ordre :
1. **pnpm + `injected: true`** sur les workspace deps (hack connu).
2. **Turborepo + pnpm** (ajout d'une couche d'orchestration, pas un remplacement).
3. **Nx** (plus lourd mais meilleure intégration Angular + caching) — ADR
   0005 si on y va.
