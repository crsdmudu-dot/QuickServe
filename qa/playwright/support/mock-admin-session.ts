import { type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * mockAdminSession — a DASHBOARD-ISOLATION fixture (NOT a replacement for
 * real-login testing; the Admin Authentication suite remains the authority for
 * login behaviour).
 *
 * It lets the Executive Dashboard suite run fully offline and deterministically
 * by establishing an authenticated admin the *normal* way — the app's real
 * `(admin-web)` guard runs unchanged and the app resolves the session through
 * its own `supabase.auth.getSession()` + profile-role fetch. We do NOT bypass
 * the guard and we do NOT mount the dashboard component directly.
 *
 * What it stubs — the MINIMUM to establish an authenticated admin:
 *   1. A valid, non-expired Supabase session seeded into `localStorage` under the
 *      real storage key (the app's web storage adapter reads `window.localStorage`
 *      with the raw key). Seeded via `addInitScript` so it exists before app code.
 *   2. The `/rest/v1/profiles` role query → `role: 'admin'` (what `useAdminGuard`
 *      checks). Also stubs the admin-shell unread-notifications count → empty.
 *   3. A network guard: ANY `/auth/v1/**` request is treated as unexpected (a
 *      valid stored session needs none in-window) and recorded; any other
 *      un-stubbed `/rest/v1/**` request is recorded as an unexpected dependency.
 *      `assertClean()` fails loudly if either occurred.
 *
 * No production authentication logic is modified; everything lives in `qa/`.
 */

export type NetworkGuard = {
  /** Any `/auth/v1/*` request seen (expected to be empty in mock mode). */
  readonly authRequests: string[];
  /** Any un-stubbed `/rest/v1/*` request seen (unexpected network dependency). */
  readonly unexpectedRest: string[];
  /** Throws with a useful diagnostic if any unexpected auth/rest traffic occurred. */
  assertClean(): void;
};

function rootSupabaseUrl(): string {
  const envPath = path.resolve(__dirname, '../../../.env');
  const content = fs.readFileSync(envPath, 'utf-8');
  const m = content.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m);
  if (!m) {
    throw new Error('mockAdminSession: EXPO_PUBLIC_SUPABASE_URL not found in the repo-root .env');
  }
  return m[1].trim();
}

/** Supabase v2 persists the session under `sb-<project-ref>-auth-token`. */
export function supabaseStorageKey(): string {
  const ref = new URL(rootSupabaseUrl()).hostname.split('.')[0];
  return `sb-${ref}-auth-token`;
}

/** A valid, non-expired session object shaped like a Supabase v2 Session. */
function mockAdminSessionObject(): unknown {
  const now = Math.floor(Date.now() / 1000);
  const iso = new Date(now * 1000).toISOString();
  return {
    access_token: 'mock.admin.access.token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600, // far beyond any refresh margin → no network refresh in-window
    refresh_token: 'mock-admin-refresh-token',
    user: {
      id: '00000000-0000-4000-8000-0000000000ad',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'qa.admin.mock@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: iso,
      updated_at: iso,
    },
  };
}

export async function installMockAdminSession(page: Page): Promise<NetworkGuard> {
  const authRequests: string[] = [];
  const unexpectedRest: string[] = [];

  const storageKey = supabaseStorageKey();
  const session = JSON.stringify(mockAdminSessionObject());

  // (1) Seed the session BEFORE any app code runs.
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    [storageKey, session] as [string, string],
  );

  // (3a) Fail-loud auth guard — a valid stored session needs no /auth/v1 traffic.
  await page.route('**/auth/v1/**', async (route) => {
    authRequests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.abort();
  });

  // (3b) General REST catch-all (lowest priority — specific routes below win).
  await page.route('**/rest/v1/**', async (route) => {
    unexpectedRest.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  // (2) Profile role → admin (what useAdminGuard checks). `.maybeSingle()` → object.
  await page.route('**/rest/v1/profiles*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ role: 'admin', approval_status: 'approved' }),
    });
  });

  // Admin-shell unread-notification count → empty (head/count request).
  await page.route('**/rest/v1/notifications*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '*/0' },
      body: '[]',
    });
  });

  // App-shell `ServicesProvider` loads the service catalog on mount (unrelated to
  // the dashboard's data). Stub empty so it's a known, offline, deterministic
  // dependency rather than an "unexpected" one.
  for (const table of ['services', 'service_categories']) {
    await page.route(`**/rest/v1/${table}*`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  }

  return {
    authRequests,
    unexpectedRest,
    assertClean() {
      if (authRequests.length > 0) {
        throw new Error(
          `mockAdminSession: unexpected auth request(s) occurred:\n  - ${authRequests.join('\n  - ')}`,
        );
      }
      if (unexpectedRest.length > 0) {
        throw new Error(
          `mockAdminSession: unexpected REST dependency(ies) occurred:\n  - ${unexpectedRest.join('\n  - ')}`,
        );
      }
    },
  };
}
