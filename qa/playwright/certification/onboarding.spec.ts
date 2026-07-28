import { test, expect } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import {
  adminCreateUser,
  adminDeleteUser,
  signInAs,
  readOwnProfile,
  signupPublicRaw,
  makeEphemeralEmail,
  sweepEphemeralUsers,
} from '../support/connected/qa-auth';

/**
 * Phase 1B — User onboarding (CONNECTED).
 *
 * Exercises the real on_auth_user_created → handle_new_user trigger and Supabase
 * Auth validation on the dedicated QA project: account creation + role assignment,
 * the admin-downgrade privilege guard, duplicate prevention, and signup validation
 * failures. Ephemeral users are created via the admin API (which fires the same
 * trigger without the public-signup email-send rate limit) and are deleted
 * deterministically (per-test + a prefix sweep). Chromium-only; gated on
 * certificationConfigured() (never targets production).
 */
const PW = 'QaPhase1b-123!';

test.describe('Phase 1B — Onboarding', { tag: ['@certification', '@connected'] }, () => {
  const createdUserIds: string[] = [];

  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(testInfo.project.name !== 'chromium', 'Connected coverage is Chromium-only.');
  });

  test.afterAll(async () => {
    for (const id of createdUserIds) await adminDeleteUser(id);
    await sweepEphemeralUsers();
  });

  async function createUser(tag: string, role: string): Promise<{ id: string; email: string }> {
    const email = makeEphemeralEmail(tag);
    const r = await adminCreateUser(email, PW, { full_name: 'QA P1B', role });
    expect(r.status, `admin create (${role})`).toBe(200);
    const id = (r.body.id as string) ?? ((r.body.user as { id?: string } | undefined)?.id as string);
    expect(id, 'created user id').toBeTruthy();
    createdUserIds.push(id);
    return { id, email };
  }

  test('account creation: a new customer gets a customer/approved profile', { tag: ['@p0'] }, async () => {
    const { id, email } = await createUser('customer', 'customer');
    const token = await signInAs(email, PW);
    expect(token, 'new user can sign in').toBeTruthy();
    const prof = await readOwnProfile(token as string, id);
    expect(prof).toHaveLength(1);
    expect(prof[0].role).toBe('customer');
    expect(prof[0].approval_status).toBe('approved');
  });

  test('provider onboarding: a provider signup starts pending', { tag: ['@p0'] }, async () => {
    const { id, email } = await createUser('provider', 'provider');
    const token = await signInAs(email, PW);
    const prof = await readOwnProfile(token as string, id);
    expect(prof[0].role).toBe('provider');
    expect(prof[0].approval_status).toBe('pending');
  });

  test('admin is never self-assignable: an admin-role signup is downgraded to customer', { tag: ['@p0', '@security'] }, async () => {
    const { id, email } = await createUser('adminattempt', 'admin');
    const token = await signInAs(email, PW);
    const prof = await readOwnProfile(token as string, id);
    // handle_new_user pins any non-'provider' role to 'customer' — admin can NOT self-register.
    expect(prof[0].role, 'admin metadata must not yield an admin profile').toBe('customer');
    expect(prof[0].approval_status).toBe('approved');
  });

  test('duplicate prevention: re-registering an existing email is rejected', { tag: ['@p0', '@security'] }, async () => {
    const { email } = await createUser('dup', 'customer');
    const again = await adminCreateUser(email, PW, { role: 'customer' });
    expect(again.status, 'duplicate email rejected').toBe(422);
    expect(String(again.body.error_code ?? again.body.code ?? '')).toContain('email_exists');
  });

  test('validation failure: an invalid email format is rejected at signup', { tag: ['@p1'] }, async () => {
    const r = await signupPublicRaw('notanemail', PW, { role: 'customer' });
    expect(r.status, 'invalid email rejected').toBe(400);
    expect(String(r.body.error_code ?? r.body.code ?? '')).toBe('validation_failed');
  });

  test('validation failure: a too-short password is rejected at signup', { tag: ['@p1'] }, async () => {
    const r = await signupPublicRaw(makeEphemeralEmail('weakpw'), 'x', { role: 'customer' });
    expect(r.status, 'weak password rejected').toBe(422);
    expect(String(r.body.error_code ?? r.body.code ?? '')).toBe('weak_password');
  });
});
