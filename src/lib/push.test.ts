import { AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import {
  routeForNotificationData,
  registerForPushNotifications,
  unregisterForPushNotifications,
  setupNotificationResponseListener,
} from './push';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Provide an explicit factory so the mock namespace shape is fully controlled and
// Jest's dynamic-import interception resolves the same mock object (no real module
// side-effects that crash under Node / Expo Go).
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  // R1: the handler that hides only the challenge push, and the listener that receives it.
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
}));

// AsyncStorage — used by the cold-start stale-response guard in push.ts.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));

jest.mock('expo-device');
// The factory is hoisted by Jest before module scope runs, so we embed the object
// directly inside the factory. We then access it via jest.requireMock() below so
// individual tests can mutate appOwnership to simulate Expo Go.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        eas: { projectId: 'p1' },
      },
    },
    appOwnership: undefined as string | undefined,
    executionEnvironment: undefined as string | undefined,
  },
}));
jest.mock('@/lib/supabase', () => {
  // device_tokens delete builder: supabase.from('device_tokens').delete().eq('push_token', t)
  const eq = jest.fn(() => Promise.resolve({ error: null }));
  const del = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ delete: del }));
  // R1: whose session is asking (getSession) and the sign-out / account-change watcher.
  const auth = { getSession: jest.fn(), onAuthStateChange: jest.fn() };
  return {
    supabase: { functions: { invoke: jest.fn() }, from, auth },
    __deviceTokensMocks: { eq, del, from },
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

// Use requireMock so we always get the same object that dynamic import() resolves to.
const mockNotifications = jest.requireMock('expo-notifications') as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getExpoPushTokenAsync: jest.Mock;
  addNotificationResponseReceivedListener: jest.Mock;
  getLastNotificationResponseAsync: jest.Mock;
  setNotificationHandler: jest.Mock;
  addNotificationReceivedListener: jest.Mock;
};

const mockAsyncStorage = (jest.requireMock('@react-native-async-storage/async-storage') as {
  default: { getItem: jest.Mock; setItem: jest.Mock };
}).default;

// Flush the async IIFE (dynamic import + getLastNotificationResponseAsync +
// AsyncStorage reads all resolve as microtasks) fully.
const flush = () => new Promise((r) => setTimeout(r, 0));

const { supabase } = jest.requireMock('@/lib/supabase') as {
  supabase: {
    functions: { invoke: jest.Mock };
    from: jest.Mock;
    auth: { getSession: jest.Mock; onAuthStateChange: jest.Mock };
  };
};

const deviceTokensMocks = (jest.requireMock('@/lib/supabase') as {
  __deviceTokensMocks: { eq: jest.Mock; del: jest.Mock; from: jest.Mock };
}).__deviceTokensMocks;

// Mutable Constants mock — lets tests set appOwnership = 'expo' to simulate Expo Go.
const mockConstants = jest.requireMock('expo-constants').default as {
  expoConfig: { extra: { eas: { projectId: string } } };
  appOwnership: string | undefined;
  executionEnvironment: string | undefined;
};

// ── R1 helpers (register-device protocol 2) ──────────────────────────────────

type Body = Record<string, unknown>;

const TOKEN = 'ExponentPushToken[x]';
const R = 'r-request-secret-0123';   // the request secret register-device returns to begin
const N = 'n-push-nonce-4567';       // the nonce that arrives only inside the challenge push

const challengeReply = (cid: string) => ({
  data: { ok: true, status: 'challenge', challenge_id: cid, request_secret: R, expires_in: 120 },
  error: null,
});
const REGISTERED = { data: { ok: true, status: 'registered' }, error: null };
const challengeData = (cid: string, n: string = N) => ({ type: 'kwik_device_challenge', cid, n });
const challengePush = (cid: string, n: string = N) => ({ request: { content: { data: challengeData(cid, n) } } });

/** The account signed in on the phone, as supabase.auth.getSession() reports it. */
let sessionUserId: string | null = null;

/** Script register-device's replies, in call order. */
function serverReplies(...replies: unknown[]): void {
  for (const reply of replies) supabase.functions.invoke.mockImplementationOnce(async () => reply);
}

/** A register-device reply that arrives only when the test releases it. */
function heldReply(): (reply: unknown) => void {
  let release: (reply: unknown) => void = () => {};
  supabase.functions.invoke.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  return (reply) => release(reply);
}

const bodies = (): Body[] =>
  supabase.functions.invoke.mock.calls.map((call) => (call[1] as { body: Body }).body);
const steps = () => bodies().map((body) => body.step);

/** Deliver a notification to the received-notification listener push.ts installed last. */
function receive(notification: unknown): void {
  const calls = mockNotifications.addNotificationReceivedListener.mock.calls;
  (calls[calls.length - 1][0] as (n: unknown) => void)(notification);
}

/** Fire the sign-in watcher push.ts installed last (sign-out, or a different account). */
function authEvent(event: string, userId: string | null): void {
  sessionUserId = userId;
  const calls = supabase.auth.onAuthStateChange.mock.calls;
  (calls[calls.length - 1][0] as (e: string, s: unknown) => void)(event, userId ? { user: { id: userId } } : null);
}

/** Watch a promise without awaiting it. */
function track<T>(promise: Promise<T>): { done: boolean; value?: T } {
  const state: { done: boolean; value?: T } = { done: false };
  void promise.then((value) => {
    state.done = true;
    state.value = value;
  });
  return state;
}

/** Let every pending promise callback run (fake timers: nothing is advanced). */
const settle = () => jest.advanceTimersByTimeAsync(0);
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

/** The app's foreground state, as push.ts reads it (AppState.currentState). */
function setAppState(state: 'active' | 'background'): void {
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true, writable: true });
}

let userCounter = 0;

// ── routeForNotificationData ─────────────────────────────────────────────────

describe('routeForNotificationData', () => {
  it('returns route for a chat_message payload', () => {
    expect(
      routeForNotificationData({ type: 'chat_message', route: '/booking/chat/1' }),
    ).toBe('/booking/chat/1');
  });

  it('returns route for a booking_update payload', () => {
    expect(
      routeForNotificationData({ type: 'booking_update', route: '/customer/bookings/42' }),
    ).toBe('/customer/bookings/42');
  });

  it('returns null for an empty object', () => {
    expect(routeForNotificationData({})).toBeNull();
  });

  it('returns null for null input', () => {
    expect(routeForNotificationData(null)).toBeNull();
  });

  it('returns null for an empty route string', () => {
    expect(routeForNotificationData({ route: '' })).toBeNull();
  });

  // S11-1: a push tap may only open an in-app screen, never an outside link.
  it.each(['https://evil.example/login', '//evil.example', 'mailto:x@evil.example', 'javascript:alert(1)'])(
    'returns null for an outside route (%s)',
    (route) => {
      expect(routeForNotificationData({ type: 'system', route })).toBeNull();
    },
  );
});

// ── registerForPushNotifications (R1: begin → challenge push → complete) ─────

describe('registerForPushNotifications', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    jest.clearAllMocks();
    // Default: real device, granted permission, NOT Expo Go, in the foreground, signed in
    mockConstants.appOwnership = undefined;
    mockConstants.executionEnvironment = undefined;
    (Device as any).isDevice = true;
    (Device as any).deviceName = 'Test Phone';
    setAppState('active');
    userCounter += 1;
    sessionUserId = `user-${userCounter}`;
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockNotifications.getExpoPushTokenAsync.mockResolvedValue({
      data: TOKEN,
      type: 'expo',
    });
    mockNotifications.addNotificationReceivedListener.mockImplementation(() => ({ remove: jest.fn() }));
    mockNotifications.addNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() });
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(undefined);
    mockNotifications.setNotificationHandler.mockImplementation(() => undefined);
    supabase.auth.getSession.mockImplementation(async () => ({
      data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
    }));
    supabase.auth.onAuthStateChange.mockImplementation(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    }));
    // Every reply is scripted per test; an unscripted call gets an error reply.
    supabase.functions.invoke.mockReset();
    supabase.functions.invoke.mockResolvedValue({ data: null, error: new Error('no reply scripted') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null and does NOT call invoke when not a device', async () => {
    (Device as any).isDevice = false;
    const result = await registerForPushNotifications();
    expect(result).toBeNull();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('returns null and does NOT call invoke when permission denied', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const result = await registerForPushNotifications();
    expect(result).toBeNull();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('returns null (graceful) when getExpoPushTokenAsync throws', async () => {
    mockNotifications.getExpoPushTokenAsync.mockRejectedValue(
      new Error('Not supported in Expo Go'),
    );
    const result = await registerForPushNotifications();
    expect(result).toBeNull();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('returns null and sends nothing when nobody is signed in', async () => {
    sessionUserId = null;
    const result = await registerForPushNotifications();
    expect(result).toBeNull();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('A-10 Expo Go → register no-ops: returns null without calling getExpoPushTokenAsync or invoke', async () => {
    mockConstants.appOwnership = 'expo';
    const result = await registerForPushNotifications();
    expect(result).toBeNull();
    expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockNotifications.setNotificationHandler).not.toHaveBeenCalled();
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('A-1 begins, waits for its own challenge push, and completes with the matching cid', async () => {
    serverReplies(challengeReply('c1'), REGISTERED);
    const result = track(registerForPushNotifications());
    await settle();
    expect(bodies()).toEqual([
      { protocol: 2, step: 'begin', push_token: TOKEN, platform: Platform.OS, device_name: 'Test Phone' },
    ]);
    expect(result.done).toBe(false);   // waiting for the challenge push
    receive(challengePush('c1'));
    await settle();
    // D-1 (owner, C-37r-2 option A, 26 Oct 11:12): complete repeats begin's platform and device_name.
    expect(bodies()[1]).toEqual({
      protocol: 2,
      step: 'complete',
      push_token: TOKEN,
      platform: Platform.OS,
      device_name: 'Test Phone',
      challenge_id: 'c1',
      request_secret: R,
      nonce: N,
    });
    expect(result).toEqual({ done: true, value: TOKEN });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('never sends the old one-step body: every call is protocol 2 begin or complete', async () => {
    serverReplies(challengeReply('c1'), REGISTERED);
    const result = track(registerForPushNotifications());
    await settle();
    receive(challengePush('c1'));
    await settle();
    expect(result.value).toBe(TOKEN);
    expect(supabase.functions.invoke.mock.calls.every((call) => call[0] === 'register-device')).toBe(true);
    expect(bodies().every((body) => body.protocol === 2)).toBe(true);
    expect(steps()).toEqual(['begin', 'complete']);
  });

  it('uses null for device_name when Device.deviceName is null', async () => {
    (Device as any).deviceName = null;
    serverReplies(REGISTERED);
    const result = await registerForPushNotifications();
    expect(result).toBe(TOKEN);
    expect(bodies()).toEqual([
      { protocol: 2, step: 'begin', push_token: TOKEN, platform: Platform.OS, device_name: null },
    ]);
  });

  it('D-1 complete sends the same platform and a null device_name when Device.deviceName is null', async () => {
    (Device as any).deviceName = null;
    serverReplies(challengeReply('c1'), REGISTERED);
    const result = track(registerForPushNotifications());
    await settle();
    (Device as any).deviceName = 'Renamed Phone';   // complete must repeat what begin sent
    receive(challengePush('c1'));
    await settle();
    expect(bodies()[1]).toEqual({
      protocol: 2,
      step: 'complete',
      push_token: TOKEN,
      platform: Platform.OS,
      device_name: null,
      challenge_id: 'c1',
      request_secret: R,
      nonce: N,
    });
    expect(result.value).toBe(TOKEN);
  });

  it('A-3 ignores a challenge push with another cid, then completes with its own', async () => {
    serverReplies(challengeReply('c1'), REGISTERED);
    const result = track(registerForPushNotifications());
    await settle();
    receive(challengePush('someone-elses-cid', 'n-other'));
    await settle();
    expect(steps()).toEqual(['begin']);
    receive(challengePush('c1'));
    await settle();
    expect(steps()).toEqual(['begin', 'complete']);
    expect(bodies()[1].nonce).toBe(N);
    expect(result.value).toBe(TOKEN);
  });

  it('A-4 timeout: no complete; one retry 30 s later while in the foreground; then stops', async () => {
    serverReplies(challengeReply('c1'), challengeReply('c2'));
    const result = track(registerForPushNotifications());
    await settle();
    await advance(45_000);   // no challenge push arrived
    expect(steps()).toEqual(['begin']);
    await advance(29_999);
    expect(steps()).toEqual(['begin']);
    await advance(1);
    expect(steps()).toEqual(['begin', 'begin']);
    await advance(45_000);
    expect(result).toEqual({ done: true, value: null });
    expect(steps()).toEqual(['begin', 'begin']);   // no third try
    expect(jest.getTimerCount()).toBe(0);
  });

  it('A-4 timeout in the background: no retry', async () => {
    serverReplies(challengeReply('c1'));
    const result = track(registerForPushNotifications());
    await settle();
    setAppState('background');
    await advance(45_000);
    expect(result).toEqual({ done: true, value: null });
    expect(steps()).toEqual(['begin']);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('A-4 in the background when the 30 s pause ends: no retry', async () => {
    serverReplies(challengeReply('c1'));
    const result = track(registerForPushNotifications());
    await settle();
    await advance(45_000);
    setAppState('background');
    await advance(30_000);
    expect(result).toEqual({ done: true, value: null });
    expect(steps()).toEqual(['begin']);
  });

  it('a complete answered `retry` uses the single retry (30 s later), then stops', async () => {
    serverReplies(challengeReply('c1'), { data: { ok: false, status: 'retry' }, error: null }, challengeReply('c2'));
    const result = track(registerForPushNotifications());
    await settle();
    receive(challengePush('c1'));
    await settle();
    expect(steps()).toEqual(['begin', 'complete']);
    await advance(30_000);
    expect(steps()).toEqual(['begin', 'complete', 'begin']);
    await advance(45_000);
    expect(result).toEqual({ done: true, value: null });
    expect(steps()).toEqual(['begin', 'complete', 'begin']);
  });

  it('A-5 `registered` from begin: no wait, no complete, returns the token', async () => {
    serverReplies(REGISTERED);
    const result = track(registerForPushNotifications());
    await settle();
    expect(result).toEqual({ done: true, value: TOKEN });
    expect(steps()).toEqual(['begin']);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each<[string, unknown]>([
    ['rate_limited', { data: { ok: false, status: 'rate_limited' }, error: null }],
    ['update_required', { data: { ok: false, status: 'update_required' }, error: null }],
    ['an HTTP error', { data: null, error: new Error('FunctionsHttpError') }],
    ['an unknown status', { data: { ok: true, status: 'something_else' }, error: null }],
    ['a challenge without request_secret', { data: { ok: true, status: 'challenge', challenge_id: 'c1' }, error: null }],
    ['a challenge with an empty cid', { data: { ok: true, status: 'challenge', challenge_id: '', request_secret: R }, error: null }],
    ['ok false with no status', { data: { ok: false }, error: null }],
    ['a text body', { data: 'ok', error: null }],
  ])('A-6 begin answered %s → returns null, never throws, no wait, no retry', async (_label, reply) => {
    serverReplies(reply);
    const result = track(registerForPushNotifications());
    await settle();
    expect(result).toEqual({ done: true, value: null });
    expect(steps()).toEqual(['begin']);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('A-6 begin throws (network) → returns null, never throws', async () => {
    supabase.functions.invoke.mockRejectedValueOnce(new Error('network down'));
    await expect(registerForPushNotifications()).resolves.toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each<[string, unknown]>([
    ['an HTTP error', { data: null, error: new Error('FunctionsHttpError') }],
    ['rate_limited', { data: { ok: false, status: 'rate_limited' }, error: null }],
  ])('A-6 complete answered %s → returns null, no retry', async (_label, reply) => {
    serverReplies(challengeReply('c1'), reply);
    const result = track(registerForPushNotifications());
    await settle();
    receive(challengePush('c1'));
    await settle();
    expect(result).toEqual({ done: true, value: null });
    expect(steps()).toEqual(['begin', 'complete']);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('A-6 complete throws (network) → returns null, no retry', async () => {
    serverReplies(challengeReply('c1'));
    supabase.functions.invoke.mockRejectedValueOnce(new Error('network down'));
    const result = track(registerForPushNotifications());
    await settle();
    receive(challengePush('c1'));
    await settle();
    expect(result).toEqual({ done: true, value: null });
    expect(steps()).toEqual(['begin', 'complete']);
  });

  it('A-8 a tap on the matching challenge notice completes it and never navigates', async () => {
    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await settle();
    serverReplies(challengeReply('c1'), REGISTERED);
    const result = track(registerForPushNotifications());
    await settle();
    const tap = mockNotifications.addNotificationResponseReceivedListener.mock.calls[0][0] as (r: unknown) => void;
    tap({ notification: { request: { identifier: 't1', content: { data: { ...challengeData('c1'), route: '/booking/1' } } } } });
    await settle();
    expect(steps()).toEqual(['begin', 'complete']);
    expect(result.value).toBe(TOKEN);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('A-9 nothing logs the push code, the nonce or the request secret', async () => {
    const spies: jest.SpyInstance[] = [
      jest.spyOn(console, 'log').mockImplementation(() => undefined),
      jest.spyOn(console, 'info').mockImplementation(() => undefined),
      jest.spyOn(console, 'warn').mockImplementation(() => undefined),
      jest.spyOn(console, 'error').mockImplementation(() => undefined),
      jest.spyOn(console, 'debug').mockImplementation(() => undefined),
    ];
    try {
      setupNotificationResponseListener(jest.fn());
      await settle();
      // A run whose complete fails (the error text even contains r) ...
      serverReplies(challengeReply('c1'), { data: null, error: new Error(`refused ${R}`) });
      const failed = track(registerForPushNotifications());
      await settle();
      receive(challengePush('c1'));
      await settle();
      expect(failed.value).toBeNull();
      // ... then a run that is proven, then the sign-out delete.
      serverReplies(challengeReply('c2'), REGISTERED);
      const proven = track(registerForPushNotifications());
      await settle();
      receive(challengePush('c2'));
      await settle();
      expect(proven.value).toBe(TOKEN);
      await unregisterForPushNotifications();
      const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
      expect(logged).not.toContain(TOKEN);
      expect(logged).not.toContain(N);
      expect(logged).not.toContain(R);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });

  it('A-11 a challenge push received before the begin reply is still completed', async () => {
    const releaseBegin = heldReply();
    serverReplies(REGISTERED);
    const result = track(registerForPushNotifications());
    await settle();
    expect(steps()).toEqual(['begin']);
    receive(challengePush('c1'));   // arrives while the begin reply is still on the way
    await settle();
    expect(steps()).toEqual(['begin']);
    releaseBegin(challengeReply('c1'));
    await settle();
    expect(bodies()[1]).toMatchObject({ step: 'complete', challenge_id: 'c1', request_secret: R, nonce: N });
    expect(result.value).toBe(TOKEN);
  });

  it('A-11 a received challenge is kept for at most 120 s', async () => {
    const releaseBegin = heldReply();
    track(registerForPushNotifications());
    await settle();
    receive(challengePush('c1'));
    await advance(120_001);
    releaseBegin(challengeReply('c1'));
    await settle();
    expect(steps()).toEqual(['begin']);
  });

  it('a pending challenge is not completed after its expires_in', async () => {
    serverReplies({ data: { ok: true, status: 'challenge', challenge_id: 'c1', request_secret: R, expires_in: 10 }, error: null });
    track(registerForPushNotifications());
    await settle();
    await advance(10_001);
    receive(challengePush('c1'));
    await settle();
    expect(steps()).toEqual(['begin']);
  });

  it('C-2a an expires_in above 120 is capped: a push at 120 001 ms is not completed', async () => {
    serverReplies({ data: { ok: true, status: 'challenge', challenge_id: 'c1', request_secret: R, expires_in: 600 }, error: null });
    track(registerForPushNotifications());
    await settle();
    setAppState('background');   // no retry, so the only begin is the one above
    await advance(120_001);
    receive(challengePush('c1'));
    await settle();
    expect(steps()).toEqual(['begin']);
  });

  it('C-2a control: with expires_in 600, a push at 119 000 ms is still completed', async () => {
    serverReplies({ data: { ok: true, status: 'challenge', challenge_id: 'c1', request_secret: R, expires_in: 600 }, error: null }, REGISTERED);
    track(registerForPushNotifications());
    await settle();
    setAppState('background');
    await advance(119_000);
    receive(challengePush('c1'));
    await settle();
    expect(steps()).toEqual(['begin', 'complete']);
  });

  it('A-12 a challenge pending for A is never completed after the user changes to B', async () => {
    serverReplies(challengeReply('c1'), REGISTERED);
    const result = track(registerForPushNotifications());
    await settle();
    authEvent('SIGNED_IN', `${sessionUserId}-B`);
    await settle();
    receive(challengePush('c1'));
    await settle();
    expect(steps()).toEqual(['begin']);
    expect(result).toEqual({ done: true, value: null });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('A-12 sign-out stops the waiting run at once and drops its challenges', async () => {
    serverReplies(challengeReply('c1'));
    const result = track(registerForPushNotifications());
    await settle();
    authEvent('SIGNED_OUT', null);
    await settle();
    expect(result).toEqual({ done: true, value: null });
    expect(jest.getTimerCount()).toBe(0);
    receive(challengePush('c1'));
    await settle();
    expect(steps()).toEqual(['begin']);
  });

  it('A-12 the session is read again before complete: a different account is never completed', async () => {
    serverReplies(challengeReply('c1'), REGISTERED);
    const result = track(registerForPushNotifications());
    await settle();
    sessionUserId = `${sessionUserId}-B`;   // changed with no event seen yet
    receive(challengePush('c1'));
    await settle();
    expect(steps()).toEqual(['begin']);
    expect(result).toEqual({ done: true, value: null });
  });

  it('C-2b the session is gone at complete time and no auth event fired: no complete', async () => {
    serverReplies(challengeReply('c1'), REGISTERED);
    const result = track(registerForPushNotifications());
    await settle();
    sessionUserId = null;   // signed out with no event seen yet
    receive(challengePush('c1'));
    await settle();
    expect(steps()).toEqual(['begin']);
    expect(result).toEqual({ done: true, value: null });
  });

  it('A-12 after sign-out and a new sign-in, a push received before sign-out is not reused', async () => {
    const userA = sessionUserId;
    const releaseOldBegin = heldReply();
    serverReplies(challengeReply('c1'), REGISTERED);
    track(registerForPushNotifications());
    await settle();
    receive(challengePush('c1', 'n-received-before-sign-out'));
    authEvent('SIGNED_OUT', null);
    await settle();
    sessionUserId = userA;   // the same account signs in again
    const again = track(registerForPushNotifications());
    await settle();
    releaseOldBegin(challengeReply('c0'));   // the first run's late reply is ignored
    await settle();
    expect(steps()).toEqual(['begin', 'begin']);
    receive(challengePush('c1'));
    await settle();
    expect(steps()).toEqual(['begin', 'begin', 'complete']);
    expect(bodies()[2].nonce).toBe(N);
    expect(again.value).toBe(TOKEN);
  });

  it('A-13 the handler and the challenge listener are set before begin is called', async () => {
    serverReplies(REGISTERED);
    await registerForPushNotifications();
    const beginOrder = supabase.functions.invoke.mock.invocationCallOrder[0];
    expect(mockNotifications.setNotificationHandler.mock.invocationCallOrder[0]).toBeLessThan(beginOrder);
    expect(mockNotifications.addNotificationReceivedListener.mock.invocationCallOrder[0]).toBeLessThan(beginOrder);
  });

  it('A-13 when the handler cannot be set, begin is not called', async () => {
    mockNotifications.setNotificationHandler.mockImplementation(() => {
      throw new Error('handler unavailable');
    });
    serverReplies(REGISTERED);
    await expect(registerForPushNotifications()).resolves.toBeNull();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('A-14 an `{ok: true}` reply with no status (an older server) → done: no wait, no throw', async () => {
    serverReplies({ data: { ok: true }, error: null });
    const result = track(registerForPushNotifications());
    await settle();
    expect(result).toEqual({ done: true, value: TOKEN });
    expect(steps()).toEqual(['begin']);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('A-15 duplicate deliveries after `registered`: one complete, no new begin', async () => {
    setupNotificationResponseListener(jest.fn());
    await settle();
    serverReplies(challengeReply('c1'), REGISTERED);
    const result = track(registerForPushNotifications());
    await settle();
    receive(challengePush('c1'));
    receive(challengePush('c1'));
    await settle();
    receive(challengePush('c1'));
    const tap = mockNotifications.addNotificationResponseReceivedListener.mock.calls[0][0] as (r: unknown) => void;
    tap({ notification: { request: { identifier: 'd1', content: { data: challengeData('c1') } } } });
    await advance(120_000);
    expect(steps()).toEqual(['begin', 'complete']);
    expect(result.value).toBe(TOKEN);
  });

  it('A-15 a late push during the 30 s pause registers, and no new begin starts', async () => {
    serverReplies(challengeReply('c1'), REGISTERED);
    const result = track(registerForPushNotifications());
    await settle();
    await advance(45_000);
    receive(challengePush('c1'));   // still within the challenge's 120 s
    await settle();
    expect(steps()).toEqual(['begin', 'complete']);
    await advance(30_000);
    expect(steps()).toEqual(['begin', 'complete']);
    expect(result.value).toBe(TOKEN);
  });

  it('A-15 after `registered` from begin, a stray challenge push starts nothing', async () => {
    serverReplies(REGISTERED);
    await registerForPushNotifications();
    receive(challengePush('c9'));
    await advance(120_000);
    expect(steps()).toEqual(['begin']);
  });
});

// ── unregisterForPushNotifications (Phase 4E.1 token-ownership) ──────────────
// R1 A-2: the sign-out delete is unchanged, so these tests are unchanged. The order
// "delete before signOut" is held by src/auth/auth-context.test.tsx (not changed by R1).

describe('unregisterForPushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConstants.appOwnership = undefined;
    mockConstants.executionEnvironment = undefined;
    (Device as any).isDevice = true;
    mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[x]', type: 'expo' });
    deviceTokensMocks.from.mockReturnValue({ delete: deviceTokensMocks.del });
    deviceTokensMocks.del.mockReturnValue({ eq: deviceTokensMocks.eq });
    deviceTokensMocks.eq.mockResolvedValue({ error: null });
  });

  it('deletes ONLY this device token row (filters by push_token; RLS scopes to the user)', async () => {
    await unregisterForPushNotifications();
    expect(deviceTokensMocks.from).toHaveBeenCalledWith('device_tokens');
    expect(deviceTokensMocks.del).toHaveBeenCalledTimes(1);
    // Filters by the current device's push_token only — never a broad delete of all
    // the user's tokens (their other devices are untouched; RLS scopes to auth.uid()).
    expect(deviceTokensMocks.eq).toHaveBeenCalledTimes(1);
    expect(deviceTokensMocks.eq).toHaveBeenCalledWith('push_token', 'ExponentPushToken[x]');
  });

  it('does nothing on a simulator / non-device', async () => {
    (Device as any).isDevice = false;
    await unregisterForPushNotifications();
    expect(deviceTokensMocks.from).not.toHaveBeenCalled();
  });

  it('does nothing in Expo Go (never imports expo-notifications)', async () => {
    mockConstants.appOwnership = 'expo';
    await unregisterForPushNotifications();
    expect(deviceTokensMocks.from).not.toHaveBeenCalled();
  });

  it('never throws when the delete fails (best-effort — logout must still proceed)', async () => {
    deviceTokensMocks.eq.mockRejectedValueOnce(new Error('network down'));
    await expect(unregisterForPushNotifications()).resolves.toBeUndefined();
  });

  it('never throws when the push token cannot be resolved', async () => {
    mockNotifications.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('no token'));
    await expect(unregisterForPushNotifications()).resolves.toBeUndefined();
    expect(deviceTokensMocks.from).not.toHaveBeenCalled();
  });
});

// ── setupNotificationResponseListener ───────────────────────────────────────

describe('setupNotificationResponseListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: NOT Expo Go
    mockConstants.appOwnership = undefined;
    mockConstants.executionEnvironment = undefined;
  });

  it('calls navigate with the resolved route when a notification response is received', async () => {
    const removeMock = jest.fn();
    let capturedHandler: ((response: any) => void) | undefined;

    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((handler: any) => {
      capturedHandler = handler;
      return { remove: removeMock };
    });

    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);

    // Flush the async IIFE: dynamic import() resolves as a microtask, then the
    // listener is registered. Two ticks of the microtask queue are sufficient.
    await Promise.resolve();
    await Promise.resolve();

    expect(capturedHandler).toBeDefined();

    // Simulate a notification tap with route data.
    capturedHandler!({
      notification: {
        request: {
          content: {
            data: { route: '/booking/1' },
          },
        },
      },
    });

    expect(navigate).toHaveBeenCalledWith('/booking/1');
  });

  it('calls sub.remove() when the returned unsubscribe is called', async () => {
    const removeMock = jest.fn();
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation(() => ({
      remove: removeMock,
    }));

    const unsubscribe = setupNotificationResponseListener(jest.fn());

    // Wait for the async IIFE to complete and register the listener.
    await Promise.resolve();
    await Promise.resolve();

    unsubscribe();
    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('does not call navigate when route is missing from data', async () => {
    let capturedHandler: ((response: any) => void) | undefined;
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((handler: any) => {
      capturedHandler = handler;
      return { remove: jest.fn() };
    });

    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await Promise.resolve();
    await Promise.resolve();

    capturedHandler!({
      notification: { request: { content: { data: {} } } },
    });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('A-10 Expo Go → listener no-ops: returns a no-op function, never calls addNotificationResponseReceivedListener', async () => {
    mockConstants.appOwnership = 'expo';
    const navigate = jest.fn();
    const unsubscribe = setupNotificationResponseListener(navigate);

    // Flush microtask queue — no async IIFE runs in Expo Go path
    await Promise.resolve();
    await Promise.resolve();

    expect(mockNotifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
    expect(mockNotifications.setNotificationHandler).not.toHaveBeenCalled();
    expect(mockNotifications.addNotificationReceivedListener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });
});

// ── setupNotificationResponseListener — cold start (Phase 4E.1) ──────────────

describe('setupNotificationResponseListener — cold start', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConstants.appOwnership = undefined;
    mockConstants.executionEnvironment = undefined;
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(undefined);
    mockNotifications.addNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() });
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = (id: string | undefined, route: string | undefined): any => ({
    notification: { request: { identifier: id, content: { data: route === undefined ? {} : { route } } } },
  });

  it('navigates from the notification that cold-started the app (launch response)', async () => {
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(response('n1', '/booking/1'));
    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await flush();
    expect(navigate).toHaveBeenCalledWith('/booking/1');
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('push:lastColdStartResponseId', 'n1');
  });

  it('does not navigate twice when the cold-start response is also replayed to the live listener', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let liveHandler: ((r: any) => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((h: any) => {
      liveHandler = h;
      return { remove: jest.fn() };
    });
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(response('n1', '/booking/1'));
    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await flush();
    // OS replays the SAME launch response to the live listener.
    liveHandler!(response('n1', '/booking/1'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/booking/1');
  });

  it('ignores a cold-start response with a missing route (no navigation)', async () => {
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(response('n1', undefined));
    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await flush();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not re-navigate a STALE launch response already consumed in a prior session', async () => {
    mockAsyncStorage.getItem.mockResolvedValue('n1'); // persisted from a previous session
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(response('n1', '/booking/1'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let liveHandler: ((r: any) => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((h: any) => {
      liveHandler = h;
      return { remove: jest.fn() };
    });
    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await flush();
    expect(navigate).not.toHaveBeenCalled();
    expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    // The live listener must not re-navigate the same stale id either (no loop).
    liveHandler!(response('n1', '/booking/1'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('still routes fresh warm/background taps through the live listener', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let liveHandler: ((r: any) => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((h: any) => {
      liveHandler = h;
      return { remove: jest.fn() };
    });
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(undefined); // no cold start
    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await flush();
    liveHandler!(response('n2', '/booking/2'));
    expect(navigate).toHaveBeenCalledWith('/booking/2');
  });

  it('A-8 a cold-start challenge notice never navigates, even with a route', async () => {
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue({
      notification: { request: { identifier: 'n3', content: { data: { ...challengeData('c1'), route: '/booking/1' } } } },
    });
    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await flush();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('A-8 a tapped challenge notice never navigates; an ordinary tap still does', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let liveHandler: ((r: any) => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((h: any) => {
      liveHandler = h;
      return { remove: jest.fn() };
    });
    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await flush();
    liveHandler!({ notification: { request: { identifier: 'n4', content: { data: { ...challengeData('zz'), route: '/booking/1' } } } } });
    liveHandler!(response('n5', '/booking/2'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/booking/2');
  });
});

// ── The notification handler (R1, A-7) ──────────────────────────────────────

describe('notification handler (A-7)', () => {
  const SHOWN = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
  const HIDDEN = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };

  /** The handleNotification function push.ts installed last. */
  function installedHandler(): (notification: unknown) => Promise<unknown> {
    const calls = mockNotifications.setNotificationHandler.mock.calls;
    return (calls[calls.length - 1][0] as { handleNotification: (n: unknown) => Promise<unknown> }).handleNotification;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockConstants.appOwnership = undefined;
    mockConstants.executionEnvironment = undefined;
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(undefined);
    mockNotifications.addNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() });
    mockNotifications.setNotificationHandler.mockImplementation(() => undefined);
  });

  it('is set at mount by setupNotificationResponseListener', async () => {
    setupNotificationResponseListener(jest.fn());
    await flush();
    expect(mockNotifications.setNotificationHandler).toHaveBeenCalledTimes(1);
  });

  it.each<[string, unknown]>([
    ['no notification', undefined],
    ['a null notification', null],
    ['no request', {}],
    ['no content', { request: {} }],
    ['no data', { request: { content: {} } }],
    ['null data', { request: { content: { data: null } } }],
    ['data that is a string', { request: { content: { data: 'kwik_device_challenge' } } }],
    ['data that is an array', { request: { content: { data: [] } } }],
    ['data with no type', { request: { content: { data: {} } } }],
    ['a chat message', { request: { content: { data: { type: 'chat_message', route: '/booking/chat/1' } } } }],
    ['a booking update', { request: { content: { data: { type: 'booking_update', route: '/booking/2' } } } }],
    ['the type in capitals', { request: { content: { data: { type: 'KWIK_DEVICE_CHALLENGE' } } } }],
    ['the type with a space', { request: { content: { data: { type: ' kwik_device_challenge' } } } }],
    ['a longer type', { request: { content: { data: { type: 'kwik_device_challenge_x' } } } }],
    ['the type inside an array', { request: { content: { data: { type: ['kwik_device_challenge'] } } } }],
    ['a numeric type', { request: { content: { data: { type: 1 } } } }],
  ])('shows %s exactly as with no handler (banner, list, sound, badge)', async (_label, notification) => {
    setupNotificationResponseListener(jest.fn());
    await flush();
    await expect(installedHandler()(notification)).resolves.toEqual(SHOWN);
  });

  it.each<[string, unknown]>([
    ['a well-formed challenge', { request: { content: { data: challengeData('c1') } } }],
    ['the challenge type with no cid or nonce', { request: { content: { data: { type: 'kwik_device_challenge' } } } }],
  ])('hides %s (all four false)', async (_label, notification) => {
    setupNotificationResponseListener(jest.fn());
    await flush();
    await expect(installedHandler()(notification)).resolves.toEqual(HIDDEN);
  });

  it('returns without waiting on any I/O: settled after one microtask, no storage, session or network call', async () => {
    setupNotificationResponseListener(jest.fn());
    await flush();
    const before = [
      supabase.functions.invoke.mock.calls.length,
      supabase.auth.getSession.mock.calls.length,
      mockAsyncStorage.getItem.mock.calls.length,
      mockAsyncStorage.setItem.mock.calls.length,
      mockNotifications.getPermissionsAsync.mock.calls.length,
      mockNotifications.getExpoPushTokenAsync.mock.calls.length,
    ];
    for (const notification of [challengePush('c1'), { request: { content: { data: { type: 'chat_message' } } } }]) {
      let settled = false;
      void installedHandler()(notification).then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(true);
    }
    expect([
      supabase.functions.invoke.mock.calls.length,
      supabase.auth.getSession.mock.calls.length,
      mockAsyncStorage.getItem.mock.calls.length,
      mockAsyncStorage.setItem.mock.calls.length,
      mockNotifications.getPermissionsAsync.mock.calls.length,
      mockNotifications.getExpoPushTokenAsync.mock.calls.length,
    ]).toEqual(before);
  });
});
