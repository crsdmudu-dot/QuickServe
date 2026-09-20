/**
 * qa-target.ts — fail-closed target validation for the connected certification suite.
 *
 * WHY THIS EXISTS. The previous guard (`assertNotProduction`) was RELATIVE: it refused to run
 * only when QA_SUPABASE_URL happened to match the app's EXPO_PUBLIC_SUPABASE_URL host. That
 * comparison silently passes whenever the app variable is absent — which is the normal state of
 * a fresh checkout, because the root .env is git-ignored. A missing variable therefore disabled
 * the guard entirely, and any project ref (including Production, or an unrelated third project)
 * would have been accepted for a full write suite driven by a service-role key.
 *
 * This module is ABSOLUTE instead: exactly one project ref is certified for connected runs, and
 * anything else — missing, malformed, Production, or simply unknown — is refused. It has no
 * dependencies (not even dotenv) so it can be exercised offline and imported from the Playwright
 * config, the global setup and the connected client alike.
 *
 * DISCLOSURE RULE. Every message here names at most a PROJECT REF, which is a public identifier
 * that already appears in committed configuration. No key, password, token or complete
 * credential-bearing URL is ever interpolated into an error, a log line or a thrown message.
 */

/**
 * The only Supabase project connected certification may touch: the dedicated QA project.
 * Production and every other project — including unknown ones — are refused.
 */
export const CERTIFIED_QA_PROJECT_REF = 'wjvjuplooidctlxxozws';

/** Supabase project refs are twenty lowercase letters. */
const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const SUPABASE_HOST_SUFFIX = '.supabase.co';

/**
 * Extract the project ref from a Supabase URL, validating it structurally.
 *
 * Throws — never returns a fallback — when the value is missing, is not a URL, is not https,
 * is not a `<ref>.supabase.co` host, or carries a ref of the wrong shape. The raw value is not
 * echoed: only the variable name and, where it is safely derivable, the ref itself.
 */
export function projectRefFromSupabaseUrl(raw: string | undefined, varName: string): string {
  const value = raw?.trim();
  if (!value) {
    throw new Error(`REFUSING TO RUN: ${varName} is not set. Connected certification requires the dedicated QA project.`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`REFUSING TO RUN: ${varName} is not a valid URL.`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`REFUSING TO RUN: ${varName} must use https.`);
  }
  if (!url.hostname.endsWith(SUPABASE_HOST_SUFFIX)) {
    throw new Error(`REFUSING TO RUN: ${varName} is not a ${SUPABASE_HOST_SUFFIX} host.`);
  }

  const ref = url.hostname.slice(0, -SUPABASE_HOST_SUFFIX.length);
  if (!PROJECT_REF_PATTERN.test(ref)) {
    throw new Error(`REFUSING TO RUN: ${varName} does not carry a well-formed Supabase project ref.`);
  }
  return ref;
}

/**
 * Validate the DATABASE target (QA_SUPABASE_URL) and return its ref.
 *
 * Every connected client, service-role context and destructive cleanup path calls this BEFORE
 * constructing a request context or issuing a mutation, so a misconfigured run cannot reach a
 * non-certified database at all.
 */
export function assertCertifiedQaDatabase(): string {
  const ref = projectRefFromSupabaseUrl(process.env.QA_SUPABASE_URL, 'QA_SUPABASE_URL');
  if (ref !== CERTIFIED_QA_PROJECT_REF) {
    throw new Error(
      `REFUSING TO RUN: QA_SUPABASE_URL points at project "${ref}", which is not the certified QA project ` +
        `"${CERTIFIED_QA_PROJECT_REF}". Connected certification runs against that project only — never Production, ` +
        'and never an unrecognised project.',
    );
  }
  return ref;
}

/**
 * Validate the ADMIN APPLICATION's backend, which the UI path authenticates against.
 *
 * The database guard above does not cover this: global setup and the admin UI specs drive the
 * served application, whose backend comes from EXPO_PUBLIC_SUPABASE_URL at serve time. Both must
 * resolve to the same certified QA project, or a UI login could authenticate a real administrator
 * against a different backend.
 *
 * The anon key is required to be PRESENT but is never read into a message.
 */
export function assertCertifiedAdminApp(): void {
  const appRef = projectRefFromSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL');
  if (appRef !== CERTIFIED_QA_PROJECT_REF) {
    throw new Error(
      `REFUSING TO RUN: the admin application's EXPO_PUBLIC_SUPABASE_URL points at project "${appRef}", ` +
        `not the certified QA project "${CERTIFIED_QA_PROJECT_REF}".`,
    );
  }
  if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    throw new Error('REFUSING TO RUN: EXPO_PUBLIC_SUPABASE_ANON_KEY is not set for the admin application.');
  }
  if (!process.env.QA_SUPABASE_ANON_KEY?.trim()) {
    throw new Error('REFUSING TO RUN: QA_SUPABASE_ANON_KEY is not set.');
  }

  const dbRef = assertCertifiedQaDatabase();
  if (dbRef !== appRef) {
    throw new Error(
      `REFUSING TO RUN: the admin application (project "${appRef}") and QA_SUPABASE_URL (project "${dbRef}") ` +
        'identify different projects. They must be the same certified QA project.',
    );
  }
}

/**
 * Validate the BASE_URL the browser drives.
 *
 * Connected certification accepts only a loopback origin, i.e. the admin application launched
 * locally by this Playwright config. An arbitrary remote BASE_URL is refused because nothing in
 * the run can prove which backend a remote deployment was built against — the served bundle's
 * project is baked in at export time and is not observable from here. Point BASE_URL at a remote
 * origin only once the served application can prove its own backend project at runtime.
 */
export function assertLoopbackBaseUrl(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('REFUSING TO RUN: BASE_URL is not a valid URL.');
  }
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  if (!LOOPBACK.has(url.hostname)) {
    throw new Error(
      `REFUSING TO RUN: BASE_URL host "${url.hostname}" is not loopback. Connected certification drives only the ` +
        'locally launched admin application, because a remote deployment cannot prove which backend project it ' +
        'was built against.',
    );
  }
}

/** All three gates, in the order a run encounters them. Used by global setup. */
export function assertCertifiedConnectedTarget(baseUrl: string): void {
  assertLoopbackBaseUrl(baseUrl);
  assertCertifiedAdminApp();
}

// ── Server ownership ────────────────────────────────────────────────────────────────────────
//
// A loopback origin is necessary but NOT sufficient. Playwright's `reuseExistingServer` would
// happily attach to whatever already answers on the port — and the loopback guard cannot tell a
// Playwright-managed admin server from an unrelated dev server someone left running. Expo's
// default 8081 makes that collision likely rather than theoretical: a consumer dev server on
// 8081 would be accepted as "loopback" and then serve 404s, or worse, a differently-configured
// build.
//
// Connected certification therefore OWNS its server: a dedicated port, `reuseExistingServer:
// false`, and a base URL derived here rather than read from the environment. If the port is
// occupied, Playwright fails to start the server and the run stops before global setup and
// before any credential is submitted.

/** Loopback host for the Playwright-managed admin instance. */
export const ADMIN_TEST_HOST = '127.0.0.1';

/**
 * Dedicated admin-test port. Deliberately NOT Expo's default 8081, so an unrelated Expo dev
 * server cannot be mistaken for this suite's admin instance.
 */
export const ADMIN_TEST_PORT = 8473;

/** The only base URL connected certification drives. Derived — never read from the environment. */
export const ADMIN_TEST_BASE_URL = `http://${ADMIN_TEST_HOST}:${ADMIN_TEST_PORT}`;

/** Working directory of the managed server: exactly the separated admin application. */
export const ADMIN_SERVER_CWD = '../apps/admin';

/** The managed server command. Shares ADMIN_TEST_PORT so command and base URL cannot diverge. */
export const ADMIN_SERVER_COMMAND = `npm run start -- --port ${ADMIN_TEST_PORT}`;

/**
 * True when this run is connected: either UI admin credentials or a QA database target is
 * configured. Kept to environment variables only so this module stays dependency-free and does
 * not form an import cycle with qa-accounts.
 */
export function connectedModeConfigured(): boolean {
  const hasUiCreds = !!(process.env.E2E_ADMIN_EMAIL?.trim() && process.env.E2E_ADMIN_PASSWORD?.trim());
  const hasQaDatabase = !!process.env.QA_SUPABASE_URL?.trim();
  return hasUiCreds || hasQaDatabase;
}

/**
 * Refuse an externally supplied BASE_URL in connected mode.
 *
 * An external value could point at an already-running server this suite does not own — including
 * a loopback one, which the loopback guard alone would accept. Connected runs always use the
 * managed instance, so any attempt to override it is a configuration error, not a preference.
 */
export function assertManagedServerBaseUrl(configuredBaseUrl: string): void {
  if (configuredBaseUrl !== ADMIN_TEST_BASE_URL) {
    throw new Error(
      `REFUSING TO RUN: connected certification drives only the Playwright-managed admin instance at ` +
        `${ADMIN_TEST_BASE_URL}, but the configured base URL is "${configuredBaseUrl}". ` +
        'Unset BASE_URL — connected runs must not attach to a server this suite does not own.',
    );
  }
}
