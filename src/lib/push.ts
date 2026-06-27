import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

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

/** Sets up the notification-tap → deep-link listener. Dynamic import keeps
 *  expo-notifications out of the startup graph (Expo Go SDK 53 crashes otherwise).
 *  Returns an unsubscribe function; no-ops gracefully in unsupported environments. */
export function setupNotificationResponseListener(navigate: (path: string) => void): () => void {
  if (isExpoGo()) return () => {};   // no-op cleanup; never imports expo-notifications
  let sub: { remove: () => void } | undefined;
  let cancelled = false;
  (async () => {
    try {
      const Notifications = await import('expo-notifications');
      if (cancelled) return;
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const path = routeForNotificationData(response.notification.request.content.data);
        if (path) navigate(path);
      });
    } catch {
      // Expo Go / unsupported — no-op.
    }
  })();
  return () => { cancelled = true; sub?.remove(); };
}
