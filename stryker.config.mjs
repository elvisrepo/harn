// Stryker, scoped thin: command runner (exit code = kill), no per-test
// optimization, mutants only in src/lib. Manual + incremental, like the
// article — NOT in check (minutes per run). Scope via:
//   npx stryker run --mutate src/lib/mods.ts
export default {
  testRunner: 'command',
  commandRunner: { command: 'node --test test/lib.test.mjs' },
  mutate: ['src/lib/**/*.ts', '!src/lib/**/*.test.ts'],
  reporters: ['clear-text', 'json'],
  concurrency: 4,
  timeoutMS: 30000,
  disableBail: true,
  coverageAnalysis: 'off',
  allowEmpty: false,
};
