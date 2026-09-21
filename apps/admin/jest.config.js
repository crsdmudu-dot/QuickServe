// jest.config.js — KwikServe Admin test suite.
//
// Mirrors the repository root config (same preset, same transformIgnorePatterns, same shared
// setup file) and adds the admin import boundary:
//
//   @admin/*  -> apps/admin/src/*   (admin routes + admin-only components)
//   @/*       -> <repo>/src/*       (shared layer, reused not copied)
//
// The root suite ignores /apps/admin/, so the two suites never run each other's tests. Run both:
//   npm test && npm --prefix apps/admin test
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

module.exports = {
  preset: 'jest-expo',
  rootDir: __dirname,
  setupFilesAfterEnv: [path.join(repoRoot, 'test/setup.ts')],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|expo-router|expo-symbols|react-native-reanimated|react-native-worklets|@react-native/.*|standard-navigation))',
  ],
  moduleNameMapper: {
    '^@admin/(.*)$': '<rootDir>/src/$1',
    '^@/(.+\.css)$': path.join(repoRoot, 'test/cssStub.js'),
    '^@/(.*)$': path.join(repoRoot, 'src/$1'),
  },
};
