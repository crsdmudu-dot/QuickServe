import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, Pressable, Text } from 'react-native';
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

const mockIsSuspended = jest.fn().mockResolvedValue(false);
jest.mock('@/lib/account-state', () => ({ isAccountSuspended: (...a: unknown[]) => mockIsSuspended(...a) }));

function Probe() {
  const { isLoading, role, signedIn, authError, selectRole, signUp: su, signIn, signOut: so } = useAuth();
  return (
    <>
      <Text>{isLoading ? 'loading' : `ready:${role ?? 'none'}:${signedIn}:${authError ?? '-'}`}</Text>
      <Pressable onPress={() => selectRole('provider')}><Text>select</Text></Pressable>
      <Pressable onPress={() => su({ fullName: 'A', email: 'a@b', phone: '07', password: 'pw' })}><Text>signup</Text></Pressable>
      <Pressable onPress={() => su({ fullName: 'A', email: 'a@b', phone: '07', password: 'pw', acceptedTermsVersion: 'draft-2026-09-26' })}><Text>signup-terms</Text></Pressable>
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
  mockIsSuspended.mockReset();
  mockIsSuspended.mockResolvedValue(false);
});

describe('suspended accounts (F5.6)', () => {
  const BLOCKED = "This account can't sign in. If you think this is a mistake, contact support@kwikserve.co.ke.";

  it('a session whose profile is hidden and whose account is suspended is signed out on this device, with the neutral message', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockIsSuspended.mockResolvedValue(true);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText(`ready:none:false:${BLOCKED}`)).toBeOnTheScreen());
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('a missing profile that is not a suspension is left alone', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('ready:none:true:-')).toBeOnTheScreen());
    expect(mockIsSuspended).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('an ordinary sign-in with a readable profile makes no extra account-state call', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockMaybeSingle.mockResolvedValue({ data: { role: 'customer', approval_status: 'approved' }, error: null });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('ready:customer:true:-')).toBeOnTheScreen());
    expect(mockIsSuspended).not.toHaveBeenCalled();
  });

  it('checks again when the app returns to the foreground, and signs out only when suspended', async () => {
    const handlers: ((s: string) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      handlers.push(handler as (s: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockMaybeSingle.mockResolvedValue({ data: { role: 'customer', approval_status: 'approved' }, error: null });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('ready:customer:true:-')).toBeOnTheScreen());
    const onChange = handlers[handlers.length - 1];

    await act(async () => onChange('background'));
    expect(mockIsSuspended).not.toHaveBeenCalled();
    await act(async () => onChange('active'));
    expect(mockIsSuspended).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();

    mockIsSuspended.mockResolvedValue(true);
    await act(async () => onChange('active'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' }));
    await waitFor(() => expect(screen.getByText(`ready:customer:true:${BLOCKED}`)).toBeOnTheScreen());
    spy.mockRestore();
  });
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
    expect.objectContaining({
      options: expect.objectContaining({ data: { full_name: 'A', phone: '07', role: 'provider' } }),
    }),
  ));
  fireEvent.press(screen.getByText('signout'));
  await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
});

it('signUp carries the Terms version agreed on the register screen (F5.4)', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockSignUp.mockResolvedValue({ error: null });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('ready:none:false:-')).toBeOnTheScreen());
  fireEvent.press(screen.getByText('select'));
  fireEvent.press(screen.getByText('signup-terms'));
  await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({ data: { full_name: 'A', phone: '07', role: 'provider', terms_version: 'draft-2026-09-26' } }),
    }),
  ));
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
