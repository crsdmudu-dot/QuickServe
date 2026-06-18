import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAuth, loadAuth, saveAuth } from '@/auth/auth-storage';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('auth-storage', () => {
  it('returns defaults when nothing stored', async () => {
    expect(await loadAuth()).toEqual({ role: null, signedIn: false });
  });
  it('round-trips saved state', async () => {
    await saveAuth({ role: 'provider', signedIn: true });
    expect(await loadAuth()).toEqual({ role: 'provider', signedIn: true });
  });
  it('clears state', async () => {
    await saveAuth({ role: 'admin', signedIn: true });
    await clearAuth();
    expect(await loadAuth()).toEqual({ role: null, signedIn: false });
  });
  it('returns defaults on corrupt data', async () => {
    await AsyncStorage.setItem('quickserve.auth', 'not json');
    expect(await loadAuth()).toEqual({ role: null, signedIn: false });
  });
});
