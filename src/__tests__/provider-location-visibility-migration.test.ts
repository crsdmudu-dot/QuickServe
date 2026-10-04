/**
 * Guard for Update 74's hardening H3, the provider-location visibility (M-93-4 option (a), owner decision of
 * 2026-10-03 19:19, item 7). Its number is PROVISIONAL (0076 locally); the final number is assigned at
 * merge, so this guard finds the file by name.
 *
 * Pins the reviewed shape:
 *   - H3 stands alone: it refers to nothing from H1, H2 or the cancellation feature;
 *   - the customer reads a position only while the booking is on_the_way or in_progress, and only the
 *     current provider's row; the assigned provider reads only their own row; admins read every row;
 *   - an AFTER UPDATE trigger deletes the booking's position when the status becomes completed or
 *     cancelled, or the assigned provider changes, whoever makes the change;
 *   - the trigger function is SECURITY DEFINER and no client role can execute it; the write functions
 *     (upsert_provider_location, clear_provider_location) are not touched.
 * Behaviour (visibility by status, former assignments, unauthorised readers, the race with an in-flight
 * location write, with and without H2) is proven on a real database by the 74e SQL harness
 * (checks/harness/h3), with this file applied alone, together with its mutants.
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS = path.join(__dirname, '../../supabase/migrations');
const files = fs.readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const matching = files.filter((f) => f.endsWith('_provisional_provider_location_visibility.sql'));
const raw = matching.length ? fs.readFileSync(path.join(MIGRATIONS, matching[0]), 'utf-8') : '';
const flat = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

describe('H3 (location visibility): provisional numbering and independence', () => {
  it('exists exactly once, is byte-exact (no CR bytes) and is marked provisional', () => {
    expect(matching).toHaveLength(1);
    expect(raw.includes('\r')).toBe(false);
    expect(raw).toMatch(/PROVISIONAL NUMBER/);
  });

  it('creates only its clearing function and refers to nothing from H1, H2 or the feature', () => {
    const created = [...flat.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]);
    expect(created).toEqual(['tg_provider_locations_clear']);
    expect(flat).not.toMatch(/tg_bookings_terminal_guard|upsert_provider_location\(|for share|customer_cancel_booking|booking_cancellations|accept_quote/);
  });

  it('grants nothing and drops only its own policy and trigger before re-creating them', () => {
    expect(flat).not.toMatch(/(?:^|; )grant /);
    expect(flat).not.toMatch(/\bdrop (function|table|view|index)\b/);
    const drops = [...flat.matchAll(/\bdrop (policy|trigger) [^;]*;/g)].map((m) => m[0]);
    expect(drops).toEqual([
      'drop policy if exists "provider_locations_select" on public.provider_locations;',
      'drop trigger if exists trg_provider_locations_clear on public.bookings;',
    ]);
  });
});

describe('H3: who may read a position', () => {
  const start = flat.indexOf('create policy "provider_locations_select" on public.provider_locations');
  const policy = flat.slice(start, flat.indexOf(');', flat.indexOf('public.is_admin()', start)) + 2);

  it('the customer: only while travelling or working, and only the current provider row', () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(policy).toContain(
      "(b.customer_id = auth.uid() and b.status in ('on_the_way', 'in_progress') and provider_locations.provider_id = b.assigned_provider_id)",
    );
  });

  it('the assigned provider: only their own row; admins: every row', () => {
    expect(policy).toContain('(b.assigned_provider_id = auth.uid() and provider_locations.provider_id = auth.uid())');
    expect(policy).toContain('or public.is_admin()');
    expect(policy).toContain('for select using');
  });
});

describe('H3: the position is deleted when the job ends or the provider changes', () => {
  it('an AFTER UPDATE OF status, assigned_provider_id row trigger with the right condition', () => {
    expect(flat).toContain(
      "create trigger trg_provider_locations_clear after update of status, assigned_provider_id on public.bookings for each row when ((new.status in ('completed', 'cancelled') and new.status is distinct from old.status) or new.assigned_provider_id is distinct from old.assigned_provider_id) execute function public.tg_provider_locations_clear();",
    );
  });

  it('the function deletes only that booking row, is SECURITY DEFINER and no client can execute it', () => {
    const start = flat.indexOf('create or replace function public.tg_provider_locations_clear(');
    const fn = flat.slice(start, flat.indexOf('$$;', start) + 3);
    expect(fn).toContain('security definer set search_path = public, pg_temp');
    expect(fn).toContain('delete from public.provider_locations where booking_id = new.id;');
    expect(flat).toContain('revoke execute on function public.tg_provider_locations_clear() from public, anon, authenticated;');
  });

  it('stops itself unless the policy, the trigger and the privileges are exactly as intended', () => {
    expect(flat).toContain("raise exception 'provisional 0076 self-check: provider_locations_select is not the status-restricted rule'");
    expect(flat).toContain("raise exception 'provisional 0076 self-check: another select policy on provider_locations would widen the rule'");
    expect(flat).toContain("raise exception 'provisional 0076 self-check: the clearing function is executable by a client role'");
  });

  it('its self-check refuses a BEFORE trigger (PM stage 109, L-109-1)', () => {
    expect(flat).toContain(
      "or (t.tgtype & 1) = 0 or (t.tgtype & 2) <> 0 or (t.tgtype & 16) = 0 or t.tgenabled <> 'o' then raise exception 'provisional 0076 self-check: the clearing trigger is not an enabled after update row trigger on its function'",
    );
  });
});
