/**
 * Guard for Update 74's hardening H2, the provider-location fix (P4). Its number is final: 0074
 * (numbering N1, PM stage 119); this guard finds the file by name.
 *
 * Pins the reviewed shape:
 *   - H2 stands alone: it re-creates only upsert_provider_location and refers to nothing from H1 (the
 *     terminal guard) or the cancellation feature, so it can ship on its own (owner instruction
 *     2026-10-02 18:25, item 1);
 *   - the function is 0018's, byte for byte once comments and spacing are normalised, except that the
 *     booking read takes FOR SHARE (so a write racing a cancellation waits and re-reads the status);
 *   - CREATE OR REPLACE keeps the 0064 grants: the file grants and revokes nothing, and drops nothing.
 * Behaviour (an in-flight upsert cannot re-create a location row after a cancellation; legitimate writes
 * and the provider and status checks are unchanged) is proven on a real database by the 74c SQL harness
 * (checks/harness/h2), with this file applied alone, together with its mutants.
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS = path.join(__dirname, '../../supabase/migrations');
const files = fs.readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const matching = files.filter((f) => f.endsWith('_provider_location_share_lock.sql'));
const H2 = matching[0];
const raw = fs.readFileSync(path.join(MIGRATIONS, H2), 'utf-8');
const flatOf = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const flat = flatOf(raw);
const UPSERT = 'create or replace function public.upsert_provider_location(';
const functionIn = (text: string) => {
  const start = text.indexOf(UPSERT);
  expect(start).toBeGreaterThanOrEqual(0);
  return text.slice(start, text.indexOf('$$;', start) + 3);
};

describe('H2 (location lock): final numbering and independence', () => {
  it('exists exactly once, is byte-exact (no CR bytes) and carries its final number', () => {
    expect(matching).toHaveLength(1);
    expect(raw.includes('\r')).toBe(false);
    expect(raw).toMatch(/FINAL NUMBER 0074\./);
  });

  it('re-creates only upsert_provider_location and refers to nothing from H1 or the feature', () => {
    const created = [...flat.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]);
    expect(created).toEqual(['upsert_provider_location']);
    expect(flat).not.toMatch(/tg_bookings_terminal_guard|create trigger|customer_cancel_booking|booking_cancellations|accept_quote/);
  });

  it('grants, revokes and drops nothing, so the 0064 grants are kept', () => {
    // A statement that starts with GRANT or REVOKE (the self-check's messages may use the words).
    expect(flat).not.toMatch(/(?:^|; )(?:grant|revoke) /);
    expect('x; grant execute on f to anon;').toMatch(/(?:^|; )(?:grant|revoke) /);
    expect(flat).not.toMatch(/\bdrop (function|table|policy|trigger|view|index)\b/);
  });
});

describe('H2: upsert_provider_location reads the booking FOR SHARE and is otherwise 0018 verbatim', () => {
  const h2 = functionIn(flat);
  const original = functionIn(flatOf(fs.readFileSync(path.join(MIGRATIONS, '0018_provider_locations.sql'), 'utf-8')));

  it('takes FOR SHARE on the booking read, before any check', () => {
    expect(h2).toMatch(/from public\.bookings where id = p_booking_id for share;/);
    expect(h2.indexOf('for share;')).toBeLessThan(h2.indexOf('if not found then'));
  });

  it('keeps the signature, the provider and status checks and the upsert of 0018 exactly', () => {
    expect(h2.replace(' for share;', ';')).toBe(original);
    expect(h2).toContain(
      'upsert_provider_location( p_booking_id uuid, p_lat double precision, p_lng double precision, p_heading double precision, p_speed double precision )',
    );
    expect(h2).toContain('if v_assigned_provider_id is distinct from auth.uid() then');
    expect(h2).toContain("if v_status not in ('on_the_way', 'in_progress') then");
  });

  it('stops itself if the grants changed or FOR SHARE is missing', () => {
    expect(flat).toContain("has_function_privilege('anon', upsert, 'execute')");
    expect(flat).toContain("not has_function_privilege('authenticated', upsert, 'execute')");
    expect(flat).toContain("position('for share' in pg_get_functiondef(upsert)) = 0");
  });
});
