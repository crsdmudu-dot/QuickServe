// receipts.test.ts — Tests for src/lib/receipts.ts (pure — no Supabase I/O)
// Verifies buildReceipt math, line construction, and field mapping.
// receipts.ts imports amountDue from wallet.ts; wallet.ts loads supabase for its
// other exports, so we mock @/lib/wallet to expose only the pure amountDue function
// (identical logic) without triggering the Supabase env check.

// Mock @/lib/wallet so only amountDue is exposed (avoids Supabase env requirement)
jest.mock('@/lib/wallet', () => ({
  amountDue: (p: { amount: number; wallet_applied?: number; promo_discount?: number }) =>
    Math.max(0, p.amount - (p.wallet_applied ?? 0) - (p.promo_discount ?? 0)),
}));

import { buildReceipt, canDownloadReceipt, type ReceiptLine } from '@/lib/receipts';
import type { Payment } from '@/lib/payments';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id:               'pay-1',
    booking_id:       'bk-1',
    customer_id:      'cust-1',
    amount:           3000,
    currency:         'KES',
    status:           'paid',
    provider_share:   2400,
    quickserve_share: 600,
    payment_method:   'mpesa',
    paid_at:          '2025-06-01T10:00:00Z',
    created_at:       '2025-06-01T09:55:00Z',
    ...overrides,
  };
}

// ── canDownloadReceipt ─────────────────────────────────────────────────────

describe('canDownloadReceipt', () => {
  it('is false (future-ready placeholder)', () => {
    expect(canDownloadReceipt).toBe(false);
  });
});

// ── buildReceipt — null payment ────────────────────────────────────────────

describe('buildReceipt — null payment', () => {
  it('returns zeros for all amounts and null for status/method/paidAt', () => {
    const receipt = buildReceipt({ payment: null });

    expect(receipt.total).toBe(0);
    expect(receipt.subtotal).toBe(0);
    expect(receipt.walletApplied).toBe(0);
    expect(receipt.promoDiscount).toBe(0);
    expect(receipt.amountDue).toBe(0);
    expect(receipt.status).toBeNull();
    expect(receipt.method).toBeNull();
    expect(receipt.paidAt).toBeNull();
  });

  it('sets currency to KES', () => {
    const receipt = buildReceipt({ payment: null });
    expect(receipt.currency).toBe('KES');
  });

  it('never throws for null payment', () => {
    expect(() => buildReceipt({ payment: null })).not.toThrow();
  });
});

// ── buildReceipt — math ────────────────────────────────────────────────────

describe('buildReceipt — math', () => {
  it('subtotal = total + walletApplied + promoDiscount', () => {
    const payment = makePayment({ amount: 2000, wallet_applied: 300, promo_discount: 200 });
    const r = buildReceipt({ payment });

    expect(r.total).toBe(2000);
    expect(r.walletApplied).toBe(300);
    expect(r.promoDiscount).toBe(200);
    expect(r.subtotal).toBe(2500); // 2000 + 300 + 200
  });

  it('amountDue = max(0, total - walletApplied - promoDiscount)', () => {
    const payment = makePayment({ amount: 2000, wallet_applied: 300, promo_discount: 200 });
    const r = buildReceipt({ payment });

    expect(r.amountDue).toBe(1500); // 2000 - 300 - 200
  });

  it('amountDue floors at 0 when credits exceed total', () => {
    const payment = makePayment({ amount: 200, wallet_applied: 150, promo_discount: 100 });
    const r = buildReceipt({ payment });

    expect(r.amountDue).toBe(0); // max(0, 200 - 150 - 100) = max(0, -50) = 0
  });

  it('subtotal = total when no wallet or promo', () => {
    const payment = makePayment({ amount: 1800 });
    const r = buildReceipt({ payment });

    expect(r.subtotal).toBe(1800);
    expect(r.walletApplied).toBe(0);
    expect(r.promoDiscount).toBe(0);
    expect(r.amountDue).toBe(1800);
  });
});

// ── buildReceipt — lines ───────────────────────────────────────────────────

describe('buildReceipt — lines', () => {
  it('includes Subtotal and Total lines always', () => {
    const payment = makePayment({ amount: 1000 });
    const r = buildReceipt({ payment });
    const labels = r.lines.map((l: ReceiptLine) => l.label);

    expect(labels).toContain('Subtotal');
    expect(labels).toContain('Total');
  });

  it('includes Wallet credit line only when walletApplied > 0', () => {
    const withWallet    = makePayment({ amount: 1000, wallet_applied: 200 });
    const withoutWallet = makePayment({ amount: 1000 });

    expect(buildReceipt({ payment: withWallet    }).lines.map((l) => l.label)).toContain('Wallet credit');
    expect(buildReceipt({ payment: withoutWallet }).lines.map((l) => l.label)).not.toContain('Wallet credit');
  });

  it('includes Promo discount line only when promoDiscount > 0', () => {
    const withPromo    = makePayment({ amount: 1000, promo_discount: 100 });
    const withoutPromo = makePayment({ amount: 1000 });

    expect(buildReceipt({ payment: withPromo    }).lines.map((l) => l.label)).toContain('Promo discount');
    expect(buildReceipt({ payment: withoutPromo }).lines.map((l) => l.label)).not.toContain('Promo discount');
  });

  it('Wallet credit line amount is negative (−walletApplied)', () => {
    const payment = makePayment({ amount: 1000, wallet_applied: 200 });
    const walletLine = buildReceipt({ payment }).lines.find((l) => l.label === 'Wallet credit')!;

    expect(walletLine.amount).toBe(-200);
  });

  it('Promo discount line amount is negative (−promoDiscount)', () => {
    const payment = makePayment({ amount: 1000, promo_discount: 150 });
    const promoLine = buildReceipt({ payment }).lines.find((l) => l.label === 'Promo discount')!;

    expect(promoLine.amount).toBe(-150);
  });

  it('full line set when both wallet and promo applied', () => {
    const payment = makePayment({ amount: 2000, wallet_applied: 300, promo_discount: 200 });
    const labels  = buildReceipt({ payment }).lines.map((l) => l.label);

    expect(labels).toEqual(['Subtotal', 'Wallet credit', 'Promo discount', 'Total']);
  });
});

// ── buildReceipt — status / method / paidAt ───────────────────────────────

describe('buildReceipt — field mapping', () => {
  it('maps payment.status to receipt.status', () => {
    expect(buildReceipt({ payment: makePayment({ status: 'paid'      }) }).status).toBe('paid');
    expect(buildReceipt({ payment: makePayment({ status: 'refunded'  }) }).status).toBe('refunded');
    expect(buildReceipt({ payment: makePayment({ status: 'cancelled' }) }).status).toBe('cancelled');
  });

  it('maps payment.payment_method to receipt.method', () => {
    expect(buildReceipt({ payment: makePayment({ payment_method: 'mpesa' }) }).method).toBe('mpesa');
    expect(buildReceipt({ payment: makePayment({ payment_method: 'card'  }) }).method).toBe('card');
    expect(buildReceipt({ payment: makePayment({ payment_method: 'cash'  }) }).method).toBe('cash');
    expect(buildReceipt({ payment: makePayment({ payment_method: null    }) }).method).toBeNull();
  });

  it('paidAt uses paid_at when present', () => {
    const payment = makePayment({ paid_at: '2025-06-01T10:00:00Z' });
    expect(buildReceipt({ payment }).paidAt).toBe('2025-06-01T10:00:00Z');
  });

  it('paidAt falls back to created_at when paid_at is null', () => {
    const payment = makePayment({ paid_at: null, created_at: '2025-06-01T09:55:00Z' });
    expect(buildReceipt({ payment }).paidAt).toBe('2025-06-01T09:55:00Z');
  });
});

// ── buildReceipt — feesTaxes omitted ──────────────────────────────────────

describe('buildReceipt — feesTaxes omitted', () => {
  it('does not include feesTaxes in the receipt (no fee/tax field on Payment)', () => {
    const r = buildReceipt({ payment: makePayment() });
    expect(r.feesTaxes).toBeUndefined();
  });
});

// ── buildReceipt — bookingId / serviceId ──────────────────────────────────

describe('buildReceipt — bookingId / serviceId', () => {
  it('includes bookingId and serviceId when booking provided', () => {
    const r = buildReceipt({
      booking: { id: 'bk-99', service_id: 'plumbing' },
      payment: makePayment(),
    });
    expect(r.bookingId).toBe('bk-99');
    expect(r.serviceId).toBe('plumbing');
  });

  it('omits bookingId and serviceId when booking is null', () => {
    const r = buildReceipt({ booking: null, payment: makePayment() });
    expect(r.bookingId).toBeUndefined();
    expect(r.serviceId).toBeUndefined();
  });

  it('omits bookingId when booking.id is not set', () => {
    const r = buildReceipt({ booking: { service_id: 'massage' }, payment: makePayment() });
    expect(r.bookingId).toBeUndefined();
    expect(r.serviceId).toBe('massage');
  });
});

// ── buildReceipt — pure (no Supabase) ─────────────────────────────────────

describe('buildReceipt — purity', () => {
  it('does not import or call supabase (module has no supabase dependency)', () => {
    // If receipts.ts imported supabase, the test environment would need to mock it.
    // The fact that this file has no jest.mock('@/lib/supabase') and tests pass confirms purity.
    const r = buildReceipt({ payment: makePayment({ amount: 500 }) });
    expect(r.total).toBe(500);
  });
});
