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

describe('resolveRootRedirect — Terms gate (F5.4)', () => {
  const signedIn = { ...base, signedIn: true, role: 'customer' } as const;

  it('sends a signed-in user who has not accepted the current Terms to the Terms screen, from anywhere', () => {
    expect(resolveRootRedirect({ ...signedIn, segments: ['home'], termsRequired: true })).toBe('/accept-terms');
    expect(resolveRootRedirect({ ...signedIn, segments: ['booking', '[id]'], termsRequired: true })).toBe('/accept-terms');
    expect(resolveRootRedirect({ ...signedIn, segments: ['(onboarding)', 'signin'], termsRequired: true })).toBe('/accept-terms');
    expect(resolveRootRedirect({ ...signedIn, role: 'provider', segments: ['provider'], termsRequired: true })).toBe('/accept-terms');
  });

  it('keeps them on the Terms screen until they accept', () => {
    expect(resolveRootRedirect({ ...signedIn, segments: ['accept-terms'], termsRequired: true })).toBeNull();
  });

  it('never traps someone who declines: account deletion stays reachable without accepting', () => {
    expect(resolveRootRedirect({ ...signedIn, segments: ['account', 'delete'], termsRequired: true })).toBeNull();
    expect(resolveRootRedirect({ ...signedIn, role: 'provider', segments: ['account', 'delete'], termsRequired: true })).toBeNull();
    // Only the deletion screen is exempt, not the rest of a segment that happens to share its name.
    expect(resolveRootRedirect({ ...signedIn, segments: ['account'], termsRequired: true })).toBe('/accept-terms');
    expect(resolveRootRedirect({ ...signedIn, segments: ['account', 'other'], termsRequired: true })).toBe('/accept-terms');
    // Signed out, the deletion screen still leads to welcome, as before.
    expect(resolveRootRedirect({ ...base, segments: ['account', 'delete'] })).toBe('/welcome');
  });

  it('sends them to their home once accepted (or when the screen is opened without need)', () => {
    expect(resolveRootRedirect({ ...signedIn, segments: ['accept-terms'], termsRequired: false })).toBe('/home');
    expect(resolveRootRedirect({ ...signedIn, role: 'provider', segments: ['accept-terms'] })).toBe('/provider');
  });

  it('does not gate while the check is pending or when not required', () => {
    expect(resolveRootRedirect({ ...signedIn, segments: ['home'], termsRequired: false })).toBeNull();
    expect(resolveRootRedirect({ ...signedIn, segments: ['home'] })).toBeNull();
  });

  it('still lets auth link routes and an active recovery run first', () => {
    expect(resolveRootRedirect({ ...signedIn, segments: ['auth', 'recovery'], termsRequired: true })).toBeNull();
    expect(resolveRootRedirect({ ...signedIn, segments: ['home'], recoveryActive: true, termsRequired: true })).toBeNull();
  });

  it('a signed-out visitor on the Terms screen goes to welcome', () => {
    expect(resolveRootRedirect({ ...base, segments: ['accept-terms'], termsRequired: false })).toBe('/welcome');
  });
});
