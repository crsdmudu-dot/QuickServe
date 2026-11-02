/**
 * auth-confirm.test.tsx — the mobile email-confirmation route (`/auth/confirm`).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import ConfirmScreen from '@/app/auth/confirm';

const HASH = 'd'.repeat(64);
// The approved wording (AL-WORDING), byte for byte.
const AL1 = "You're already signed in on this phone. To use this link, sign out first.";
const STAY = 'Stay signed in';
const SWITCH = 'Sign out and continue';
const INVALID = 'This link is invalid or has expired.';
const mockVerifyAuthLink = jest.fn();
const mockSwitch = jest.fn();
const mockAbandonRecovery = jest.fn();
const mockSignOut = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, unknown> = {};
let mockRecoveryStage = 'idle';

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
jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    verifyAuthLink: (...a: unknown[]) => mockVerifyAuthLink(...a),
    signOutAndVerifyAuthLink: (...a: unknown[]) => mockSwitch(...a),
    abandonRecovery: (...a: unknown[]) => mockAbandonRecovery(...a),
    signOut: (...a: unknown[]) => mockSignOut(...a),
    recovery: { stage: mockRecoveryStage, sessionFromLink: mockRecoveryStage === 'ready' },
  }),
}));


beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockRecoveryStage = 'idle';
});

describe('ConfirmScreen', () => {
  it('verifies a well-formed signup link once with type=signup, strips the params, then hands off to "/"', async () => {
    mockParams = { token_hash: HASH, type: 'signup' };
    mockVerifyAuthLink.mockResolvedValue(true);
    render(<ConfirmScreen />);
    await waitFor(() => expect(mockVerifyAuthLink).toHaveBeenCalledWith({ tokenHash: HASH, type: 'signup' }));
    expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1);
    // The secret is stripped with setParams, which keeps the route key so this screen is not
    // remounted mid-verification. See src/__tests__/auth-link-remount.test.tsx.
    expect(mockSetParams).toHaveBeenCalledWith({ token_hash: undefined, type: undefined });
    expect(mockReplace).not.toHaveBeenCalledWith('/auth/confirm');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('shows the safe error state for invalid / expired / reused links and offers sign in', async () => {
    mockParams = { token_hash: HASH, type: 'signup' };
    mockVerifyAuthLink.mockResolvedValue(false);
    render(<ConfirmScreen />);
    expect(await screen.findByText('This link is invalid or has expired.')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Go to sign in'));
    expect(mockReplace).toHaveBeenCalledWith('/signin');
    expect(mockReplace).not.toHaveBeenCalledWith('/');
  });

  it('performs no auth request for missing / malformed / wrong-type parameters', async () => {
    for (const p of [{}, { token_hash: HASH, type: 'recovery' }, { token_hash: 'nope', type: 'signup' }]) {
      mockParams = p;
      const view = render(<ConfirmScreen />);
      expect(await screen.findByText('This link is invalid or has expired.')).toBeOnTheScreen();
      expect(mockVerifyAuthLink).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it('on web it renders the HTTPS bridge (fragment-driven), ignores query parameters, and performs no auth request', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      mockParams = { token_hash: HASH, type: 'signup' }; // query params must NOT be honoured on web
      render(<ConfirmScreen />);
      expect(await screen.findByText('This link is invalid or has expired.')).toBeOnTheScreen();
      await act(async () => {});
      expect(mockVerifyAuthLink).not.toHaveBeenCalled();
      expect(screen.queryByText(/Continue in browser/i)).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});

describe('ConfirmScreen — this phone is already signed in (FX-AL)', () => {
  let announceSpy: jest.SpyInstance;

  beforeEach(() => {
    mockParams = { token_hash: HASH, type: 'signup' };
    mockVerifyAuthLink.mockResolvedValue('signed-in');
    mockSwitch.mockResolvedValue(true);
    announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });
  afterEach(() => announceSpy.mockRestore());

  async function renderChoice() {
    const view = render(<ConfirmScreen />);
    expect(await screen.findByText(AL1)).toBeOnTheScreen();
    return view;
  }

  it('S-1: shows the choice only after the parameters were stripped, and does not hand off to "/"', async () => {
    await renderChoice();
    expect(mockSetParams).toHaveBeenCalledWith({ token_hash: undefined, type: undefined });
    expect(mockSetParams.mock.invocationCallOrder[0]).toBeLessThan(mockVerifyAuthLink.mock.invocationCallOrder[0]);
    expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSwitch).not.toHaveBeenCalled();
    expect(screen.queryByText(INVALID)).toBeNull();
    expect(screen.queryByText('Confirming your email…')).toBeNull();
  });

  it('S-2 / S-11: "Stay signed in" goes home and calls nothing in the auth context', async () => {
    await renderChoice();
    fireEvent.press(screen.getByRole('button', { name: STAY }));
    expect(mockReplace.mock.calls).toEqual([['/']]);
    expect(mockSwitch).not.toHaveBeenCalled();
    expect(mockAbandonRecovery).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1); // only the first check, which used nothing
  });

  it('S-3: "Sign out and continue" calls the switch once with the parsed link, then goes to "/" on success', async () => {
    await renderChoice();
    fireEvent.press(screen.getByRole('button', { name: SWITCH }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockSwitch.mock.calls).toEqual([[{ tokenHash: HASH, type: 'signup' }]]);
    expect(screen.getByText('Email confirmed. Taking you to the app…')).toBeOnTheScreen();
  });

  it('S-3: "Sign out and continue" shows today\'s invalid-link state when it fails', async () => {
    mockSwitch.mockResolvedValue(false);
    await renderChoice();
    fireEvent.press(screen.getByRole('button', { name: SWITCH }));
    expect(await screen.findByText(INVALID)).toBeOnTheScreen();
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

  it('S-6 / AJ-2 / AJ-6: exactly two buttons, "Stay signed in" first and primary, no hints', async () => {
    await renderChoice();
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([STAY, SWITCH]);
    expect(buttons[0]).toHaveStyle({ borderWidth: 0 }); // primary (filled)
    expect(buttons[1]).toHaveStyle({ borderWidth: 1 }); // secondary (outlined)
    for (const b of buttons) expect(b.props.accessibilityHint).toBeUndefined();
  });

  it('S-7: leaving the screen while the choice shows uses nothing and signs nothing out', async () => {
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
      render(<ConfirmScreen />);
      expect(await screen.findByText(AL1)).toBeOnTheScreen();
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      expect(screen.getByText(AL1)).toBeOnTheScreen();
      expect(mockSwitch).not.toHaveBeenCalled();
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
    mockSwitch.mockResolvedValue(false);
    const view = await renderChoice();
    expect(JSON.stringify(screen.toJSON())).not.toContain(HASH);
    fireEvent.press(screen.getByRole('button', { name: SWITCH }));
    expect(await screen.findByText(INVALID)).toBeOnTheScreen();
    expect(JSON.stringify(screen.toJSON())).not.toContain(HASH);
    view.unmount();
    await renderChoice();
    fireEvent.press(screen.getByRole('button', { name: STAY }));
    expect(JSON.stringify(screen.toJSON())).not.toContain(HASH);
    expect(announceSpy).toHaveBeenCalled();
    for (const call of announceSpy.mock.calls) expect(JSON.stringify(call)).not.toContain(HASH);
  });

  it('S-12: during another link\'s password reset, a confirmation link still asks, and "Stay signed in" changes nothing', async () => {
    mockRecoveryStage = 'ready';
    await renderChoice();
    fireEvent.press(screen.getByRole('button', { name: STAY }));
    expect(mockSwitch).not.toHaveBeenCalled();
    expect(mockAbandonRecovery).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    // Where the app then lands is recorded in the FX-AL notes: "/" dispatches by role while the reset stays active.
    expect(mockReplace.mock.calls).toEqual([['/']]);
  });

  it('AJ-1: the heading has the header role, in the choice and in the invalid state', async () => {
    await renderChoice();
    expect(screen.getByRole('header', { name: 'Confirm your email' })).toBeOnTheScreen();
    mockSwitch.mockResolvedValue(false);
    fireEvent.press(screen.getByRole('button', { name: SWITCH }));
    expect(await screen.findByText(INVALID)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Confirm your email' })).toBeOnTheScreen();
  });

  it('AJ-4 / AJ-5: the message is plain text (not an alert) and is announced exactly once, word for word', async () => {
    await renderChoice();
    expect(screen.getByText(AL1).props.accessibilityRole).not.toBe('alert');
    screen.rerender(<ConfirmScreen />);
    expect(screen.getByText(AL1)).toBeOnTheScreen();
    expect(announceSpy.mock.calls).toEqual([[AL1]]);
  });
});
