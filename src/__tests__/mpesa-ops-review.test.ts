/**
 * Static regression guards for migration 0053 — M-PESA operational review + alert sweep.
 *
 * What 0053 adds (and only this):
 *   - two IMMUTABLE threshold functions that are the single source of truth for operational
 *     age semantics: mpesa_ops_callback_window() = interval '5 minutes' (same value the 0036 cron
 *     passes to reconcile_stale_payment_attempts) and mpesa_ops_stale_after() = interval
 *     '60 minutes';
 *   - admin_mpesa_attempt_review(): an admin-only SECURITY DEFINER read model over
 *     payment_attempts that DERIVES an operational category, urgency, blocking flag and
 *     needs-operator flag from the existing row state (no new persisted status), masks the
 *     customer phone, and never exposes raw_response;
 *   - mpesa_ops_alert_sweep(): a service_role-only sweep that emits ADMIN notifications through
 *     the existing notify_admins() fan-out with a per-attempt, per-kind dedup base, so a cron
 *     re-run can never repeat an alert; plus its pg_cron schedule.
 *
 * What 0053 must NOT do: touch apply_mpesa_callback, confirm_payment_attempt,
 * reconcile_payment_attempt_no_collection, reserve_mpesa_attempt, the 0036 cron, or any
 * payment/attempt/earning data.
 */
import fs from 'fs';
import path from 'path';

const MIGRATION = '0053_mpesa_operational_review.sql';
const dir = path.resolve(__dirname, '../../supabase/migrations');
const sql = fs.readFileSync(path.join(dir, MIGRATION), 'utf-8');
const code = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
const lower = code.toLowerCase();

function fn(name: string): string {
  const start = lower.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  // Bodies use either `$$` or `$fn$` dollar quoting; stop at whichever terminator comes first.
  const ends = ['$$;', '$fn$;'].map((t) => lower.indexOf(t, start)).filter((i) => i > -1);
  return lower.slice(start, Math.min(...ends) + 3);
}

describe('0053 — placement', () => {
  it('sits immediately after 0052 and leaves 0051/0052 in place', () => {
    const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    const idx0052 = files.findIndex((f) => f.startsWith('0052_'));
    expect(files[idx0052 + 1]).toBe(MIGRATION);
    expect(files.filter((f) => f.startsWith('0051'))).toHaveLength(1);
    expect(files.filter((f) => f.startsWith('0052'))).toHaveLength(1);
    expect(files.filter((f) => f.startsWith('0053'))).toHaveLength(1);
  });
});

describe('0053 — centralised thresholds', () => {
  it('defines the callback window as 5 minutes, matching the 0036 cron argument', () => {
    const body = fn('mpesa_ops_callback_window');
    expect(body).toContain("interval '5 minutes'");
    expect(body).toContain('immutable');
  });

  it('defines the stale threshold as 60 minutes', () => {
    const body = fn('mpesa_ops_stale_after');
    expect(body).toContain("interval '60 minutes'");
    expect(body).toContain('immutable');
  });
});

describe('0053 — admin_mpesa_attempt_review()', () => {
  const body = () => fn('admin_mpesa_attempt_review');

  it('is admin-only, security definer, pinned search_path, callable by authenticated only', () => {
    expect(body()).toContain('security definer');
    expect(body()).toContain('set search_path = public');
    expect(body()).toMatch(/begin\s+if not public\.is_admin\(\) then\s+raise exception 'admin only'/);
    expect(lower).toContain('revoke execute on function public.admin_mpesa_attempt_review() from public, anon;');
    expect(lower).toContain('grant  execute on function public.admin_mpesa_attempt_review() to authenticated;');
  });

  it('exposes the operational columns and derives them from existing state', () => {
    const b = body();
    for (const col of [
      'attempt_id', 'payment_id', 'booking_id', 'status', 'amount', 'created_at', 'age_seconds',
      'callback_received_at', 'result_code', 'result_desc', 'checkout_request_id',
      'merchant_request_id', 'has_collected_amount', 'has_settlement_reference',
      'discrepancy_count', 'latest_discrepancy_type', 'payment_status', 'blocks_retry',
      'needs_operator', 'resolved_at', 'resolved_by_present', 'resolution_note',
      'resolution_reference', 'category', 'urgency', 'phone_masked',
    ]) {
      expect(b.slice(0, b.indexOf('language plpgsql'))).toContain(col);
    }
  });

  it('never returns the raw phone, raw_response, or any secret-bearing column', () => {
    const out = body().slice(0, body().indexOf('language plpgsql'));
    expect(out).not.toMatch(/\bphone\s+text/);
    expect(out).not.toContain('raw_response');
    expect(body()).toMatch(/'\*\*\*' \|\| right\(/); // masked: *** + last digits only
  });

  it('uses the 0046 blocking set for blocks_retry and the threshold functions for age buckets', () => {
    const b = body();
    expect(b).toMatch(/a\.status in \('initiated', ?'pending', ?'timed_out'\)\s+as blocks_retry/);
    expect(b).toContain('public.mpesa_ops_callback_window()');
    expect(b).toContain('public.mpesa_ops_stale_after()');
  });

  it('derives every category name the UI expects, discrepancy-first', () => {
    const b = body();
    for (const c of ["'investigate'", "'settled'", "'failed'", "'no_collection'", "'superseded'", "'reconcile'", "'ambiguous'", "'waiting'"]) {
      expect(b).toContain(c);
    }
    // A recorded discrepancy must win over any status-based classification.
    expect(b.indexOf("then 'investigate'")).toBeLessThan(b.indexOf("then 'settled'"));
  });
});

describe('0053 — mpesa_ops_alert_sweep()', () => {
  const body = () => fn('mpesa_ops_alert_sweep');

  it('is service_role only and security definer with pinned search_path', () => {
    expect(body()).toContain('security definer');
    expect(body()).toContain('set search_path = public');
    expect(lower).toContain('revoke execute on function public.mpesa_ops_alert_sweep() from public, anon, authenticated;');
    expect(lower).toContain('grant  execute on function public.mpesa_ops_alert_sweep() to service_role;');
  });

  it('emits admin alerts through notify_admins with a per-attempt, per-kind dedup base', () => {
    const b = body();
    expect(b).toContain('perform public.notify_admins(');
    for (const kind of ["'admin_attempt_timed_out'", "'admin_attempt_discrepancy'", "'admin_attempt_stale'"]) {
      expect(b).toContain(kind);
    }
    // dedup base = <attempt id>:<kind>, so notify_user's on-conflict makes each alert one-shot.
    expect(b).toMatch(/r\.id::text \|\| ':admin_attempt_timed_out'/);
    expect(b).toMatch(/r\.id::text \|\| ':admin_attempt_discrepancy'/);
    expect(b).toMatch(/r\.id::text \|\| ':admin_attempt_stale'/);
  });

  it('only reads payment data — it never mutates attempts, payments or earnings', () => {
    const b = body();
    expect(b).not.toMatch(/update\s+public\.payment_attempts/);
    expect(b).not.toMatch(/update\s+public\.payments/);
    expect(b).not.toMatch(/insert\s+into\s+public\.(payment_attempts|payments|provider_earnings)/);
    expect(b).not.toContain('delete ');
  });

  it('is scheduled every five minutes under its own cron name, leaving the 0036 job alone', () => {
    expect(lower).toMatch(/cron\.schedule\(\s*'mpesa-ops-alert-sweep',\s*'\*\/5 \* \* \* \*'/);
    expect(lower).not.toContain("'mpesa-reconcile-stale-attempts'");
    expect(lower).not.toContain('cron.unschedule');
  });
});

describe('0053 — contradictory evidence stays operator-visible until reviewed', () => {
  it('adds review columns for discrepancies and a structured evidence source for no-collection', () => {
    expect(lower).toMatch(/alter table public\.payment_attempts[\s\S]*add column if not exists discrepancy_reviewed_at\s+timestamptz/);
    expect(lower).toMatch(/add column if not exists discrepancy_reviewed_by\s+uuid/);
    expect(lower).toMatch(/add column if not exists discrepancy_reviewed_count\s+integer/);
    expect(lower).toMatch(/add column if not exists discrepancy_review_note\s+text/);
    expect(lower).toMatch(/add column if not exists resolution_evidence_source\s+text/);
    expect(lower).toMatch(/resolution_evidence_source in \('provider_reference', ?'portal_lookup'\)/);
  });

  it('derives investigate for ANY unresolved discrepancy, including on a settled attempt', () => {
    const b = fn('admin_mpesa_attempt_review');
    // unresolved = more discrepancy entries than the operator has reviewed
    expect(b).toMatch(/> coalesce\(a\.discrepancy_reviewed_count, 0\)\s+as disc_unresolved/);
    // the investigate branch must not be conditioned on status
    const inv = b.slice(b.indexOf("then 'investigate'") - 80, b.indexOf("then 'investigate'"));
    expect(inv).not.toContain("status <> 'successful'");
    expect(b).toContain('discrepancy_unresolved');
    expect(b).toContain('discrepancy_reviewed_at');
  });

  it('exposes review_attempt_discrepancy(): admin-only, note required, records reviewer/time/count, never touches money', () => {
    const b = fn('review_attempt_discrepancy');
    expect(b).toContain('security definer');
    expect(b).toContain('set search_path = public');
    expect(b).toMatch(/if not public\.is_admin\(\) then/);
    expect(b).toMatch(/review note required/);
    expect(b).toContain('for update');
    expect(b).toMatch(/discrepancy_reviewed_at\s*=\s*now\(\)/);
    expect(b).toMatch(/discrepancy_reviewed_by\s*=\s*auth\.uid\(\)/);
    expect(b).toMatch(/discrepancy_reviewed_count\s*=/);
    expect(b).not.toMatch(/update\s+public\.payments/);
    expect(b).not.toMatch(/set\s+status/);
    expect(b).not.toContain('provider_earnings');
    expect(lower).toContain('revoke execute on function public.review_attempt_discrepancy(uuid, text) from public, anon;');
    expect(lower).toContain('grant  execute on function public.review_attempt_discrepancy(uuid, text) to authenticated;');
  });

  it('the alert sweep raises a discrepancy alert for unresolved evidence on any status, settled included', () => {
    const b = fn('mpesa_ops_alert_sweep');
    const seg = b.slice(b.indexOf("'admin_attempt_discrepancy'") - 900, b.indexOf("'admin_attempt_discrepancy'"));
    expect(seg).not.toContain("status <> 'successful'");
    expect(seg).toMatch(/> coalesce\(a\.discrepancy_reviewed_count, 0\)/);
  });
});

describe('0053 — no-collection requires structured evidence server-side', () => {
  it('replaces the 3-argument RPC with a 4-argument one carrying p_evidence_source', () => {
    expect(lower).toContain('drop function if exists public.reconcile_payment_attempt_no_collection(uuid, text, text);');
    const b = fn('reconcile_payment_attempt_no_collection');
    expect(b).toMatch(/p_evidence_source\s+text/);
    expect(b).toMatch(/p_evidence_source not in \('provider_reference', ?'portal_lookup'\)/);
    // provider_reference evidence requires a non-blank reference
    expect(b).toMatch(/p_evidence_source = 'provider_reference'[\s\S]*raise exception 'provider reference required for provider_reference evidence'/);
    // note is still mandatory
    expect(b).toMatch(/reconciliation note required/);
    // the evidence source is persisted
    expect(b).toMatch(/resolution_evidence_source\s*=\s*p_evidence_source/);
  });

  it('keeps every 0045 guard: admin, both row locks, pending payment, resolvable status, never settles', () => {
    const b = fn('reconcile_payment_attempt_no_collection');
    expect(b).toMatch(/if not public\.is_admin\(\) then/);
    expect(b).toMatch(/from public\.payments where id = v_payment_id for update/);
    expect(b).toMatch(/from public\.payment_attempts where id = p_attempt_id for update/);
    expect(b).toContain("if v_payment.status <> 'pending' then");
    expect(b).toContain("if v_attempt.status not in ('initiated','pending','timed_out') then");
    expect(b).not.toContain('settlement_reference');
    expect(b).not.toMatch(/update\s+public\.payments/);
    expect(lower).toContain('revoke execute on function public.reconcile_payment_attempt_no_collection(uuid, text, text, text) from public, anon;');
    expect(lower).toContain('grant  execute on function public.reconcile_payment_attempt_no_collection(uuid, text, text, text) to authenticated;');
  });
});

describe('0053 — untouched surfaces', () => {
  it('does not redefine the settlement, callback, reservation or confirmation RPCs', () => {
    for (const name of [
      'apply_mpesa_callback', 'confirm_payment_attempt',
      'reserve_mpesa_attempt', 'reconcile_stale_payment_attempts', 'mark_attempt_accepted',
      'mark_attempt_failed', 'override_payment_status', 'initiate_payment_attempt',
    ]) {
      expect(lower).not.toContain(`create or replace function public.${name}(`);
      expect(lower).not.toContain(`drop function if exists public.${name}(`);
    }
    // the only table change is the additive columns above; no data backfill of any kind
    expect((lower.match(/alter table public\.payment_attempts/g) ?? []).length).toBeGreaterThan(0);
    expect(lower).not.toMatch(/\bupdate\s+public\.payments\b/);
    expect(lower).not.toMatch(/\bupdate\s+public\.provider_earnings\b/);
    expect(lower).not.toMatch(/\bdelete\s+from\b/);
  });
});
