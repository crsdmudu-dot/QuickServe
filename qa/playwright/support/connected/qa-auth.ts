import { request, type APIRequestContext } from '@playwright/test';
import { qaSupabaseUrl, qaSupabaseAnonKey, qaAccount, assertNotProduction, type QaRole } from './qa-accounts';

/**
 * qa-auth.ts — connected auth-lifecycle + onboarding primitives (Phase 1B).
 *
 * Drives the REAL Supabase Auth (GoTrue) endpoints of the dedicated QA project:
 *   - password / refresh_token grants, logout, invalid-token contexts (auth lifecycle)
 *   - admin-API user create/delete (onboarding: exercises the on_auth_user_created
 *     trigger without the public-signup email-send rate limit) + public signup for
 *     validation-failure paths.
 *
 * assertNotProduction() guards every entry point. Created users are swept
 * deterministically by an email prefix via the service role.
 */

/** Sweepable prefix for every ephemeral onboarding user this suite creates. */
export const EPHEMERAL_EMAIL_PREFIX = 'qa-p1b';

/** A unique, sweepable email under a domain the QA project accepts. */
export function makeEphemeralEmail(tag = 'user'): string {
  return `${EPHEMERAL_EMAIL_PREFIX}-${tag}-${crypto.randomUUID()}@example.com`;
}

type RawResult = { status: number; body: Record<string, unknown>; text: string };

async function readJson(res: { status(): number; text(): Promise<string> }): Promise<RawResult> {
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  return { status: res.status(), body, text };
}

async function anon(): Promise<APIRequestContext> {
  assertNotProduction();
  return request.newContext({
    baseURL: qaSupabaseUrl(),
    extraHTTPHeaders: { apikey: qaSupabaseAnonKey() as string, 'Content-Type': 'application/json' },
  });
}

async function service(): Promise<APIRequestContext> {
  assertNotProduction();
  const key = process.env.QA_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('QA_SERVICE_ROLE_KEY is required for onboarding tests.');
  return request.newContext({
    baseURL: qaSupabaseUrl(),
    extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
}

// ── Auth lifecycle ────────────────────────────────────────────────────────

export type TokenSet = { accessToken: string; refreshToken: string; userId: string };

/** A FRESH password-grant sign-in (uncached) returning the full token set for a persistent role. */
export async function passwordGrantFresh(role: QaRole): Promise<TokenSet> {
  const acct = qaAccount(role);
  if (!acct) throw new Error(`No QA account configured for role "${role}".`);
  const ctx = await anon();
  try {
    const r = await readJson(
      await ctx.post('/auth/v1/token?grant_type=password', { data: { email: acct.email, password: acct.password } }),
    );
    if (r.status !== 200 || !r.body.access_token) {
      throw new Error(`passwordGrantFresh("${role}") failed: HTTP ${r.status}`);
    }
    return {
      accessToken: r.body.access_token as string,
      refreshToken: r.body.refresh_token as string,
      userId: (r.body.user as { id?: string } | undefined)?.id as string,
    };
  } finally {
    await ctx.dispose();
  }
}

/** Raw password grant that does NOT throw — for negative assertions (wrong password). */
export async function passwordGrantRaw(email: string, password: string): Promise<RawResult> {
  const ctx = await anon();
  try {
    return await readJson(await ctx.post('/auth/v1/token?grant_type=password', { data: { email, password } }));
  } finally {
    await ctx.dispose();
  }
}

/** Exchange a refresh token for a new access token (grant_type=refresh_token). */
export async function refreshGrantRaw(refreshToken: string): Promise<RawResult> {
  const ctx = await anon();
  try {
    return await readJson(
      await ctx.post('/auth/v1/token?grant_type=refresh_token', { data: { refresh_token: refreshToken } }),
    );
  } finally {
    await ctx.dispose();
  }
}

/** Revoke the session for an access token (GoTrue logout). */
export async function logout(accessToken: string): Promise<number> {
  const ctx = await request.newContext({
    baseURL: qaSupabaseUrl(),
    extraHTTPHeaders: {
      apikey: qaSupabaseAnonKey() as string,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  try {
    return (await ctx.post('/auth/v1/logout')).status();
  } finally {
    await ctx.dispose();
  }
}

/** A PostgREST context carrying a bogus bearer token (for expired/invalid-session assertions). */
export async function invalidTokenContext(): Promise<APIRequestContext> {
  assertNotProduction();
  return request.newContext({
    baseURL: qaSupabaseUrl(),
    extraHTTPHeaders: {
      apikey: qaSupabaseAnonKey() as string,
      Authorization: 'Bearer not-a-real-token.abc.def',
    },
  });
}

// ── Onboarding ────────────────────────────────────────────────────────────

/** Public signup (the endpoint the app uses) — does NOT throw; for validation-failure paths. */
export async function signupPublicRaw(
  email: string,
  password: string,
  meta: Record<string, unknown> = {},
): Promise<RawResult> {
  const ctx = await anon();
  try {
    return await readJson(await ctx.post('/auth/v1/signup', { data: { email, password, data: meta } }));
  } finally {
    await ctx.dispose();
  }
}

/**
 * Create a confirmed user via the admin API (service role). Fires the
 * on_auth_user_created → handle_new_user trigger identically to public signup,
 * without the signup email-send rate limit. Returns the created user id.
 */
export async function adminCreateUser(
  email: string,
  password: string,
  meta: Record<string, unknown> = {},
): Promise<RawResult> {
  const svc = await service();
  try {
    return await readJson(
      await svc.post('/auth/v1/admin/users', {
        data: { email, password, email_confirm: true, user_metadata: meta },
      }),
    );
  } finally {
    await svc.dispose();
  }
}

/** Sign a specific email/password in and return its access token (for own-profile RLS reads). */
export async function signInAs(email: string, password: string): Promise<string | null> {
  const r = await passwordGrantRaw(email, password);
  return (r.body.access_token as string | undefined) ?? null;
}

/** Read a user's OWN profile via RLS (profiles_select_own) with their token. */
export async function readOwnProfile(accessToken: string, userId: string): Promise<Record<string, unknown>[]> {
  const ctx = await request.newContext({
    baseURL: qaSupabaseUrl(),
    extraHTTPHeaders: { apikey: qaSupabaseAnonKey() as string, Authorization: `Bearer ${accessToken}` },
  });
  try {
    const res = await ctx.get(`/rest/v1/profiles?id=eq.${userId}&select=role,approval_status`);
    return (await res.json()) as Record<string, unknown>[];
  } finally {
    await ctx.dispose();
  }
}

/** Delete a specific user via the admin API (profiles cascade). */
export async function adminDeleteUser(userId: string): Promise<void> {
  const svc = await service();
  try {
    await svc.delete(`/auth/v1/admin/users/${userId}`);
  } finally {
    await svc.dispose();
  }
}

// ── Provider-onboarding admin notification ──────────────────────────────────
//
// Creating a provider profile fires tg_notify_provider_pending (migration 0020), which fans an
// admin notification out through notify_admins with p_booking_id NULL. That row is unreachable
// from booking-scoped marker cleanup (no booking) and survives deletion of the provider user
// (its user_id is the ADMIN recipient, not the provider), so certification runs accumulated one
// row each. The dedup_key is the only thing that ties a row to the fixture that caused it.

/** The notification type tg_notify_provider_pending emits. */
export const PROVIDER_PENDING_NOTIFICATION_TYPE = 'admin_provider_pending';

/**
 * The BASE key tg_notify_provider_pending passes to notify_admins:
 *     new.id::text || ':admin_provider_pending'
 * where new.id is the profiles row id, which is the auth user id.
 *
 * This is NOT what is stored. notify_admins fans the notification out one row per approved
 * admin and appends the recipient for per-row uniqueness (0020_notification_system.sql):
 *     p_dedup_base || ':' || r.id::text
 * so matching the base alone matches nothing at all.
 */
export function providerPendingDedupBase(profileId: string): string {
  return `${profileId}:${PROVIDER_PENDING_NOTIFICATION_TYPE}`;
}

/**
 * Every stored dedup_key for one provider fixture: the base plus each approved admin recipient.
 * Exact values, never a pattern — a row for a different provider cannot be built from this list.
 */
export function providerPendingDedupKeys(profileId: string, adminIds: string[]): string[] {
  const base = providerPendingDedupBase(profileId);
  return adminIds.map((adminId) => `${base}:${adminId}`);
}

/**
 * The approved admin profiles notify_admins fans out to. Read once per teardown and reused, so
 * the composed keys match exactly the rows the trigger produced.
 */
export async function approvedAdminProfileIds(): Promise<string[]> {
  assertNotProduction();
  const svc = await service();
  try {
    const res = await svc.get('/rest/v1/profiles?select=id&role=eq.admin&approval_status=eq.approved');
    if (res.status() >= 400) throw new Error(`approvedAdminProfileIds HTTP ${res.status()}`);
    return ((await res.json()) as { id: string }[]).map((row) => row.id);
  } finally {
    await svc.dispose();
  }
}

/**
 * Count of admin provider-pending notifications carrying no booking.
 *
 * Used for a DELTA-ZERO assertion, never an absolute one: rows orphaned by an earlier crash
 * (profile already gone, notification left behind) cannot have their ownership inferred and are
 * deliberately left for separately authorised bounded cleanup.
 */
export async function countProviderPendingNotifications(): Promise<number> {
  assertNotProduction();
  const svc = await service();
  try {
    const res = await svc.get(
      `/rest/v1/notifications?select=id&type=eq.${PROVIDER_PENDING_NOTIFICATION_TYPE}&booking_id=is.null`,
      { headers: { Prefer: 'count=exact', Range: '0-0' } },
    );
    if (res.status() >= 400) {
      throw new Error(`countProviderPendingNotifications HTTP ${res.status()}`);
    }
    const range = res.headers()['content-range'] ?? '';
    const total = range.includes('/') ? Number(range.split('/')[1]) : NaN;
    if (Number.isNaN(total)) throw new Error('countProviderPendingNotifications: no exact count returned');
    return total;
  } finally {
    await svc.dispose();
  }
}

/**
 * Delete ONLY the provider-pending notifications caused by this fixture profile.
 *
 * All three predicates are required and all are exact: the type, a NULL booking_id, and a
 * dedup_key drawn from the composed set for THIS profile. `in.` is exact-set equality, not a
 * pattern: no prefix match, no LIKE, no bare type delete and no time window, none of which
 * could distinguish a fixture row from a genuine admin notification.
 *
 * Returns the number of rows actually removed. An earlier version matched the base key alone,
 * which the fan-out never stores: the request succeeded, deleted nothing, and the leak went
 * unnoticed until the delta-zero assertion caught it. Reporting the count makes a silent
 * zero-row delete visible to the caller.
 */
export async function deleteProviderPendingNotification(
  profileId: string,
  adminIds?: string[],
): Promise<number> {
  assertNotProduction();
  const recipients = adminIds ?? (await approvedAdminProfileIds());
  if (recipients.length === 0) return 0;
  const keys = providerPendingDedupKeys(profileId, recipients);
  const inList = `(${keys.map((key) => `"${key}"`).join(",")})`;
  const svc = await service();
  try {
    const res = await svc.delete(
      `/rest/v1/notifications?type=eq.${PROVIDER_PENDING_NOTIFICATION_TYPE}&booking_id=is.null&dedup_key=in.${encodeURIComponent(inList)}`,
      { headers: { Prefer: 'return=representation' } },
    );
    if (res.status() >= 400) {
      throw new Error(`deleteProviderPendingNotification HTTP ${res.status()}`);
    }
    const removed = (await res.json()) as unknown[];
    return Array.isArray(removed) ? removed.length : 0;
  } finally {
    await svc.dispose();
  }
}

/**
 * Safety-net sweep: delete every auth user whose email starts with the ephemeral
 * prefix. Guarantees repeated runs leave the QA project clean even after a crash.
 *
 * Order matters. Each surviving id is collected and its exact notification removed FIRST, while
 * ownership is still provable; deleting the user first would leave a row nothing could attribute.
 */
export async function sweepEphemeralUsers(prefix = EPHEMERAL_EMAIL_PREFIX): Promise<void> {
  const recipients = await approvedAdminProfileIds();
  const svc = await service();
  try {
    // The admin list endpoint is paginated; one page (default 50) is ample for a run.
    const res = await svc.get('/auth/v1/admin/users?per_page=200');
    const body = (await res.json()) as { users?: { id: string; email?: string }[] };
    const victims = (body.users ?? []).filter((u) => (u.email ?? '').startsWith(prefix));
    for (const u of victims) {
      await deleteProviderPendingNotification(u.id, recipients);
      await svc.delete(`/auth/v1/admin/users/${u.id}`);
    }
  } finally {
    await svc.dispose();
  }
}
