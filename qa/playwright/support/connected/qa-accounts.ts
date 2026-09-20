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
 *
 * Decision C (fail closed): targeting is no longer only a namespace convention. Exactly one
 * project ref is certified for connected runs and `assertCertifiedQaDatabase()` refuses every
 * other target — missing, malformed, Production, or unrecognised. See shared/qa-target.ts.
 */

import { assertCertifiedQaDatabase, CERTIFIED_QA_PROJECT_REF } from '../../../shared/qa-target';

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
 * Guard: refuse to run certification against anything but the certified QA project.
 *
 * This used to be a RELATIVE check — it compared QA_SUPABASE_URL against the app's
 * EXPO_PUBLIC_SUPABASE_URL host and refused only when the two matched. That comparison silently
 * passed whenever the app variable was absent, which is the normal state of a fresh checkout
 * (the root .env is git-ignored). A missing variable therefore disabled the guard completely, and
 * any project ref — Production, or an unrecognised third project — would have been accepted for a
 * full write suite driven by a service-role key.
 *
 * It is now ABSOLUTE: `assertCertifiedQaDatabase()` accepts exactly one project ref and rejects a
 * missing, malformed, Production or simply unknown target. The exported NAME is deliberately
 * unchanged: every connected entry point and both service-role contexts already call it, so the
 * stronger guard reaches all of them without any call site being able to miss the change.
 */
export function assertNotProduction(): void {
  assertCertifiedQaDatabase();
}

/** Explicit names for new call sites; same guard. */
export { assertCertifiedQaDatabase, CERTIFIED_QA_PROJECT_REF };
