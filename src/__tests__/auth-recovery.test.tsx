/**
 * auth-recovery.test.tsx — the mobile recovery-link route (`/auth/recovery`).
 *
 * The screen captures the link parameters once, strips them from the visible route, asks the
 * auth context to verify, and renders by recovery stage. It never handles tokens itself, never
 * accepts a destination from the URL, and on web it only tells the user to open the link on a phone.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import RecoveryScreen from '@/app/auth/recovery';

const HASH = 'c'.repeat(64);
const mockVerifyAuthLink = jest.fn();
const mockCompletePasswordReset = jest.fn();
const mockAbandonRecovery = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, unknown> = {};
let mockAuth: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-router/head', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => mockAuth }));


function setAuth(stage: string, extra: Record<string, unknown> = {}) {
  mockAuth = {
    recovery: { stage, sessionFromLink: stage === 'ready' || stage === 'updating' || stage === 'done' },
    authError: null,
    session: stage === 'ready' ? { user: { email: 'user@example.com' } } : null,
    verifyAuthLink: (...a: unknown[]) => mockVerifyAuthLink(...a),
    completePasswordReset: (...a: unknown[]) => mockCompletePasswordReset(...a),
    abandonRecovery: (...a: unknown[]) => mockAbandonRecovery(...a),
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  setAuth('idle');
  mockVerifyAuthLink.mockResolvedValue(true);
  mockAbandonRecovery.mockResolvedValue(undefined);
});

describe('RecoveryScreen — link intake', () => {
  it('verifies a well-formed link exactly once and strips the parameters from the route', async () => {
    mockParams = { token_hash: HASH, type: 'recovery' };
    render(<RecoveryScreen />);
    await waitFor(() => expect(mockVerifyAuthLink).toHaveBeenCalledWith({ tokenHash: HASH, type: 'recovery' }));
    expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/auth/recovery');
  });

  it('performs no auth request for missing or malformed parameters and shows the safe error state', async () => {
    for (const p of [{}, { token_hash: 'short', type: 'recovery' }, { token_hash: HASH, type: 'signup' }, { token_hash: [HASH], type: 'recovery' }]) {
      mockParams = p;
      const view = render(<RecoveryScreen />);
      expect(await screen.findByText('This link is invalid or has expired.')).toBeOnTheScreen();
      expect(mockVerifyAuthLink).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it('ignores any destination carried by the link', async () => {
    mockParams = { token_hash: HASH, type: 'recovery', next: 'https://evil.example', redirect_to: '/admin' };
    render(<RecoveryScreen />);
    await waitFor(() => expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1));
    for (const call of mockReplace.mock.calls) expect(String(call[0])).not.toMatch(/evil|admin/);
  });

  it('does not re-verify a replayed link while a recovery is already active', async () => {
    mockParams = { token_hash: HASH, type: 'recovery' };
    setAuth('ready');
    render(<RecoveryScreen />);
    await act(async () => {});
    expect(mockVerifyAuthLink).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('New password')).toBeOnTheScreen();
  });
});

describe('RecoveryScreen — stages', () => {
  it('shows a checking state while verifying', () => {
    setAuth('verifying');
    render(<RecoveryScreen />);
    expect(screen.getByText('Checking your link…')).toBeOnTheScreen();
  });

  it('shows the safe error state with a way to request a new link, without touching the session', async () => {
    setAuth('invalid');
    render(<RecoveryScreen />);
    expect(screen.getByText('This link is invalid or has expired.')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Request a new link'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/forgot-password'));
    expect(mockAbandonRecovery).toHaveBeenCalled();
    expect(mockCompletePasswordReset).not.toHaveBeenCalled();
  });

  it('reveals the set-password form only in the ready stage and validates before submitting', async () => {
    setAuth('ready');
    render(<RecoveryScreen />);
    expect(screen.getByPlaceholderText('New password')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByPlaceholderText('New password'), 'short');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm password'), 'short');
    fireEvent.press(screen.getByText('Set new password'));
    expect(screen.getByText('Password must be at least 8 characters')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByPlaceholderText('New password'), 'user@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm password'), 'user@example.com');
    fireEvent.press(screen.getByText('Set new password'));
    expect(screen.getByText('Password must not be your email')).toBeOnTheScreen();
    expect(mockCompletePasswordReset).not.toHaveBeenCalled();
  });

  it('submits the new password explicitly and routes through the root dispatcher on success', async () => {
    setAuth('ready');
    mockCompletePasswordReset.mockResolvedValue(true);
    render(<RecoveryScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('New password'), 'CorrectHorse42');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm password'), 'CorrectHorse42');
    fireEvent.press(screen.getByText('Set new password'));
    await waitFor(() => expect(mockCompletePasswordReset).toHaveBeenCalledWith('CorrectHorse42'));
    // once the context reports completion the screen hands off to "/" (role dispatch), never a URL target
    setAuth('done');
    render(<RecoveryScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('cancel abandons the recovery explicitly and returns to sign in', async () => {
    setAuth('ready');
    render(<RecoveryScreen />);
    fireEvent.press(screen.getByText('Cancel'));
    await waitFor(() => expect(mockAbandonRecovery).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/signin');
  });
});

describe('RecoveryScreen — platform gating', () => {
  it('on web it renders the HTTPS bridge (fragment-driven), ignores query parameters, and performs no auth request', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      mockParams = { token_hash: HASH, type: 'recovery' }; // query params must NOT be honoured on web
      render(<RecoveryScreen />);
      expect(await screen.findByText('This link is invalid or has expired.')).toBeOnTheScreen();
      await act(async () => {});
      expect(mockVerifyAuthLink).not.toHaveBeenCalled();
      expect(screen.queryByPlaceholderText('New password')).toBeNull();
      expect(screen.queryByText(/Continue in browser/i)).toBeNull();
      expect(screen.getByText(/Request a new link/)).toBeOnTheScreen();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});
