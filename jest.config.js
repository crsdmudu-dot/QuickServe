module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|expo-router|expo-symbols|react-native-reanimated|react-native-worklets|@react-native/.*))',
  ],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/QuickServe/'],
  roots: ['<rootDir>/test'],
};
