module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|expo-router|expo-symbols|react-native-reanimated|react-native-worklets|@react-native/.*))',
  ],
  // Exclude the nested QuickServe sub-project from test discovery.
  // The pattern is anchored to <rootDir>/QuickServe/ (the second-level project).
  // A bare 'QuickServe' pattern would also match the repo root and exclude everything.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/QuickServe/'],
  // Also prevent jest's haste module map from crawling the nested project's
  // node_modules and source, which would cause a "module naming collision" error.
  modulePathIgnorePatterns: ['<rootDir>/QuickServe/'],
  moduleNameMapper: {
    '^@/(.+\\.css)$': '<rootDir>/test/cssStub.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
