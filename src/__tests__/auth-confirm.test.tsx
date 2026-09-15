/**
 * auth-confirm.test.tsx — the mobile email-confirmation route (`/auth/confirm`).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import ConfirmScreen from '@/app/auth/confirm';

const HASH = 'd'.repeat(64);
const mockVerifyAuthLink = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, unknown> = {};

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
  useAuth: () => ({ verifyAuthLink: (...a: unknown[]) => mockVerifyAuthLink(...a), recovery: { stage: 'idle', sessionFromLink: false } }),
}));


beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
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
