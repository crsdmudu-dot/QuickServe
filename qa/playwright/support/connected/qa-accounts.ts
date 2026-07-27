/**
 * qa-accounts.ts — configuration + gating for the Launch Certification Suite
 * (QA Slice 44A). CONNECTED MODE ONLY.
 *
 * Decision A: the connected certification suite targets a DEDICATED QA/staging
 * Supabase project — NEVER production, and NEVER the app's own
 * `EXPO_PUBLIC_SUPABASE_URL`. It is configured through a separate `QA_*` variable
 * namespace so it is impossible to accidentally run write-tests against the
 * production backend.
 *
 * Decision B: four persistent accounts (1 customer, 1 admin, 2 providers) are
 * provisioned once (see `qa/scripts/provision-accounts.mjs`) and reused.
 *
 * If any required variable is missing, the certification suite skips cleanly.
 * It never falls back to the app's production project.
 */

export type QaRole = 'customer' | 'admin' | 'provider1' | 'provider2';

export type QaAccount = { email: string; password: string };

/** The dedicated QA/staging Supabase project URL (NOT the app's production URL). */
export function qaSupabaseUrl(): string | undefined {
  return process.env.QA_SUPABASE_URL?.trim() || undefined;
}

/** The QA project's anon key (public — used for RLS-negative assertions). */
export function qaSupabaseAnonKey(): string | undefined {
  return process.env.QA_SUPABASE_ANON_KEY?.trim() || undefined;
}

const ENV_KEYS: Record<QaRole, { email: string; password: string }> = {
  customer: { email: 'QA_CUSTOMER_EMAIL', password: 'QA_CUSTOMER_PASSWORD' },
  admin: { email: 'QA_ADMIN_EMAIL', password: 'QA_ADMIN_PASSWORD' },
  provider1: { email: 'QA_PROVIDER1_EMAIL', password: 'QA_PROVIDER1_PASSWORD' },
  provider2: { email: 'QA_PROVIDER2_EMAIL', password: 'QA_PROVIDER2_PASSWORD' },
};

/** The persistent QA account for a role, or undefined if not configured. */
export function qaAccount(role: QaRole): QaAccount | undefined {
  const keys = ENV_KEYS[role];
  const email = process.env[keys.email]?.trim();
  const password = process.env[keys.password]?.trim();
  if (!email || !password) return undefined;
  return { email, password };
}

/** All four accounts must be present for a full cross-role certification run. */
export function allQaAccountsConfigured(): boolean {
  return (['customer', 'admin', 'provider1', 'provider2'] as QaRole[]).every((r) => !!qaAccount(r));
}

/**
 * True only when a DEDICATED QA backend + all four persistent accounts are
 * configured. The certification suite gates every connected test on this and
 * skips (never targets production) otherwise.
 */
export function certificationConfigured(): boolean {
  return !!qaSupabaseUrl() && !!qaSupabaseAnonKey() && allQaAccountsConfigured();
}

/** Human-readable reason for a skip, listing exactly what is missing. */
export function certificationSkipReason(): string {
  const missing: string[] = [];
  if (!qaSupabaseUrl()) missing.push('QA_SUPABASE_URL');
  if (!qaSupabaseAnonKey()) missing.push('QA_SUPABASE_ANON_KEY');
  for (const r of ['customer', 'admin', 'provider1', 'provider2'] as QaRole[]) {
    if (!qaAccount(r)) missing.push(`QA_${r.toUpperCase()}_EMAIL/PASSWORD`);
  }
  return `Launch Certification requires a dedicated QA Supabase project + persistent accounts. Missing: ${missing.join(', ')}. See qa/docs/LAUNCH-CERTIFICATION.md.`;
}

/**
 * Guard: refuse to run certification against the app's production project.
 * If someone points QA_SUPABASE_URL at the same host as the app's
 * EXPO_PUBLIC_SUPABASE_URL, that is a misconfiguration — fail loudly.
 */
export function assertNotProduction(): void {
  const qa = qaSupabaseUrl();
  const app = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (qa && app && new URL(qa).host === new URL(app).host) {
    throw new Error(
      'REFUSING TO RUN: QA_SUPABASE_URL points at the app EXPO_PUBLIC_SUPABASE_URL host. ' +
        'Launch Certification must use a DEDICATED QA/staging project (Decision A), never production.',
    );
  }
}
