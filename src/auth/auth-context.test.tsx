import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { AuthProvider, useAuth } from '@/auth/auth-context';

const mockSignUp = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue({ error: null });
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: (...a: unknown[]) => mockSignUp(...a),
      signInWithPassword: (...a: unknown[]) => mockSignInWithPassword(...a),
      signOut: (...a: unknown[]) => mockSignOut(...a),
      getSession: (...a: unknown[]) => mockGetSession(...a),
      onAuthStateChange: (...a: unknown[]) => mockOnAuthStateChange(...a),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: (...a: unknown[]) => mockMaybeSingle(...a) }) }) }),
  },
}));

const mockUnregister = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/push', () => ({
  unregisterForPushNotifications: (...a: unknown[]) => mockUnregister(...a),
}));

function Probe() {
  const { isLoading, role, signedIn, authError, selectRole, signUp: su, signIn, signOut: so } = useAuth();
  return (
    <>
      <Text>{isLoading ? 'loading' : `ready:${role ?? 'none'}:${signedIn}:${authError ?? '-'}`}</Text>
      <Pressable onPress={() => selectRole('provider')}><Text>select</Text></Pressable>
      <Pressable onPress={() => su({ fullName: 'A', email: 'a@b', phone: '07', password: 'pw' })}><Text>signup</Text></Pressable>
      <Pressable onPress={() => signIn('a@b', 'pw')}><Text>signin</Text></Pressable>
      <Pressable onPress={() => so()}><Text>signout</Text></Pressable>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
  mockUnregister.mockReset();
  mockUnregister.mockResolvedValue(undefined);
});

it('loads with no session', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('ready:none:false:-')).toBeOnTheScreen());
});

it('loads role from profile when a session exists', async () => {
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  mockMaybeSingle.mockResolvedValue({ data: { role: 'customer', approval_status: 'approved' }, error: null });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('ready:customer:true:-')).toBeOnTheScreen());
});

it('signIn sets authError on failure', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('ready:none:false:-')).toBeOnTheScreen());
  fireEvent.press(screen.getByText('signin'));
  await waitFor(() =>
    expect(screen.getByText('ready:none:false:Incorrect email or password.')).toBeOnTheScreen(),
  );
});

it('signUp passes role metadata and signOut calls supabase', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockSignUp.mockResolvedValue({ error: null });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('ready:none:false:-')).toBeOnTheScreen());
  fireEvent.press(screen.getByText('select'));
  fireEvent.press(screen.getByText('signup'));
  await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith(
    expect.objectContaining({ options: { data: { full_name: 'A', phone: '07', role: 'provider' } } }),
  ));
  fireEvent.press(screen.getByText('signout'));
  await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
});

it('signOut unregisters this device push token BEFORE supabase signOut (Phase 4E.1)', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  const order: string[] = [];
  mockUnregister.mockImplementation(async () => { order.push('unregister'); });
  mockSignOut.mockImplementation(async () => { order.push('signout'); return { error: null }; });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('ready:none:false:-')).toBeOnTheScreen());
  fireEvent.press(screen.getByText('signout'));
  await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  expect(mockUnregister).toHaveBeenCalled();
  expect(order).toEqual(['unregister', 'signout']);
});

it('signOut still signs out even if push cleanup fails (best-effort — Phase 4E.1)', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockUnregister.mockRejectedValue(new Error('cleanup failed'));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('ready:none:false:-')).toBeOnTheScreen());
  fireEvent.press(screen.getByText('signout'));
  await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
});
