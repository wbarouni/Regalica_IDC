import { resolve } from 'node:path';
import process from 'node:process';

import { logger } from '../logger.js';
import { getStatus, runUp, verifyChecksums } from '../db/migrator.js';
import { closePool } from '../db/pool.js';

/**
 * CLI entry for the pg-native migration runner.
 *
 * Usage:
 *   pnpm --filter @regflow/api migrate:up       # apply all pending
 *   pnpm --filter @regflow/api migrate:status   # list applied/pending
 *   pnpm --filter @regflow/api migrate:verify   # check checksums
 */

const DEFAULT_MIGRATIONS_DIR = resolve(process.cwd(), 'migrations');

type Subcommand = 'up' | 'status' | 'verify';

function parseSubcommand(arg: string | undefined): Subcommand {
  if (arg === 'up' || arg === 'status' || arg === 'verify') {
    return arg;
  }
  throw new Error(`Unknown subcommand '${arg ?? '(none)'}'. Expected one of: up, status, verify.`);
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
