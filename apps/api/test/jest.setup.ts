// Test-only environment defaults.
//
// `apps/api/src/config.ts` validates required env vars at module load
// time and `process.exit(1)`s on failure. Tests that transitively import
// the config module (e.g. `test/health.test.ts` via `src/app.ts`) would
// therefore fail to start in any environment that does not pre-set the
// canonical values normally provided by `.env` or the CI job's `env:`
// block. This setup file fills the gaps without overriding any value
// the operator already exported.
//
// Path note: this file lives under `apps/api/test/` and is therefore
// excluded by Guard D's path filter (semgrep skips any path matching
// `**/test/`); the literal values below do not constitute hardcoding
// in the doctrinal sense.

const TEST_ENV_DEFAULTS: Record<string, string> = {
  API_CORS_ORIGIN: 'http://test.local',
  PG_POOL_IDLE_TIMEOUT_MS: '1000',
  PG_POOL_CONN_TIMEOUT_MS: '500',
  // Required by the engine middleware (commit C3). Both the Node API
  // and chatbot-py read this same env var into their respective
  // settings; the value must match across the two apps. The literal
  // here is the conventional default — operators may override
  // through the standard env mechanism.
  REGFLOW_ENGINE_ROLE_CLAIM: 'regflow_engine',
};

for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
