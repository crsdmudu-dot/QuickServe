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

/** Sign a QA role in via Supabase Auth and return its access token. */
export async function signIn(role: QaRole): Promise<string> {
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
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) throw new Error(`QA "${role}" sign-in returned no access_token.`);
    return body.access_token;
  } finally {
    await ctx.dispose();
  }
}

/** An authenticated PostgREST context for a QA role (apikey + Bearer token). */
export async function authedContext(role: QaRole): Promise<APIRequestContext> {
  const token = await signIn(role);
  return request.newContext({
    baseURL: qaSupabaseUrl(),
    extraHTTPHeaders: {
      apikey: qaSupabaseAnonKey() as string,
      Authorization: `Bearer ${token}`,
    },
  });
}
