/**
 * Zero-liability payout presentation.
 *
 * Invariant: an earning with zero outstanding liability must never be presented as money
 * awaiting payout. The amounts on the ledger row are authoritative; the stored/derived status
 * columns can lag (a zero-share earning is inserted with the column default 'pending', and a
 * fully-deducted earning was derived 'pending' before migration 0051).
 */
import { resolvePayoutStatus, isAwaitingPayout } from '@/lib/payout-status';

const BASE = {
  earning_id: 'e1',
  booking_id: 'b1',
  provider_id: 'p1',
  provider_entitlement: 0,
  deductions_total: 0,
  net_provider_payable: 0,
  amount_disbursed: 0,
  outstanding_provider_liability: 0,
  stored_payout_status: 'pending' as const,
  derived_payout_status: 'pending' as const,
};

describe('resolvePayoutStatus', () => {
  it('Case A — zero-value earning (amount 0, nothing outstanding) is settled, not pending', () => {
    // Exactly the certified Production row: provider_share 0 → earning amount 0, stored 'pending'.
    const row = { ...BASE };
    expect(resolvePayoutStatus(row)).toBe('paid');
    expect(isAwaitingPayout(row)).toBe(false);
  });

  it('Case B — positive unpaid earning stays pending', () => {
    const row = {
      ...BASE,
      provider_entitlement: 2100,
      net_provider_payable: 2100,
      outstanding_provider_liability: 2100,
    };
    expect(resolvePayoutStatus(row)).toBe('pending');
    expect(isAwaitingPayout(row)).toBe(true);
  });

  it('Case C — fully paid positive earning is paid', () => {
    const row = {
      ...BASE,
      provider_entitlement: 2100,
      net_provider_payable: 2100,
      amount_disbursed: 2100,
      outstanding_provider_liability: 0,
      stored_payout_status: 'paid' as const,
      derived_payout_status: 'paid' as const,
    };
    expect(resolvePayoutStatus(row)).toBe('paid');
    expect(isAwaitingPayout(row)).toBe(false);
  });

  it('Case D — partial payout keeps the remaining liability pending as partially_paid', () => {
    const row = {
      ...BASE,
      provider_entitlement: 2100,
      net_provider_payable: 2100,
      amount_disbursed: 500,
      outstanding_provider_liability: 1600,
      stored_payout_status: 'partially_paid' as const,
      derived_payout_status: 'partially_paid' as const,
    };
    expect(resolvePayoutStatus(row)).toBe('partially_paid');
    expect(isAwaitingPayout(row)).toBe(true);
  });

  it('Case E — deductions that consume the whole entitlement leave nothing awaiting payout', () => {
    // Gross entitlement positive, net 0, nothing disbursed, stored status still 'pending'.
    const row = {
      ...BASE,
      provider_entitlement: 2100,
      deductions_total: 2100,
      net_provider_payable: 0,
      outstanding_provider_liability: 0,
    };
    expect(resolvePayoutStatus(row)).toBe('paid');
    expect(isAwaitingPayout(row)).toBe(false);
  });

  it('never reports a negative outstanding liability as settled', () => {
    // Impossible via the RPCs (deductions <= entitlement, net >= disbursed, payouts <= outstanding,
    // all under a row lock), so a negative value can only mean corrupt data. It must stay
    // visible as an anomaly, never disappear behind a "paid" label.
    const row = {
      ...BASE,
      provider_entitlement: 100,
      deductions_total: 150,
      net_provider_payable: -50,
      outstanding_provider_liability: -50,
    };
    expect(resolvePayoutStatus(row)).not.toBe('paid');
    expect(isAwaitingPayout(row)).toBe(true);
  });

  it('never trusts a stale stored status over the amounts', () => {
    const row = {
      ...BASE,
      provider_entitlement: 2100,
      net_provider_payable: 2100,
      outstanding_provider_liability: 2100,
      stored_payout_status: 'paid' as const, // impossible in practice, amounts win
      derived_payout_status: 'paid' as const,
    };
    expect(resolvePayoutStatus(row)).toBe('pending');
  });
});
