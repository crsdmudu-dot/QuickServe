/**
 * account-deletion-messages.test.ts — the message shown after a deletion request is COMPOSED from
 * the independent dimensions the server reports. It must be precise: access revoked (always),
 * login removed or pending, eligible uploads removed / being removed / retained under a hold,
 * and the retained records named. It must never make the blanket claim "your data has been
 * removed".
 */
// The module under test imports the Supabase client for the request path; the pure message
// composition needs none of it.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { describeDeletionOutcome, type DeletionOutcome } from '@/lib/account';

type Ok = Extract<DeletionOutcome, { ok: true }>;

function outcome(over: Partial<Ok>): Ok {
  return { ok: true, status: 'deleted', authState: 'deleted', cleanupState: 'complete', ...over };
}

describe('describeDeletionOutcome', () => {
  it('fully done: access revoked, login removed, uploads removed, retained records named', () => {
    const { title, lines } = describeDeletionOutcome(outcome({ requestId: 'req-1' }));
    expect(title).toBe('Account deleted');
    expect(lines).toEqual([
      'Your access has been revoked. You can no longer sign in or use the app.',
      'Your login has been removed.',
      'Photos you uploaded to bookings have been removed.',
      'Your profile details, saved addresses, the messages you sent and your review text have been removed or replaced.',
      'Booking, payment and support records are kept as described in the privacy policy. Photos and messages from the other person on a booking, and support notes, may still refer to you.',
      'Request reference: req-1',
    ]);
  });

  it('login removed, uploads still being removed: says pending for uploads only', () => {
    const { title, lines } = describeDeletionOutcome(outcome({ cleanupState: 'pending' }));
    expect(title).toBe('Account deletion in progress');
    expect(lines[1]).toBe('Your login has been removed.');
    expect(lines[2]).toBe('Photos you uploaded to bookings are being removed. A final check runs automatically.');
  });

  it('login pending, uploads complete: says pending for the login only', () => {
    const { lines } = describeDeletionOutcome(outcome({ status: 'pending_auth_delete', authState: 'pending_retry' }));
    expect(lines[1]).toBe('Removal of your login is still pending. It is retried automatically; you cannot sign in meanwhile.');
    expect(lines[2]).toBe('Photos you uploaded to bookings have been removed.');
  });

  it('retained under a hold is named as such, not folded into "removed"', () => {
    const { lines } = describeDeletionOutcome(outcome({ cleanupState: 'complete_with_retained' }));
    expect(lines[2]).toMatch(/except items retained under a hold/);
  });

  it('operator attention is stated for either dimension', () => {
    expect(describeDeletionOutcome(outcome({ authState: 'needs_operator' })).lines[1]).toMatch(/needs attention from our team/);
    expect(describeDeletionOutcome(outcome({ cleanupState: 'needs_operator' })).lines[2]).toMatch(/needs attention from our team/);
  });

  it('REGRESSION (finding 5): never promises that retained records carry no name or contact details, and names what may still refer to the person', () => {
    const states: Ok['cleanupState'][] = ['not_started', 'pending', 'provisional', 'complete', 'complete_with_retained', 'needs_operator'];
    for (const cleanupState of states) {
      const text = describeDeletionOutcome(outcome({ cleanupState })).lines.join(' ').toLowerCase();
      expect(text).not.toContain('without your name');
      expect(text).not.toContain('without your contact');
      expect(text).toContain('may still refer to you');
      expect(text).toContain('the messages you sent');
    }
  });

  it('REGRESSION (review finding 5) provisional: does not claim photos were removed, does not promise a deadline, and keeps the three dimensions apart', () => {
    const { title, lines } = describeDeletionOutcome(outcome({ cleanupState: 'provisional' }));
    expect(title).toBe('Account deletion in progress');
    expect(lines[0]).toMatch(/^Your access has been revoked/);
    expect(lines[1]).toBe('Your login has been removed.');
    expect(lines[2]).toBe('Photo cleanup is awaiting a final check for uploads that were already in progress. Some photos may remain under a hold. We cannot confirm completion yet.');
    const text = lines.join(' ').toLowerCase();
    expect(text).not.toMatch(/have been removed\. a final check/);
    expect(text).not.toMatch(/within 24 hours|24h/);
    expect(text).not.toMatch(/photos you uploaded to bookings have been removed/);
  });

  it('provisional with held items and provisional under a delayed final sweep read the same, truthful line (state alone is what the server reports)', () => {
    const withHeld = describeDeletionOutcome(outcome({ cleanupState: 'provisional', authState: 'pending_retry' })).lines;
    expect(withHeld[1]).toMatch(/still pending/);
    expect(withHeld[2]).toMatch(/Some photos may remain under a hold/);
    expect(withHeld[2]).toMatch(/cannot confirm completion yet/);
  });

  it('terminal states are distinct: complete says removed; complete_with_retained names the hold; neither says "in progress"', () => {
    expect(describeDeletionOutcome(outcome({ cleanupState: 'complete' })).lines[2]).toBe('Photos you uploaded to bookings have been removed.');
    const retained = describeDeletionOutcome(outcome({ cleanupState: 'complete_with_retained' }));
    expect(retained.lines[2]).toMatch(/except items retained under a hold/);
    expect(retained.title).toBe('Account deletion in progress');
    expect(describeDeletionOutcome(outcome({ cleanupState: 'complete' })).title).toBe('Account deleted');
  });

  it('never makes the blanket claim', () => {
    const states: Ok['cleanupState'][] = ['not_started', 'pending', 'provisional', 'complete', 'complete_with_retained', 'needs_operator'];
    const auths: Ok['authState'][] = ['not_started', 'pending_retry', 'deleted', 'needs_operator'];
    for (const cleanupState of states) {
      for (const authState of auths) {
        const text = describeDeletionOutcome(outcome({ cleanupState, authState })).lines.join(' ').toLowerCase();
        expect(text).not.toContain('your data has been removed');
        expect(text).toContain('your access has been revoked');
      }
    }
  });
});
