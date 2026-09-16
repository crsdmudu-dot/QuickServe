/**
 * auth-link-remount.test.tsx — the successful-verification remount defect.
 *
 * WHY THIS HARNESS EXISTS. `src/__tests__/auth-confirm.test.tsx` mocks `router.replace` as a spy
 * that does nothing, so the screen it renders never remounts and the suite passed while the real
 * journey failed. On 2026-09-15 a physical iPhone confirmed a real link: the gateway logged one
 * `POST /auth/v1/verify` with status 200 and GoTrue logged `Login`, yet the app displayed
 * "This link is invalid or has expired.".
 *
 * Cause: `router.replace('/auth/confirm')` ran BEFORE the verification resolved. Expo Router's
 * replace gives the route a NEW KEY (see `src/components/auth/auth-link-bridge.tsx` header), so the
 * screen remounted with its parameters already stripped. The fresh instance derived `invalid` from
 * the absent parameters, and the original instance's `active` guard discarded the success.
 *
 * The harness below models the installed router's real semantics rather than a no-op spy:
 *   - `replace(path)` to the same route => NEW route key (remount) and cleared params
 *   - `setParams(patch)`  => SAME route key (no remount), shallow merge, `undefined` retained
 * That shallow-merge behaviour is documented in the installed
 * `node_modules/expo-router/build/hooks/useLocalSearchParams.js`, and the key preservation is
 * visible in the vendored `react-navigation/routers/BaseRouter.js` SET_PARAMS reducer, which
 * spreads the existing route (`{ ...r, params: ... }`) instead of creating a new one.
 *
 * No real token is used anywhere: the fixtures are synthetic and assembled locally.
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React, { useSyncExternalStore } from 'react';

// ── router harness ────────────────────────────────────────────────────────────────────────────
type Params = Record<string, unknown>;
let hRouteKey = 0;
let mockRouteParams: Params = {};
// Minimal external store: the harness subscribes to it, so a navigation that happens inside the
// screen's own effect still schedules a re-render. `useSyncExternalStore` re-checks the snapshot
// after subscribing, which covers the case where the store changed before the subscription existed.
let hVersion = 0;
const hListeners = new Set<() => void>();
const hSubscribe = (listener: () => void) => {
  hListeners.add(listener);
  return () => {
    hListeners.delete(listener);
  };
};
const hGetSnapshot = () => hVersion;
const hNotify = () => {
  hVersion += 1;
  hListeners.forEach((listener) => listener());
};
const hReplaceCalls: string[] = [];
const hSetParamsCalls: Params[] = [];

function hResetRouter(initial: Params) {
  hRouteKey = 0;
  hVersion += 1;
  mockRouteParams = { ...initial };
  hReplaceCalls.length = 0;
  hSetParamsCalls.length = 0;
}

const AUTH_PATHS = new Set(['/auth/confirm', '/auth/recovery']);

const mockRouterHarness = {
  replace(href: string) {
    hReplaceCalls.push(href);
    // Real semantics: a replace onto the same route produces a NEW route key, so the screen
    // remounts, and the new URL carries no parameters.
    if (AUTH_PATHS.has(href)) {
      hRouteKey += 1;
      mockRouteParams = {};
      hNotify();
    }
  },
  setParams(patch: Params) {
    hSetParamsCalls.push({ ...patch });
    // Real semantics: shallow merge onto the CURRENT route. The key is unchanged, so no remount.
    mockRouteParams = { ...mockRouteParams, ...patch };
    hNotify();
  },
  push: jest.fn(),
  back: jest.fn(),
};

jest.mock('expo-router', () => ({
  router: {
    replace: (href: string) => mockRouterHarness.replace(href),
    setParams: (patch: Record<string, unknown>) => mockRouterHarness.setParams(patch),
    push: (...a: unknown[]) => mockRouterHarness.push(...a),
    back: () => mockRouterHarness.back(),
  },
  useLocalSearchParams: () => mockRouteParams,
  // The root navigator is ready in these suites; cold-launch readiness is covered in
  // src/__tests__/auth-link-cold-launch.test.tsx.
  useNavigationContainerRef: () => ({ isReady: () => true, addListener: () => () => {} }),
}));
jest.mock('expo-router/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

/**
 * Re-renders on every navigation and keys the screen by route key, so a new key remounts it.
 * The notifier is registered DURING RENDER, not in an effect: React runs child effects before
 * parent effects, so an effect-based registration would still be null when the screen's own
 * intake effect navigates, and the remount under test would never be reproduced.
 */
function Harness({ Screen }: { Screen: React.ComponentType }) {
  useSyncExternalStore(hSubscribe, hGetSnapshot, hGetSnapshot);
  return <Screen key={hRouteKey} />;
}

// ── auth context mock ─────────────────────────────────────────────────────────────────────────
const mockVerifyAuthLink = jest.fn();
let mockRecoveryStage: 'idle' | 'verifying' | 'ready' | 'updating' | 'done' | 'invalid' = 'idle';

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    verifyAuthLink: (...a: unknown[]) => mockVerifyAuthLink(...a),
    recovery: { stage: mockRecoveryStage, sessionFromLink: false },
    authError: null,
    session: null,
    completePasswordReset: jest.fn(),
    abandonRecovery: jest.fn(),
  }),
}));

const TOKEN = 'a'.repeat(48); // synthetic, never a real token hash
const INVALID_TEXT = 'This link is invalid or has expired.';

beforeEach(() => {
  jest.clearAllMocks();
  mockRecoveryStage = 'idle';
});

// ── confirmation route ────────────────────────────────────────────────────────────────────────
describe('confirmation route survives parameter stripping', () => {
  async function renderConfirm() {
    const ConfirmScreen = (await import('@/app/auth/confirm')).default;
    return render(<Harness Screen={ConfirmScreen} />);
  }

  it('a successful verification never renders the invalid-link state', async () => {
    hResetRouter({ token_hash: TOKEN, type: 'signup' });
    mockVerifyAuthLink.mockResolvedValue(true);
    await renderConfirm();
    await waitFor(() => expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hReplaceCalls).toContain('/'));
    expect(screen.queryByText(INVALID_TEXT)).toBeNull();
    // The screen must never have been remounted: a new route key is the defect itself.
    expect(hRouteKey).toBe(0);
  });

  it('reaches the root dispatcher so the customer lands on their home', async () => {
    hResetRouter({ token_hash: TOKEN, type: 'signup' });
    mockVerifyAuthLink.mockResolvedValue(true);
    await renderConfirm();
    await waitFor(() => expect(hReplaceCalls).toContain('/'));
  });

  it('removes the sensitive parameters BEFORE the verification promise resolves', async () => {
    hResetRouter({ token_hash: TOKEN, type: 'signup' });
    let release!: (ok: boolean) => void;
    mockVerifyAuthLink.mockReturnValue(
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
    );
    await renderConfirm();
    await waitFor(() => expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1));
    // still in flight: the token must already be gone from router-visible state
    expect(mockRouteParams.token_hash).toBeUndefined();
    expect(mockRouteParams.type).toBeUndefined();
    expect(JSON.stringify(mockRouteParams)).not.toContain(TOKEN);
    expect(hRouteKey).toBe(0); // stripped without remounting
    expect(hSetParamsCalls.length).toBeGreaterThan(0);
    await act(async () => {
      release(true);
    });
    await waitFor(() => expect(hReplaceCalls).toContain('/'));
  });

  it('verifies exactly once even though stripping re-renders the screen', async () => {
    hResetRouter({ token_hash: TOKEN, type: 'signup' });
    mockVerifyAuthLink.mockResolvedValue(true);
    await renderConfirm();
    await waitFor(() => expect(hReplaceCalls).toContain('/'));
    expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1);
  });

  it('still fails closed when the token is rejected', async () => {
    hResetRouter({ token_hash: TOKEN, type: 'signup' });
    mockVerifyAuthLink.mockResolvedValue(false);
    await renderConfirm();
    expect(await screen.findByText(INVALID_TEXT)).toBeOnTheScreen();
    expect(hReplaceCalls).not.toContain('/');
  });

  it('still fails closed and makes no request without parameters', async () => {
    hResetRouter({});
    await renderConfirm();
    expect(await screen.findByText(INVALID_TEXT)).toBeOnTheScreen();
    expect(mockVerifyAuthLink).not.toHaveBeenCalled();
  });
});

// ── recovery route ────────────────────────────────────────────────────────────────────────────
describe('recovery route survives parameter stripping', () => {
  async function renderRecovery() {
    const RecoveryScreen = (await import('@/app/auth/recovery')).default;
    return render(<Harness Screen={RecoveryScreen} />);
  }

  it('a successful verification exposes the password form, never the invalid state', async () => {
    hResetRouter({ token_hash: TOKEN, type: 'recovery' });
    mockVerifyAuthLink.mockImplementation(async () => {
      mockRecoveryStage = 'verifying';
      await Promise.resolve();
      mockRecoveryStage = 'ready';
      hNotify();
      return true;
    });
    await renderRecovery();
    await waitFor(() => expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByText('Set new password')).not.toBeNull());
    expect(screen.queryByText(INVALID_TEXT)).toBeNull();
  });

  it('stays on the recovery screen and is not routed away before a password is entered', async () => {
    hResetRouter({ token_hash: TOKEN, type: 'recovery' });
    mockVerifyAuthLink.mockImplementation(async () => {
      mockRecoveryStage = 'ready';
      hNotify();
      return true;
    });
    await renderRecovery();
    await waitFor(() => expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1));
    expect(hReplaceCalls).not.toContain('/');
    expect(hReplaceCalls).not.toContain('/signin');
  });

  it('removes the sensitive parameters immediately', async () => {
    hResetRouter({ token_hash: TOKEN, type: 'recovery' });
    mockVerifyAuthLink.mockResolvedValue(true);
    await renderRecovery();
    await waitFor(() => expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1));
    expect(mockRouteParams.token_hash).toBeUndefined();
    expect(JSON.stringify(mockRouteParams)).not.toContain(TOKEN);
    expect(hRouteKey).toBe(0); // stripped without remounting
  });

  it('still fails closed with no parameters', async () => {
    hResetRouter({});
    await renderRecovery();
    expect(await screen.findByText(INVALID_TEXT)).toBeOnTheScreen();
    expect(mockVerifyAuthLink).not.toHaveBeenCalled();
  });
});

// ── mutation guards on the production source ──────────────────────────────────────────────────
describe('source guards that keep the defect from returning', () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
  const CONFIRM = 'src/app/auth/confirm.tsx';
  const RECOVERY = 'src/app/auth/recovery.tsx';

  it('neither route uses a self-replace as its primary strip', () => {
    // A self-replace remounts the screen, which is the defect this suite exists for. It survives
    // in ONE place only: the catch that handles a setParams failure, where the screen is being
    // failed closed on purpose and nothing is verified afterwards. See
    // src/__tests__/auth-link-cold-launch.test.tsx for that path.
    for (const file of [CONFIRM, RECOVERY]) {
      const text = read(file);
      for (const match of text.matchAll(/router\s*\.\s*replace\(\s*['"]\/auth\/(?:confirm|recovery)['"]\s*\)/g)) {
        const before = text.slice(Math.max(0, match.index - 900), match.index);
        expect(before).toMatch(/catch\s*\{/);
      }
      expect(text).toMatch(/router\s*\.\s*setParams\(/);
    }
  });

  it('both routes strip the sensitive parameters with setParams', () => {
    for (const file of [CONFIRM, RECOVERY]) {
      const text = read(file);
      expect(text).toMatch(/router\s*\.\s*setParams\(/);
      expect(text).toMatch(/token_hash:\s*undefined/);
      expect(text).toMatch(/type:\s*undefined/);
    }
  });

  it('both routes guard the verification so it cannot run twice', () => {
    for (const file of [CONFIRM, RECOVERY]) {
      const text = read(file);
      expect(text).toMatch(/handled\s*\.\s*current/);
    }
  });

  it('the confirmation route still hands off to the root dispatcher on success', () => {
    expect(read(CONFIRM)).toMatch(/router\s*\.\s*replace\(\s*['"]\/['"]\s*\)/);
  });

  it('the recovery route only reaches the root dispatcher after the password is set', () => {
    const text = read(RECOVERY);
    // A hand-off to "/" is legitimate once the reset completes, and only then.
    expect(text).toMatch(/stage === 'done'[\s\S]{0,60}router\s*\.\s*replace\(\s*['"]\/['"]\s*\)/);
    // The intake effect must never hand off to the root dispatcher itself.
    const intake = text.slice(text.indexOf('Link intake'), text.indexOf('linkInvalid'));
    expect(intake).not.toMatch(/router\s*\.\s*replace\(\s*['"]\/['"]\s*\)/);
  });

  it('no real token material is embedded in these routes', () => {
    for (const file of [CONFIRM, RECOVERY]) {
      const text = read(file);
      expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
      expect(text).not.toMatch(/\bsb_secret_|\bsbp_[0-9a-f]{40}\b/);
      // Control characters, checked by code point so no escape can be corrupted in transit.
      const control = [...text].filter((ch) => {
        const code = ch.charCodeAt(0);
        return code < 9 || (code > 13 && code < 32) || code === 127;
      });
      expect(control).toHaveLength(0);
    }
  });
});
