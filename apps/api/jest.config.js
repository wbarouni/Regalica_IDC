/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.test.ts', '<rootDir>/tests/**/*.test.ts'],
  setupFiles: ['<rootDir>/test/jest.setup.ts'],
  // Strip the `.js` suffix from relative imports so the migration / db
  // test suites (written with the TypeScript native-ESM `import './_setup.js'`
  // convention) resolve to the corresponding `.ts` source under the
  // ts-jest CJS preset.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Workspace package aliases — pre-built dist artifacts are not required
    // for test/typecheck because we resolve directly to the source tree
    // (mirrors packages/evaluator/jest.config.cjs).
    '^@regflow/evaluator$': '<rootDir>/../../packages/evaluator/src/index.ts',
    '^@regflow/bct-xml-parser$': '<rootDir>/../../packages/bct-xml-parser/src/index.ts',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  restoreMocks: true,
  verbose: true,
};
