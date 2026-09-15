// Dependency rules (article: sensors-article dependency-rules) — the only
// cross-file structural sensor here: routes -> lib -> db, ops aside,
// extension isolated. Error text recaps the layering (self-correction
// guidance, not just a rule name).
//
// Blind spot, stated openly: dependency-cruiser cannot parse .astro files,
// so page frontmatter imports are invisible — the ts/js/mjs graph
// (lib, db, scripts, test, api/*.ts, extension) is fully covered.
const LAYERS =
  '[Layers: src/pages|layouts|components (routes) -> src/lib (logic) -> db (persistence); ' +
  'scripts+test are ops; .pi is the isolated harness extension.]';

export default {
  forbidden: [
    {
      name: 'lib-no-routes',
      comment:
        'Logic must stay UI-free so it remains unit-testable and portable. ' +
        LAYERS,
      severity: 'error',
      from: { path: '^src/lib' },
      to: { path: '^src/(pages|layouts|components)' },
    },
    {
      name: 'db-inward-only',
      comment:
        'Persistence takes no dependencies on app code — the schema/client ' +
        'must stay importable from anywhere. ' +
        LAYERS,
      severity: 'error',
      from: { path: '^db' },
      to: { path: '^src' },
    },
    {
      name: 'ops-no-routes',
      comment:
        'Scripts and tests drive the app over imports of lib (or HTTP) — ' +
        'never by reaching into pages. ' +
        LAYERS,
      severity: 'error',
      from: { path: '^(scripts|test)' },
      to: { path: '^src/(pages|layouts|components)' },
    },
    {
      name: 'extension-isolation',
      comment:
        'The pi extension is kit-portable: node builtins + the pi API only. ' +
        'App imports would weld it to this instance. ' +
        LAYERS,
      severity: 'error',
      from: { path: '^\\.pi' },
      to: { path: '^(src|db|scripts|test)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
  },
};
