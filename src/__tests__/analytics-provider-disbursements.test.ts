/**
 * Static regression guards for migration 0052 — "Provider payouts" analytics metric.
 *
 * Old semantics (0025): `provider_payouts` = sum(provider_earnings.amount) by earning created_at,
 * i.e. GROSS PROVIDER ENTITLEMENT accrued in the window, mislabelled as payouts.
 *
 * New semantics (0052), additive and backward compatible:
 *   provider_payouts_disbursed      = sum(provider_payouts.amount) where paid_at within [from, to]
 *                                     (real disbursements, by the date the money moved)
 *   provider_outstanding_liability  = sum(outstanding_provider_liability) over the canonical
 *                                     provider_payout_ledger view — a CURRENT snapshot, never
 *                                     filtered by the analytics date range
 * The legacy `provider_payouts` key is kept unchanged so existing consumers/exports still work.
 */
import fs from 'fs';
import path from 'path';

const MIGRATION = '0052_analytics_provider_disbursements.sql';
const dir = path.resolve(__dirname, '../../supabase/migrations');
const sql = fs.readFileSync(path.join(dir, MIGRATION), 'utf-8');
const code = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
const lower = code.toLowerCase();

function fnBody(name: string): string {
  const start = lower.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = lower.indexOf('end; $$;', start);
  return lower.slice(start, end);
}

describe('0052 — provider disbursement analytics', () => {
  it('sits immediately after 0051 and is the only 0052 migration', () => {
    const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    const idx0051 = files.findIndex((f) => f.startsWith('0051_'));
    expect(idx0051).toBeGreaterThan(-1);
    expect(files[idx0051 + 1]).toBe(MIGRATION);
    expect(files.filter((f) => f.startsWith('0052'))).toHaveLength(1);
    expect(files.filter((f) => f.startsWith('0051'))).toHaveLength(1);
  });

  it('extends the summary contract additively (legacy keys first, new keys appended)', () => {
    // RETURNS TABLE cannot be altered in place, so the function is dropped and re-created with
    // the SAME argument signature.
    expect(lower).toContain('drop function if exists public.analytics_financial_summary(timestamptz, timestamptz);');
    const body = fnBody('analytics_financial_summary');
    const cols = ['revenue', 'provider_payouts', 'quickserve_revenue', 'wallet_used', 'promo_used', 'provider_payouts_disbursed', 'provider_outstanding_liability'];
    let last = -1;
    for (const c of cols) {
      const i = body.indexOf(`${c} `, body.indexOf('returns table('));
      expect(i).toBeGreaterThan(last);
      last = i;
    }
  });

  it('keeps the legacy provider_payouts formula (gross entitlement by earning created_at)', () => {
    const body = fnBody('analytics_financial_summary');
    expect(body).toMatch(/sum\(pe\.amount\)[\s\S]*from public\.provider_earnings pe[\s\S]*pe\.created_at between p_from and p_to\)\s+as provider_payouts/);
  });

  it('sums real disbursements by paid_at for the selected window', () => {
    const body = fnBody('analytics_financial_summary');
    expect(body).toMatch(/sum\(pp\.amount\)[\s\S]*from public\.provider_payouts pp[\s\S]*pp\.paid_at between p_from and p_to\)\s+as provider_payouts_disbursed/);
    // Never inferred from earning rows, their creation time, or payout_status.
    const seg = body.slice(body.indexOf('as provider_payouts,'), body.indexOf('as provider_payouts_disbursed'));
    expect(seg).not.toContain('provider_earnings');
    expect(seg).not.toContain('payout_status');
  });

  it('reads current outstanding liability from the canonical ledger view, unfiltered by date', () => {
    const body = fnBody('analytics_financial_summary');
    const seg = body.slice(body.indexOf('as provider_payouts_disbursed'), body.indexOf('as provider_outstanding_liability'));
    expect(seg).toContain('sum(l.outstanding_provider_liability)');
    expect(seg).toContain('from public.provider_payout_ledger l');
    expect(seg).not.toContain('p_from');
    expect(seg).not.toContain('p_to');
    expect(seg).not.toContain('greatest(');
  });

  it('adds a per-bucket disbursement series to the timeseries, keeping every legacy column', () => {
    expect(lower).toContain('drop function if exists public.analytics_financial_timeseries(timestamptz, timestamptz, text);');
    const body = fnBody('analytics_financial_timeseries');
    for (const c of ['period', 'revenue', 'provider_payouts', 'quickserve_revenue', 'wallet_used', 'promo_used', 'provider_payouts_disbursed']) {
      expect(body.slice(body.indexOf('returns table('), body.indexOf('language plpgsql'))).toContain(c);
    }
    expect(body).toMatch(/date_trunc\(p_bucket, pp\.paid_at\)[\s\S]*sum\(pp\.amount\)[\s\S]*as provider_payouts_disbursed[\s\S]*from public\.provider_payouts pp/);
    // The disbursement CTE must participate in the period union so payout-only periods appear.
    expect(body).toMatch(/all_periods as \([\s\S]*select disb\.period\s+from disb[\s\S]*\)/);
    // Every union member must qualify `period`: with an OUT column of the same name, a bare
    // `select period from x` is ambiguous in plpgsql (42702) and the RPC fails at runtime —
    // which is exactly how 0025 shipped.
    expect(body).not.toMatch(/select\s+period\s+from/);
    // No historical liability series: that cannot be reconstructed honestly from these rows.
    expect(body).not.toContain('outstanding');
  });

  it('preserves security definer, pinned search_path and the is_admin() gate on both RPCs', () => {
    for (const fn of ['analytics_financial_summary', 'analytics_financial_timeseries']) {
      const body = fnBody(fn);
      expect(body).toContain('language plpgsql security definer set search_path = public');
      expect(body).toContain("if not public.is_admin() then");
      expect(body).toContain("raise exception 'admin only'");
    }
  });

  it('touches no other object', () => {
    expect(lower).not.toContain('create or replace view'); // the ledger view is read, never redefined
    expect(lower).not.toContain('alter table');
    expect(lower).not.toMatch(/\b(insert|update|delete)\s+/);
    expect(lower).not.toContain('_provider_earning_state');
    expect(lower).not.toContain('analytics_providers');
  });
});
