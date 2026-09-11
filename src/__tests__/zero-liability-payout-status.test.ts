/**
 * Static regression guards for migration 0051 — zero-liability payout status.
 *
 * Root cause (0042): both `_provider_earning_state()` and the `provider_payout_ledger` view
 * derive `'pending'` whenever `amount_disbursed = 0`, without looking at the outstanding
 * liability. A zero-share earning (amount 0) or a fully-deducted earning therefore shows as
 * "KES 0 pending" forever, because no payout can ever be recorded against it.
 *
 * 0051 must: derive `'paid'` (settled, nothing outstanding) whenever outstanding <= 0, in BOTH
 * SQL copies; backfill already-stuck rows; and leave security/grants exactly as 0042/0048 left
 * them. It must not touch the earning-creation trigger or any settlement RPC.
 */
import fs from 'fs';
import path from 'path';

const MIGRATION = '0051_settle_zero_liability_provider_earnings.sql';
const dir = path.resolve(__dirname, '../../supabase/migrations');
const sql = fs.readFileSync(path.join(dir, MIGRATION), 'utf-8');
const noComments = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('0051 — zero-liability earnings are settled, not pending', () => {
  it('is a new forward-only migration immediately after 0050 and edits nothing earlier', () => {
    const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    const idx0050 = files.findIndex((f) => f.startsWith('0050_'));
    expect(idx0050).toBeGreaterThan(-1);
    expect(files[idx0050 + 1]).toBe(MIGRATION);
    expect(files.filter((f) => f.startsWith('0051'))).toHaveLength(1);
  });

  it('re-derives status in _provider_earning_state from outstanding liability first', () => {
    expect(noComments).toContain('create or replace function public._provider_earning_state(p_earning_id uuid)');
    const body = noComments.slice(noComments.indexOf('_provider_earning_state'));
    // Exactly zero, never "<= 0": a negative liability is impossible via the RPCs and must
    // remain visible as an anomaly instead of being labelled settled.
    const settled = body.indexOf("if v_outstanding = 0 then");
    expect(body).not.toContain('v_outstanding <= 0');
    const pending = body.indexOf("v_derived := 'pending'");
    expect(settled).toBeGreaterThan(-1);
    expect(pending).toBeGreaterThan(settled);
    expect(body).toContain("v_derived := 'paid'");
    expect(body).toContain("v_derived := 'partially_paid'");
  });

  it('keeps _provider_earning_state security definer, search_path pinned and unexecutable by roles', () => {
    expect(noComments).toMatch(/_provider_earning_state\(p_earning_id uuid\)\s*returns jsonb language plpgsql security definer set search_path = public/);
    expect(noComments).toContain('revoke execute on function public._provider_earning_state(uuid) from public, anon, authenticated;');
  });

  it('re-creates provider_payout_ledger with the same liability-first CASE and security_invoker', () => {
    const view = noComments.slice(noComments.indexOf('create or replace view public.provider_payout_ledger'));
    expect(view).toContain('with (security_invoker = true)');
    const settled = view.indexOf("= 0 then 'paid'");
    const pending = view.indexOf("= 0 then 'pending'");
    expect(settled).toBeGreaterThan(-1);
    expect(view).not.toContain("<= 0 then 'paid'");
    expect(pending).toBeGreaterThan(settled);
    expect(view).toContain('as derived_payout_status');
    // Column set unchanged — clients depend on every one of these.
    for (const col of [
      'earning_id', 'booking_id', 'provider_id', 'provider_entitlement', 'deductions_total',
      'net_provider_payable', 'amount_disbursed', 'outstanding_provider_liability',
      'stored_payout_status', 'derived_payout_status',
    ]) {
      expect(view).toContain(`as ${col}`);
    }
  });

  it('re-applies the 0048 ACL on the view (select for authenticated only)', () => {
    expect(noComments).toContain('revoke all on public.provider_payout_ledger from public, anon, authenticated;');
    expect(noComments).toContain('grant select on public.provider_payout_ledger to authenticated;');
  });

  it('backfills only stuck rows: zero outstanding, nothing disbursed, still pending', () => {
    const upd = noComments.slice(noComments.indexOf('update public.provider_earnings'));
    expect(upd).toContain("set payout_status = 'paid'");
    expect(upd).toContain("payout_status = 'pending'");
    expect(upd).toMatch(/outstanding_provider_liability\s*=\s*0/);
    expect(upd).not.toMatch(/outstanding_provider_liability\s*<=\s*0/);
    expect(upd).toMatch(/amount_disbursed\s*=\s*0/);
  });

  it('does not widen the payout_status domain or touch earning creation / settlement', () => {
    expect(noComments).not.toContain('provider_earnings_payout_status_check');
    expect(noComments).not.toContain('create_earning_on_paid');
    expect(noComments).not.toContain('apply_mpesa_callback');
    expect(noComments).not.toContain('record_provider_payout');
    expect(noComments).not.toMatch(/delete\s+from\s+public\.provider_earnings/i);
  });
});
