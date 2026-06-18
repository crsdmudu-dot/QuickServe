// Internal path required for RNTL v13 — the public 'extend-expect' alias was removed; revisit on upgrade to v14+.
import '@testing-library/react-native/build/matchers/extend-expect';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
