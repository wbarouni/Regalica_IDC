/**
 * Migration runner — executes all up() functions in order.
 *
 * Usage:
 *   npx tsx src/db/migrate.ts
 *
 * Each migration is idempotent (createTable uses ifNotExists: true and
 * indexes use IF NOT EXISTS via raw SQL where needed).
 */
import { sequelize } from './sequelize';
import { up as m001 } from './migrations/001-create-tenants';
import { up as m002 } from './migrations/002-create-rules';
import { up as m003 } from './migrations/003-create-rule-terms';
import { up as m004 } from './migrations/004-create-validation-runs';
import { up as m005 } from './migrations/005-create-verdicts';

const migrations: Array<{ name: string; up: (qi: ReturnType<typeof sequelize.getQueryInterface>) => Promise<void> }> = [
  { name: '001-create-tenants',         up: m001 },
  { name: '002-create-rules',           up: m002 },
  { name: '003-create-rule-terms',      up: m003 },
  { name: '004-create-validation-runs', up: m004 },
  { name: '005-create-verdicts',        up: m005 },
];

async function main(): Promise<void> {
  const qi = sequelize.getQueryInterface();

  for (const migration of migrations) {
    console.info(`[migrate] running ${migration.name} …`);
    try {
      await migration.up(qi);
      console.info(`[migrate] ${migration.name} — OK`);
    } catch (err) {
      console.error(`[migrate] ${migration.name} — FAILED`, err);
      await sequelize.close();
      process.exit(1);
    }
  }

  console.info('[migrate] all migrations completed successfully');
  await sequelize.close();
}

main().catch((err) => {
  console.error('[migrate] unexpected error', err);
  process.exit(1);
});
