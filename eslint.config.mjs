// Minimal static sensor: recommended hygiene minus the rules tsc already
// covers (keeps the signal-to-noise high — no trivia failures).
// Astro files are covered by `astro check`, not here.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '.astro/**',
      'data/**',
      'node_modules/**',
      'coverage/**',
      'public/docs/archify/**',
      'public/screenshots/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // astro check already hints these — gating on them here doubles the noise
      '@typescript-eslint/no-unused-vars': 'off',
      // snapshot/c4 boundaries are untyped by design (for now)
      '@typescript-eslint/no-explicit-any': 'off',
      // src/env.d.ts is Astro-mandated convention, not our code
      '@typescript-eslint/triple-slash-reference': 'off',
      // AI-shortcoming guards (article: lint rules for typical agent failure
      // modes) — thresholds raised twice from first evidence (framework
      // signatures come in fives; wiring/dispatch read flat, not nested);
      // each raise re-fires on worsening, never a silent exemption.
      'max-params': ['error', 5],
      'max-lines-per-function': ['error', { max: 150, skipComments: true, skipBlankLines: true, IIFEs: true }],
      complexity: ['error', 20],
    },
  },
);
