/**
 * Guard for Update 74's hardening H1, the cancellation race fix (P1). Its number is final: 0073
 * (numbering N1, PM stage 119); this guard finds the file by name.
 *
 * Pins the reviewed shape:
 *   - H1 stands alone: it creates only the terminal-status guard and its trigger, and refers to nothing
 *     from H2 (the location lock) or the cancellation feature, so it can ship on its own (owner
 *     instruction 2026-10-02 18:25, item 1);
 *   - the trigger is BEFORE UPDATE OF status, FOR EACH ROW, so its OLD is the newest locked row version,
 *     and it refuses a signed-in non-admin leaving 'cancelled' or 'completed';
 *   - admins and paths with no signed-in user are not refused; no client role can execute the function;
 *   - the file grants nothing and drops nothing but its own trigger (to re-create it).
 * Behaviour under the concurrent interleaving (provider in_progress, completed and on_the_way moves after
 * a cancellation; admin and service moves; legitimate provider transitions) is proven on a real database
 * by the 74c SQL harness (checks/harness/h1), with this file applied alone, together with its mutants.
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS = path.join(__dirname, '../../supabase/migrations');
const files = fs.readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const matching = files.filter((f) => f.endsWith('_booking_terminal_status_guard.sql'));
const H1 = matching[0];
const raw = fs.readFileSync(path.join(MIGRATIONS, H1), 'utf-8');
const flat = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

describe('H1 (terminal-status guard): final numbering and independence', () => {
  it('exists exactly once, is byte-exact (no CR bytes) and carries its final number', () => {
    expect(matching).toHaveLength(1);
    expect(raw.includes('\r')).toBe(false);
    expect(raw).toMatch(/FINAL NUMBER 0073\./);
  });

  it('creates only the guard function and refers to nothing from H2 or the feature', () => {
    const created = [...flat.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]);
    expect(created).toEqual(['tg_bookings_terminal_guard']);
    expect(flat).not.toMatch(/upsert_provider_location|provider_locations|for share|customer_cancel_booking|booking_cancellations|accept_quote/);
  });

  it('grants nothing, and drops nothing except its own trigger before re-creating it', () => {
    expect(flat).not.toMatch(/\bgrant\b/);
    expect(flat).not.toMatch(/\bdrop (function|table|policy|view|index)\b/);
    const drops = [...flat.matchAll(/\bdrop trigger [^;]*;/g)].map((m) => m[0]);
    expect(drops).toEqual(['drop trigger if exists trg_bookings_terminal_guard on public.bookings;']);
  });
});

describe('H1: the guard refuses a signed-in non-admin leaving a terminal status', () => {
  const start = flat.indexOf('create or replace function public.tg_bookings_terminal_guard(');
  const fn = flat.slice(start, flat.indexOf('$$;', start) + 3);

  it('is a SECURITY DEFINER trigger function with a fixed search_path', () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(fn).toContain('returns trigger');
    expect(fn).toContain('security definer set search_path = public, pg_temp');
  });

  it('compares the newest row (OLD) and refuses only signed-in non-admins changing the status', () => {
    expect(fn).toContain("old.status in ('cancelled', 'completed')");
    expect(fn).toContain('new.status is distinct from old.status');
    expect(fn).toContain('auth.uid() is not null');
    expect(fn).toContain('not public.is_admin()');
    expect(fn).toContain("raise exception 'booking_status_final' using errcode = 'p0001'");
    expect(fn).toContain('return new;');
  });

  it('fires BEFORE UPDATE OF status for each row, and no client role can execute the function', () => {
    expect(flat).toContain(
      'create trigger trg_bookings_terminal_guard before update of status on public.bookings for each row execute function public.tg_bookings_terminal_guard();',
    );
    expect(flat).toContain('revoke execute on function public.tg_bookings_terminal_guard() from public, anon, authenticated;');
  });

  it('stops itself unless the trigger is an enabled BEFORE UPDATE row trigger that no client can execute', () => {
    expect(flat).toContain("tgname = 'trg_bookings_terminal_guard'");
    expect(flat).toContain('(t.tgtype & 2) = 0');
    expect(flat).toContain("t.tgenabled <> 'o'");
    expect(flat).toContain("has_function_privilege('authenticated', guard, 'execute')");
  });
});
