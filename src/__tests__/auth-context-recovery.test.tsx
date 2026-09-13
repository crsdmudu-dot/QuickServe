/**
 * auth-context-recovery.test.tsx — AuthProvider recovery/confirmation behaviour against a mocked
 * Supabase client. Pins the token-hash flow: the client is never switched to PKCE, tokens from
 * URL fragments are never accepted, invalid links never sign anyone out, and passwords / token
 * hashes never reach the console.
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import appJson from '../../app.json';

import { AuthProvider, useAuth } from '@/auth/auth-context';

const SCHEME = (appJson as { expo: { scheme: string[] } }).expo.scheme[0];
const HASH = 'b'.repeat(64);
const SECRET_PASSWORD = 'CorrectHorse42';

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
        getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
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
const probe: { api: Api | null } = { api: null };

function Probe() {
  const a = useAuth();
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
  mockAuthListener = null;
  mockSignOut.mockResolvedValue({ error: null });
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

describe('secrets never reach the console', () => {
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
