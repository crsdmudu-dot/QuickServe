import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

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

/** Pure: resolve a notification's data payload to an expo-router path, or null. */
export function routeForNotificationData(data: unknown): string | null {
  if (data && typeof data === 'object') {
    const route = (data as Record<string, unknown>).route;
    if (typeof route === 'string' && route.length > 0) return route;
  }
  return null;
}

/**
 * Request permission, get the Expo push token, and register it with the backend.
 * Returns the token, or null when not possible (no device / denied / Expo Go / error).
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
    await supabase.functions.invoke('register-device', {
      body: { push_token, platform: Platform.OS, device_name: Device.deviceName ?? null },
    });
    return push_token;
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
    const path = routeForNotificationData(data);
    if (path) navigate(path);
  }

  (async () => {
    try {
      const Notifications = await import('expo-notifications');
      if (cancelled) return;

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
