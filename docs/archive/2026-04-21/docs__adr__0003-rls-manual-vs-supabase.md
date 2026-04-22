# ADR 0003 — RLS manuel sur Postgres 16 vanilla

- **Status:** Accepted
- **Date:** 2026-04-18

## Context

Le pilier 7 (HIERARCHICAL TENANCY) et toute la sécurité des données exigent
une isolation stricte entre tenants. Master doc §3 interdit qu'une requête
accidentellement non-scopée expose les données d'un tenant à un autre.

Supabase (stack v1) offrait un système RLS managé avec `auth.uid()` injecté
automatiquement. Le nouveau stack (Postgres 16 vanilla) ne l'offre pas.

## Decision

**RLS activée à la main sur 100 % des tables portant de la donnée tenant,
avec un middleware Express qui injecte le contexte via `SET LOCAL`.**

### 1. Chaque migration Sequelize crée une table avec RLS activée

```sql
CREATE TABLE uploads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  filename         TEXT NOT NULL,
  uploaded_by      UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads FORCE ROW LEVEL SECURITY;

CREATE POLICY uploads_tenant_isolation ON uploads
  USING (tenant_id::text = current_setting('app.tenant_id', true));
```

### 2. Middleware Express injecte le tenant à chaque transaction

```typescript
// apps/api/src/middleware/tenant-ctx.ts
export const tenantCtx: RequestHandler = async (req, res, next) => {
  const ctx = req.auth; // {tenantId, userId} from JWT
  const tx = await sequelize.transaction();
  await tx.query(`SET LOCAL app.tenant_id = '${ctx.tenantId}'`);
  await tx.query(`SET LOCAL app.user_id   = '${ctx.userId}'`);
  (req as any).tx = tx;
  // ... commit/rollback on response finish
};
```

### 3. Tous les modèles Sequelize ont un `defaultScope` qui **force** `tenant_id`

```typescript
Upload.init({...}, {
  defaultScope: {
    where: { tenantId: literal(`current_setting('app.tenant_id')::uuid`) },
  },
});
```

### 4. Hiérarchie (maison-mère → filiales) via fonction SQL

```sql
-- returns set of ancestor + current tenant ids
CREATE OR REPLACE FUNCTION tenant_ancestors(t UUID) RETURNS SETOF UUID AS $$
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id FROM tenants WHERE id = t
    UNION ALL
    SELECT t2.id, t2.parent_id FROM tenants t2
    JOIN ancestors a ON t2.id = a.parent_id
  )
  SELECT id FROM ancestors;
$$ LANGUAGE SQL STABLE;

-- Rules visibility: own tenant + inherited from ancestors
CREATE POLICY rules_hierarchical ON rules
  USING (tenant_id IN (SELECT tenant_ancestors(current_setting('app.tenant_id')::uuid)));
```

## Consequences

### Positives
- Défense en profondeur : même si le code applicatif oublie un `WHERE
  tenant_id = …`, la DB refuse.
- Audit SQL trivial : `SELECT * FROM uploads` exécuté par un admin **ne voit
  que son tenant** sauf s'il bypass explicitement (`SET app.tenant_id =
  superadmin_bypass` — à éviter sauf opérations spéciales).
- Portable : Postgres 16 vanilla, pas de dépendance Supabase.

### Négatives
- Plus de code à écrire (policies, middleware, defaultScope).
- Sequelize n'a pas de support natif pour `SET LOCAL` — wrapper custom requis.
- Tests doivent prouver l'isolation (suite de tests dédiée
  `tests/integration/rls.test.ts`).
- Performances : une policy RLS = un coût à chaque query. Indexer `tenant_id`
  sur toutes les tables portant de la donnée.

### Tests obligatoires (à livrer Phase 1)
1. Tenant A ne peut pas lire les uploads de Tenant B.
2. Tenant filiale peut lire les rules héritées de sa maison-mère.
3. Une requête sans `tenant_id` dans le contexte renvoie 0 rows (fail-safe).
4. Un admin superuser peut toujours bypass explicitement.

## Alternatives considérées

- **Séparation par schéma** (un schéma Postgres par tenant) — rejeté :
  non-scalable au-delà de ~50 tenants, migrations cauchemardesques.
- **Séparation par base** (une DB par tenant) — rejeté pour la même raison +
  coût infra prohibitif.
- **RLS désactivée, filtrage applicatif strict** — rejeté : viole le principe
  de défense en profondeur du pilier 1.
