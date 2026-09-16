/**
 * support-access.test.tsx — the standing requirement that a user who needs help is offered a route
 * to the verified support mailbox.
 *
 * Covered here: the terminal and blocking mobile surfaces (Auth invalid states, the root not-found
 * screen) and the two profile screens that are the discoverable entry point. The global error
 * boundary is covered in src/components/error-boundary.test.tsx and the web Auth bridge in
 * src/__tests__/auth-link-bridge.test.tsx, next to their existing suites.
 *
 * The Auth screens are the security-critical ones: they render on a route that arrived carrying a
 * one-time token, so the assertions below require the support URL to be the SAME constant string
 * everywhere. A link that interpolated the route, the params or an error description would fail.
 */

// ── Mocks ───────────────────────────────────────────────────────────────────
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
    setParams: jest.fn(),
    back: jest.fn(),
  },
  useLocalSearchParams: () => mockParams,
  useNavigationContainerRef: () => ({ isReady: () => true, addListener: () => () => {} }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-router/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

const mockVerifyAuthLink = jest.fn();
const mockSignOut = jest.fn();
let mockRecoveryStage = 'idle';
jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    verifyAuthLink: (...a: unknown[]) => mockVerifyAuthLink(...a),
    requestPasswordReset: jest.fn().mockResolvedValue({ ok: true }),
    completePasswordReset: jest.fn(),
    abandonRecovery: jest.fn(),
    signOut: (...a: unknown[]) => mockSignOut(...a),
    authError: null,
    session: { user: { id: 'u-1', email: 'someone@example.com' } },
    recovery: { stage: mockRecoveryStage, sessionFromLink: false },
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));
jest.mock('@/lib/saved-addresses', () => ({ getMySavedAddresses: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/providers', () => ({
  getProviderProfile: jest.fn().mockResolvedValue(null),
  updateMyProviderProfile: jest.fn(),
}));
jest.mock('@/lib/reviews', () => ({
  getProviderRatingSummary: jest.fn().mockResolvedValue(null),
  getProviderReviews: jest.fn().mockResolvedValue([]),
  getProviderQualityFlags: jest.fn().mockResolvedValue(null),
  getProviderReviewStats: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/earnings', () => ({
  getProviderEarningsSummary: jest.fn().mockResolvedValue(null),
  getProviderPayouts: jest.fn().mockResolvedValue([]),
  getProviderEarnings: jest.fn().mockResolvedValue(null),
  getMyPayoutAccount: jest.fn().mockResolvedValue(null),
}));

// ── Imports ─────────────────────────────────────────────────────────────────
import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ConfirmScreen from '@/app/auth/confirm';
import RecoveryScreen from '@/app/auth/recovery';
import NotFoundScreen from '@/app/+not-found';
import CustomerProfileScreen from '@/app/(customer)/profile';
import ProviderProfileScreen from '@/app/provider/(tabs)/profile';
import { SUPPORT_EMAIL, buildSupportMailtoUrl } from '@/lib/support';

const HASH = 'a'.repeat(64);
const SUPPORT_URL = 'mailto:support@hiredcorp.co.ke';

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockRecoveryStage = 'idle';
});

/** Press the support link and return the single URL it opened. */
async function pressSupportAndCaptureUrl(): Promise<string> {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
  fireEvent.press(screen.getByRole('link'));
  await waitFor(() => expect(openURL).toHaveBeenCalledTimes(1));
  const url = openURL.mock.calls[0][0] as string;
  openURL.mockRestore();
  return url;
}

// ---------------------------------------------------------------------------
// Auth confirmation — invalid / expired link
// ---------------------------------------------------------------------------

describe('/auth/confirm invalid state', () => {
  it('offers the support address', async () => {
    mockParams = { token_hash: HASH, type: 'signup' };
    mockVerifyAuthLink.mockResolvedValue(false);
    render(<ConfirmScreen />);
    await waitFor(() => expect(screen.getByText(SUPPORT_EMAIL)).toBeOnTheScreen());
  });

  it('keeps its existing sign-in action', async () => {
    mockParams = { token_hash: HASH, type: 'signup' };
    mockVerifyAuthLink.mockResolvedValue(false);
    render(<ConfirmScreen />);
    await waitFor(() => expect(screen.getByText('Go to sign in')).toBeOnTheScreen());
  });

  it('opens the constant support URL, carrying no token, route or param', async () => {
    mockParams = { token_hash: HASH, type: 'signup' };
    mockVerifyAuthLink.mockResolvedValue(false);
    render(<ConfirmScreen />);
    await waitFor(() => expect(screen.getByText(SUPPORT_EMAIL)).toBeOnTheScreen());

    const url = await pressSupportAndCaptureUrl();
    expect(url).toBe(SUPPORT_URL);
    expect(url).toBe(buildSupportMailtoUrl());
    expect(url).not.toContain(HASH);
    expect(url).not.toMatch(/token|confirm|signup|type=|[?#&]/i);
  });
});

// ---------------------------------------------------------------------------
// Auth recovery — invalid / expired link
// ---------------------------------------------------------------------------

describe('/auth/recovery invalid state', () => {
  it('offers the support address', async () => {
    mockRecoveryStage = 'invalid';
    render(<RecoveryScreen />);
    await waitFor(() => expect(screen.getByText(SUPPORT_EMAIL)).toBeOnTheScreen());
  });

  it('keeps its existing request-a-new-link action', async () => {
    mockRecoveryStage = 'invalid';
    render(<RecoveryScreen />);
    await waitFor(() => expect(screen.getByText('Request a new link')).toBeOnTheScreen());
  });

  it('opens the constant support URL, carrying no token, route or param', async () => {
    mockRecoveryStage = 'invalid';
    render(<RecoveryScreen />);
    await waitFor(() => expect(screen.getByText(SUPPORT_EMAIL)).toBeOnTheScreen());

    const url = await pressSupportAndCaptureUrl();
    expect(url).toBe(SUPPORT_URL);
    expect(url).not.toMatch(/token|recovery|type=|[?#&]/i);
  });
});

// ---------------------------------------------------------------------------
// Root not-found
// ---------------------------------------------------------------------------

describe('root not-found screen', () => {
  it('explains the problem and offers the support address', () => {
    render(<NotFoundScreen />);
    expect(screen.getByText('This screen does not exist.')).toBeOnTheScreen();
    expect(screen.getByText(SUPPORT_EMAIL)).toBeOnTheScreen();
  });

  it('offers a way back into the app', () => {
    render(<NotFoundScreen />);
    expect(screen.getByText('Go to home')).toBeOnTheScreen();
  });

  it('opens the constant support URL', async () => {
    render(<NotFoundScreen />);
    expect(await pressSupportAndCaptureUrl()).toBe(SUPPORT_URL);
  });
});

// ---------------------------------------------------------------------------
// Profile surfaces — the discoverable entry point for help
// ---------------------------------------------------------------------------

describe('customer profile', () => {
  it('offers the support address', async () => {
    render(<CustomerProfileScreen />);
    await waitFor(() => expect(screen.getByText(SUPPORT_EMAIL)).toBeOnTheScreen());
  });

  it('keeps its existing entries', async () => {
    render(<CustomerProfileScreen />);
    await waitFor(() => expect(screen.getByText('Wallet')).toBeOnTheScreen());
    expect(screen.getByText('Saved addresses')).toBeOnTheScreen();
    expect(screen.getByText('Trust & Safety')).toBeOnTheScreen();
  });
});

describe('provider profile', () => {
  it('offers the support address', async () => {
    render(<ProviderProfileScreen />);
    await waitFor(() => expect(screen.getByText(SUPPORT_EMAIL)).toBeOnTheScreen());
  });

  it('keeps its existing entries', async () => {
    render(<ProviderProfileScreen />);
    await waitFor(() => expect(screen.getByText('Quality Dashboard')).toBeOnTheScreen());
    expect(screen.getByText('Code of Conduct')).toBeOnTheScreen();
  });
});

// ---------------------------------------------------------------------------
// One constant, everywhere
// ---------------------------------------------------------------------------

describe('the support URL is a single constant', () => {
  it('is identical on every surface that offers it', () => {
    expect(buildSupportMailtoUrl()).toBe(SUPPORT_URL);
    expect(`mailto:${SUPPORT_EMAIL}`).toBe(SUPPORT_URL);
  });
});
