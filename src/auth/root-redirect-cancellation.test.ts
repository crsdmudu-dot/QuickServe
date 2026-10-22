/**
 * Update 74 (OD-74-8 DEFAULT, PM stage 102): a customer who has not accepted the current Terms can still
 * reach the cancellation screens (booking/cancel and booking/help), as account deletion is reachable.
 * Everything else stays behind the Terms screen, and providers are not exempted.
 */
import { resolveRootRedirect } from '@/auth/root-redirect';
import { TERMS_GATE_EXEMPTS_CANCELLATION } from '@/constants/cancellation';

const signedIn = { isLoading: false, signedIn: true, recoveryActive: false, termsRequired: true } as const;

describe('resolveRootRedirect — the cancellation exemption from the Terms gate', () => {
  it('is the DEFAULT for now', () => {
    expect(TERMS_GATE_EXEMPTS_CANCELLATION).toBe(true);
  });

  it('a customer who must accept the Terms may stay on the cancellation screens', () => {
    for (const segments of [['booking', 'cancel'], ['booking', 'cancel', '[id]'], ['booking', 'help', '[id]']]) {
      expect(resolveRootRedirect({ ...signedIn, role: 'customer', segments })).toBeNull();
    }
  });

  it('every other booking screen still sends them to the Terms screen', () => {
    for (const segments of [['booking', '[id]'], ['booking', 'chat', '[id]'], ['booking', 'service-details'], ['home']]) {
      expect(resolveRootRedirect({ ...signedIn, role: 'customer', segments })).toBe('/accept-terms');
    }
  });

  it('a provider is not exempted (cancellation is customer-side)', () => {
    expect(resolveRootRedirect({ ...signedIn, role: 'provider', segments: ['booking', 'cancel'] })).toBe('/accept-terms');
  });

  it('account deletion stays exempt, as before', () => {
    expect(resolveRootRedirect({ ...signedIn, role: 'customer', segments: ['account', 'delete'] })).toBeNull();
  });
});
