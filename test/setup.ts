// Internal path required for RNTL v13 — the public 'extend-expect' alias was removed; revisit on upgrade to v14+.
import '@testing-library/react-native/build/matchers/extend-expect';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The keyboard library's own test mock: KeyboardAwareScrollView renders as a plain ScrollView and
// KeyboardAvoidingView as a plain View, so screen tests see the same structure as before.
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));
