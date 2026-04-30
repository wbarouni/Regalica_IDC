import type { Pool } from 'pg';

/**
 * Read-through cache for platform_config tunables.
 *
 * Every config value on disk is JSONB; the loader deserialises into
 * the call site's expected JS type via the generic `<T>`. The cache
 * is process-global with no TTL — platform_config rows change rarely
 * (a migration is required, which restarts the process). Tests can
 * call `clearPlatformConfigCache()` between scenarios if they need
 * fresh reads.
 *
 * Throws when the key is missing or soft-deleted. We never return a
 * fallback — the doctrine is "read from DB or fail loudly", not
 * "silently fall back to a hardcoded literal" (Guard D-006 doctrine).
 */

const cache = new Map<string, unknown>();

export class PlatformConfigMissingError extends Error {
  constructor(key: string) {
    super(`platform_config: key '${key}' not found or deleted`);
    this.name = 'PlatformConfigMissingError';
  }
}

export class PlatformConfigTypeError extends Error {
  constructor(key: string, expected: string, actual: string) {
    super(`platform_config: key '${key}' expected ${expected}, got ${actual}`);
    this.name = 'PlatformConfigTypeError';
  }
}

interface ConfigRow {
  config_value: unknown;
}

async function fetchValue(pool: Pool, key: string): Promise<unknown> {
  const r = await pool.query<ConfigRow>(
    `SELECT config_value
     FROM platform_config
     WHERE config_key = $1 AND deleted_at IS NULL`,
    [key],
  );
  if (r.rows.length === 0) {
    throw new PlatformConfigMissingError(key);
  }
  return r.rows[0]!.config_value;
}

export async function getPlatformConfig<T>(pool: Pool, key: string): Promise<T> {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached as T;
  }
  const value = await fetchValue(pool, key);
  cache.set(key, value);
  return value as T;
}

export async function getPlatformConfigNumber(pool: Pool, key: string): Promise<number> {
  const value = await getPlatformConfig<unknown>(pool, key);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PlatformConfigTypeError(key, 'finite number', typeof value);
  }
  return value;
}

export function clearPlatformConfigCache(): void {
  cache.clear();
}
