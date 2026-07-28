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
    ],
  },
]);
