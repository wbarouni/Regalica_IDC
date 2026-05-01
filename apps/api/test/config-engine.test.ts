import { config } from '../src/config';

/**
 * Pin the engine config wiring (commit C3 / H9). The middleware reads
 * `config.engine.roleClaim` as the source of truth for what the
 * incoming JWT's `role` claim must equal. The chatbot-py client signs
 * its tokens with the same env-driven value
 * (settings.regflow_engine_role_claim). This test asserts that the
 * roleClaim isn't lost or renamed between config schema and the
 * middleware — typo regressions there would silently 403 every
 * service-to-service call without any other test failing locally.
 */
describe('config.engine — env-driven engine claim wiring', () => {
  it('exposes a non-empty roleClaim string from REGFLOW_ENGINE_ROLE_CLAIM', () => {
    expect(typeof config.engine.roleClaim).toBe('string');
    expect(config.engine.roleClaim.length).toBeGreaterThan(0);
  });

  it('matches the value the test harness supplies for the role claim', () => {
    // jest.setup.ts seeds REGFLOW_ENGINE_ROLE_CLAIM on every test
    // process. The exact string is irrelevant; what matters is that
    // both sides of the contract (env -> config -> middleware) read
    // the same value. Reading process.env here directly verifies the
    // config schema hasn't dropped or renamed the field.
    expect(config.engine.roleClaim).toBe(process.env['REGFLOW_ENGINE_ROLE_CLAIM']);
  });
});
