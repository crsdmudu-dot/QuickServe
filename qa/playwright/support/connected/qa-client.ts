import { request, type APIRequestContext } from '@playwright/test';
import {
  qaSupabaseUrl,
  qaSupabaseAnonKey,
  qaAccount,
  assertNotProduction,
  type QaRole,
} from './qa-accounts';

/**
 * qa-client.ts — connected certification client for the DEDICATED QA/staging
 * Supabase project (QA Slice 44A). Drives the real backend at the API layer
 * (Supabase Auth + PostgREST) so certification proves real persistence, RLS, and
 * business rules — never mocked. `assertNotProduction()` guards every entry point.
 *
 * Callers gate on `certificationConfigured()` and dispose contexts they create.
 */

/** An anonymous (apikey-only) context — used for RLS-negative assertions. */
export async function anonContext(): Promise<APIRequestContext> {
  assertNotProduction();
  return request.newContext({
    baseURL: qaSupabaseUrl(),
    extraHTTPHeaders: { apikey: qaSupabaseAnonKey() as string },
  });
}

type Session = { accessToken: string; userId: string };

// Cache one sign-in per role per worker process. Supabase Auth rate-limits the
// token endpoint, so re-authenticating on every test/context (across parallel
// workers) triggers throttling that manifests as intermittent empty/failed
// reads. Caching the session keeps runs deterministic and fast. Tokens outlive a
// short certification run; a rejected sign-in is not cached so it can be retried.
const sessionCache = new Map<QaRole, Promise<Session>>();

async function performSignIn(role: QaRole): Promise<Session> {
  assertNotProduction();
  const acct = qaAccount(role);
  if (!acct) throw new Error(`No QA account configured for role "${role}".`);
  const ctx = await anonContext();
  try {
    const res = await ctx.post('/auth/v1/token?grant_type=password', {
      headers: { 'Content-Type': 'application/json' },
      data: { email: acct.email, password: acct.password },
    });
    if (!res.ok()) {
      throw new Error(`QA "${role}" sign-in failed: HTTP ${res.status()}.`);
    }
    const body = (await res.json()) as { access_token?: string; user?: { id?: string } };
    if (!body.access_token) throw new Error(`QA "${role}" sign-in returned no access_token.`);
    if (!body.user?.id) throw new Error(`QA "${role}" sign-in returned no user id.`);
    return { accessToken: body.access_token, userId: body.user.id };
  } finally {
    await ctx.dispose();
  }
}

/** Sign a QA role in via Supabase Auth; return its access token AND user id (cached per role). */
export async function signInWithUser(role: QaRole): Promise<Session> {
  let pending = sessionCache.get(role);
  if (!pending) {
    pending = performSignIn(role);
    sessionCache.set(role, pending);
    // Don't cache a failed sign-in — allow a later retry.
    pending.catch(() => sessionCache.delete(role));
  }
  return pending;
}

/** Sign a QA role in via Supabase Auth and return its access token. */
export async function signIn(role: QaRole): Promise<string> {
  return (await signInWithUser(role)).accessToken;
}

/** Build a PostgREST context from a raw bearer token. */
function contextForToken(token: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: qaSupabaseUrl(),
    extraHTTPHeaders: {
      apikey: qaSupabaseAnonKey() as string,
      Authorization: `Bearer ${token}`,
    },
  });
}

/** An authenticated PostgREST context for a QA role (apikey + Bearer token). */
export async function authedContext(role: QaRole): Promise<APIRequestContext> {
  return contextForToken(await signIn(role));
}

/** Authenticated context PLUS the role's user id (for owner-scoped writes). */
export async function authedContextWithUser(
  role: QaRole,
): Promise<{ ctx: APIRequestContext; userId: string }> {
  const { accessToken, userId } = await signInWithUser(role);
  return { ctx: await contextForToken(accessToken), userId };
}

// ── Service-role context (TEARDOWN/SETUP ONLY — never for asserting behavior) ──

/** True when the QA service-role key is available (needed for cleanup: bookings has no DELETE RLS policy). */
export function hasServiceRole(): boolean {
  return !!process.env.QA_SERVICE_ROLE_KEY?.trim();
}

/**
 * A service-role context that BYPASSES RLS. Used only to guarantee deterministic
 * cleanup of rows the tests created (bookings has no DELETE policy). It is NEVER
 * used to assert behavior — assertions always use anon/role tokens so RLS and
 * business rules are proven honestly.
 */
export async function serviceContext(): Promise<APIRequestContext> {
  assertNotProduction();
  const key = process.env.QA_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('QA_SERVICE_ROLE_KEY is required for certification cleanup.');
  return request.newContext({
    baseURL: qaSupabaseUrl(),
    extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}` },
  });
}
