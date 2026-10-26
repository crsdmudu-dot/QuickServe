/**
 * Guard for Update 74's feature migration (customer cancellation in the app). Its number is final
 * (0076; numbering N1, PM stage 119); this guard finds the files by name.
 * The two hardening migrations have their own guards: H1, the terminal-status guard
 * (booking-terminal-guard-migration.test.ts), and H2, the location lock
 * (provider-location-lock-migration.test.ts).
 *
 * Pins the reviewed shape:
 *   - the feature sorts after H1 and H2 and its self-check requires both (Option B, decided 2026-10-03;
 *     PM stage 107: H2 live no later than the feature); it re-creates nothing that H1, H2 or H3 own, so
 *     each of them stays independently releasable;
 *   - customer_cancel_booking: SECURITY DEFINER with a fixed search_path, EXECUTE for authenticated only,
 *     the caller must be signed in and active, the booking is locked FOR NO KEY UPDATE before anything is
 *     decided, a booking that is not the caller's answers not_found, the payment is locked after it, the
 *     notices reuse the status trigger's dedup keys, the transition is conditional on the locked status;
 *   - booking_cancellations: RLS on, no client write, select only;
 *   - accept_quote refuses a cancelled booking; no Update 50 function is touched; nothing is dropped;
 *   - the OWNER DECISIONS (2026-10-03 19:19) in the function equal the app's mirror
 *     (src/constants/cancellation.ts), every OD-74 point is named in both places, the decided ones are
 *     marked DECIDED, and manual dispatch has the same eligibility (owner item 3);
 *   - the customer is told when anyone else cancels (owner item 6), once, never on their own cancellation.
 * Behaviour (ownership, eligibility, idempotency, races, late callbacks, STK refusal) is proven on a real
 * database by the Update 74 SQL harness (74c package, checks/harness: the feature section, with H1 and H2
 * applied, and again with H1 only).
 */
import * as fs from 'fs';
import * as path from 'path';

import { CANCEL_REASON_CODES, CANCELLABLE_STATUSES } from '@/constants/cancellation';

const MIGRATIONS = path.join(__dirname, '../../supabase/migrations');
const files = fs.readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const one = (suffix: string) => {
  const found = files.filter((f) => f.endsWith(suffix));
  expect(found).toHaveLength(1);
  return found[0];
};
const H1 = one('_booking_terminal_status_guard.sql');
const H2 = one('_provider_location_share_lock.sql');
// H3 is independent of the feature, so a tree without it is valid.
const H3_FILES = files.filter((f) => f.endsWith('_provider_location_visibility.sql'));
const CANCEL = one('_customer_booking_cancellation.sql');
const rawOf = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8');
const flatOf = (raw: string) =>
  raw
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const cancelRaw = rawOf(CANCEL);
const cancel = flatOf(cancelRaw);
const h1 = flatOf(rawOf(H1));
const h2 = flatOf(rawOf(H2));
const h3 = H3_FILES.length === 1 ? flatOf(rawOf(H3_FILES[0])) : '';

function body(flat: string, name: string): string {
  const start = flat.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  return flat.slice(start, flat.indexOf('$$;', start) + 3);
}

/** The array literal assigned to a constant in the function's DEFAULTS block. */
function sqlArray(name: string): string[] {
  const m = new RegExp(`${name} constant text\\[\\] := array\\[([^\\]]*)\\]`).exec(cancel);
  expect(m).not.toBeNull();
  return (m as RegExpExecArray)[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
}

describe('Update 74 feature migration: final numbering and its dependency on H1 and H2', () => {
  it('is byte-exact (no CR bytes) and carries its final number', () => {
    expect(cancelRaw.includes('\r')).toBe(false);
    expect(cancelRaw).toMatch(/FINAL NUMBER 0076\./);
  });

  it('sorts after H1 and H2, and its self-check requires the enabled H1 trigger on its function and H2', () => {
    expect(files.indexOf(CANCEL)).toBeGreaterThan(files.indexOf(H1));
    expect(files.indexOf(CANCEL)).toBeGreaterThan(files.indexOf(H2));
    expect(cancel).toContain("raise exception '0076 self-check: h2 (the location lock, 0074) is not applied'");
    expect(cancel).toContain("position('for share' in coalesce(pg_get_functiondef(to_regprocedure(");
    expect(cancel).toContain("tgname = 'trg_bookings_terminal_guard'");
    expect(cancel).toContain("tgfoid = to_regprocedure('public.tg_bookings_terminal_guard()')");
    expect(cancel).toContain("raise exception '0076 self-check: h1 (the terminal guard, 0073) is not applied'");
  });

  it('re-creates nothing that H1, H2 or H3 own, and they refer to nothing of the feature', () => {
    expect(H3_FILES.length).toBeLessThanOrEqual(1);
    expect(cancel).not.toMatch(/create or replace function public\.(tg_bookings_terminal_guard|upsert_provider_location|tg_provider_locations_clear)\(/);
    expect(cancel).not.toMatch(/create trigger trg_bookings_terminal_guard|create trigger trg_provider_locations_clear|provider_locations_select/);
    for (const h of [h1, h2, h3]) expect(h).not.toMatch(/customer_cancel_booking|booking_cancellations|accept_quote/);
  });
});

describe('feature: customer_cancel_booking', () => {
  const fn = body(cancel, 'customer_cancel_booking');

  it('is SECURITY DEFINER with a fixed search_path, and only signed-in users may execute it', () => {
    expect(fn).toContain('security definer set search_path = public, pg_temp');
    expect(cancel).toContain('revoke all on function public.customer_cancel_booking(uuid, text, uuid) from public, anon, authenticated;');
    expect(cancel).toContain('grant execute on function public.customer_cancel_booking(uuid, text, uuid) to authenticated;');
    expect(cancel).not.toMatch(/grant execute on function public\.customer_cancel_booking\([^)]*\) to (anon|public)/);
  });

  it('requires a signed-in, active caller and validates its input', () => {
    expect(fn).toContain("if v_uid is null then raise exception 'not_authenticated'");
    expect(fn).toContain("if not public.is_active_user() then raise exception 'not_allowed'");
    expect(fn).toContain("p_reason_code = any (c_reason_codes)");
    expect(fn).toContain('p_idempotency_key is null');
  });

  it('locks the booking FOR NO KEY UPDATE first and answers not_found for a booking that is not the caller’s', () => {
    const lock = fn.indexOf('from public.bookings where id = p_booking_id for no key update;');
    expect(lock).toBeGreaterThan(0);
    expect(fn).toContain("if not found or v_booking.customer_id is distinct from v_uid then return jsonb_build_object('ok', false, 'code', 'not_found');");
    const payLock = fn.indexOf('from public.payments where booking_id = p_booking_id for update;');
    expect(payLock).toBeGreaterThan(lock);
  });

  it('refuses work started, completed and anything involving money (manual dispatch is not refused)', () => {
    expect(fn).toContain("if v_booking.status = 'in_progress' then return jsonb_build_object('ok', false, 'code', 'work_started');");
    expect(fn).toContain("'code', 'completed'");
    expect(fn).toContain("a.status in ('initiated', 'pending', 'timed_out', 'successful')");
    expect(fn).toContain("'code', 'payment_in_progress'");
    expect(fn).toContain("'code', 'payment_recorded'");
    expect(fn).toContain('v_payment.wallet_applied > 0 or v_payment.promo_discount > 0 or v_payment.promo_code_id is not null');
  });

  it('writes the notices with the status trigger’s dedup keys, then changes the status only from the locked one', () => {
    expect(fn).toContain("':booking_cancelled'");
    expect(fn).toContain("':admin_cancelled_after_assign'");
    const notices = fn.indexOf('perform public.notify_admins(');
    const transition = fn.indexOf("update public.bookings set status = 'cancelled' where id = p_booking_id and status = v_booking.status;");
    expect(notices).toBeGreaterThan(0);
    expect(transition).toBeGreaterThan(notices);
    expect(fn).toContain("raise exception 'cancel_state_changed'");
  });

  it('clears the tracking row before the status change, so the result does not depend on H3', () => {
    const del = fn.indexOf('delete from public.provider_locations where booking_id = p_booking_id; v_cleared := found;');
    const transition = fn.indexOf("update public.bookings set status = 'cancelled' where id = p_booking_id and status = v_booking.status;");
    expect(del).toBeGreaterThan(0);
    expect(transition).toBeGreaterThan(del);
  });

  it('manual dispatch: no refusal, the admins are told to phone the provider, and the answer says so', () => {
    expect(fn).not.toMatch(/if v_manual[^;]*then return jsonb_build_object\('ok', false/);
    expect(fn).not.toContain('c_manual_dispatch_to_help');
    expect(fn).toContain("case when v_manual then c_admin_manual_note else '' end");
    expect(fn).toContain("'manual_provider', v_manual");
  });

  it('closes an unpaid payment, stops tracking and writes one audit row', () => {
    expect(fn).toContain("update public.payments set status = 'cancelled', paid_at = null where id = v_payment.id and status = 'pending';");
    expect(fn).toContain('delete from public.provider_locations where booking_id = p_booking_id;');
    expect(fn).toContain('insert into public.booking_cancellations');
    expect(fn).toContain("'already_cancelled'");
  });
});

describe('feature: the audit table and accept_quote', () => {
  it('booking_cancellations: RLS on, no client write, select only for the customer and active admins', () => {
    expect(cancel).toContain('alter table public.booking_cancellations enable row level security;');
    expect(cancel).toContain('revoke all on table public.booking_cancellations from public, anon, authenticated;');
    expect(cancel).toContain('grant select on table public.booking_cancellations to authenticated;');
    expect(cancel).not.toMatch(/grant (insert|update|delete|all)[^;]*booking_cancellations/);
    expect(cancel).toContain('using (cancelled_by = auth.uid() or public.is_active_admin());');
    expect(cancel).toContain('as restrictive for all to authenticated using (public.is_active_user())');
  });

  it("accept_quote refuses a cancelled booking and keeps its signature", () => {
    const fn = body(cancel, 'accept_quote');
    expect(fn).toContain('accept_quote(p_booking_id uuid)');
    expect(fn).toContain("and status <> 'cancelled';");
  });

  it('touches no Update 50 function and drops nothing', () => {
    for (const name of ['reserve_mpesa_attempt', 'mark_attempt_accepted', 'mark_attempt_failed', 'apply_mpesa_callback', 'apply_or_record_mpesa_callback', 'record_mpesa_callback_event']) {
      expect(cancel).not.toContain(`create or replace function public.${name}(`);
      expect(h1).not.toContain(`create or replace function public.${name}(`);
      expect(h2).not.toContain(`create or replace function public.${name}(`);
    }
    expect(cancel).not.toMatch(/\bdrop function\b|\bdrop table\b/);
  });
});

describe('feature: the customer is told when anyone else cancels (owner item 6)', () => {
  it('an AFTER UPDATE OF status trigger, only on becoming cancelled, SECURITY DEFINER, not executable by clients', () => {
    expect(cancel).toContain(
      "create trigger trg_bookings_customer_cancel_notice after update of status on public.bookings for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled') execute function public.tg_bookings_customer_cancel_notice();",
    );
    expect(cancel).toContain('revoke execute on function public.tg_bookings_customer_cancel_notice() from public, anon, authenticated;');
    const notice = body(cancel, 'tg_bookings_customer_cancel_notice');
    expect(notice).toContain('security definer set search_path = public, pg_temp');
  });

  it("never on the customer's own cancellation, and once per booking", () => {
    const notice = body(cancel, 'tg_bookings_customer_cancel_notice');
    expect(notice).toContain('if auth.uid() is not distinct from new.customer_id then return null;');
    expect(notice).toContain("new.customer_id::text || ':' || new.id::text || ':booking_cancelled_by_kwikserve'");
  });
});

describe('OWNER DECISIONS: one block on the server, one in the app, and they agree', () => {
  it('the cancellable statuses and reasons are equal in both places', () => {
    expect(sqlArray('c_cancellable_statuses')).toEqual([...CANCELLABLE_STATUSES]);
    expect(sqlArray('c_reason_codes')).toEqual([...CANCEL_REASON_CODES]);
  });

  it('every OD-74 point is named in the server block and in the app block', () => {
    const appBlock = fs.readFileSync(path.join(__dirname, '../constants/cancellation.ts'), 'utf-8');
    for (let i = 1; i <= 13; i++) {
      expect(cancelRaw).toContain(`OD-74-${i}`);
      expect(appBlock).toContain(`OD-74-${i}`);
    }
    expect(cancelRaw).toMatch(/OWNER DECISIONS/);
    expect(appBlock).toMatch(/OWNER DECISIONS/);
  });

  it('cites the owner file, marks the decided points DECIDED, and leaves OD-74-7 undecided with no promise', () => {
    const appBlock = fs.readFileSync(path.join(__dirname, '../constants/cancellation.ts'), 'utf-8');
    for (const block of [cancelRaw, appBlock]) {
      expect(block).toContain('00-OWNER-DECISIONS-2026-10-03-1919.md');
      for (const od of [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13]) expect(block).toMatch(new RegExp(`OD-74-${od}\\b[^\\n]*DECIDED|OD-74-${od}, [^\\n]*DECIDED`));
      expect(block).toMatch(/OD-74-7\s+UNDECIDED/);
      expect(block).not.toMatch(/DEFAULT pending|OWNER-DECISION DEFAULTS/);
    }
  });
});
