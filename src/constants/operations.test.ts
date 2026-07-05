import {
  CASE_TYPES,
  CASE_STATUSES,
  CASE_PRIORITIES,
  DISPUTE_KINDS,
  RESOLUTION_OUTCOMES,
  ACCOUNT_FLAG_KINDS,
  UNRESOLVED_STATUSES,
  caseStatusLabel,
  casePriorityLabel,
} from '@/constants/operations';

// ── Array length checks ────────────────────────────────────────────────────

describe('CASE_TYPES', () => {
  it('has exactly 2 entries', () => {
    expect(CASE_TYPES).toHaveLength(2);
  });
  it('contains support and dispute', () => {
    const ids = CASE_TYPES.map((t) => t.id);
    expect(ids).toContain('support');
    expect(ids).toContain('dispute');
  });
  it('every entry has id, label, and color', () => {
    for (const opt of CASE_TYPES) {
      expect(opt.id).toBeTruthy();
      expect(opt.label).toBeTruthy();
      expect(opt.color).toBeTruthy();
    }
  });
});

describe('CASE_STATUSES', () => {
  it('has exactly 6 entries', () => {
    expect(CASE_STATUSES).toHaveLength(6);
  });
  it('contains all expected statuses', () => {
    const ids = CASE_STATUSES.map((s) => s.id);
    expect(ids).toContain('open');
    expect(ids).toContain('in_review');
    expect(ids).toContain('waiting_on_customer');
    expect(ids).toContain('waiting_on_provider');
    expect(ids).toContain('resolved');
    expect(ids).toContain('closed');
  });
  it('every entry has id, label, and color', () => {
    for (const opt of CASE_STATUSES) {
      expect(opt.id).toBeTruthy();
      expect(opt.label).toBeTruthy();
      expect(opt.color).toBeTruthy();
    }
  });
});

describe('CASE_PRIORITIES', () => {
  it('has exactly 4 entries', () => {
    expect(CASE_PRIORITIES).toHaveLength(4);
  });
  it('contains low, medium, high, urgent', () => {
    const ids = CASE_PRIORITIES.map((p) => p.id);
    expect(ids).toContain('low');
    expect(ids).toContain('medium');
    expect(ids).toContain('high');
    expect(ids).toContain('urgent');
  });
  it('every entry has id, label, and color', () => {
    for (const opt of CASE_PRIORITIES) {
      expect(opt.id).toBeTruthy();
      expect(opt.label).toBeTruthy();
      expect(opt.color).toBeTruthy();
    }
  });
});

describe('DISPUTE_KINDS', () => {
  it('has exactly 4 entries', () => {
    expect(DISPUTE_KINDS).toHaveLength(4);
  });
  it('contains all four kinds', () => {
    const ids = DISPUTE_KINDS.map((d) => d.id);
    expect(ids).toContain('booking_dispute');
    expect(ids).toContain('payment_dispute');
    expect(ids).toContain('customer_complaint');
    expect(ids).toContain('provider_complaint');
  });
  it('every entry has id, label, and color', () => {
    for (const opt of DISPUTE_KINDS) {
      expect(opt.id).toBeTruthy();
      expect(opt.label).toBeTruthy();
      expect(opt.color).toBeTruthy();
    }
  });
});

describe('RESOLUTION_OUTCOMES', () => {
  it('has exactly 6 entries', () => {
    expect(RESOLUTION_OUTCOMES).toHaveLength(6);
  });
  it('contains all expected outcomes', () => {
    const ids = RESOLUTION_OUTCOMES.map((r) => r.id);
    expect(ids).toContain('no_action');
    expect(ids).toContain('refund_recommended');
    expect(ids).toContain('wallet_credit_recommended');
    expect(ids).toContain('provider_warning');
    expect(ids).toContain('provider_suspension_recommended');
    expect(ids).toContain('customer_warning');
  });
  it('every entry has id, label, and color', () => {
    for (const opt of RESOLUTION_OUTCOMES) {
      expect(opt.id).toBeTruthy();
      expect(opt.label).toBeTruthy();
      expect(opt.color).toBeTruthy();
    }
  });
  it('wallet_credit_recommended has a human-readable label', () => {
    const opt = RESOLUTION_OUTCOMES.find((r) => r.id === 'wallet_credit_recommended');
    expect(opt?.label).toBe('Wallet Credit Recommended');
  });
});

describe('ACCOUNT_FLAG_KINDS', () => {
  it('has exactly 2 entries', () => {
    expect(ACCOUNT_FLAG_KINDS).toHaveLength(2);
  });
  it('contains flag and suspension', () => {
    const ids = ACCOUNT_FLAG_KINDS.map((k) => k.id);
    expect(ids).toContain('flag');
    expect(ids).toContain('suspension');
  });
  it('every entry has id, label, and color', () => {
    for (const opt of ACCOUNT_FLAG_KINDS) {
      expect(opt.id).toBeTruthy();
      expect(opt.label).toBeTruthy();
      expect(opt.color).toBeTruthy();
    }
  });
});

// ── UNRESOLVED_STATUSES ────────────────────────────────────────────────────

describe('UNRESOLVED_STATUSES', () => {
  it('does NOT include resolved', () => {
    expect(UNRESOLVED_STATUSES).not.toContain('resolved');
  });
  it('does NOT include closed', () => {
    expect(UNRESOLVED_STATUSES).not.toContain('closed');
  });
  it('includes open, in_review, waiting_on_customer, waiting_on_provider', () => {
    expect(UNRESOLVED_STATUSES).toContain('open');
    expect(UNRESOLVED_STATUSES).toContain('in_review');
    expect(UNRESOLVED_STATUSES).toContain('waiting_on_customer');
    expect(UNRESOLVED_STATUSES).toContain('waiting_on_provider');
  });
});

// ── Helper label lookups ───────────────────────────────────────────────────

describe('caseStatusLabel', () => {
  it('returns human label for open', () => {
    expect(caseStatusLabel('open')).toBe('Open');
  });
  it('returns human label for waiting_on_customer', () => {
    expect(caseStatusLabel('waiting_on_customer')).toBe('Waiting on Customer');
  });
  it('returns human label for resolved', () => {
    expect(caseStatusLabel('resolved')).toBe('Resolved');
  });
  it('falls back to the raw key for unknown status', () => {
    // @ts-expect-error — intentional invalid value for test
    expect(caseStatusLabel('unknown_status')).toBe('unknown_status');
  });
});

describe('casePriorityLabel', () => {
  it('returns human label for urgent', () => {
    expect(casePriorityLabel('urgent')).toBe('Urgent');
  });
  it('returns human label for low', () => {
    expect(casePriorityLabel('low')).toBe('Low');
  });
});
