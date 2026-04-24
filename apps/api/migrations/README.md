# REGFlow — apps/api/migrations

Canonical location for all SQL migrations that build and evolve the REGFlow database schema.

The full sequence of 37 migrations is listed in `docs/06-SCHEMA-SQL-COMPLET.md` §26. This directory is empty at the end of commit 11 (runner infrastructure only); migrations 001-037 are added in commits 12 to 18 of Phase 1.

## File naming

Every migration file follows this pattern:

```
NNN[a-z]?_slug.sql
```

- `NNN` — three-digit zero-padded numeric prefix, strictly increasing. Gaps are allowed in history but new migrations take the next free number.
- Optional single lowercase letter `[a-z]` — marks an **amendment migration** that runs after its `NNN` base migration but before `NNN+1` (Flyway-style). See next subsection.
- `slug` — short lowercase-with-underscores description. Must match the table or feature being created.

Examples: `001_extensions.sql`, `008_referentials_annexes.sql`, `035_pg_cron_partitions.sql`, `007b_platform_config.sql`.

### When to use an amendment id

Amendment migrations (`NNN[a-z]_slug.sql`) are for cross-table backfills, forward-FK reconciliations, or canon gaps discovered after the base migration was written and applied. They are strictly additive and run in lexicographic order (`'007' < '007a' < '007b' < '008'`).

- **Use** an amendment when you need to add state after a later table becomes available (for example, a FK from an earlier table to a table defined in a later migration), or when a canon review uncovers an additive fix (new system role, new seed row) that must apply to already-deployed databases.
- **Do not** use an amendment to modify the base migration's content. That is a checksum drift and the runner will refuse it. If the base migration needs different content, the correct response is a new additive amendment — never an in-place edit.
- A single lowercase letter is enough in practice: 26 amendments per tier is far beyond anything the canonical §26 sequence needs. Running out is a schema-design signal, not a naming problem.

## Mandatory file header

Every `.sql` file starts with this block (adapted per migration):

```sql
-- Migration NNN_slug.sql
-- Object: one line describing the change
-- Author: ALGORIA Factory
-- Date: YYYY-MM-DD
-- Depends on: NNN_previous.sql  (or "none" for 001)
-- References: Document 6 §<section number>
```

If the migration contains a DDL that cannot run inside a transaction (for example `CREATE INDEX CONCURRENTLY`, `ALTER TYPE ... ADD VALUE` in some Postgres versions), add an extra directive immediately below the header:

```sql
-- migrator: no-transaction
```

The runner detects this directive and will NOT wrap the file in `BEGIN/COMMIT`. The migration must then manage its own atomicity.

## Rules for the SQL body

1. **Idempotent where possible.** Use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, and so on. Re-running a migration that partly succeeded must not error out on the idempotent parts.
2. **One concern per migration.** Do not mix unrelated tables in the same file. Split into numbered migrations.
3. **No `DROP`.** A migration never deletes a column or table that an earlier migration created. Evolution is additive (new migration creates `_v2`, old one kept for audit trail). Exceptions require explicit review.
4. **No `GRANT` or `REVOKE` outside `036_grants_regflow_app.sql`.** Privileges live in a single migration for auditability.
5. **RLS policies declared in the same migration** that creates the table they protect, or the dedicated RLS migration (§22).
6. **Numerical types**: `decimal(38, ...)` for any financial quantity to match `ROUND_HALF_EVEN` precision (PRD §5.10 invariant).

## Runner behaviour

- Migrations are applied in strictly ascending order by lexicographic comparison of their id (`'007' < '007a' < '007b' < '008'`).
- The runner wraps every file in `BEGIN/COMMIT` unless `-- migrator: no-transaction` is present.
- State lives in the `schema_migrations` table (id text PK, filename, checksum, applied_at). Created automatically on first run.
- A checksum drift (SHA-256 of the file content differs from the stored value) is surfaced by `pnpm migrate:verify` and does NOT auto-heal — the operator decides how to reconcile (usually: do not modify an applied migration; create an amendment instead).

## Operator commands

```bash
pnpm --filter @regflow/api migrate:status    # list applied / pending migrations
pnpm --filter @regflow/api migrate:up        # apply all pending
pnpm --filter @regflow/api migrate:verify    # check file checksums against DB
```

All require `DATABASE_URL` in the environment.

## Associated tests

Each migration is paired with an integration test under `apps/api/tests/migrations/` that verifies the objects created (tables, columns, indexes, triggers, RLS policies) and the expected constraints. The test suite is the non-regression contract for the schema.
