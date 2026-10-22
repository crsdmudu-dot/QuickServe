/**
 * Tests for src/lib/cancellation-rules.ts (Update 74): the app's mirror of the server's eligibility rule.
 * The cases copy the SQL harness scenarios (E1–E6, S1–S5), so the button the app shows matches what the
 * server will answer when nothing changes in between.
 */
import {
  bookingReference,
  cancellationOption,
  consequenceLines,
  expectedRefusal,
  helpSituation,
  isManualDispatch,
  type CancelBooking,
} from '@/lib/cancellation-rules';
import {
  CQ_NO_FEE,
  CQ_NO_PROVIDER,
  CQ_NOTHING_TO_PAY,
  CQ_QUOTE,
  CQ_REBOOK,
} from '@/constants/cancellation-copy';

const IN_APP = { assigned_provider_id: 'prov-1', assigned_provider_name: 'Test Provider' };
const NONE = { assigned_provider_id: null, assigned_provider_name: null };
const MANUAL = { assigned_provider_id: null, assigned_provider_name: 'Manual Provider' };
type Who = { assigned_provider_id: string | null; assigned_provider_name: string | null };
const b = (status: CancelBooking['status'], who: Who = NONE, quote_status = 'pending'): CancelBooking => ({
  id: 'abcdef12-3456-4789-8abc-def012345678',
  status,
  quote_status,
  ...who,
});
const pending = { status: 'pending', wallet_applied: 0, promo_discount: 0, promo_code_id: null };

describe('cancellationOption / helpSituation (mirror of customer_cancel_booking)', () => {
  it.each([
    ['pending, no provider (S1)', b('pending'), null, [], 'cancel', null],
    ['accepted, quote sent (S2)', b('accepted', NONE, 'sent'), null, [], 'cancel', null],
    ['provider_assigned, in-app (S3)', b('provider_assigned', IN_APP), null, [], 'cancel', null],
    ['on_the_way, in-app (S4)', b('on_the_way', IN_APP), null, [], 'cancel', null],
    ['unpaid payment, nothing applied (S5)', b('provider_assigned', IN_APP, 'accepted'), pending, [], 'cancel', null],
    ['cancelled payment', b('pending'), { status: 'cancelled' }, [], 'cancel', null],
    ['in_progress (E1)', b('in_progress', IN_APP), null, [], 'help', 'work_started'],
    ['completed (E2)', b('completed', IN_APP), null, [], 'help', 'completed'],
    // Owner decision 2026-10-03, item 3: manually dispatched bookings have the same eligibility.
    ['manual dispatch, assigned (E3)', b('provider_assigned', MANUAL), null, [], 'cancel', null],
    ['manual dispatch, travelling', b('on_the_way', MANUAL), null, [], 'cancel', null],
    ['manual dispatch, work recorded as started by an admin', b('in_progress', MANUAL), null, [], 'help', 'work_started'],
    ['manual dispatch with wallet credit', b('provider_assigned', MANUAL), { ...pending, wallet_applied: 50 }, [], 'help', 'money'],
    ['wallet applied (E4)', b('provider_assigned', IN_APP), { ...pending, wallet_applied: 200 }, [], 'help', 'money'],
    ['promo applied', b('provider_assigned', IN_APP), { ...pending, promo_code_id: 'promo-1' }, [], 'help', 'money'],
    ['open attempt (E5)', b('on_the_way', IN_APP), pending, [{ status: 'pending' }], 'help', 'money'],
    ['timed-out attempt', b('on_the_way', IN_APP), pending, [{ status: 'timed_out' }], 'help', 'money'],
    ['failed attempt only', b('on_the_way', IN_APP), pending, [{ status: 'failed' }], 'cancel', null],
    ['paid (E6)', b('on_the_way', IN_APP), { status: 'paid' }, [], 'help', 'money'],
    ['cancelled booking', b('cancelled', IN_APP), null, [], 'none', null],
  ] as const)('%s', (_label, booking, payment, attempts, option, situation) => {
    expect(cancellationOption(booking, payment, attempts)).toBe(option);
    expect(helpSituation(booking, payment, attempts)).toBe(situation);
  });
});

describe('expectedRefusal (the server code the app can foresee, in the server order)', () => {
  it.each([
    ['in_progress', b('in_progress', IN_APP), null, [], 'work_started'],
    ['completed', b('completed', IN_APP), null, [], 'completed'],
    ['manual dispatch: no refusal (same eligibility)', b('on_the_way', MANUAL), null, [], null],
    ['paid', b('on_the_way', IN_APP), { status: 'paid' }, [], 'payment_recorded'],
    ['refunded', b('on_the_way', IN_APP), { status: 'refunded' }, [], 'payment_recorded'],
    ['open attempt', b('on_the_way', IN_APP), pending, [{ status: 'initiated' }], 'payment_in_progress'],
    ['successful attempt', b('on_the_way', IN_APP), pending, [{ status: 'successful' }], 'payment_in_progress'],
    ['wallet applied', b('on_the_way', IN_APP), { ...pending, wallet_applied: 1 }, [], 'needs_support'],
    ['promo discount', b('on_the_way', IN_APP), { ...pending, promo_discount: 5 }, [], 'needs_support'],
    ['cancellable', b('on_the_way', IN_APP), pending, [], null],
    ['already cancelled', b('cancelled'), null, [], null],
  ] as const)('%s', (_l, booking, payment, attempts, code) => {
    expect(expectedRefusal(booking, payment, attempts)).toBe(code);
  });
});

describe('helpers', () => {
  it('isManualDispatch: a name with no in-app provider id', () => {
    expect(isManualDispatch(MANUAL)).toBe(true);
    expect(isManualDispatch(IN_APP)).toBe(false);
    expect(isManualDispatch(NONE)).toBe(false);
    expect(isManualDispatch({ assigned_provider_id: null, assigned_provider_name: '   ' })).toBe(false);
  });

  it('bookingReference uses the Receipt format', () => {
    expect(bookingReference('abcdef12-3456-4789-8abc-def012345678')).toBe('#ABCDEF12');
  });
});

describe('consequenceLines (DRAFT texts; never a refund, a fee or a time limit)', () => {
  it('no provider yet: nothing sent, nothing to pay, no fee, book again', () => {
    expect(consequenceLines(b('pending'), null)).toEqual([CQ_NO_PROVIDER, CQ_NOTHING_TO_PAY, CQ_NO_FEE, CQ_REBOOK]);
  });

  it('an assigned in-app provider is named and told; a quote is cancelled too', () => {
    const lines = consequenceLines(b('provider_assigned', IN_APP, 'accepted'), 'Test Provider');
    expect(lines[0]).toBe("We'll tell Test Provider straight away that the booking is cancelled.");
    expect(lines).toContain(CQ_QUOTE);
  });

  it('a travelling provider: the notice says they will be told, and to use Get help if work has started', () => {
    const [first] = consequenceLines(b('on_the_way', IN_APP), 'Test Provider');
    expect(first).toMatch(/already on the way/);
    expect(first).toMatch(/Get help with this booking/);
  });

  it('a provider we arranged by phone: we will let them know (no in-app or timing promise)', () => {
    const [assigned] = consequenceLines(b('provider_assigned', MANUAL), null);
    expect(assigned).toBe("We'll let Manual Provider know that the booking is cancelled.");
    const [travelling] = consequenceLines(b('on_the_way', MANUAL), null);
    expect(travelling).toMatch(/^Manual Provider may already be on the way/);
    expect(travelling).toMatch(/Get help with this booking/);
    expect([assigned, travelling].join(' ')).not.toMatch(/straight away|in the app/);
  });

  it('no line mentions a refund, a charge, a deadline or a payment for the provider', () => {
    const all = [
      ...consequenceLines(b('pending'), null),
      ...consequenceLines(b('on_the_way', IN_APP, 'sent'), 'X'),
      ...consequenceLines(b('on_the_way', MANUAL), null),
    ].join(' ');
    expect(all).not.toMatch(/refund|charge(?!s)|within|hours?\b|deadline|compensat|paid for (the|your) (trip|travel)/i);
  });
});
