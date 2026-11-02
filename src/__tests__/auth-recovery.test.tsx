/**
 * auth-recovery.test.tsx — the mobile recovery-link route (`/auth/recovery`).
 *
 * The screen captures the link parameters once, strips them from the visible route, asks the
 * auth context to verify, and renders by recovery stage. It never handles tokens itself, never
 * accepts a destination from the URL, and on web it only tells the user to open the link on a phone.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import RecoveryScreen from '@/app/auth/recovery';

const HASH = 'c'.repeat(64);
// The approved wording (AL-WORDING), byte for byte.
const AL1 = "You're already signed in on this phone. To use this link, sign out first.";
const STAY = 'Stay signed in';
const SWITCH = 'Sign out and continue';
const INVALID = 'This link is invalid or has expired.';
const mockVerifyAuthLink = jest.fn();
const mockSwitch = jest.fn();
const mockSignOut = jest.fn();
const mockCompletePasswordReset = jest.fn();
const mockAbandonRecovery = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, unknown> = {};
let mockAuth: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: (...a: unknown[]) => mockReplace(...a),
    setParams: (...a: unknown[]) => mockSetParams(...a),
    back: jest.fn(),
  },
  useLocalSearchParams: () => mockParams,
  // The root navigator is ready in these suites; cold-launch readiness is covered in
  // src/__tests__/auth-link-cold-launch.test.tsx.
  useNavigationContainerRef: () => ({ isReady: () => true, addListener: () => () => {} }),
}));
jest.mock('expo-router/head', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => mockAuth }));


function setAuth(stage: string, extra: Record<string, unknown> = {}) {
  mockAuth = {
    recovery: { stage, sessionFromLink: stage === 'ready' || stage === 'updating' || stage === 'done' },
    authError: null,
    session: stage === 'ready' ? { user: { email: 'user@example.com' } } : null,
    verifyAuthLink: (...a: unknown[]) => mockVerifyAuthLink(...a),
    signOutAndVerifyAuthLink: (...a: unknown[]) => mockSwitch(...a),
    signOut: (...a: unknown[]) => mockSignOut(...a),
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
    // Stripped with setParams so the route key, and therefore this screen instance, survives.
    expect(mockSetParams).toHaveBeenCalledWith({ token_hash: undefined, type: undefined });
    expect(mockReplace).not.toHaveBeenCalledWith('/auth/recovery');
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

describe('RecoveryScreen — this phone is already signed in (FX-AL)', () => {
  let announceSpy: jest.SpyInstance;

  beforeEach(() => {
    mockParams = { token_hash: HASH, type: 'recovery' };
    mockVerifyAuthLink.mockResolvedValue('signed-in');
    mockSwitch.mockResolvedValue(true);
    announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });
  afterEach(() => announceSpy.mockRestore());

  async function renderChoice() {
    const view = render(<RecoveryScreen />);
    expect(await screen.findByText(AL1)).toBeOnTheScreen();
    return view;
  }

  function expectNoPasswordForm() {
    expect(screen.queryByPlaceholderText('New password')).toBeNull();
    expect(screen.queryByPlaceholderText('Confirm password')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set new password' })).toBeNull();
  }

  it('S-1 / S-5 / AJ-8: shows the choice after the parameters were stripped, with no password field and no hand-off', async () => {
    await renderChoice();
    expect(mockSetParams).toHaveBeenCalledWith({ token_hash: undefined, type: undefined });
    expect(mockSetParams.mock.invocationCallOrder[0]).toBeLessThan(mockVerifyAuthLink.mock.invocationCallOrder[0]);
    expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByText(INVALID)).toBeNull();
    expect(screen.queryByText('Checking your link…')).toBeNull();
    expectNoPasswordForm();
  });

  it('S-2 / S-11: "Stay signed in" goes home and calls nothing in the auth context', async () => {
    await renderChoice();
    fireEvent.press(screen.getByRole('button', { name: STAY }));
    expect(mockReplace.mock.calls).toEqual([['/']]);
    expect(mockSwitch).not.toHaveBeenCalled();
    expect(mockAbandonRecovery).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1);
  });

  it('S-3: "Sign out and continue" calls the switch once with the parsed link, then shows today\'s set-password form', async () => {
    mockSwitch.mockImplementation(async () => {
      setAuth('ready'); // the context's recovery session after the link was used
      return true;
    });
    await renderChoice();
    fireEvent.press(screen.getByRole('button', { name: SWITCH }));
    expect(await screen.findByPlaceholderText('New password')).toBeOnTheScreen();
    expect(mockSwitch.mock.calls).toEqual([[{ tokenHash: HASH, type: 'recovery' }]]);
    expect(mockReplace).not.toHaveBeenCalledWith('/');
  });

  it.each([
    ['the sign-out did not succeed', 'idle'],
    ['the link was rejected', 'invalid'],
  ])('S-3: shows today\'s invalid-link state when %s', async (_label, stageAfter) => {
    mockSwitch.mockImplementation(async () => {
      setAuth(stageAfter);
      return false;
    });
    await renderChoice();
    fireEvent.press(screen.getByRole('button', { name: SWITCH }));
    expect(await screen.findByText(INVALID)).toBeOnTheScreen();
    expectNoPasswordForm();
    expect(mockReplace).not.toHaveBeenCalledWith('/');
  });

  it('S-4: a double tap calls the switch once', async () => {
    mockSwitch.mockReturnValue(new Promise(() => {}));
    await renderChoice();
    const button = screen.getByRole('button', { name: SWITCH });
    fireEvent.press(button);
    fireEvent.press(button);
    expect(mockSwitch).toHaveBeenCalledTimes(1);
  });

  it('S-5: the set-password form stays hidden while the switch is still running, even once the stage is ready', async () => {
    mockSwitch.mockImplementation(() => {
      setAuth('ready');
      return new Promise(() => {});
    });
    await renderChoice();
    fireEvent.press(screen.getByRole('button', { name: SWITCH }));
    expect(screen.getByText(AL1)).toBeOnTheScreen();
    expectNoPasswordForm();
  });

  it('S-6 / AJ-2 / AJ-6: exactly two buttons, "Stay signed in" first and primary, no hints', async () => {
    await renderChoice();
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([STAY, SWITCH]);
    expect(buttons[0]).toHaveStyle({ borderWidth: 0 }); // primary (filled)
    expect(buttons[1]).toHaveStyle({ borderWidth: 1 }); // secondary (outlined)
    for (const b of buttons) expect(b.props.accessibilityHint).toBeUndefined();
  });

  it('S-7: leaving the screen while the choice shows uses nothing, abandons nothing and signs nothing out', async () => {
    const view = await renderChoice();
    view.unmount();
    await act(async () => {});
    expect(mockSwitch).not.toHaveBeenCalled();
    expect(mockAbandonRecovery).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('S-8: nothing happens by itself: after 60 seconds the choice is still shown and nothing was called', async () => {
    jest.useFakeTimers();
    try {
      render(<RecoveryScreen />);
      expect(await screen.findByText(AL1)).toBeOnTheScreen();
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      expect(screen.getByText(AL1)).toBeOnTheScreen();
      expect(mockSwitch).not.toHaveBeenCalled();
      expect(mockAbandonRecovery).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('S-9 / AJ-3: after the first "Sign out and continue" tap both buttons are disabled and "Stay signed in" does nothing', async () => {
    mockSwitch.mockReturnValue(new Promise(() => {}));
    await renderChoice();
    expect(screen.getByRole('button', { name: STAY })).toBeEnabled();
    expect(screen.getByRole('button', { name: SWITCH })).toBeEnabled();
    fireEvent.press(screen.getByRole('button', { name: SWITCH }));
    expect(screen.getByRole('button', { name: STAY })).toBeDisabled();
    expect(screen.getByRole('button', { name: SWITCH })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: STAY }));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSwitch).toHaveBeenCalledTimes(1);
  });

  it('S-10 / AJ-7: the link\'s code is never rendered, labelled or announced', async () => {
    mockSwitch.mockImplementation(async () => {
      setAuth('invalid');
      return false;
    });
    const view = await renderChoice();
    expect(JSON.stringify(screen.toJSON())).not.toContain(HASH);
    fireEvent.press(screen.getByRole('button', { name: SWITCH }));
    expect(await screen.findByText(INVALID)).toBeOnTheScreen();
    expect(JSON.stringify(screen.toJSON())).not.toContain(HASH);
    view.unmount();
    setAuth('idle');
    await renderChoice();
    fireEvent.press(screen.getByRole('button', { name: STAY }));
    expect(JSON.stringify(screen.toJSON())).not.toContain(HASH);
    expect(announceSpy).toHaveBeenCalled();
    for (const call of announceSpy.mock.calls) expect(JSON.stringify(call)).not.toContain(HASH);
  });

  it('a choice still shows when an earlier link left the invalid state behind', async () => {
    setAuth('invalid');
    await renderChoice();
    expect(screen.queryByText(INVALID)).toBeNull();
  });

  it('AJ-1: the heading has the header role, in the choice and in the set-password form', async () => {
    await renderChoice();
    expect(screen.getByRole('header', { name: 'Reset your password' })).toBeOnTheScreen();
    mockSwitch.mockImplementation(async () => {
      setAuth('ready');
      return true;
    });
    fireEvent.press(screen.getByRole('button', { name: SWITCH }));
    expect(await screen.findByPlaceholderText('New password')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Reset your password' })).toBeOnTheScreen();
  });

  it('AJ-4 / AJ-5: the message is plain text (not an alert) and is announced exactly once, word for word', async () => {
    await renderChoice();
    expect(screen.getByText(AL1).props.accessibilityRole).not.toBe('alert');
    screen.rerender(<RecoveryScreen />);
    expect(screen.getByText(AL1)).toBeOnTheScreen();
    expect(announceSpy.mock.calls).toEqual([[AL1]]);
  });
});
