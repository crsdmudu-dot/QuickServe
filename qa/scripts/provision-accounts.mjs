#!/usr/bin/env node
/**
 * qa/scripts/provision-accounts.mjs — ONE-TIME operator provisioning for the
 * Launch Certification Suite (QA Slice 44A, Decision B).
 *
 * Creates/repairs four PERSISTENT accounts in a DEDICATED QA/staging Supabase
 * project (Decision A — never production):
 *   - 1 Customer   (profiles.role = 'customer')
 *   - 1 Admin      (profiles.role = 'admin',    approval_status = 'approved')
 *   - 2 Providers  (profiles.role = 'provider', approval_status = 'approved')
 *
 * Idempotent: safe to re-run. Existing users are updated in place (password reset
 * + role/approval repaired); missing users are created email-confirmed.
 *
 * REQUIRES (env; never commit these):
 *   QA_SUPABASE_URL           dedicated QA/staging project URL
 *   QA_SERVICE_ROLE_KEY       QA project service-role key (server-only secret)
 *   QA_CUSTOMER_EMAIL / QA_CUSTOMER_PASSWORD
 *   QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD
 *   QA_PROVIDER1_EMAIL / QA_PROVIDER1_PASSWORD
 *   QA_PROVIDER2_EMAIL / QA_PROVIDER2_PASSWORD
 *
 * Run from the repo root (so `@supabase/supabase-js` resolves from the app's
 * node_modules):
 *   node qa/scripts/provision-accounts.mjs
 *
 * `qa/.env` is loaded automatically (resolved relative to this script, not the
 * CWD). Values already set in the shell/CI are never overwritten. No `--env-file`
 * flag is needed.
 *
 * Safety: refuses to run if QA_SUPABASE_URL matches EXPO_PUBLIC_SUPABASE_URL host.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnvFileIfPresent } from './lib/load-env.mjs';

// Auto-load qa/.env (this script lives in qa/scripts, so ../.env is qa/.env),
// filling only variables not already provided by the shell/CI. Must run BEFORE
// any env validation below.
loadEnvFileIfPresent(resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env'));

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(2);
  }
  return v;
}

const url = requireEnv('QA_SUPABASE_URL');
const serviceKey = requireEnv('QA_SERVICE_ROLE_KEY');

const appUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
if (appUrl && new URL(url).host === new URL(appUrl).host) {
  console.error(
    'REFUSING: QA_SUPABASE_URL matches EXPO_PUBLIC_SUPABASE_URL host. ' +
      'Provisioning must target a DEDICATED QA/staging project, never production.',
  );
  process.exit(3);
}

const ACCOUNTS = [
  { key: 'customer', role: 'customer', approval: null, emailVar: 'QA_CUSTOMER_EMAIL', passVar: 'QA_CUSTOMER_PASSWORD', fullName: 'QA Customer' },
  { key: 'admin', role: 'admin', approval: 'approved', emailVar: 'QA_ADMIN_EMAIL', passVar: 'QA_ADMIN_PASSWORD', fullName: 'QA Admin' },
  { key: 'provider1', role: 'provider', approval: 'approved', emailVar: 'QA_PROVIDER1_EMAIL', passVar: 'QA_PROVIDER1_PASSWORD', fullName: 'QA Provider One' },
  { key: 'provider2', role: 'provider', approval: 'approved', emailVar: 'QA_PROVIDER2_EMAIL', passVar: 'QA_PROVIDER2_PASSWORD', fullName: 'QA Provider Two' },
];

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Find an existing auth user by email (paginated listing). */
async function findUserByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function provisionOne(acct) {
  const email = requireEnv(acct.emailVar);
  const password = requireEnv(acct.passVar);
  const metadata = { full_name: acct.fullName, phone: '+254700000000', role: acct.role };

  let user = await findUserByEmail(email);
  if (user) {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    console.log(`  ~ updated existing ${acct.key} (${email})`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    user = data.user;
    console.log(`  + created ${acct.key} (${email})`);
  }

  // Repair the profiles row (role + approval). The signup trigger may create it;
  // upsert guarantees the correct role/approval regardless.
  const profile = { id: user.id, role: acct.role };
  if (acct.approval !== null) profile.approval_status = acct.approval;
  const { error: pErr } = await admin.from('profiles').upsert(profile, { onConflict: 'id' });
  if (pErr) throw pErr;
  console.log(`    profiles: role=${acct.role}${acct.approval ? `, approval=${acct.approval}` : ''}`);
}

async function main() {
  console.log(`Provisioning QA certification accounts on ${new URL(url).host} …`);
  for (const acct of ACCOUNTS) {
    try {
      await provisionOne(acct);
    } catch (err) {
      console.error(`  ! failed ${acct.key}:`, err?.message ?? err);
      process.exit(1);
    }
  }
  console.log('Done. All four persistent QA accounts are ready.');
}

main();
