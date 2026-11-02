/**
 * auth-context-recovery.test.tsx — AuthProvider recovery/confirmation behaviour against a mocked
 * Supabase client. Pins the token-hash flow: the client is never switched to PKCE, tokens from
 * URL fragments are never accepted, invalid links never sign anyone out, and passwords / token
 * hashes never reach the console. FX-AL: a link opened while this phone is signed in is never used
 * without the person's choice.
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import appJson from '../../app.json';

import { AuthProvider, useAuth } from '@/auth/auth-context';
import { unregisterForPushNotifications } from '@/lib/push';

const SCHEME = (appJson as { expo: { scheme: string[] } }).expo.scheme[0];
const HASH = 'b'.repeat(64);
const SECRET_PASSWORD = 'CorrectHorse42';
const mockUnregister = unregisterForPushNotifications as jest.Mock;

// The session stored on this phone, as getSession() reports it (per test; null = signed out).
let mockStoredSession: unknown = null;
const mockGetSession = jest.fn();
const mockResetPasswordForEmail = jest.fn();
const mockVerifyOtp = jest.fn();
const mockUpdateUser = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue({ error: null });
const mockResend = jest.fn();
const mockSignUp = jest.fn();
let mockAuthListener: ((event: string, session: unknown) => void) | null = null;

jest.mock('@/lib/push', () => ({
  registerForPushNotifications: jest.fn(),
  unregisterForPushNotifications: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/supabase', () => {
  // thenable query chain: `await supabase.from('profiles').select(...).eq(...).single()`
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'single', 'maybeSingle', 'limit', 'order']) {
    chain[m] = jest.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => void) =>
    resolve({ data: { role: 'customer', approval_status: 'approved' }, error: null });
  return {
    supabase: {
      from: jest.fn(() => chain),
      auth: {
        getSession: (...a: unknown[]) => mockGetSession(...a),
        onAuthStateChange: jest.fn((cb: (event: string, session: unknown) => void) => {
          mockAuthListener = cb;
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        }),
        resetPasswordForEmail: (...a: unknown[]) => mockResetPasswordForEmail(...a),
        verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
        updateUser: (...a: unknown[]) => mockUpdateUser(...a),
        signOut: (...a: unknown[]) => mockSignOut(...a),
        resend: (...a: unknown[]) => mockResend(...a),
        signUp: (...a: unknown[]) => mockSignUp(...a),
        signInWithPassword: jest.fn(),
      },
    },
  };
});


type Api = ReturnType<typeof useAuth>;
const probe: { api: Api | null; stages: string[] } = { api: null, stages: [] };

function Probe() {
  const a = useAuth();
  probe.stages.push(a.recovery.stage); // every recovery stage ever rendered
  useEffect(() => {
    probe.api = a;
  }, [a]);
  return (
    <Text testID="probe">
      {`stage=${a.recovery.stage} fromLink=${a.recovery.sessionFromLink} pending=${a.pendingConfirmationEmail ?? 'none'}`}
    </Text>
  );
}

const SESSION = { access_token: 'x', refresh_token: 'y', user: { id: 'u1', email: 'u@example.com' } };

async function mount() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(probe.api).not.toBeNull());
  await waitFor(() => expect(mockAuthListener).not.toBeNull());
  return probe.api as Api;
}

beforeEach(() => {
  jest.clearAllMocks();
  probe.api = null;
  probe.stages = [];
  mockAuthListener = null;
  mockStoredSession = null;
  mockGetSession.mockImplementation(async () => ({ data: { session: mockStoredSession } }));
  mockSignOut.mockResolvedValue({ error: null });
  mockUnregister.mockResolvedValue(undefined);
});

describe('requestPasswordReset', () => {
  it('sends the reset with exactly the approved mobile recovery redirect and reports "sent"', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const a = await mount();
    await expect(a.requestPasswordReset('  Person@Example.com ')).resolves.toBe('sent');
    expect(mockResetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('person@example.com', {
      redirectTo: `${SCHEME}://auth/recovery`,
    });
  });

  it('classifies outcomes by installed Auth error code: neutral only for not-found and the email-send rate limit', async () => {
    const a = await mount();
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { name: 'AuthApiError', message: 'User not found', status: 400, code: 'user_not_found' } });
    await expect(a.requestPasswordReset('nobody@example.com')).resolves.toBe('sent');
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { name: 'AuthApiError', message: 'For security purposes, you can only request this after 60 seconds.', status: 429, code: 'over_email_send_rate_limit' } });
    await expect(a.requestPasswordReset('nobody@example.com')).resolves.toBe('sent-rate-limited');
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { name: 'AuthApiError', message: 'redirect_to URL is not allowed', status: 400, code: 'validation_failed' } });
    await expect(a.requestPasswordReset('nobody@example.com')).resolves.toBe('delivery-failed');
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { name: 'AuthApiError', message: 'Unable to validate email address: invalid format', status: 400, code: 'validation_failed' } });
    await expect(a.requestPasswordReset('nobody@example.com')).resolves.toBe('invalid-request');
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { name: 'AuthApiError', message: 'Bad request', status: 400 } });
    await expect(a.requestPasswordReset('nobody@example.com')).resolves.toBe('delivery-failed');
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } });
    await expect(a.requestPasswordReset('nobody@example.com')).resolves.toBe('retry');
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { name: 'AuthRetryableFetchError', message: 'Service unavailable', status: 503 } });
    await expect(a.requestPasswordReset('nobody@example.com')).resolves.toBe('retry');
    mockResetPasswordForEmail.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(a.requestPasswordReset('nobody@example.com')).resolves.toBe('retry');
  });

  it('never logs the email, the request or the raw Auth error', async () => {
    const spies = [jest.spyOn(console, 'log'), jest.spyOn(console, 'error'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'info')].map((s) => s.mockImplementation(() => {}));
    const RAW = 'RAW-AUTH-MESSAGE-MARKER redirect_to https://evil.example';
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { name: 'AuthApiError', message: RAW, status: 400, code: 'validation_failed' } });
    const a = await mount();
    await a.requestPasswordReset('private.person@example.com');
    const all = spies.flatMap((s) => s.mock.calls.flat()).map((v) => (typeof v === 'string' ? v : JSON.stringify(v) ?? String(v)));
    for (const line of all) {
      expect(line).not.toContain('RAW-AUTH-MESSAGE-MARKER');
      expect(line).not.toContain('private.person@example.com');
    }
    spies.forEach((s) => s.mockRestore());
  });

  it('never mutates auth merely by mounting the provider', async () => {
    await mount();
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

describe('verifyAuthLink (recovery)', () => {
  it('verifies with token_hash + type=recovery and enters the recovery session', async () => {
    mockVerifyOtp.mockImplementation(async () => {
      mockAuthListener?.('PASSWORD_RECOVERY', SESSION);
      return { data: { session: SESSION, user: SESSION.user }, error: null };
    });
    const a = await mount();
    await act(async () => {
      await expect(a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' })).resolves.toBe(true);
    });
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'recovery' });
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toContain('stage=ready'));
    expect(screen.getByTestId('probe').props.children).toContain('fromLink=true');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('marks the link invalid on expired / used / malformed errors and never signs out', async () => {
    const a = await mount();
    for (const err of [
      { message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' },
      { message: 'Email link is invalid or has expired', status: 401 },
    ]) {
      mockVerifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: err });
      await act(async () => {
        await expect(a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' })).resolves.toBe(false);
      });
      await waitFor(() => expect(screen.getByTestId('probe').props.children).toContain('stage=invalid'));
    }
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('is idempotent: a replayed link during an active recovery does not verify again', async () => {
    mockVerifyOtp.mockImplementation(async () => {
      mockAuthListener?.('PASSWORD_RECOVERY', SESSION);
      return { data: { session: SESSION, user: SESSION.user }, error: null };
    });
    const a = await mount();
    await act(async () => {
      await a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' });
    });
    await act(async () => {
      await expect(a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' })).resolves.toBe(true);
    });
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
  });
});

describe('completePasswordReset', () => {
  it('refuses to update the password without a verified recovery session', async () => {
    const a = await mount();
    await expect(a.completePasswordReset(SECRET_PASSWORD)).resolves.toBe(false);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('updates the password once after verification and finishes the recovery', async () => {
    mockVerifyOtp.mockImplementation(async () => {
      mockAuthListener?.('PASSWORD_RECOVERY', SESSION);
      return { data: { session: SESSION, user: SESSION.user }, error: null };
    });
    mockUpdateUser.mockResolvedValue({ data: { user: SESSION.user }, error: null });
    const a = await mount();
    await act(async () => {
      await a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' });
    });
    await act(async () => {
      await expect(a.completePasswordReset(SECRET_PASSWORD)).resolves.toBe(true);
    });
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: SECRET_PASSWORD });
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toContain('stage=done'));
    expect(mockSignOut).not.toHaveBeenCalled(); // the new session is kept
  });

  it('surfaces a mapped error and stays in the recovery session when the update fails', async () => {
    mockVerifyOtp.mockImplementation(async () => {
      mockAuthListener?.('PASSWORD_RECOVERY', SESSION);
      return { data: { session: SESSION, user: SESSION.user }, error: null };
    });
    mockUpdateUser.mockResolvedValue({ data: { user: null }, error: { message: 'New password should be different from the old password.', code: 'same_password', status: 422 } });
    const a = await mount();
    await act(async () => {
      await a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' });
    });
    await act(async () => {
      await expect(a.completePasswordReset(SECRET_PASSWORD)).resolves.toBe(false);
    });
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toContain('stage=ready'));
    expect((probe.api as Api).authError).toBe('Your new password must be different from your old password.');
  });
});

describe('abandonRecovery', () => {
  it('signs out locally only when the session came from a recovery link, then resets the state', async () => {
    mockVerifyOtp.mockImplementation(async () => {
      mockAuthListener?.('PASSWORD_RECOVERY', SESSION);
      return { data: { session: SESSION, user: SESSION.user }, error: null };
    });
    const a = await mount();
    await act(async () => {
      await a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' });
    });
    await act(async () => {
      await a.abandonRecovery();
    });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toContain('stage=idle'));
  });

  it('does not sign out when abandoning an invalid link (existing session untouched)', async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { message: 'Token has expired or is invalid', code: 'otp_expired', status: 403 } });
    const a = await mount();
    await act(async () => {
      await a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' });
    });
    await act(async () => {
      await a.abandonRecovery();
    });
    expect(mockSignOut).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toContain('stage=idle'));
  });
});

describe('email confirmation', () => {
  it('signUp supplies the approved confirmation redirect and records the pending email when no session is returned', async () => {
    mockSignUp.mockResolvedValue({ data: { session: null, user: { id: 'u2' } }, error: null });
    const a = await mount();
    await act(async () => {
      await expect(a.signUp({ fullName: 'A', email: 'New@Example.com', phone: '0700', password: SECRET_PASSWORD })).resolves.toBe(true);
    });
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'New@Example.com',
      password: SECRET_PASSWORD,
      options: {
        data: { full_name: 'A', phone: '0700', role: null },
        emailRedirectTo: `${SCHEME}://auth/confirm`,
      },
    });
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toContain('pending=New@Example.com'));
  });

  it('does not record a pending confirmation when signUp returns a session (confirmations disabled)', async () => {
    mockSignUp.mockResolvedValue({ data: { session: SESSION, user: SESSION.user }, error: null });
    const a = await mount();
    await act(async () => {
      await a.signUp({ fullName: 'A', email: 'new@example.com', phone: '0700', password: SECRET_PASSWORD });
    });
    expect(screen.getByTestId('probe').props.children).toContain('pending=none');
  });

  it('verifyAuthLink for signup calls verifyOtp with type=signup and does not enter recovery', async () => {
    mockVerifyOtp.mockImplementation(async () => {
      mockAuthListener?.('SIGNED_IN', SESSION);
      return { data: { session: SESSION, user: SESSION.user }, error: null };
    });
    const a = await mount();
    await act(async () => {
      await expect(a.verifyAuthLink({ tokenHash: HASH, type: 'signup' })).resolves.toBe(true);
    });
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'signup' });
    expect(screen.getByTestId('probe').props.children).toContain('stage=idle');
  });

  it('resendConfirmation is explicit, neutral, and uses the approved confirmation redirect', async () => {
    mockResend.mockResolvedValueOnce({ data: {}, error: null });
    const a = await mount();
    expect(mockResend).not.toHaveBeenCalled();
    await expect(a.resendConfirmation('new@example.com')).resolves.toBe('sent');
    expect(mockResend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'new@example.com',
      options: { emailRedirectTo: `${SCHEME}://auth/confirm` },
    });
    mockResend.mockResolvedValueOnce({ data: null, error: { name: 'AuthApiError', message: 'over email send rate limit', status: 429, code: 'over_email_send_rate_limit' } });
    await expect(a.resendConfirmation('new@example.com')).resolves.toBe('sent-rate-limited');
    mockResend.mockResolvedValueOnce({ data: null, error: { name: 'AuthApiError', message: 'Bad request', status: 400 } });
    await expect(a.resendConfirmation('new@example.com')).resolves.toBe('delivery-failed');
  });
});

describe('a link opened while this phone is signed in (FX-AL)', () => {
  const probeText = () => screen.getByTestId('probe').props.children as string;

  it('J-1: a confirmation link returns "signed-in": nothing is verified, signed out or unregistered', async () => {
    mockStoredSession = SESSION;
    const a = await mount();
    await act(async () => {
      await expect(a.verifyAuthLink({ tokenHash: HASH, type: 'signup' })).resolves.toBe('signed-in');
    });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockUnregister).not.toHaveBeenCalled();
  });

  it('J-2: a reset link returns "signed-in" and the recovery stage never leaves idle', async () => {
    mockStoredSession = SESSION;
    const a = await mount();
    await act(async () => {
      await expect(a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' })).resolves.toBe('signed-in');
    });
    expect(probeText()).toContain('stage=idle');
    expect([...new Set(probe.stages)]).toEqual(['idle']);
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('J-3: the replay guard stays first, so the stored recovery session does not turn a replay into a choice', async () => {
    mockVerifyOtp.mockImplementation(async () => {
      mockStoredSession = SESSION; // the recovery session is now stored on this phone
      mockAuthListener?.('PASSWORD_RECOVERY', SESSION);
      return { data: { session: SESSION, user: SESSION.user }, error: null };
    });
    const a = await mount();
    await act(async () => {
      await expect(a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' })).resolves.toBe(true);
    });
    await act(async () => {
      await expect(a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' })).resolves.toBe(true);
    });
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('a duplicate reset link delivered while the first is still being checked is ignored', async () => {
    const a = await mount();
    let release: () => void = () => {};
    mockGetSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ data: { session: null } });
        }),
    );
    mockVerifyOtp.mockResolvedValue({ data: { session: SESSION, user: SESSION.user }, error: null });
    await act(async () => {
      const first = a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' });
      await expect(a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' })).resolves.toBe(true);
      release();
      await expect(first).resolves.toBe(true);
    });
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
  });

  it('J-4: the switch unregisters push, signs out on this phone only (exactly once), then verifies once, in that order', async () => {
    const order: string[] = [];
    mockStoredSession = SESSION;
    mockUnregister.mockImplementationOnce(async () => {
      order.push('unregister');
    });
    mockSignOut.mockImplementationOnce(async () => {
      order.push('signOut');
      mockStoredSession = null;
      return { error: null };
    });
    mockVerifyOtp.mockImplementationOnce(async () => {
      order.push('verifyOtp');
      return { data: { session: SESSION, user: SESSION.user }, error: null };
    });
    const a = await mount();
    await act(async () => {
      await expect(a.signOutAndVerifyAuthLink({ tokenHash: HASH, type: 'signup' })).resolves.toBe(true);
    });
    expect(order).toEqual(['unregister', 'signOut', 'verifyOtp']);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut.mock.calls[0]).toEqual([{ scope: 'local' }]); // never the all-devices default
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'signup' });
  });

  it('J-4: for a reset link the switch then enters the recovery session, as today', async () => {
    mockStoredSession = SESSION;
    mockSignOut.mockImplementationOnce(async () => {
      mockStoredSession = null;
      return { error: null };
    });
    mockVerifyOtp.mockImplementationOnce(async () => {
      mockAuthListener?.('PASSWORD_RECOVERY', SESSION);
      return { data: { session: SESSION, user: SESSION.user }, error: null };
    });
    const a = await mount();
    await act(async () => {
      await expect(a.signOutAndVerifyAuthLink({ tokenHash: HASH, type: 'recovery' })).resolves.toBe(true);
    });
    expect(mockSignOut.mock.calls).toEqual([[{ scope: 'local' }]]);
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'recovery' });
    await waitFor(() => expect(probeText()).toContain('stage=ready'));
  });

  const SIGN_OUT_FAILURES: [string, () => Promise<unknown>][] = [
    [
      'the sign-out reports an error (even with the stored session gone)',
      async () => {
        mockStoredSession = null; // so only the error check can stop the link
        return { error: { message: 'offline', status: 0 } };
      },
    ],
    [
      'the sign-out throws',
      async () => {
        throw new Error('offline');
      },
    ],
    ['a session is still stored after the sign-out', async () => ({ error: null })],
  ];

  it.each(SIGN_OUT_FAILURES)('J-5: the link is not used when %s', async (_label, signOutResult) => {
    mockStoredSession = SESSION;
    mockSignOut.mockImplementationOnce(signOutResult);
    const a = await mount();
    await act(async () => {
      await expect(a.signOutAndVerifyAuthLink({ tokenHash: HASH, type: 'recovery' })).resolves.toBe(false);
    });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(probeText()).toContain('stage=idle');
  });

  it('J-6: the link is still held back when the stored session can only be read after it arrives (cold start)', async () => {
    let release: () => void = () => {};
    const stored = new Promise((resolve) => {
      release = () => resolve({ data: { session: SESSION } });
    });
    mockGetSession.mockImplementation(() => stored);
    const a = await mount();
    expect(a.session).toBeNull(); // the React state does not know about the session yet
    let outcome: unknown;
    await act(async () => {
      const pending = a.verifyAuthLink({ tokenHash: HASH, type: 'signup' });
      release();
      outcome = await pending;
    });
    expect(outcome).toBe('signed-in');
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('a confirmation link used after signing out of an active reset leaves no stale recovery state', async () => {
    mockVerifyOtp.mockImplementationOnce(async () => {
      mockStoredSession = SESSION;
      mockAuthListener?.('PASSWORD_RECOVERY', SESSION);
      return { data: { session: SESSION, user: SESSION.user }, error: null };
    });
    const a = await mount();
    await act(async () => {
      await a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' });
    });
    await waitFor(() => expect(probeText()).toContain('stage=ready'));
    // The reset's session is stored, so a confirmation link now asks first and changes nothing.
    await act(async () => {
      await expect(a.verifyAuthLink({ tokenHash: HASH, type: 'signup' })).resolves.toBe('signed-in');
    });
    expect(probeText()).toContain('stage=ready');
    mockSignOut.mockImplementationOnce(async () => {
      mockStoredSession = null;
      return { error: null };
    });
    mockVerifyOtp.mockResolvedValueOnce({ data: { session: SESSION, user: SESSION.user }, error: null });
    await act(async () => {
      await expect(a.signOutAndVerifyAuthLink({ tokenHash: HASH, type: 'signup' })).resolves.toBe(true);
    });
    await waitFor(() => expect(probeText()).toContain('stage=idle'));
  });

  // C-1: a stored session that cannot be read never lets a link through (fail closed).
  const LINK_TYPES: ('signup' | 'recovery')[] = ['signup', 'recovery'];
  const READ_ERROR = { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 };

  it.each(LINK_TYPES)('C-1 (a): when reading the stored session throws, a %s link is not used', async (type) => {
    const a = await mount();
    mockGetSession.mockRejectedValueOnce(new Error('storage unavailable'));
    await act(async () => {
      await expect(a.verifyAuthLink({ tokenHash: HASH, type })).resolves.toBe(false);
    });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it.each(LINK_TYPES)('C-1 (b): when getSession() reports an error, a %s link asks first and is not used', async (type) => {
    const a = await mount();
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: READ_ERROR });
    await act(async () => {
      await expect(a.verifyAuthLink({ tokenHash: HASH, type })).resolves.toBe('signed-in');
    });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(probeText()).toContain('stage=idle');
  });

  const STEP3_READ_FAILURES: [string, () => void][] = [
    ['reports an error', () => mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: READ_ERROR })],
    ['throws', () => mockGetSession.mockRejectedValueOnce(new Error('storage unavailable'))],
  ];

  it.each(STEP3_READ_FAILURES)('C-1 (c): when the session check after the sign-out %s, the link is not used', async (_label, failNextRead) => {
    mockStoredSession = SESSION;
    const a = await mount();
    mockSignOut.mockImplementationOnce(async () => {
      mockStoredSession = null;
      failNextRead(); // the next getSession() is the switch's step 3
      return { error: null };
    });
    await act(async () => {
      await expect(a.signOutAndVerifyAuthLink({ tokenHash: HASH, type: 'signup' })).resolves.toBe(false);
    });
    expect(mockSignOut.mock.calls).toEqual([[{ scope: 'local' }]]);
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('C-6: after a completed reset (stage done) with its session stored, a new reset link asks first and is not used', async () => {
    mockVerifyOtp.mockImplementationOnce(async () => {
      mockStoredSession = SESSION;
      mockAuthListener?.('PASSWORD_RECOVERY', SESSION);
      return { data: { session: SESSION, user: SESSION.user }, error: null };
    });
    mockUpdateUser.mockResolvedValueOnce({ data: { user: SESSION.user }, error: null });
    const a = await mount();
    await act(async () => {
      await a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' });
    });
    await act(async () => {
      await expect(a.completePasswordReset(SECRET_PASSWORD)).resolves.toBe(true);
    });
    await waitFor(() => expect(probeText()).toContain('stage=done'));
    await act(async () => {
      await expect(a.verifyAuthLink({ tokenHash: 'e'.repeat(64), type: 'recovery' })).resolves.toBe('signed-in');
    });
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    expect(probeText()).toContain('stage=done');
  });
});

describe('secrets never reach the console', () => {
  it('J-7: logs no token hash on the signed-in and sign-out-and-continue paths', async () => {
    const spies = [jest.spyOn(console, 'log'), jest.spyOn(console, 'error'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'info')].map((s) => s.mockImplementation(() => {}));
    mockStoredSession = SESSION;
    mockSignOut.mockResolvedValueOnce({ error: { message: `sign-out failed ${HASH}`, status: 500 } });
    mockVerifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { message: `bad token ${HASH}`, code: 'otp_expired', status: 403 } });
    const a = await mount();
    await act(async () => {
      await a.verifyAuthLink({ tokenHash: HASH, type: 'signup' });
      await a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' });
      await a.signOutAndVerifyAuthLink({ tokenHash: HASH, type: 'signup' }); // the sign-out fails
      mockStoredSession = null;
      await a.signOutAndVerifyAuthLink({ tokenHash: HASH, type: 'recovery' }); // the link is rejected
    });
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    const all = spies.flatMap((s) => s.mock.calls.flat()).map((v) => (typeof v === 'string' ? v : JSON.stringify(v) ?? String(v)));
    for (const line of all) expect(line).not.toContain(HASH);
    spies.forEach((s) => s.mockRestore());
  });

  it('logs neither the token hash nor the password on any path', async () => {
    const spies = [jest.spyOn(console, 'log'), jest.spyOn(console, 'error'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'info')].map((s) => s.mockImplementation(() => {}));
    mockVerifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { message: `bad token ${HASH}`, code: 'otp_expired', status: 403 } });
    mockResetPasswordForEmail.mockRejectedValueOnce(new Error(`boom ${SECRET_PASSWORD}`));
    mockUpdateUser.mockResolvedValue({ data: { user: null }, error: { message: 'weak', code: 'weak_password', status: 422 } });
    const a = await mount();
    await act(async () => {
      await a.verifyAuthLink({ tokenHash: HASH, type: 'recovery' });
      await a.requestPasswordReset('x@example.com');
      await a.completePasswordReset(SECRET_PASSWORD);
    });
    const all = spies.flatMap((s) => s.mock.calls.flat()).map((v) => (typeof v === 'string' ? v : JSON.stringify(v) ?? String(v)));
    for (const line of all) {
      expect(line).not.toContain(HASH);
      expect(line).not.toContain(SECRET_PASSWORD);
    }
    spies.forEach((s) => s.mockRestore());
  });
});
