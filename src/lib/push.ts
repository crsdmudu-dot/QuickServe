import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { safeInternalRoute } from '@/lib/safe-route';

/** Key under which the id of the last cold-start notification response we navigated
 *  from is persisted. Android keeps the last notification response across app
 *  launches, so without this a normal relaunch would re-navigate a stale tap. */
const LAST_COLD_START_RESPONSE_KEY = 'push:lastColdStartResponseId';

/** True when running inside the Expo Go client, where native push (expo-notifications)
 *  is unsupported on Android SDK 53 — importing the module itself crashes, so callers
 *  must bail out BEFORE any dynamic import. */
function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
}

/** Pure: resolve a notification's data payload to an expo-router path, or null.
 *  Only a plain in-app path is followed (S11-1); an outside link or anything else is ignored. */
export function routeForNotificationData(data: unknown): string | null {
  if (data && typeof data === 'object') {
    return safeInternalRoute((data as Record<string, unknown>).route);
  }
  return null;
}

// ── Proof that this phone receives its push code (R1, register-device "protocol 2") ──
//
// Knowing a push code is not enough to register it. The app asks register-device to BEGIN.
// The server sends one push to the code with data {type, cid, n} and answers THIS app only
// with the challenge id (cid) and a request secret (r). The app then COMPLETES with r and the
// n that arrived in the push. Only the installation that holds the code ever receives n.
//
// Everything below lives in memory only (nothing is stored on the phone), and nothing here
// ever logs the push code, n or r.

/** data.type of the server's challenge push. */
const CHALLENGE_TYPE = 'kwik_device_challenge';
/** How long one attempt waits for its own challenge push. */
const CHALLENGE_WAIT_MS = 45_000;
/** Pause before the single retry, which runs only while the app is still in the foreground. */
const RETRY_DELAY_MS = 30_000;
/** A challenge lives 120 s on the server, so a pending or received one is kept no longer. */
const CHALLENGE_LIFETIME_MS = 120_000;

type NotificationsModule = typeof import('expo-notifications');

/** How one attempt ended: proven; worth the single retry (no push in time, or `retry`); or stop. */
type Outcome = 'registered' | 'again' | 'stop';

/** A challenge this session obtained from begin and has not completed yet. */
type PendingChallenge = {
  cid: string;
  requestSecret: string;
  pushToken: string;
  /** The platform and device name begin sent; complete sends the same values. */
  platform: string;
  deviceName: string | null;
  userId: string;
  expiresAt: number;
  settle: (outcome: Outcome) => void;
};

const challenges = {
  /** The signed-in account the challenges below belong to; null while nobody is signed in. */
  userId: null as string | null,
  /** Bumped by every registration run and every clear, so a superseded run stops quietly. */
  run: 0,
  /** True once the current run is proven; a late duplicate or `retry` then starts nothing. */
  registered: false,
  /** Challenges obtained from begin, by cid. */
  pending: new Map<string, PendingChallenge>(),
  /** Challenge pushes received while signed in that matched nothing yet, by cid. */
  received: new Map<string, { nonce: string; receivedAt: number }>(),
};

let receivedSubscription: { remove: () => void } | null = null;
let authSubscription: { unsubscribe: () => void } | null = null;

/** Every ordinary notification is shown exactly as it would be with no handler at all. */
const SHOW_NOTIFICATION = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
/** Only the challenge push is hidden while the app is open. */
const HIDE_NOTIFICATION = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };

/** The data payload of a received notification, or undefined. */
function dataOf(notification: unknown): unknown {
  return (notification as { request?: { content?: { data?: unknown } } } | null | undefined)
    ?.request?.content?.data;
}

/** True only when data.type is exactly the challenge type. */
function isChallengeType(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as Record<string, unknown>).type === CHALLENGE_TYPE;
}

/** The cid and nonce of a well-formed challenge payload, or null. */
function readChallenge(data: unknown): { cid: string; nonce: string } | null {
  if (!isChallengeType(data)) return null;
  const { cid, n } = data as Record<string, unknown>;
  if (typeof cid !== 'string' || cid === '' || typeof n !== 'string' || n === '') return null;
  return { cid, nonce: n };
}

/** The id of the account signed in on this phone right now, or null. */
async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function isForeground(): boolean {
  return AppState.currentState === 'active';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves with the promise's value, or with null after `ms` if it has not settled by then. */
function waitAtMost<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/** Drop every pending and received challenge (sign-out, or a different account). */
function clearChallenges(): void {
  const waiting = [...challenges.pending.values()];
  challenges.userId = null;
  challenges.run += 1;
  challenges.registered = false;
  challenges.pending.clear();
  challenges.received.clear();
  waiting.forEach((pending) => pending.settle('stop'));
}

/** Forget challenges older than their lifetime. */
function dropExpired(now: number): void {
  for (const [cid, pending] of challenges.pending) {
    if (now > pending.expiresAt) {
      challenges.pending.delete(cid);
      pending.settle('again');
    }
  }
  for (const [cid, received] of challenges.received) {
    if (now > received.receivedAt + CHALLENGE_LIFETIME_MS) challenges.received.delete(cid);
  }
}

/** The current run is proven: nothing else pending or received is needed any more. */
function markRegistered(userId: string): void {
  if (challenges.userId !== userId) return;
  challenges.registered = true;
  const others = [...challenges.pending.values()];
  challenges.pending.clear();
  challenges.received.clear();
  others.forEach((pending) => pending.settle('registered'));
}

/** Calls register-device and reduces its reply to one status word ('error' when unusable). */
async function callRegisterDevice(
  body: Record<string, unknown>,
): Promise<{ status: string; reply: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke('register-device', { body });
  if (error || !data || typeof data !== 'object') return { status: 'error', reply: {} };
  const reply = data as Record<string, unknown>;
  if (typeof reply.status === 'string') return { status: reply.status, reply };
  // A server without the proof step answers {ok: true} with no status: done, with no wait.
  if (reply.ok === true && reply.status === undefined) return { status: 'registered', reply };
  return { status: 'error', reply: {} };
}

/** Complete one pending challenge with the nonce from its push. Each challenge is tried once. */
async function completeChallenge(pending: PendingChallenge, nonce: string): Promise<void> {
  if (challenges.pending.get(pending.cid) !== pending) return;   // already handled: a duplicate push
  challenges.pending.delete(pending.cid);
  challenges.received.delete(pending.cid);
  try {
    if (Date.now() > pending.expiresAt) {
      pending.settle('again');
      return;
    }
    // Only ever for the account that asked: read the session again first.
    const sessionUserId = await currentUserId();
    if (sessionUserId !== pending.userId || challenges.userId !== pending.userId) {
      if (challenges.userId === pending.userId) clearChallenges();   // the signed-in account changed
      pending.settle('stop');
      return;
    }
    const { status } = await callRegisterDevice({
      protocol: 2,
      step: 'complete',
      push_token: pending.pushToken,
      platform: pending.platform,
      device_name: pending.deviceName,
      challenge_id: pending.cid,
      request_secret: pending.requestSecret,
      nonce,
    });
    if (status === 'registered') {
      markRegistered(pending.userId);
      pending.settle('registered');
    } else if (status === 'retry' && !challenges.registered) {
      pending.settle('again');
    } else {
      pending.settle('stop');   // includes a `retry` after `registered`: start nothing
    }
  } catch {
    pending.settle('stop');
  }
}

/** A challenge push arrived while the app runs: complete it if it is ours, else keep it up to 120 s. */
async function onChallengeReceived(data: unknown): Promise<void> {
  const challenge = readChallenge(data);
  if (!challenge || challenges.userId === null) return;   // not a challenge, or nobody signed in
  const now = Date.now();
  dropExpired(now);
  const pending = challenges.pending.get(challenge.cid);
  if (pending) {
    await completeChallenge(pending, challenge.nonce);
    return;
  }
  // Its begin reply may still be on the way (or it is not ours): keep it until it expires.
  if (!challenges.received.has(challenge.cid)) {
    challenges.received.set(challenge.cid, { nonce: challenge.nonce, receivedAt: now });
  }
}

/** The person tapped a challenge notice: complete it only if it matches a pending challenge. */
function onChallengeTapped(data: unknown): void {
  const challenge = readChallenge(data);
  if (!challenge || challenges.userId === null) return;
  dropExpired(Date.now());
  const pending = challenges.pending.get(challenge.cid);
  if (pending) void completeChallenge(pending, challenge.nonce);
}

/**
 * Install (or re-install) the challenge path: the notification handler that hides only the
 * challenge push, the received-notification listener that feeds challenges in, and a
 * sign-in watcher that drops every challenge on sign-out or on a change of account.
 * Safe to call more than once; throws if the handler cannot be set.
 */
function installChallengeHandling(Notifications: NotificationsModule): void {
  Notifications.setNotificationHandler({
    // Decided from the notification alone, with no storage, network or other waiting.
    handleNotification: (notification) =>
      Promise.resolve(isChallengeType(dataOf(notification)) ? HIDE_NOTIFICATION : SHOW_NOTIFICATION),
  });
  receivedSubscription?.remove();
  receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    void onChallengeReceived(dataOf(notification));
  });
  authSubscription?.unsubscribe();
  authSubscription = null;
  try {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (challenges.userId !== null && (session?.user?.id ?? null) !== challenges.userId) clearChallenges();
    });
    authSubscription = data.subscription;
  } catch {
    // Still safe: every completion reads the session again first.
  }
}

/** Start a registration run for `userId`, dropping any other account's challenges first. */
function startRun(userId: string): number {
  if (challenges.userId !== userId) clearChallenges();
  challenges.userId = userId;
  challenges.registered = false;
  challenges.run += 1;
  return challenges.run;
}

function isCurrentRun(run: number, userId: string): boolean {
  return challenges.run === run && challenges.userId === userId;
}

/** One attempt: begin, then wait up to 45 s for our own challenge push to be completed. */
async function beginAndWait(pushToken: string, userId: string, run: number): Promise<Outcome> {
  const platform: string = Platform.OS;
  const deviceName = Device.deviceName ?? null;
  const { status, reply } = await callRegisterDevice({
    protocol: 2,
    step: 'begin',
    push_token: pushToken,
    platform,
    device_name: deviceName,
  });
  if (!isCurrentRun(run, userId)) return 'stop';
  if (status === 'registered') {
    markRegistered(userId);   // already proven for this account: no challenge, no wait
    return 'registered';
  }
  if (status !== 'challenge') return 'stop';   // rate_limited, update_required, an error or an unknown reply
  const cid = reply.challenge_id;
  const requestSecret = reply.request_secret;
  if (typeof cid !== 'string' || cid === '' || typeof requestSecret !== 'string' || requestSecret === '') {
    return 'stop';
  }
  const expiresIn = reply.expires_in;
  const lifetimeMs =
    typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0
      ? Math.min(expiresIn * 1000, CHALLENGE_LIFETIME_MS)
      : CHALLENGE_LIFETIME_MS;
  let settle: (outcome: Outcome) => void = () => {};
  const outcome = new Promise<Outcome>((resolve) => {
    settle = resolve;
  });
  const pending: PendingChallenge = {
    cid,
    requestSecret,
    pushToken,
    platform,
    deviceName,
    userId,
    expiresAt: Date.now() + lifetimeMs,
    settle,
  };
  challenges.pending.set(cid, pending);
  // The push may have arrived before this reply; if so it was kept, so complete it now.
  dropExpired(Date.now());
  const early = challenges.received.get(cid);
  if (early) void completeChallenge(pending, early.nonce);
  return (await waitAtMost(outcome, CHALLENGE_WAIT_MS)) ?? 'again';
}

/** Begin → wait → complete, with one retry after 30 s while still in the foreground. */
async function proveThisDevice(pushToken: string, userId: string, run: number): Promise<boolean> {
  const first = await beginAndWait(pushToken, userId, run);
  if (first === 'again' && isForeground()) {
    await sleep(RETRY_DELAY_MS);
    // A late push may have completed the first challenge meanwhile: then start nothing.
    if (isCurrentRun(run, userId) && !challenges.registered && isForeground()) {
      await beginAndWait(pushToken, userId, run);
    }
  }
  return isCurrentRun(run, userId) && challenges.registered;
}

/**
 * Request permission, get the Expo push token, and prove to the backend that this app
 * installation receives that token's pushes (register-device protocol 2):
 *   begin → wait up to 45 s for our own challenge push → complete.
 * If no challenge arrives in time (or the server answers `retry`) and the app is still in
 * the foreground, it tries once more after 30 s, then stops until the next fresh start or
 * sign-in. The old one-step body is never sent.
 * Returns the token once the server reports it registered, or null when not possible
 * (no device / denied / Expo Go / not signed in / not proven / error).
 * NEVER throws.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;                 // simulators / Expo Go web
    if (isExpoGo()) return null;   // never import expo-notifications in Expo Go
    const Notifications = await import('expo-notifications');
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const push_token = tokenResp.data;
    const userId = await currentUserId();
    if (!userId) return null;   // a registration always belongs to a signed-in account
    // The handler and the challenge listener must be in place BEFORE begin.
    installChallengeHandling(Notifications);
    const run = startRun(userId);
    return (await proveThisDevice(push_token, userId, run)) ? push_token : null;
  } catch {
    return null;   // Expo Go on Android throws on getExpoPushTokenAsync — handled gracefully.
  }
}

/**
 * Remove THIS installation's push token for the CURRENTLY authenticated user.
 *
 * Call this while the user is STILL signed in (before supabase.auth.signOut()),
 * so RLS (device_tokens_delete: user_id = auth.uid()) scopes the delete to the
 * caller's own row for this exact device token. It therefore removes only the
 * (current user, current device token) association — never another user's row and
 * never this user's OTHER devices.
 *
 * Best-effort: NEVER throws and never logs the token — logout must proceed even if
 * push cleanup fails.
 */
export async function unregisterForPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) return;                 // simulators / Expo Go web
    if (isExpoGo()) return;   // never import expo-notifications in Expo Go
    const Notifications = await import('expo-notifications');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const push_token = tokenResp.data;
    // RLS restricts this DELETE to the current user's row for this token only.
    await supabase.from('device_tokens').delete().eq('push_token', push_token);
  } catch {
    // Best-effort — never block logout on push cleanup failure. No token logged.
  }
}

/** Extracts the notification identifier from a notification response, or undefined. */
function responseId(response: unknown): string | undefined {
  return (response as { notification?: { request?: { identifier?: string } } } | null | undefined)
    ?.notification?.request?.identifier;
}

/** Sets up notification-tap → deep-link routing for BOTH warm/background taps
 *  (live listener) AND cold-start taps that launched the app from a terminated
 *  state (getLastNotificationResponseAsync — the live listener can miss these).
 *
 *  A tap navigates at most once: responses are deduped by notification id, so a
 *  cold-start response that is also replayed to the live listener is not handled
 *  twice, and a stale launch response persisted from a previous session is not
 *  re-navigated on a normal relaunch.
 *
 *  It also installs the challenge path at mount (the handler that hides only the
 *  challenge push, and its listener). A tapped challenge notice never navigates; it
 *  only completes a matching pending challenge.
 *
 *  Dynamic import keeps expo-notifications out of the startup graph (Expo Go
 *  SDK 53+ crashes otherwise). Returns an unsubscribe function; no-ops gracefully
 *  in unsupported environments. */
export function setupNotificationResponseListener(navigate: (path: string) => void): () => void {
  if (isExpoGo()) return () => {};   // no-op cleanup; never imports expo-notifications
  let sub: { remove: () => void } | undefined;
  let cancelled = false;
  const navigatedIds = new Set<string>();

  // Navigate from a notification response at most once per notification id.
  function navigateFrom(response: unknown): void {
    const id = responseId(response);
    if (id) {
      if (navigatedIds.has(id)) return;   // this tap was already handled
      navigatedIds.add(id);
    }
    const data = (response as { notification?: { request?: { content?: { data?: unknown } } } } | null | undefined)
      ?.notification?.request?.content?.data;
    if (isChallengeType(data)) {
      onChallengeTapped(data);   // a challenge notice never navigates
      return;
    }
    const path = routeForNotificationData(data);
    if (path) navigate(path);
  }

  (async () => {
    try {
      const Notifications = await import('expo-notifications');
      if (cancelled) return;

      // 0. The challenge path: the handler and listener are in place from mount.
      try {
        installChallengeHandling(Notifications);
      } catch {
        // Registration installs it again before its first begin.
      }

      // 1. Live listener first — handles warm/background taps (unchanged behavior).
      sub = Notifications.addNotificationResponseReceivedListener((response) => navigateFrom(response));

      // 2. Cold start — the tap that launched the app arrives here, not via the
      //    live listener. Navigate from it unless it is a stale response already
      //    consumed in a previous session (Android retains it across launches).
      const last = await Notifications.getLastNotificationResponseAsync();
      if (cancelled || !last) return;
      const id = responseId(last);
      if (id) {
        let stale = false;
        try {
          stale = (await AsyncStorage.getItem(LAST_COLD_START_RESPONSE_KEY)) === id;
        } catch {
          stale = false;   // storage unavailable → treat as fresh
        }
        if (cancelled) return;
        if (stale) {
          navigatedIds.add(id);   // block the live listener from re-navigating it too
          return;
        }
        navigateFrom(last);
        try { await AsyncStorage.setItem(LAST_COLD_START_RESPONSE_KEY, id); } catch { /* ignore */ }
      } else {
        navigateFrom(last);
      }
    } catch {
      // Expo Go / unsupported — no-op.
    }
  })();
  return () => { cancelled = true; sub?.remove(); };
}
