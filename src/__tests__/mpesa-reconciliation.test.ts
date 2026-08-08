/**
 * mpesa-reconciliation.test.ts
 *
 * Phase 4D.2 regression — static assertions on migration 0036. Reads the migration
 * as TEXT (fs); no live DB. Fails on the pre-fix baseline (0036 absent → read throws)
 * and passes after the fix.
 *
 * Behavioural certification (stale→timed_out, late-callback still settles, authz) is
 * proven connected on DEV + QA; this offline test guards the migration invariants so the
 * fix cannot silently regress in CI.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AttemptStatus } from '@/lib/attempts';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/', f), 'utf-8');
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();
const FN = norm('public.reconcile_stale_payment_attempts(interval)');

describe('migration 0036 — mpesa attempt reconciliation', () => {
  let sql: string;
  beforeAll(() => { sql = norm(read('0036_mpesa_attempt_reconciliation.sql')); });

  it("adds a terminal 'timed_out' status to payment_attempts", () => {
    expect(sql).toContain("'timed_out'");
    expect(sql).toMatch(/check \(status in \([^)]*'timed_out'[^)]*\)\)/);
  });

  it('defines reconcile_stale_payment_attempts(interval) returning integer', () => {
    expect(sql).toContain('create or replace function public.reconcile_stale_payment_attempts');
    expect(sql).toContain('returns integer');
  });

  it('reconcile marks stale mpesa pending attempts timed_out and NEVER mutates payments', () => {
    // Updates payment_attempts to timed_out for stale, uncalled-back, mpesa pending rows.
    expect(sql).toContain("set status = 'timed_out'");
    expect(sql).toContain("provider = 'mpesa'");
    expect(sql).toContain('callback_received_at is null');
    expect(sql).toContain('created_at < now() - p_max_age');
    // Critical: no settlement — it must not update public.payments.
    expect(sql).not.toContain('update public.payments');
  });

  it('locks reconcile to service_role only (never PUBLIC/anon/authenticated)', () => {
    expect(sql).toContain(`revoke execute on function ${FN} from public`);
    expect(sql).toContain(`revoke execute on function ${FN} from anon`);
    expect(sql).toContain(`revoke execute on function ${FN} from authenticated`);
    expect(sql).toContain(`grant execute on function ${FN} to service_role`);
    expect(sql).not.toContain(`grant execute on function ${FN} to public`);
  });

  it('schedules automatic reconciliation via pg_cron', () => {
    expect(sql).toContain('create extension if not exists pg_cron');
    expect(sql).toContain("cron.schedule");
    expect(sql).toContain('mpesa-reconcile-stale-attempts');
  });

  it('does not redefine or re-grant apply_mpesa_callback (no DDL churn on 0012/0035)', () => {
    // A comment may reference apply_mpesa_callback, but 0036 must not create/replace,
    // revoke, or grant on it — those live in 0012/0035 and are left untouched.
    expect(sql).not.toContain('create or replace function public.apply_mpesa_callback');
    expect(sql).not.toContain('revoke execute on function public.apply_mpesa_callback');
    expect(sql).not.toContain('grant execute on function public.apply_mpesa_callback');
  });

  it("AttemptStatus type includes 'timed_out'", () => {
    const s: AttemptStatus = 'timed_out';
    expect(s).toBe('timed_out');
  });
});
