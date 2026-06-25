/**
 * register-device/index.ts — Supabase Edge Function (Deno).
 *
 * Registers (or updates) a device push token for the authenticated user.
 *
 * Security: JWT verification is ENABLED (verify_jwt = true in config.toml).
 * The caller must supply a valid Supabase user JWT in the Authorization header.
 *
 * The user-scoped client is used for all writes so RLS ensures a user can only
 * upsert their OWN row in device_tokens (user_id = auth.uid()).
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Send a JSON response with the given HTTP status code. */
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
    // 1. Read the Authorization header and parse the request body.
    const authHeader = req.headers.get('Authorization') ?? '';

    let body: {
      push_token?: unknown;
      platform?: unknown;
      device_name?: unknown;
      native_push_token?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'Invalid request.' }, 400);
    }

    const { push_token, platform, device_name, native_push_token } = body as {
      push_token?: string;
      platform?: string;
      device_name?: string;
      native_push_token?: string;
    };

    // 2. Validate required fields.
    const validPlatforms = ['ios', 'android', 'web'];
    if (!push_token || !platform || !validPlatforms.includes(platform)) {
      return json({ ok: false, error: 'Invalid request.' }, 400);
    }

    // 3. Build a user-scoped client that respects RLS.
    //    This client acts as the authenticated user — it cannot write rows
    //    owned by other users.
    const client = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // 4. Verify the JWT and get the user.
    const {
      data: { user },
    } = await client.auth.getUser();

    if (!user) {
      return json({ ok: false, error: 'Unauthorized.' }, 401);
    }

    // 5. Upsert the device token row.
    //    onConflict: 'user_id,push_token' — updates last_seen_at on re-registration.
    const { error } = await client.from('device_tokens').upsert(
      {
        user_id: user.id,
        push_token,
        provider: 'expo',
        platform,
        device_name: device_name ?? null,
        native_push_token: native_push_token ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,push_token' },
    );

    if (error) {
      return json({ ok: false, error: 'Could not register device.' }, 500);
    }

    return json({ ok: true });
  } catch {
    return json({ ok: false, error: 'Unexpected error.' }, 500);
  }
});
