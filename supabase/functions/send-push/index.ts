/**
 * send-push/index.ts — Supabase Edge Function (Deno).
 *
 * Webhook receiver that translates database trigger payloads into Expo push
 * notifications and fans them out to each recipient's registered devices.
 *
 * Security: JWT verification is DISABLED (verify_jwt = false in config.toml)
 * because this function is called by a Supabase database webhook, not a user.
 * Instead, the caller must supply a high-entropy shared secret in the
 * `x-webhook-secret` request header, verified in constant time.
 * The secret is set via `supabase secrets set PUSH_WEBHOOK_SECRET=<value>`;
 * the function rejects all requests when the secret is missing/empty.
 *
 * This function ALWAYS returns HTTP 200 so pg_net does not retry on errors
 * (a retry-storm could DDoS Expo). Errors are logged and swallowed.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildExpoMessages,
  notificationForChatMessage,
  notificationForPaymentPaid,
  notificationsForBookingUpdate,
  parsePushReceipts,
} from '../_shared/notifications.ts';
import type { NotificationSpec } from '../_shared/notifications.ts';
import { sendExpoPush } from '../_shared/expo-push-client.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Length-checked constant-time string comparison (avoids token timing leaks). */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** Always-200 JSON response. */
function ok200(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // 1. Constant-time gate: reject when secret is missing or wrong.
  //    Rejects immediately when PUSH_WEBHOOK_SECRET is unset so a missing
  //    config never authorizes an unauthorized caller.
  const token = req.headers.get('x-webhook-secret') ?? '';
  const expected = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';
  if (expected.length === 0 || !safeEqual(token, expected)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // 2. Parse the database webhook payload safely.
    let body: { table?: string; record?: Record<string, unknown>; old_record?: Record<string, unknown> } | null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const table = body?.table ?? '';
    const record = body?.record ?? {};
    const old_record = body?.old_record ?? {};

    // 3. Service-role client — needed to read bookings and delete stale tokens.
    //    This bypasses RLS (intentional: webhooks are server-side).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 4. Derive notification specs from the table + payload.
    const specs: NotificationSpec[] = [];

    if (table === 'bookings') {
      // Booking status / quote_status change.
      const s = notificationsForBookingUpdate(
        record as Parameters<typeof notificationsForBookingUpdate>[0],
        old_record as Parameters<typeof notificationsForBookingUpdate>[1],
      );
      specs.push(...s);
    } else if (table === 'payments') {
      // Payment marked paid.
      const s = notificationForPaymentPaid(
        record as Parameters<typeof notificationForPaymentPaid>[0],
        old_record as Parameters<typeof notificationForPaymentPaid>[1],
      );
      if (s) specs.push(s);
    } else if (table === 'booking_messages') {
      // New chat message — fetch the booking to find customer + provider.
      const { data: booking } = await admin
        .from('bookings')
        .select('customer_id, assigned_provider_id')
        .eq('id', record['booking_id'])
        .maybeSingle();

      if (booking) {
        const s = notificationForChatMessage(
          record as Parameters<typeof notificationForChatMessage>[0],
          booking as Parameters<typeof notificationForChatMessage>[1],
        );
        if (s) specs.push(s);
      }
    }
    // Any other table → no specs; fall through to 200.

    // 5. Fan out: for each spec, look up tokens, send, prune dead tokens.
    for (const spec of specs) {
      const { data: rows } = await admin
        .from('device_tokens')
        .select('push_token')
        .eq('user_id', spec.recipientUserId);

      const tokens = (rows ?? []).map((r: { push_token: string }) => r.push_token);
      if (tokens.length === 0) continue;

      const messages = buildExpoMessages(tokens, spec);
      const resp = await sendExpoPush(messages);

      // Prune tokens that Expo has flagged as DeviceNotRegistered.
      const dead = parsePushReceipts(resp, tokens);
      if (dead.length > 0) {
        await admin.from('device_tokens').delete().in('push_token', dead);
      }
    }
  } catch (err) {
    // Log but still return 200 — avoids pg_net retry storms.
    console.error('[send-push] Unexpected error:', err);
  }

  // 6. Always 200.
  return ok200();
});
