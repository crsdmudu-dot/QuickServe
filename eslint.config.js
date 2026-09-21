// https://docs.expo.dev/guides/using-eslint/
// Committed flat config so `expo lint` runs deterministically without
// auto-installing ESLint or auto-generating this file. Uses the standard
// Expo ruleset (eslint-config-expo). Separately-tooled / generated dirs are
// ignored here, mirroring the root tsconfig.json / jest.config.js exclusions.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'coverage/*',
      'qa/*',
      'apps/website/*',
      // Generated output of the separated admin application — its SOURCE is linted with the
      // same ruleset (see the apps/admin lint script), only its build artefacts are ignored.
      'apps/admin/dist/*',
      'apps/admin/.expo/*',
    ],
  },
  {
    // The separated admin application (apps/admin) is linted with the same ruleset as the
    // consumer app — only its build-tool configs need Node globals. Expo's own patterns cover
    // *.config.js at the repository root but not inside a nested app, so declare them here.
    files: ['apps/admin/*.config.js'],
    languageOptions: {
      globals: { __dirname: 'readonly', module: 'writable', require: 'readonly' },
    },
  },
  {
    // Resolve the admin application's own path aliases (`@admin/*` → its src, `@/*` → the shared
    // layer) from its tsconfig. Without this, import/no-unresolved reports every aliased import
    // in apps/admin as unresolved even though `tsc --noEmit -p apps/admin` resolves them all.
    files: ['apps/admin/**/*.ts', 'apps/admin/**/*.tsx'],
    settings: {
      'import/resolver': {
        typescript: { project: 'apps/admin/tsconfig.json' },
      },
    },
  },
]);
