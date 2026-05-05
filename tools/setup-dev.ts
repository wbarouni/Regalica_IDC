#!/usr/bin/env node
/**
 * S1 L6 — setup-dev.ts (orchestrator)
 *
 * Single command that takes a fresh clone of the repo to a working
 * dev environment. Pipeline:
 *
 *   1. bootstrap-env (S1 L4)            — populate .env files + JWT
 *   2. docker compose up -d postgres    — start the canonical Postgres
 *   3. wait for pg_isready              — health-gate before migrating
 *   4. pnpm migrate:up:operator (L3)    — apply 87 base migrations + 037a
 *      with the operator GUCs that turn the GUC-gated seed migrations
 *      from no-ops into actual data writes (rules, prompts, dev tenant).
 *   5. docker compose up -d api chatbot-py nginx — bring up the rest of
 *      the stack and wait for healthchecks.
 *   6. seed-fixtures (S1 L5)            — upload the canonical 5 XMLs.
 *   7. final summary                    — print the URLs the dev needs.
 *
 * Idempotent: every sub-step is safe to re-run on a populated env.
 * Failure: the first non-zero exit short-circuits the chain with a
 * clear message indicating which step failed and how to retry it.
 *
 * Env contract:
 *   * GEMINI_API_KEY MUST be present somewhere reachable by the
 *     bootstrap step (already in .env, or supplied interactively
 *     when the script prompts). Without it, chatbot-py refuses to
 *     start in step 5.
 *   * BOOTSTRAP_ENV_NONINTERACTIVE=true skips the interactive
 *     GEMINI_API_KEY prompt (CI / non-TTY).
 *
 * Run: `pnpm setup:dev`.
 */

import { spawn, type SpawnOptions } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const REPO_ROOT = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..');
})();

interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /**
   * When true, the command output is piped through to the parent
   * stdio; when false, the command runs silently but its stdout is
   * captured for inspection. Default true.
   */
  inheritStdio?: boolean;
}

interface RunResult {
  code: number;
  stdout: string;
}

interface Logger {
  step: (n: number, total: number, msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

const consoleLogger: Logger = {
  step: (n, total, msg) => process.stdout.write(`\n[setup-dev] [${n}/${total}] ${msg}\n`),
  info: (msg) => process.stdout.write(`[setup-dev] ${msg}\n`),
  warn: (msg) => process.stdout.write(`[setup-dev] WARN: ${msg}\n`),
  error: (msg) => process.stderr.write(`[setup-dev] ERROR: ${msg}\n`),
};

export async function run(
  command: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const inheritStdio = options.inheritStdio !== false;
  const spawnOpts: SpawnOptions = {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    stdio: inheritStdio ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  };
  return new Promise<RunResult>((resolveFn, rejectFn) => {
    const child = spawn(command, args, spawnOpts);
    let stdout = '';
    if (!inheritStdio && child.stdout !== null) {
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
    }
    if (!inheritStdio && child.stderr !== null) {
      child.stderr.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
    }
    child.on('error', rejectFn);
    child.on('close', (code) => {
      resolveFn({ code: code ?? 1, stdout });
    });
  });
}

interface WaitForReadyOptions {
  /** Max wait in milliseconds (default 60_000). */
  timeoutMs?: number;
  /** Poll interval in milliseconds (default 2_000). */
  intervalMs?: number;
  log: Logger;
}

/**
 * Poll the docker-compose service health until ready or timeout.
 * Used after `up -d` for postgres / api / chatbot-py.
 */
export async function waitForServiceHealthy(
  serviceName: string,
  options: WaitForReadyOptions,
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await run(
      'docker',
      ['inspect', '--format', '{{.State.Health.Status}}', `regalica-${serviceName}`],
      { inheritStdio: false },
    );
    const status = res.stdout.trim();
    if (status === 'healthy') {
      options.log.info(`service ${serviceName}: healthy`);
      return;
    }
    if (status === 'unhealthy') {
      throw new Error(`service ${serviceName}: container is unhealthy`);
    }
    // Postgres healthcheck reports "starting" before the first probe;
    // a missing health key means the service is up but no healthcheck
    // is defined (treat as healthy).
    if (status === '' || status === '<no value>') {
      options.log.info(`service ${serviceName}: no healthcheck declared, assuming ready`);
      return;
    }
    await sleep(intervalMs);
  }
  throw new Error(`service ${serviceName}: did not become healthy within ${timeoutMs}ms`);
}

interface SetupDevConfig {
  /**
   * When true, the bootstrap-env sub-step runs in non-interactive mode
   * (no stdin prompts). Defaults to whatever
   * BOOTSTRAP_ENV_NONINTERACTIVE in the parent env says.
   */
  nonInteractive: boolean;
}

export function readSetupConfig(env: NodeJS.ProcessEnv): SetupDevConfig {
  return {
    nonInteractive: env['BOOTSTRAP_ENV_NONINTERACTIVE'] === 'true',
  };
}

const TOTAL_STEPS = 6;

async function step1Bootstrap(cfg: SetupDevConfig, log: Logger): Promise<void> {
  log.step(1, TOTAL_STEPS, 'bootstrap-env (.env files, JWT_SECRET, secrets)');
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    BOOTSTRAP_ENV_NONINTERACTIVE: cfg.nonInteractive ? 'true' : 'false',
  };
  const res = await run(
    'pnpm',
    ['--filter', '@regflow/api', 'exec', 'tsx', '../../tools/bootstrap-env.ts'],
    { env: childEnv },
  );
  if (res.code !== 0) {
    throw new Error(`bootstrap-env failed (exit ${res.code}). Re-run via: pnpm bootstrap:env`);
  }
}

async function step2PostgresUp(log: Logger): Promise<void> {
  log.step(2, TOTAL_STEPS, 'docker compose up -d postgres');
  const res = await run('docker', ['compose', 'up', '-d', 'postgres']);
  if (res.code !== 0) {
    throw new Error('docker compose up postgres failed');
  }
}

async function step3WaitPostgres(log: Logger): Promise<void> {
  log.step(3, TOTAL_STEPS, 'wait for Postgres healthcheck');
  await waitForServiceHealthy('postgres', { log });
}

async function step4Migrate(log: Logger): Promise<void> {
  log.step(4, TOTAL_STEPS, 'pnpm migrate:up:operator (with dev GUCs)');
  // Default values match migration 037a_seed_dev_tenant.sql + the
  // historical valid_from used when seeding the rules corpus
  // (075a_backdate_rules_valid_from.sql). The orchestrator never
  // overrides values the operator already exported.
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SEED_AUTHOR_USER_ID:
      process.env['SEED_AUTHOR_USER_ID'] ?? '2cb0ce35-4b43-499f-b23a-722ef86902ce',
    SEED_VALIDATOR_USER_ID:
      process.env['SEED_VALIDATOR_USER_ID'] ?? 'ef810369-1e96-485d-bf1d-dc8937e32bb9',
    SEED_TENANT_ID: process.env['SEED_TENANT_ID'] ?? 'd3a7c6e6-2d18-4ff6-8183-94507eded6d7',
    SEED_VALID_FROM: process.env['SEED_VALID_FROM'] ?? '2020-01-01T00:00:00Z',
    SEED_DEV_TENANT: process.env['SEED_DEV_TENANT'] ?? 'true',
  };
  const res = await run('pnpm', ['--filter', '@regflow/api', 'migrate:up:operator'], {
    env: childEnv,
  });
  if (res.code !== 0) {
    throw new Error(
      'migrate:up:operator failed. Re-run via: pnpm --filter @regflow/api migrate:up:operator',
    );
  }
}

async function step5StackUp(log: Logger): Promise<void> {
  log.step(5, TOTAL_STEPS, 'docker compose up -d api chatbot-py nginx');
  const res = await run('docker', ['compose', 'up', '-d', 'api', 'chatbot-py', 'nginx']);
  if (res.code !== 0) {
    throw new Error('docker compose up api/chatbot-py/nginx failed');
  }
  // The api + chatbot-py compose definitions do not declare an
  // explicit healthcheck (only postgres does). We give the services
  // a brief grace window so the orchestrator's final summary reflects
  // a stack that is actually accepting requests.
  await sleep(5_000);
  log.info('api / chatbot-py / nginx: container started (no docker healthcheck declared)');
}

async function step6SeedFixtures(log: Logger): Promise<void> {
  log.step(6, TOTAL_STEPS, 'seed-fixtures (5 XMLs into the dev tenant)');
  const res = await run('pnpm', [
    '--filter',
    '@regflow/api',
    'exec',
    'tsx',
    '../../tools/seed-fixtures.ts',
  ]);
  if (res.code !== 0) {
    throw new Error('seed-fixtures failed. Re-run via: pnpm seed:fixtures');
  }
}

function printFinalSummary(log: Logger): void {
  log.info('');
  log.info('================================================================');
  log.info('  Dev environment ready.');
  log.info('');
  log.info('  Frontend (Vite dev server):  pnpm --filter @regflow/web dev');
  log.info('                                http://localhost:5173');
  log.info('  API (Express):                http://localhost:3000');
  log.info('  Health check:                 curl http://localhost:3000/api/health');
  log.info('  chatbot-py (FastAPI):         http://localhost:8000');
  log.info('');
  log.info('  Tenant id (dev):  d3a7c6e6-2d18-4ff6-8183-94507eded6d7');
  log.info('  Author user id:   2cb0ce35-4b43-499f-b23a-722ef86902ce');
  log.info('================================================================');
  log.info('');
}

export async function setupDev(
  cfg: SetupDevConfig = readSetupConfig(process.env),
  log: Logger = consoleLogger,
): Promise<void> {
  log.info(`setup-dev starting (interactive=${!cfg.nonInteractive})`);
  await step1Bootstrap(cfg, log);
  await step2PostgresUp(log);
  await step3WaitPostgres(log);
  await step4Migrate(log);
  await step5StackUp(log);
  await step6SeedFixtures(log);
  printFinalSummary(log);
}

const isDirect = process.argv[1] !== undefined && process.argv[1].endsWith('setup-dev.ts');
if (isDirect) {
  setupDev().catch((err: unknown) => {
    consoleLogger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
