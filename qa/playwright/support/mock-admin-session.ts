import { type Page } from '@playwright/test';

import {
  CERTIFIED_QA_PROJECT_REF,
  connectedModeConfigured,
  projectRefFromSupabaseUrl,
} from '../../shared/qa-target';

/**
 * mockAdminSession — a DASHBOARD-ISOLATION fixture (NOT a replacement for
 * real-login testing; the Admin Authentication suite remains the authority for
 * login behaviour).
 *
 * It lets the Executive Dashboard suite run fully offline and deterministically
 * by establishing an authenticated admin the *normal* way — the app's real
 * the admin application guard runs unchanged and the app resolves the session through
 * its own `supabase.auth.getSession()` + profile-role fetch. We do NOT bypass
 * the guard and we do NOT mount the dashboard component directly.
 *
 * What it stubs — the MINIMUM to establish an authenticated admin:
 *   1. A valid, non-expired Supabase session seeded into `localStorage` under the storage key of
 *      the SERVED project (derived from EXPO_PUBLIC_SUPABASE_URL, never from a file), under the
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

/**
 * The project the SERVED application is running against.
 *
 * This used to be read from the repo-root .env. That was correct only while the web server
 * served the consumer app from the repository root; once the admin app moved to apps/admin the
 * server took its environment from qa/.env and the two diverged. The mock then seeded the
 * session under a key the app never reads, every dashboard test landed on /login, and the one
 * test meant to prove the mock worked passed anyway because it asserted server-rendered text.
 *
 * The only defensible source is the same variable the server was started with. No file is read
 * and there is no fallback: an unknown project must fail, never be guessed.
 */
function servedProjectRef(): string {
  const ref = projectRefFromSupabaseUrl(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    'EXPO_PUBLIC_SUPABASE_URL',
  );
  if (connectedModeConfigured() && ref !== CERTIFIED_QA_PROJECT_REF) {
    throw new Error(
      'mockAdminSession: the served application does not resolve to the certified QA project.',
    );
  }
  return ref;
}

/**
 * True when the served project is knowable, i.e. the managed server was started with
 * EXPO_PUBLIC_SUPABASE_URL.
 *
 * False for a public-smoke run pointed at an external BASE_URL: a remote bundle has its project
 * baked in at export time and it is unobservable from here, which is the same reason
 * qa-target.ts refuses a remote origin for connected certification. Mock-authenticated admin
 * specs skip on false. Anonymous and public smoke coverage is unaffected because it never
 * seeds a session.
 */
export function mockAdminSessionConfigured(): boolean {
  try {
    servedProjectRef();
    return true;
  } catch {
    return false;
  }
}

/** Reason surfaced by the specs that skip when the served project is unknowable. */
export const MOCK_ADMIN_SESSION_SKIP_REASON =
  'mockAdminSession needs the served project (EXPO_PUBLIC_SUPABASE_URL). An external BASE_URL hides it, so no session can be seeded; run against the managed admin server.';

/** Supabase v2 persists the session under `sb-<project-ref>-auth-token`. */
export function supabaseStorageKey(): string {
  return `sb-${servedProjectRef()}-auth-token`;
}

/**
 * The admin shell sign-out control. AdminShell renders it ONLY for an authorized admin
 * (showChrome), so it cannot appear in server-rendered HTML nor on /login. Verified absent from
 * the exported analytics/index.html, analytics/detailed.html and login.html.
 */
export const ADMIN_SHELL_LANDMARK = 'Sign out';

/**
 * Wait for a POST-HYDRATION terminal outcome and report which one occurred.
 *
 * A content assertion made straight after goto() can be satisfied by static HTML before the
 * guard has decided anything, which is how a broken session mock looked healthy for three
 * commits. Waiting for either the authenticated shell or the login form forces the guard to
 * have run.
 *
 * Deliberately NOT waitForURL on a non-login pathname: the dashboard URL already satisfies that
 * at the moment of navigation, before any redirect can occur.
 */
export async function waitForAdminAuthOutcome(page: Page): Promise<'authenticated' | 'login'> {
  const shell = page.getByRole('button', { name: ADMIN_SHELL_LANDMARK }).first();
  const login = page.getByPlaceholder('admin@example.com').first();
  await shell.or(login).first().waitFor({ state: 'visible' });
  return (await shell.isVisible()) ? 'authenticated' : 'login';
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
