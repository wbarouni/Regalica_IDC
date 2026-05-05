#!/usr/bin/env node
/**
 * S1 L4 — bootstrap-env.ts
 *
 * Idempotent .env bootstrap for the REGFlow monorepo. Run via
 * `pnpm exec tsx tools/bootstrap-env.ts` (or via the orchestrator
 * `pnpm setup:dev`). The script:
 *
 *   1. Ensures the four .env files exist by copying their matching
 *      .env.example sibling when absent. Files touched:
 *        - .env                        (root, consumed by docker-compose)
 *        - apps/api/.env               (apps/api standalone)
 *        - apps/web/.env               (Vite frontend dev server)
 *        - apps/chatbot-py/.env        (chatbot-py standalone)
 *
 *   2. Generates the cryptographic secrets that have no human-meaningful
 *      default:
 *        - JWT_SECRET — `crypto.randomBytes(48)` base64. The same value
 *          is written to ALL .env files that declare the key, because
 *          chatbot-py and the Node API authenticate each other with it.
 *        - POSTGRES_PASSWORD — only regenerated if its current value is
 *          a placeholder (matches /change_me/i).
 *
 *   3. Prompts interactively for GEMINI_API_KEY when missing. This is
 *      the only secret the script cannot generate. Press ENTER to skip
 *      (the chatbot-py container will refuse to start until it is set,
 *      which the orchestrator surfaces as a clear error).
 *
 *   4. Cross-file consistency check: re-reads every .env after writing
 *      and asserts that JWT_SECRET is identical wherever it appears.
 *      Mismatch -> exit 1 with the offending files listed.
 *
 * Non-interactive mode: when the env var BOOTSTRAP_ENV_NONINTERACTIVE
 * is set to `true`, the script never prompts and never reads stdin —
 * missing GEMINI_API_KEY is left blank with a warning so CI can run
 * the bootstrap without a TTY.
 *
 * Idempotent: running the script a second time on a fully-populated
 * tree is a strict no-op (every secret already present, no .env file
 * missing). The check at step 4 still runs and reports OK.
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = (() => {
  // Resolve the repo root relative to this file: tools/<this>.ts
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..');
})();

interface EnvTarget {
  /** Friendly label for log lines. */
  label: string;
  /** Path to the .env file (created if missing). */
  envPath: string;
  /** Path to the .env.example template copied when .env is missing. */
  examplePath: string;
}

const TARGETS: readonly EnvTarget[] = [
  {
    label: 'root',
    envPath: resolve(REPO_ROOT, '.env'),
    examplePath: resolve(REPO_ROOT, '.env.example'),
  },
  {
    label: 'apps/api',
    envPath: resolve(REPO_ROOT, 'apps/api/.env'),
    examplePath: resolve(REPO_ROOT, 'apps/api/.env.example'),
  },
  {
    label: 'apps/web',
    envPath: resolve(REPO_ROOT, 'apps/web/.env'),
    examplePath: resolve(REPO_ROOT, 'apps/web/.env.example'),
  },
  {
    label: 'apps/chatbot-py',
    envPath: resolve(REPO_ROOT, 'apps/chatbot-py/.env'),
    examplePath: resolve(REPO_ROOT, 'apps/chatbot-py/.env.example'),
  },
];

const NONINTERACTIVE = process.env['BOOTSTRAP_ENV_NONINTERACTIVE'] === 'true';

// ---------------------------------------------------------------------------
// Pure helpers (covered by tests)
// ---------------------------------------------------------------------------

/**
 * Parse a .env file body into an ordered list of (key, value, raw) tuples.
 * Comment-only and blank lines are preserved as `null` keys so the file
 * can be reserialised with comments intact.
 */
export interface EnvLine {
  key: string | null;
  value: string;
  raw: string;
}

export function parseEnv(body: string): EnvLine[] {
  const out: EnvLine[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const trimmed = raw.trimStart();
    if (trimmed === '' || trimmed.startsWith('#')) {
      out.push({ key: null, value: '', raw });
      continue;
    }
    const eq = raw.indexOf('=');
    if (eq === -1) {
      out.push({ key: null, value: '', raw });
      continue;
    }
    const key = raw.slice(0, eq).trim();
    const value = raw.slice(eq + 1);
    out.push({ key, value, raw });
  }
  return out;
}

/**
 * Reserialise a parsed .env body, replacing the value of `key` with
 * `newValue` while preserving comments and ordering. If the key is not
 * present, append a new `KEY=value` line at the end. The output always
 * ends with a single trailing newline.
 */
export function setEnvValue(lines: EnvLine[], key: string, newValue: string): string {
  let touched = false;
  const reserialised = lines.map((line) => {
    if (line.key === key) {
      touched = true;
      return `${key}=${newValue}`;
    }
    return line.raw;
  });
  if (!touched) {
    if (reserialised.length > 0 && reserialised[reserialised.length - 1] !== '') {
      reserialised.push('');
    }
    reserialised.push(`${key}=${newValue}`);
  }
  // Normalise to exactly one trailing newline.
  while (reserialised.length > 0 && reserialised[reserialised.length - 1] === '') {
    reserialised.pop();
  }
  return `${reserialised.join('\n')}\n`;
}

/**
 * Lookup the raw value of `key` in a parsed .env body. Returns null
 * when the key is absent.
 */
export function getEnvValue(lines: EnvLine[], key: string): string | null {
  for (const line of lines) {
    if (line.key === key) {
      return line.value;
    }
  }
  return null;
}

/**
 * Whether the supplied secret is a placeholder. Used to decide whether
 * to overwrite vs preserve. Empty string and any literal containing
 * `change_me` (case-insensitive) qualify.
 */
export function isPlaceholderSecret(value: string | null): boolean {
  if (value === null) return true;
  const trimmed = value.trim();
  if (trimmed === '') return true;
  return /change_me/i.test(trimmed);
}

/**
 * Generate a cryptographically random base64 string of the requested
 * raw byte length. Used for JWT_SECRET (48 bytes) and POSTGRES_PASSWORD
 * fallback (24 bytes).
 */
export function generateSecret(byteLength: number): string {
  return randomBytes(byteLength).toString('base64');
}

// ---------------------------------------------------------------------------
// IO orchestration (covered by smoke tests via the orchestrator output)
// ---------------------------------------------------------------------------

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

const consoleLogger: Logger = {
  info: (msg) => process.stdout.write(`[bootstrap-env] ${msg}\n`),
  warn: (msg) => process.stdout.write(`[bootstrap-env] WARN: ${msg}\n`),
  error: (msg) => process.stderr.write(`[bootstrap-env] ERROR: ${msg}\n`),
};

async function ensureEnvFile(target: EnvTarget, log: Logger): Promise<boolean> {
  if (await fileExists(target.envPath)) {
    return false;
  }
  if (!(await fileExists(target.examplePath))) {
    throw new Error(
      `[bootstrap-env] cannot bootstrap ${target.label}: ` +
        `no .env present at ${target.envPath} and no .env.example at ${target.examplePath}`,
    );
  }
  await copyFile(target.examplePath, target.envPath);
  log.info(`created ${target.label} .env from .env.example`);
  return true;
}

async function readEnv(envPath: string): Promise<EnvLine[]> {
  const body = await readFile(envPath, 'utf8');
  return parseEnv(body);
}

async function writeEnv(
  envPath: string,
  lines: EnvLine[],
  key: string,
  value: string,
): Promise<void> {
  const next = setEnvValue(lines, key, value);
  await writeFile(envPath, next, 'utf8');
}

async function syncJwtSecret(targets: readonly EnvTarget[], log: Logger): Promise<string> {
  // Find the first non-placeholder JWT_SECRET in any .env. If none,
  // generate a fresh one. Then write it everywhere the key exists.
  let canonical: string | null = null;
  for (const target of targets) {
    const lines = await readEnv(target.envPath);
    const value = getEnvValue(lines, 'JWT_SECRET');
    if (value !== null && !isPlaceholderSecret(value)) {
      canonical = value;
      break;
    }
  }
  if (canonical === null) {
    canonical = generateSecret(48);
    log.info('generated fresh JWT_SECRET (48 random bytes, base64)');
  }
  for (const target of targets) {
    const lines = await readEnv(target.envPath);
    if (getEnvValue(lines, 'JWT_SECRET') === null) {
      // The key is not declared in this .env — skip rather than
      // append. The web .env is one such case (Vite vars only).
      continue;
    }
    if (getEnvValue(lines, 'JWT_SECRET') === canonical) {
      continue;
    }
    await writeEnv(target.envPath, lines, 'JWT_SECRET', canonical);
    log.info(`synced JWT_SECRET into ${target.label}`);
  }
  return canonical;
}

async function syncPostgresPassword(target: EnvTarget, log: Logger): Promise<void> {
  const lines = await readEnv(target.envPath);
  const current = getEnvValue(lines, 'POSTGRES_PASSWORD');
  if (current === null) {
    return;
  }
  if (!isPlaceholderSecret(current)) {
    return;
  }
  const fresh = generateSecret(24);
  await writeEnv(target.envPath, lines, 'POSTGRES_PASSWORD', fresh);
  log.info(`generated fresh POSTGRES_PASSWORD into ${target.label}`);
  // Also propagate into DATABASE_URL of the same file if it embeds
  // the placeholder password literally.
  const updatedLines = await readEnv(target.envPath);
  const dbUrl = getEnvValue(updatedLines, 'DATABASE_URL');
  if (dbUrl !== null && /change_me/i.test(dbUrl)) {
    const next = dbUrl.replace(/change_me[^@:]*/i, fresh);
    await writeEnv(target.envPath, updatedLines, 'DATABASE_URL', next);
    log.info(`updated DATABASE_URL with the fresh POSTGRES_PASSWORD in ${target.label}`);
  }
}

async function ensureGeminiApiKey(target: EnvTarget, log: Logger): Promise<void> {
  const lines = await readEnv(target.envPath);
  const current = getEnvValue(lines, 'GEMINI_API_KEY');
  if (current === null) {
    return;
  }
  if (current.trim() !== '') {
    return;
  }
  if (NONINTERACTIVE) {
    log.warn(
      `${target.label}: GEMINI_API_KEY is empty and BOOTSTRAP_ENV_NONINTERACTIVE=true. ` +
        'chatbot-py will refuse to start until a real key is set.',
    );
    return;
  }
  log.info(
    'GEMINI_API_KEY is empty. Paste your Gemini API key now (input hidden via stdin), ' +
      'or press ENTER to skip and supply it later.',
  );
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question('GEMINI_API_KEY> ')).trim();
    if (answer === '') {
      log.warn('no GEMINI_API_KEY supplied. chatbot-py will fail to start until it is provided.');
      return;
    }
    await writeEnv(target.envPath, lines, 'GEMINI_API_KEY', answer);
    log.info(`stored GEMINI_API_KEY into ${target.label}`);
  } finally {
    rl.close();
  }
}

/**
 * Pure helper: rewrite the host segment of a DATABASE_URL from the
 * docker service name `postgres` to `localhost`. Idempotent: a URL
 * already pointing at localhost (or any other host) is returned
 * unchanged. Anchored on `@postgres[:/`] so substrings inside paths
 * or query parameters are not affected.
 */
export function rewriteDatabaseUrlHost(dbUrl: string): string {
  return dbUrl.replace(/@postgres([:/])/, '@localhost$1');
}

/**
 * Rewrite the host segment of DATABASE_URL to `localhost` when the file
 * is consumed from outside the docker network. The .env.example baseline
 * uses the docker-compose service name `postgres` because that worked
 * historically when host-side tooling was rare; with the S1 setup-dev
 * orchestrator, host-side migrate / pytest / jest are first-class and
 * the only workable host for them is the published port of the
 * postgres container (i.e. localhost:5432). The api/chatbot-py
 * containers are unaffected — docker-compose.yml sets DATABASE_URL
 * inline on those services so the file's value is never consumed there.
 */
async function normalizeDatabaseUrlHost(target: EnvTarget, log: Logger): Promise<void> {
  const lines = await readEnv(target.envPath);
  const dbUrl = getEnvValue(lines, 'DATABASE_URL');
  if (dbUrl === null || dbUrl.trim() === '') {
    return;
  }
  const next = rewriteDatabaseUrlHost(dbUrl);
  if (next === dbUrl) {
    return;
  }
  await writeEnv(target.envPath, lines, 'DATABASE_URL', next);
  log.info(`normalized DATABASE_URL host postgres→localhost in ${target.label}`);
}

async function verifyJwtConsistency(targets: readonly EnvTarget[], log: Logger): Promise<void> {
  const observed = new Map<string, string[]>();
  for (const target of targets) {
    const lines = await readEnv(target.envPath);
    const value = getEnvValue(lines, 'JWT_SECRET');
    if (value === null) {
      continue;
    }
    if (!observed.has(value)) {
      observed.set(value, []);
    }
    observed.get(value)!.push(target.label);
  }
  if (observed.size === 0) {
    log.info('no JWT_SECRET declared in any .env (frontend-only setup)');
    return;
  }
  if (observed.size === 1) {
    log.info(`JWT_SECRET consistent across ${[...observed.values()][0]!.join(', ')}`);
    return;
  }
  for (const [value, labels] of observed.entries()) {
    log.error(`JWT_SECRET divergence: ${labels.join(', ')} = ${value.slice(0, 8)}…`);
  }
  throw new Error('[bootstrap-env] JWT_SECRET is not identical across .env files');
}

export async function bootstrap(
  targets: readonly EnvTarget[] = TARGETS,
  log: Logger = consoleLogger,
): Promise<void> {
  log.info(`bootstrap starting (interactive=${!NONINTERACTIVE})`);

  // 1. Ensure every .env exists.
  let createdAny = false;
  for (const target of targets) {
    if (await ensureEnvFile(target, log)) {
      createdAny = true;
    }
  }

  // 2. Sync JWT_SECRET across all .env files that declare the key.
  await syncJwtSecret(targets, log);

  // 3. Ensure POSTGRES_PASSWORD is non-placeholder in the root .env
  //    (the only file that owns it — the others read DATABASE_URL).
  const root = targets.find((t) => t.label === 'root');
  if (root !== undefined) {
    await syncPostgresPassword(root, log);
  }

  // 3b. Normalize the host segment of DATABASE_URL across every .env
  //     that declares it. The baseline .env.example values point at
  //     the docker service name `postgres`; host-side tooling (jest,
  //     migrate CLI, pytest) cannot resolve that and only sees the
  //     published port at localhost:5432. The S1 L10 e2e-fresh-machine
  //     CI job exposed this as `getaddrinfo EAI_AGAIN postgres` on
  //     pnpm migrate:up:operator. The api/chatbot-py containers
  //     override DATABASE_URL inline in docker-compose.yml so this
  //     rewrite never reaches the runtime stack.
  for (const target of targets) {
    await normalizeDatabaseUrlHost(target, log);
  }

  // 4. Prompt for GEMINI_API_KEY in the chatbot-py and root .env (the
  //    two that read it). The prompt only fires once because the value
  //    is propagated to both files in the same pass.
  for (const target of targets) {
    if (target.label === 'chatbot-py' || target.label === 'apps/chatbot-py') {
      await ensureGeminiApiKey(target, log);
    }
  }
  // Mirror into root if it's still empty there.
  const rootEnv = await readEnv(targets.find((t) => t.label === 'root')!.envPath);
  if (getEnvValue(rootEnv, 'GEMINI_API_KEY') === '') {
    const chatEnv = await readEnv(targets.find((t) => t.label === 'apps/chatbot-py')!.envPath);
    const value = getEnvValue(chatEnv, 'GEMINI_API_KEY');
    if (value !== null && value.trim() !== '') {
      await writeEnv(
        targets.find((t) => t.label === 'root')!.envPath,
        rootEnv,
        'GEMINI_API_KEY',
        value,
      );
      log.info('mirrored GEMINI_API_KEY into root .env');
    }
  }

  // 5. Final consistency check.
  await verifyJwtConsistency(targets, log);

  log.info(`bootstrap done (created=${createdAny ? 'yes' : 'no'})`);
}

// CLI entry point — only run when executed directly.
const isDirect = process.argv[1] !== undefined && process.argv[1].endsWith('bootstrap-env.ts');
if (isDirect) {
  bootstrap().catch((err: unknown) => {
    consoleLogger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
