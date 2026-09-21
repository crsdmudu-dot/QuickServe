/**
 * root-redirect.test.ts — the root navigator's redirect decision, extracted so the auth-route
 * exemptions and the recovery hold can be pinned without rendering the navigator.
 */
import { resolveRootRedirect } from '@/auth/root-redirect';

const base = { isLoading: false, signedIn: false, role: null, segments: ['home'], recoveryActive: false } as const;

describe('resolveRootRedirect', () => {
  it('waits while auth is loading', () => {
    expect(resolveRootRedirect({ ...base, isLoading: true })).toBeNull();
  });

  it('sends a signed-out user outside onboarding to /welcome', () => {
    expect(resolveRootRedirect({ ...base, segments: ['home'] })).toBe('/welcome');
    expect(resolveRootRedirect({ ...base, segments: ['(onboarding)', 'signin'] })).toBeNull();
    expect(resolveRootRedirect({ ...base, segments: ['(onboarding)', 'forgot-password'] })).toBeNull();
  });

  it('sends a signed-in user with a role away from onboarding to the role home', () => {
    expect(resolveRootRedirect({ ...base, signedIn: true, role: 'customer', segments: ['(onboarding)', 'signin'] })).toBe('/home');
    expect(resolveRootRedirect({ ...base, signedIn: true, role: 'provider', segments: ['(onboarding)', 'register'] })).toBe('/provider');
    expect(resolveRootRedirect({ ...base, signedIn: true, role: 'customer', segments: ['home'] })).toBeNull();
    expect(resolveRootRedirect({ ...base, signedIn: true, role: null, segments: ['(onboarding)', 'signin'] })).toBeNull();
  });

  it('has no administrative segment to exempt — admin-web moved to apps/admin', () => {
    // An admin identity is routed like any other role, to the inert staff notice screen.
    expect(
      resolveRootRedirect({ ...base, signedIn: true, role: 'admin', segments: ['(onboarding)'] }),
    ).toBe('/staff-notice');
  });

  it('never redirects away from the auth link routes, signed in or not', () => {
    expect(resolveRootRedirect({ ...base, segments: ['auth', 'recovery'] })).toBeNull();
    expect(resolveRootRedirect({ ...base, segments: ['auth', 'confirm'] })).toBeNull();
    expect(resolveRootRedirect({ ...base, signedIn: true, role: 'customer', segments: ['auth', 'recovery'] })).toBeNull();
  });

  it('holds ordinary role routing while a recovery is active', () => {
    expect(resolveRootRedirect({ ...base, signedIn: true, role: 'customer', segments: ['(onboarding)', 'signin'], recoveryActive: true })).toBeNull();
    expect(resolveRootRedirect({ ...base, segments: ['home'], recoveryActive: true })).toBeNull();
  });
});
