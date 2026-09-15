/**
 * auth-link-cold-launch.test.tsx — the cold-launch readiness regression.
 *
 * On 2026-09-15 a real confirmation link opened the installed app from a cold start and the app
 * showed the global error boundary. The QA gateway logged ZERO `POST /auth/v1/verify` in the
 * window, so nothing was consumed: the screen threw before it could verify.
 *
 * Cause, proven against the installed expo-router 56.2.11:
 *   - `router.setParams` calls `store.assertIsReady()` first, which throws
 *     "Attempted to navigate before mounting the Root Layout component" while the root navigator
 *     is not ready, and then calls `(store.navigationRef?.current?.setParams)(params)` where the
 *     optional chaining guards the lookup but NOT the call.
 *   - `router.replace` takes a different path: `linkTo` pushes a ROUTER_LINK action onto
 *     `routingQueue`, with no readiness assertion, so it is safe to call before the navigator is
 *     ready and is drained once the ref exists.
 * A deep-link cold launch runs the screen's first effect before the container reports ready, so
 * the strip threw on the line immediately before verification.
 *
 * Readiness primitive: `useNavigationContainerRef()` returns `store.navigationRef`, the very
 * object `assertIsReady()` interrogates, and its `isReady()` is the identical predicate
 * (`current != null && current.isReady()`). Its `addListener` is safe before mount: it buffers the
 * callback and the `current` setter replays buffered listeners when the container mounts.
 *
 * Security posture under test: the token is NEVER submitted before the sensitive parameters have
 * actually been removed, and a failed strip must not be followed by verification.
 *
 * All tokens here are synthetic.
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React, { useSyncExternalStore } from 'react';

// ── harness state ─────────────────────────────────────────────────────────────────────────────
type Params = Record<string, unknown>;
let mockRouteParams: Params = {};
let mockNavReady = false;
let mockSetParamsThrowsWhenReady = false;
let hRouteKey = 0;
const hReplaceCalls: string[] = [];
const hSetParamsCalls: Params[] = [];
const hSetParamsThrows: string[] = [];
const hListeners = new Set<() => void>();

let hVersion = 0;
const hStoreListeners = new Set<() => void>();
const hSubscribe = (l: () => void) => {
  hStoreListeners.add(l);
  return () => {
    hStoreListeners.delete(l);
  };
};
const hSnapshot = () => hVersion;
const hNotify = () => {
  hVersion += 1;
  hStoreListeners.forEach((l) => l());
};

function hReset(initial: Params, ready: boolean) {
  mockRouteParams = { ...initial };
  mockNavReady = ready;
  mockSetParamsThrowsWhenReady = false;
  hRouteKey = 0;
  hVersion += 1;
  hReplaceCalls.length = 0;
  hSetParamsCalls.length = 0;
  hSetParamsThrows.length = 0;
  hListeners.clear();
}

/** Flip the navigator to ready and fire the buffered 'state' listeners, as the real ref does. */
function hBecomeReady() {
  mockNavReady = true;
  hListeners.forEach((l) => l());
  hNotify();
}

const AUTH_PATHS = new Set(['/auth/confirm', '/auth/recovery']);

const mockRouterHarness = {
  // Mirrors the installed implementation: assertIsReady() throws while the navigator is unready.
  setParams(patch: Params) {
    if (!mockNavReady) {
      hSetParamsThrows.push('not-ready');
      throw new Error('Attempted to navigate before mounting the Root Layout component.');
    }
    if (mockSetParamsThrowsWhenReady) {
      hSetParamsThrows.push('ready-but-failed');
      throw new TypeError('store.navigationRef.current.setParams is not a function');
    }
    hSetParamsCalls.push({ ...patch });
    mockRouteParams = { ...mockRouteParams, ...patch };
    hNotify();
  },
  // Mirrors linkTo: queued, never asserts readiness, and a same-route replace gives a new key.
  replace(href: string) {
    hReplaceCalls.push(href);
    if (AUTH_PATHS.has(href)) {
      hRouteKey += 1;
      mockRouteParams = {};
      hNotify();
    }
  },
  push: jest.fn(),
  back: jest.fn(),
};

const mockNavContainerRef = {
  isReady: () => mockNavReady,
  addListener: (_event: string, cb: () => void) => {
    hListeners.add(cb);
    return () => {
      hListeners.delete(cb);
    };
  },
};

jest.mock('expo-router', () => ({
  router: {
    setParams: (p: Record<string, unknown>) => mockRouterHarness.setParams(p),
    replace: (h: string) => mockRouterHarness.replace(h),
    push: (...a: unknown[]) => mockRouterHarness.push(...a),
    back: () => mockRouterHarness.back(),
  },
  useLocalSearchParams: () => mockRouteParams,
  useNavigationContainerRef: () => mockNavContainerRef,
}));
jest.mock('expo-router/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

/** Keys the screen by route key so a replace remounts it, and re-renders on any harness change. */
function Harness({ Screen }: { Screen: React.ComponentType }) {
  useSyncExternalStore(hSubscribe, hSnapshot, hSnapshot);
  return <Screen key={hRouteKey} />;
}

// ── auth context ──────────────────────────────────────────────────────────────────────────────
const mockVerifyAuthLink = jest.fn();
let mockRecoveryStage: 'idle' | 'verifying' | 'ready' | 'updating' | 'done' | 'invalid' = 'idle';

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    // A fresh closure each render, exactly like the real provider.
    verifyAuthLink: (...a: unknown[]) => mockVerifyAuthLink(...a),
    recovery: { stage: mockRecoveryStage, sessionFromLink: false },
    authError: null,
    session: null,
    completePasswordReset: jest.fn(),
    abandonRecovery: jest.fn(),
  }),
}));

const TOKEN = 'b'.repeat(48);
const INVALID = 'This link is invalid or has expired.';

beforeEach(() => {
  jest.clearAllMocks();
  mockRecoveryStage = 'idle';
});

async function renderConfirm() {
  const Screen = (await import('@/app/auth/confirm')).default;
  return render(<Harness Screen={Screen} />);
}
async function renderRecovery() {
  const Screen = (await import('@/app/auth/recovery')).default;
  return render(<Harness Screen={Screen} />);
}

// ── the shipped regression ────────────────────────────────────────────────────────────────────
describe('cold launch: the navigator is not ready on the first render', () => {
  it('does not strip, does not verify and does not throw while the navigator is unready', async () => {
    hReset({ token_hash: TOKEN, type: 'signup' }, false);
    mockVerifyAuthLink.mockResolvedValue(true);
    await renderConfirm();
    await act(async () => {
      await Promise.resolve();
    });
    expect(hSetParamsThrows).toHaveLength(0);
    expect(hSetParamsCalls).toHaveLength(0);
    expect(mockVerifyAuthLink).not.toHaveBeenCalled();
  });

  it('once ready it strips exactly once and verifies exactly once, in that order', async () => {
    hReset({ token_hash: TOKEN, type: 'signup' }, false);
    mockVerifyAuthLink.mockImplementation(async () => {
      // Verification must never begin while the token is still in router-visible state.
      expect(mockRouteParams.token_hash).toBeUndefined();
      return true;
    });
    await renderConfirm();
    expect(mockVerifyAuthLink).not.toHaveBeenCalled();
    await act(async () => {
      hBecomeReady();
    });
    await waitFor(() => expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1));
    expect(hSetParamsCalls).toHaveLength(1);
    expect(hRouteKey).toBe(0); // stripped without remounting
  });

  it('confirmation success reaches the root dispatcher', async () => {
    hReset({ token_hash: TOKEN, type: 'signup' }, false);
    mockVerifyAuthLink.mockResolvedValue(true);
    await renderConfirm();
    await act(async () => {
      hBecomeReady();
    });
    await waitFor(() => expect(hReplaceCalls).toContain('/'));
    expect(screen.queryByText(INVALID)).toBeNull();
  });

  it('re-renders and a changing provider closure cannot duplicate verification', async () => {
    hReset({ token_hash: TOKEN, type: 'signup' }, false);
    mockVerifyAuthLink.mockResolvedValue(true);
    await renderConfirm();
    await act(async () => {
      hBecomeReady();
    });
    await waitFor(() => expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1));
    await act(async () => {
      hNotify();
      hNotify();
    });
    expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1);
    expect(hSetParamsCalls).toHaveLength(1);
  });
});

// ── strip failure after readiness ─────────────────────────────────────────────────────────────
describe('a strip that fails despite readiness fails closed', () => {
  it('never verifies, strips through the queue-safe fallback, and shows the neutral state', async () => {
    hReset({ token_hash: TOKEN, type: 'signup' }, true);
    mockSetParamsThrowsWhenReady = true;
    mockVerifyAuthLink.mockResolvedValue(true);
    await renderConfirm();
    await act(async () => {
      await Promise.resolve();
    });
    expect(hSetParamsThrows).toContain('ready-but-failed');
    expect(mockVerifyAuthLink).not.toHaveBeenCalled();
    expect(hReplaceCalls).toContain('/auth/confirm'); // queue-safe fallback strip
    expect(mockRouteParams.token_hash).toBeUndefined();
    expect(JSON.stringify(mockRouteParams)).not.toContain(TOKEN);
    expect(await screen.findByText(INVALID)).toBeOnTheScreen();
    expect(hReplaceCalls).not.toContain('/');
  });

  it('the same fallback applies to recovery', async () => {
    hReset({ token_hash: TOKEN, type: 'recovery' }, true);
    mockSetParamsThrowsWhenReady = true;
    mockVerifyAuthLink.mockResolvedValue(true);
    await renderRecovery();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockVerifyAuthLink).not.toHaveBeenCalled();
    expect(hReplaceCalls).toContain('/auth/recovery');
    expect(JSON.stringify(mockRouteParams)).not.toContain(TOKEN);
    expect(await screen.findByText(INVALID)).toBeOnTheScreen();
  });
});

// ── recovery cold launch ──────────────────────────────────────────────────────────────────────
describe('recovery cold launch', () => {
  it('waits for readiness, then strips and verifies once, and stays for password entry', async () => {
    hReset({ token_hash: TOKEN, type: 'recovery' }, false);
    mockVerifyAuthLink.mockImplementation(async () => {
      expect(mockRouteParams.token_hash).toBeUndefined();
      mockRecoveryStage = 'ready';
      hNotify();
      return true;
    });
    await renderRecovery();
    expect(mockVerifyAuthLink).not.toHaveBeenCalled();
    await act(async () => {
      hBecomeReady();
    });
    await waitFor(() => expect(mockVerifyAuthLink).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByText('Set new password')).not.toBeNull());
    expect(hReplaceCalls).not.toContain('/');
    expect(hReplaceCalls).not.toContain('/signin');
  });
});

// ── preserved fail-closed behaviour ───────────────────────────────────────────────────────────
describe('fail-closed behaviour is preserved', () => {
  it('no parameters: no strip, no verification, neutral state', async () => {
    hReset({}, true);
    await renderConfirm();
    expect(await screen.findByText(INVALID)).toBeOnTheScreen();
    expect(mockVerifyAuthLink).not.toHaveBeenCalled();
    expect(hSetParamsCalls).toHaveLength(0);
  });

  it('malformed token: stripped once ready, never verified, neutral state', async () => {
    hReset({ token_hash: 'short', type: 'signup' }, true);
    await renderConfirm();
    await act(async () => {
      await Promise.resolve();
    });
    expect(hSetParamsCalls).toHaveLength(1);
    expect(mockVerifyAuthLink).not.toHaveBeenCalled();
    expect(await screen.findByText(INVALID)).toBeOnTheScreen();
  });

  it('wrong type is not verified', async () => {
    hReset({ token_hash: TOKEN, type: 'recovery' }, true);
    await renderConfirm();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockVerifyAuthLink).not.toHaveBeenCalled();
    expect(await screen.findByText(INVALID)).toBeOnTheScreen();
  });

  it('a rejected token still shows the neutral state and never routes to root', async () => {
    hReset({ token_hash: TOKEN, type: 'signup' }, true);
    mockVerifyAuthLink.mockResolvedValue(false);
    await renderConfirm();
    expect(await screen.findByText(INVALID)).toBeOnTheScreen();
    expect(hReplaceCalls).not.toContain('/');
  });
});

// ── source guards ─────────────────────────────────────────────────────────────────────────────
describe('source guards for cold-launch handling', () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
  const FILES = ['src/app/auth/confirm.tsx', 'src/app/auth/recovery.tsx'];

  it('both routes gate the intake on navigator readiness', () => {
    for (const f of FILES) {
      const t = read(f);
      expect(t).toMatch(/useRootNavigationReady|navigationReady|navReady/);
      expect(t).toMatch(/if \(!\w*[Rr]eady\)\s*return;/);
    }
  });

  it('neither route marks the attempt handled before readiness', () => {
    for (const f of FILES) {
      const t = read(f);
      const readyGuard = t.search(/if \(!\w*[Rr]eady\)\s*return;/);
      const handledSet = t.search(/handled\.current = true/);
      expect(readyGuard).toBeGreaterThan(-1);
      expect(handledSet).toBeGreaterThan(readyGuard);
    }
  });

  it('both routes strip inside a try and never verify after a failed strip', () => {
    for (const f of FILES) {
      const t = read(f);
      expect(t).toMatch(/try \{[\s\S]{0,200}router\.setParams\(/);
      expect(t).toMatch(/catch[\s\S]{0,800}router\.replace\(\s*['"]\/auth\/(confirm|recovery)['"]\s*\)/);
      expect(t).toMatch(/catch[\s\S]{0,900}return;/);
    }
  });

  it('the confirmation route keeps the unmount-only completion guard', () => {
    const t = read(FILES[0]);
    expect(t).toMatch(/alive\.current/);
    expect(t).not.toMatch(/let active = true/);
  });

  it('the recovery route only reaches the root dispatcher after the password is set', () => {
    const t = read(FILES[1]);
    expect(t).toMatch(/stage === 'done'[\s\S]{0,60}router\s*\.\s*replace\(\s*['"]\/['"]\s*\)/);
  });

  it('no real token material in either route', () => {
    for (const f of FILES) {
      const t = read(f);
      expect(t).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
      const control = [...t].filter((ch) => {
        const c = ch.charCodeAt(0);
        return c < 9 || (c > 13 && c < 32) || c === 127;
      });
      expect(control).toHaveLength(0);
    }
  });
});
