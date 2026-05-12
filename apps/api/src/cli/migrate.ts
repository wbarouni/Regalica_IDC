import { resolve } from 'node:path';
import process from 'node:process';

import { logger } from '../logger.js';
import { getStatus, runUp, verifyChecksums } from '../db/migrator.js';
import { closePool } from '../db/pool.js';

/**
 * CLI entry for the pg-native migration runner.
 *
 * Usage:
 *   pnpm --filter @regflow/api migrate:up           # apply all pending
 *   pnpm --filter @regflow/api migrate:up:operator  # apply with operator GUCs
 *   pnpm --filter @regflow/api migrate:status       # list applied/pending
 *   pnpm --filter @regflow/api migrate:verify       # check checksums
 *
 * The `up:operator` variant (S1 L3) is required to actually populate
 * the GUC-gated migrations (annexes, rubriques, colonnes, rules,
 * prompt_bank seeds, intent_specialists, the dev tenant). Plain `up`
 * leaves them as audit-trail no-ops.
 */

const DEFAULT_MIGRATIONS_DIR = resolve(process.cwd(), 'migrations');

// S1 L3 — env vars consumed by the GUC-gated migrations. Their values
// flow into the corresponding `app.seed_*` settings via `set_config`
// inside each migration's transaction. Document one entry per GUC the
// existing migration corpus reads.
//
// The string values below are PostgreSQL session setting NAMES, not
// business data. They mirror verbatim the `current_setting('app.seed_*')`
// reads in apps/api/migrations/{038..075a,999}*.sql. Renaming a GUC
// name without updating the matching migration would silently break
// every seed — these literals are the canonical infrastructure
// constants, exempt from the D-004 business-value rule. The two
// entries containing "tenant" carry an inline nosemgrep marker
// because D-004 matches the substring; the `app.seed_*` strings are
// PG GUC keys, not tenant identifiers.
const OPERATOR_ENV_TO_GUC: Readonly<Record<string, string>> = {
  SEED_AUTHOR_USER_ID: 'app.seed_author_user_id',
  SEED_VALIDATOR_USER_ID: 'app.seed_validator_user_id',
  SEED_TENANT_ID: 'app.seed_tenant_id', // nosemgrep: D-004-var-name-string-literal
  SEED_VALID_FROM: 'app.seed_valid_from',
  SEED_DEV_TENANT: 'app.seed_dev_tenant', // nosemgrep: D-004-var-name-string-literal
  // Lot A.3.active — UUID lu byte-for-byte depuis le fichier
  // docs/prompts/*_VALIDATED_BY.txt par le wrapper
  // ops/scripts/apply_a3_active.sh, propagé jusqu'à la GUC pour que
  // migration 121 puisse comparer SEED_VALIDATOR_USER_ID et le
  // contenu du fichier dans une même session PG. Le double-check
  // est doctrinal : sans cette GUC, la migration 121 refuse de
  // promouvoir (4-yeux humain, jamais Claude Code).
  SEED_VALIDATOR_ATTESTATION_UUID: 'app.seed_validator_attestation_uuid',
};

type Subcommand = 'up' | 'up:operator' | 'status' | 'verify';

function parseSubcommand(arg: string | undefined): Subcommand {
  if (arg === 'up' || arg === 'up:operator' || arg === 'status' || arg === 'verify') {
    return arg;
  }
  throw new Error(
    `Unknown subcommand '${arg ?? '(none)'}'. Expected one of: up, up:operator, status, verify.`,
  );
}

function readOperatorSessionVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [envKey, gucKey] of Object.entries(OPERATOR_ENV_TO_GUC)) {
    const value = process.env[envKey];
    if (value !== undefined && value !== '') {
      out[gucKey] = value;
    }
  }
  return out;
}

async function cmdUp(dir: string): Promise<void> {
  const report = await runUp({ migrationsDir: dir });
  logger.info(
    { applied: report.applied.length, skipped: report.skipped.length },
    'migrate up done',
  );
  for (const m of report.applied) {
    logger.info({ id: m.id, filename: m.filename }, 'applied');
  }
}

async function cmdUpOperator(dir: string): Promise<void> {
  const sessionVars = readOperatorSessionVars();
  const declared = Object.keys(sessionVars);
  if (declared.length === 0) {
    logger.warn(
      { expected: Object.keys(OPERATOR_ENV_TO_GUC) },
      'migrate up:operator — no SEED_* env vars set; GUC-gated migrations will run as no-ops. ' +
        'Provide at least the relevant SEED_* values to actually seed dev/CI fixtures.',
    );
  } else {
    logger.info({ gucs: declared }, 'migrate up:operator — applying with operator GUCs');
  }
  const report = await runUp({ migrationsDir: dir, sessionVars });
  logger.info(
    {
      applied: report.applied.length,
      skipped: report.skipped.length,
      gucsApplied: declared.length,
    },
    'migrate up:operator done',
  );
  for (const m of report.applied) {
    logger.info({ id: m.id, filename: m.filename }, 'applied');
  }
}

async function cmdStatus(dir: string): Promise<void> {
  const status = await getStatus({ migrationsDir: dir });
  logger.info(
    {
      applied: status.applied.length,
      pending: status.pending.length,
      drifted: status.drifted.length,
    },
    'migrate status',
  );
  for (const m of status.applied) {
    logger.info({ id: m.id, filename: m.filename, appliedAt: m.appliedAt }, 'applied');
  }
  for (const m of status.pending) {
    logger.info({ id: m.id, filename: m.filename }, 'pending');
  }
  for (const d of status.drifted) {
    logger.warn(d, 'drift: file checksum differs from applied checksum');
  }
  if (status.drifted.length > 0) {
    process.exitCode = 1;
  }
}

async function cmdVerify(dir: string): Promise<void> {
  const report = await verifyChecksums({ migrationsDir: dir });
  if (report.ok) {
    logger.info({ applied: report.drifted.length }, 'migrate verify OK');
    return;
  }
  for (const d of report.drifted) {
    logger.error(d, 'drift detected');
  }
  for (const m of report.missingOnDisk) {
    logger.error({ id: m.id, filename: m.filename }, 'applied migration has no file on disk');
  }
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const sub = parseSubcommand(process.argv[2]);
  const dir = process.argv[3] ? resolve(process.argv[3]) : DEFAULT_MIGRATIONS_DIR;
  try {
    if (sub === 'up') {
      await cmdUp(dir);
    } else if (sub === 'up:operator') {
      await cmdUpOperator(dir);
    } else if (sub === 'status') {
      await cmdStatus(dir);
    } else {
      await cmdVerify(dir);
    }
  } finally {
    await closePool();
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'migrate failed');
  process.exitCode = 1;
});
