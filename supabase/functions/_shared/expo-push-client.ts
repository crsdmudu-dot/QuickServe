/**
 * expo-push-client.ts — Deno helper to POST messages to Expo's push API.
 *
 * This is a Deno file (uses fetch from the global Deno runtime).
 * It is excluded from the app's tsconfig.json.
 */

/**
 * Send one or more Expo push messages and return the raw JSON response.
 *
 * @param messages - Array of Expo push message objects (built by buildExpoMessages).
 * @returns The raw JSON response from the Expo Push API.
 */
export async function sendExpoPush(messages: unknown[]): Promise<Record<string, unknown>> {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  return await res.json();
}
