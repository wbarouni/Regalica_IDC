#!/usr/bin/env node
/**
 * S1 L5 — seed-fixtures.ts
 *
 * Idempotent uploader of golden XML fixtures into the dev/CI tenant.
 * Run via `pnpm exec tsx tools/seed-fixtures.ts` (or via the
 * orchestrator `pnpm setup:dev`). The script:
 *
 *   1. Resolves the source XML directory (default
 *      `tests/fixtures/golden/tenant-001/2026-02-28/filled/` — 5
 *      files covering annexes 00, 01, 620, 630, 640, the canonical
 *      "verdict visible" subset). Override with the env var
 *      SEED_FIXTURES_DIR.
 *   2. Resolves the destination tenant id from
 *      SEED_FIXTURES_TENANT_ID, defaulting to the dev tenant UUID
 *      seeded by migration 999_seed_dev_tenant.sql.
 *   3. Resolves the uploader user id from SEED_FIXTURES_USER_ID,
 *      defaulting to the compliance user seeded by 999.
 *   4. Resolves the API base URL from SEED_FIXTURES_API_URL,
 *      defaulting to http://localhost:3000 (the host port published
 *      by the docker-compose stack).
 *   5. POSTs each XML as `multipart/form-data` field `file`. The
 *      API dedups by SHA-256 (apps/api/src/routes/uploads.ts:242-244)
 *      so re-runs return HTTP 200 with `deduplicated:true` instead of
 *      HTTP 201.
 *   6. Final summary line: "uploaded=N deduplicated=M error=K".
 *      Exit code 1 if any upload errored, 0 otherwise.
 *
 * The default fixture subset (5 files) was chosen over the full 65
 * golden batches per ADR 0006 §5: it is the smallest set that
 * exercises the "upload XML → /runs → completed" path end-to-end
 * with non-trivial KPIs while keeping `pnpm setup:dev` under one
 * minute on a clean machine.
 */

import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..');
})();

// Defaults align with the dev fixtures defined in migration 999.
// Every literal below is a development-time convenience reference,
// not business data:
//   * tenantId / userId mirror the deterministic UUIDs hardcoded in
//     migration 999_seed_dev_tenant.sql so the script can target the
//     same dev tenant without a registry round-trip.
//   * apiUrl is the canonical localhost:3000 dev port of the API
//     service (matches docker-compose.yml `api.ports`).
// All four are overridable via SEED_FIXTURES_* env vars (cf. readConfig).
const DEFAULTS = {
  // nosemgrep: D-003-tenant-placeholder
  fixturesDir: resolve(REPO_ROOT, 'tests/fixtures/golden/tenant-001/2026-02-28/filled'),
  // nosemgrep: D-004-var-name-string-literal
  tenantId: 'd3a7c6e6-2d18-4ff6-8183-94507eded6d7',
  userId: '2cb0ce35-4b43-499f-b23a-722ef86902ce',
  // nosemgrep: D-004-var-name-string-literal,D-005-url-literal
  apiUrl: 'http://localhost:3000',
};

interface SeedConfig {
  fixturesDir: string;
  tenantId: string;
  userId: string;
  apiUrl: string;
}

export function readConfig(env: NodeJS.ProcessEnv): SeedConfig {
  return {
    fixturesDir: env['SEED_FIXTURES_DIR'] ?? DEFAULTS.fixturesDir,
    tenantId: env['SEED_FIXTURES_TENANT_ID'] ?? DEFAULTS.tenantId,
    userId: env['SEED_FIXTURES_USER_ID'] ?? DEFAULTS.userId,
    apiUrl: env['SEED_FIXTURES_API_URL'] ?? DEFAULTS.apiUrl,
  };
}

interface UploadOutcome {
  filename: string;
  status: number;
  uploadId: string | null;
  deduplicated: boolean;
  error: string | null;
}

export interface SeedReport {
  attempted: number;
  uploaded: number;
  deduplicated: number;
  errors: number;
  outcomes: UploadOutcome[];
}

export async function listXmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  return entries
    .filter((name) => name.toLowerCase().endsWith('.xml'))
    .sort()
    .map((name) => join(dir, name));
}

export function parseUploadResponse(status: number, body: unknown): UploadOutcome {
  // Defensive — the API returns { data: { upload_id, deduplicated },
  // meta }. Anything else is a parse error worth surfacing.
  const noOutcome = (err: string): UploadOutcome => ({
    filename: '',
    status,
    uploadId: null,
    deduplicated: false,
    error: err,
  });
  if (typeof body !== 'object' || body === null) {
    return noOutcome('non-object response body');
  }
  if (status >= 400) {
    const apiErr = (body as { error?: { code?: unknown } }).error;
    const code =
      apiErr !== undefined &&
      apiErr !== null &&
      typeof apiErr === 'object' &&
      typeof (apiErr as { code?: unknown }).code === 'string'
        ? (apiErr as { code: string }).code
        : `http_${status}`;
    return noOutcome(code);
  }
  const data = (body as { data?: { upload_id?: unknown; deduplicated?: unknown } }).data;
  if (data === undefined || data === null) {
    return noOutcome('missing data envelope');
  }
  return {
    filename: '',
    status,
    uploadId: typeof data.upload_id === 'string' ? data.upload_id : null,
    deduplicated: data.deduplicated === true,
    error: null,
  };
}

interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

const consoleLogger: Logger = {
  info: (msg) => process.stdout.write(`[seed-fixtures] ${msg}\n`),
  warn: (msg) => process.stdout.write(`[seed-fixtures] WARN: ${msg}\n`),
  error: (msg) => process.stderr.write(`[seed-fixtures] ERROR: ${msg}\n`),
};

async function uploadOne(fullPath: string, cfg: SeedConfig, log: Logger): Promise<UploadOutcome> {
  const filename = basename(fullPath);
  const buffer = await readFile(fullPath);
  // Node 20 exposes both globalThis.FormData and globalThis.fetch with
  // multipart support. The Blob wrapper preserves the original byte
  // payload — text encoding is irrelevant since the API decodes via
  // its own xml parser.
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)]), filename);
  let response: Response;
  try {
    response = await fetch(`${cfg.apiUrl}/api/tenants/${cfg.tenantId}/uploads`, {
      method: 'POST',
      headers: { 'X-User-Id': cfg.userId },
      body: form,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`network error on ${filename}: ${message}`);
    return {
      filename,
      status: 0,
      uploadId: null,
      deduplicated: false,
      error: `network_error:${message}`,
    };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const outcome = parseUploadResponse(response.status, body);
  outcome.filename = filename;
  if (outcome.error !== null) {
    log.error(`${filename} failed: ${outcome.error} (HTTP ${response.status})`);
  } else if (outcome.deduplicated) {
    log.info(`${filename}: already present (dedup, upload_id=${outcome.uploadId})`);
  } else {
    log.info(`${filename}: uploaded (upload_id=${outcome.uploadId})`);
  }
  return outcome;
}

export async function seedFixtures(
  cfg: SeedConfig = readConfig(process.env),
  log: Logger = consoleLogger,
): Promise<SeedReport> {
  log.info(`fixtures dir : ${cfg.fixturesDir}`);
  log.info(`tenant id    : ${cfg.tenantId}`);
  log.info(`uploader id  : ${cfg.userId}`);
  log.info(`api base url : ${cfg.apiUrl}`);

  const files = await listXmlFiles(cfg.fixturesDir);
  if (files.length === 0) {
    log.warn(`no .xml files found under ${cfg.fixturesDir}`);
    return { attempted: 0, uploaded: 0, deduplicated: 0, errors: 0, outcomes: [] };
  }

  const outcomes: UploadOutcome[] = [];
  for (const fullPath of files) {
    const outcome = await uploadOne(fullPath, cfg, log);
    outcomes.push(outcome);
  }
  const report: SeedReport = {
    attempted: outcomes.length,
    uploaded: outcomes.filter((o) => o.error === null && !o.deduplicated).length,
    deduplicated: outcomes.filter((o) => o.deduplicated).length,
    errors: outcomes.filter((o) => o.error !== null).length,
    outcomes,
  };
  log.info(
    `done — attempted=${report.attempted} uploaded=${report.uploaded} ` +
      `deduplicated=${report.deduplicated} error=${report.errors}`,
  );
  return report;
}

// CLI entry point — only run when executed directly.
const isDirect = process.argv[1] !== undefined && process.argv[1].endsWith('seed-fixtures.ts');
if (isDirect) {
  seedFixtures()
    .then((report) => {
      if (report.errors > 0) {
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      consoleLogger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
