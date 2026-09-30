/**
 * booking-insert-authority.test.ts
 *
 * Static regression guard for migration 0063 (H1): a signed-in customer may create a booking, but may not set the
 * fields KwikServe owns (status, the assigned provider, the quote, admin notes, id, created_at).
 *
 * It reads the migration files as TEXT (no database is contacted) and the app's REAL insert payload (createBooking
 * with a mocked Supabase client), and proves:
 *   - the app sends exactly the columns 0063 grants, so the legitimate insert keeps working;
 *   - every bookings column any migration defines is classified as client-supplied or server-owned, so a new
 *     column forces a deliberate decision here;
 *   - 0063 removes the table-wide INSERT privilege, grants only the client columns, and pins the starting values
 *     in the insert policy;
 *   - no later migration gives INSERT back or opens another insert path.
 * The behaviour itself (each abuse insert refused, the app-shaped insert accepted, service_role and postgres
 * unaffected) is proven separately against a real database built from these migrations (locally, then in QA).
 */
import * as fs from 'fs';
import * as path from 'path';
import { createBooking } from '@/lib/bookings';
import { balancedParens, normalizeSql, splitSqlStatements, splitTopLevel, tableColumns, topLevelConjuncts } from '../../test/sql-text.ts';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');
const FIX = '0063_lock_booking_insert_and_profile_update_fields.sql';

/** Columns a customer legitimately chooses. Must equal both 0063's GRANT list and the app's insert payload. */
const CLIENT_COLUMNS = [
  'customer_id', // who: the policy still requires auth.uid() = customer_id
  'service_id',
  'address',
  'scheduled_for',
  'notes',
  'address_label',
  'latitude',
  'longitude',
  'building_name',
  'floor',
  'door_number',
  'landmark',
  'access_notes',
  'scheduling_type',
  'time_window',
  'window_start',
  'window_end',
  'recurrence',
  'idempotency_key',
  'service_details',
] as const;

/** Columns only KwikServe sets, with the reason. A client insert may not name any of them. */
const SERVER_OWNED: Record<string, string> = {
  id: 'primary key, always gen_random_uuid() (0002); booking-photo storage paths are keyed by it (0059)',
  status: "lifecycle state; starts 'pending' (0002, 0003); moved only by admin dispatch and the assigned provider (0049)",
  created_at: 'audit timestamp, always now() (0002)',
  assigned_provider_name: 'admin dispatch field (0003)',
  assigned_provider_phone: 'admin dispatch field (0003)',
  admin_notes: 'admin-only notes (0003)',
  assigned_provider_id: 'the in-app provider link, set only by admin dispatch (0004)',
  quoted_amount: 'quote amount, authored only by set_quote (0010, 0049)',
  provider_share: "provider's share of the quote, authored only by set_quote (0010, 0049)",
  quote_status: "quote state; starts 'pending'; changed only by set_quote / accept_quote / decline_quote (0010, 0049)",
};

/** The conjuncts the re-created insert policy must consist of - exactly these, no more (an OR would weaken it). */
const POLICY_CONJUNCTS = [
  'auth.uid() = customer_id',
  "status = 'pending'",
  "quote_status = 'pending'",
  'quoted_amount is null',
  'provider_share is null',
  'assigned_provider_id is null',
  'assigned_provider_name is null',
  'assigned_provider_phone is null',
  'admin_notes is null',
  'created_at = now()',
];

type Migration = { file: string; sql: string };

function readMigrations(): Migration[] {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .map((file) => ({ file, sql: fs.readFileSync(path.join(MIGRATIONS, file), 'utf-8') }));
}

const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, '$1');

/** Every column any migration gives public.bookings (see tableColumns in test/sql-text.ts). */
export function bookingsColumns(migrations: Migration[]): string[] {
  return tableColumns(migrations, 'bookings');
}

/** 0063's pieces, parsed from its statements. */
export function parseFix(sql: string) {
  const statements = splitSqlStatements(sql).map(normalizeSql);
  const grants = statements.filter((s) => s.startsWith('grant '));
  const revokes = statements.filter((s) => s.startsWith('revoke '));
  let granted: string[] | null = null;
  const insertGrant = /^grant insert \((.*)\) on table public\.bookings to authenticated$/.exec(grants[0] ?? '');
  if (grants.length === 1 && insertGrant) granted = splitTopLevel(insertGrant[1]).map(unquote);
  const policy = statements.find((s) => s.startsWith('create policy "bookings_insert_own" on public.bookings'));
  let conjuncts: string[] | null = null;
  if (policy && /^create policy "bookings_insert_own" on public\.bookings for insert with check \(/.test(policy)) {
    const open = policy.indexOf('with check (') + 'with check '.length;
    const check = balancedParens(policy, open);
    if (check && check.end === policy.length - 1) {
      conjuncts = topLevelConjuncts(check.inner.trim());
    }
  }
  const selfCheck = statements.find((s) => s.startsWith('do '));
  const selfCheckColumns = selfCheck
    ? (/client_columns constant text\[\] := array\[([^\]]*)\]/.exec(selfCheck)?.[1] ?? '')
        .split(',')
        .map((c) => c.trim().replace(/^'(.*)'$/, '$1'))
        .filter(Boolean)
    : [];
  return { statements, grants, revokes, granted, conjuncts, selfCheckColumns };
}

/** Violations in migrations AFTER 0063 that would give INSERT back or open another insert path. */
export function laterMigrationViolations(migrations: Migration[]): string[] {
  const out: string[] = [];
  const clientRole = /\b(public|anon|authenticated)\b/;
  for (const { file, sql } of migrations.filter((m) => m.file > FIX)) {
    for (const stmt of splitSqlStatements(sql)) {
      const n = normalizeSql(stmt);
      const grant = /^grant (.*) on (?:table )?(?:public\.)?"?bookings"? to (.*)$/.exec(n);
      if (grant && /\b(insert|all)\b/.test(grant[1]) && clientRole.test(grant[2])) out.push(`${file}: re-grants INSERT on bookings: ${n}`);
      const all = /^grant (.*) on all tables in schema [^;]*\bpublic\b[^;]* to (.*)$/.exec(n);
      if (all && /\b(insert|all)\b/.test(all[1]) && clientRole.test(all[2])) out.push(`${file}: schema-wide table grant: ${n}`);
      const pol = /^create policy \S+ on (?:public\.)?"?bookings"?\b(.*)$/.exec(n);
      if (pol && !/\bas restrictive\b/.test(pol[1]) && !/\bfor (select|update|delete)\b/.test(pol[1])) {
        out.push(`${file}: adds a permissive policy that covers INSERT on bookings: ${n}`);
      }
      if (/^(drop|alter) policy (if exists )?"?bookings_insert_own"?/.test(n)) out.push(`${file}: changes bookings_insert_own: ${n}`);
      if (/^alter table (?:only )?(?:public\.)?"?bookings"? (disable row level security|no force row level security)/.test(n)) {
        out.push(`${file}: weakens row level security on bookings: ${n}`);
      }
      if (/^do\b/.test(n) && /\bgrant\b[^;]*\bbookings\b/.test(n)) out.push(`${file}: a DO block grants on bookings dynamically: ${n.slice(0, 80)}`);
    }
  }
  return out;
}

/** Everything that must hold between the app payload, the column inventory and 0063. Returns violations. */
export function h1Violations(input: {
  payloadKeys: string[];
  inventory: string[];
  fix: ReturnType<typeof parseFix>;
}): string[] {
  const out: string[] = [];
  const { payloadKeys, inventory, fix } = input;
  const client = new Set<string>(CLIENT_COLUMNS);
  const server = new Set(Object.keys(SERVER_OWNED));
  for (const c of inventory) if (!client.has(c) && !server.has(c)) out.push(`unclassified bookings column: ${c}`);
  for (const c of [...client, ...server]) if (!inventory.includes(c)) out.push(`classified column no migration defines: ${c}`);
  for (const k of payloadKeys) if (!client.has(k)) out.push(`app insert sends a non-client column: ${k}`);
  for (const c of client) if (!payloadKeys.includes(c)) out.push(`client column the app no longer sends: ${c}`);
  if (!fix.granted) out.push('0063 must contain exactly one grant: INSERT (columns) on table public.bookings to authenticated');
  else {
    for (const c of fix.granted) if (!client.has(c)) out.push(`0063 grants INSERT on a non-client column: ${c}`);
    for (const c of client) if (!fix.granted.includes(c)) out.push(`0063 does not grant client column: ${c}`);
  }
  if (!fix.revokes.includes('revoke insert on table public.bookings from public, anon, authenticated')) {
    out.push('0063 must revoke table-wide INSERT on public.bookings from public, anon and authenticated');
  }
  if (!fix.conjuncts) out.push('0063 must re-create bookings_insert_own as FOR INSERT WITH CHECK (...)');
  else if ([...fix.conjuncts].sort().join(' | ') !== [...POLICY_CONJUNCTS].sort().join(' | ')) {
    out.push(`bookings_insert_own conjuncts differ: ${fix.conjuncts.join(' | ')}`);
  }
  if ([...fix.selfCheckColumns].sort().join(',') !== [...client].sort().join(',')) {
    out.push('the 0063 self-check lists different client columns than the grant');
  }
  return out;
}

// ── The app's real insert payload ────────────────────────────────────────────────────────────────────────────

/** The row object createBooking hands to supabase.from('bookings').insert(...). */
const mockCapture: { row: Record<string, unknown> | null } = { row: null };
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'c1000000-0000-4000-8000-000000000001' } } }) },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        mockCapture.row = row;
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'b1' }, error: null }) }) };
      },
    }),
  },
}));

async function payloadKeysFor(input: Parameters<typeof createBooking>[0]): Promise<string[]> {
  mockCapture.row = null;
  const res = await createBooking(input);
  expect(res.ok).toBe(true);
  const row: Record<string, unknown> | null = mockCapture.row;
  if (!row) throw new Error('createBooking did not call insert');
  return Object.keys(row).sort();
}

describe('0063 (H1) - booking insert authority', () => {
  let migrations: Migration[];
  let fix: ReturnType<typeof parseFix>;
  let inventory: string[];
  let minimalKeys: string[];
  let fullKeys: string[];

  beforeAll(async () => {
    migrations = readMigrations();
    const fixFile = migrations.find((m) => m.file === FIX);
    if (!fixFile) throw new Error(`${FIX} is missing`);
    fix = parseFix(fixFile.sql);
    inventory = bookingsColumns(migrations);
    minimalKeys = await payloadKeysFor({ serviceId: 'house-cleaning', address: 'Synthetic Street 1', scheduledFor: '2030-01-01T09:00:00Z' });
    fullKeys = await payloadKeysFor({
      serviceId: 'house-cleaning',
      address: 'Synthetic Street 1',
      scheduledFor: '2030-01-01T09:00:00Z',
      notes: 'synthetic',
      address_label: 'Home',
      latitude: -1.29,
      longitude: 36.82,
      building_name: 'Synthetic Towers',
      floor: '7',
      door_number: '7B',
      landmark: 'Synthetic mall',
      access_notes: 'Ring twice',
      scheduling_type: 'date',
      time_window: 'morning',
      window_start: '2030-01-01T08:00:00Z',
      window_end: '2030-01-01T12:00:00Z',
      recurrence: 'one_time',
      idempotencyKey: 'd1000000-0000-4000-8000-000000000001',
      service_details: null,
    });
  });

  it('0063 is the only migration with that number', () => {
    expect(migrations.filter((m) => m.file.startsWith('0063_')).map((m) => m.file)).toEqual([FIX]);
  });

  it('the app createBooking sends exactly the client columns, whether optional fields are filled or not', () => {
    expect(minimalKeys).toEqual([...CLIENT_COLUMNS].sort());
    expect(fullKeys).toEqual([...CLIENT_COLUMNS].sort());
  });

  it('every bookings column defined by any migration is classified exactly once (30 today)', () => {
    expect(inventory).toEqual([...CLIENT_COLUMNS, ...Object.keys(SERVER_OWNED)].sort());
    expect(inventory).toHaveLength(30);
    for (const c of CLIENT_COLUMNS) expect(SERVER_OWNED[c]).toBeUndefined();
  });

  it('0063 revokes table-wide INSERT from PUBLIC, anon and authenticated', () => {
    expect(fix.revokes).toEqual(['revoke insert on table public.bookings from public, anon, authenticated']);
  });

  it('0063 grants INSERT to authenticated on exactly the client columns, and grants nothing else', () => {
    expect(fix.grants).toHaveLength(1);
    expect([...(fix.granted ?? [])].sort()).toEqual([...CLIENT_COLUMNS].sort());
    for (const c of Object.keys(SERVER_OWNED)) expect(fix.granted).not.toContain(c);
  });

  it('bookings_insert_own keeps the owner check and pins every server-owned starting value', () => {
    expect([...(fix.conjuncts ?? [])].sort()).toEqual([...POLICY_CONJUNCTS].sort());
    expect(fix.statements).toContain('drop policy if exists "bookings_insert_own" on public.bookings');
  });

  it('0063 changes only bookings INSERT authority and the two profile UPDATE policies (no function, table, trigger or data change)', () => {
    const allowed = [
      /^revoke insert on table public\.bookings from public, anon, authenticated$/,
      /^grant insert \(.*\) on table public\.bookings to authenticated$/,
      /^drop policy if exists "bookings_insert_own" on public\.bookings$/,
      /^create policy "bookings_insert_own" on public\.bookings for insert with check \(/,
      /^do \$\$ declare client_columns constant text\[\]/,
      /^drop policy if exists "profiles_update_(admin|own)" on public\.profiles$/,
      /^create policy "profiles_update_(admin|own)" on public\.profiles for update using \(/,
    ];
    for (const st of fix.statements) {
      expect({ statement: st.slice(0, 90), allowed: allowed.some((re) => re.test(st)) }).toEqual({ statement: st.slice(0, 90), allowed: true });
    }
    expect(fix.statements).toHaveLength(9);
  });

  it('the self-check block names the same client columns as the grant', () => {
    expect([...fix.selfCheckColumns].sort()).toEqual([...CLIENT_COLUMNS].sort());
  });

  it('all of the above, as one invariant check, reports no violation', () => {
    expect(h1Violations({ payloadKeys: fullKeys, inventory, fix })).toEqual([]);
  });

  it('no later migration gives INSERT back, adds another insert policy, or changes bookings_insert_own', () => {
    expect(laterMigrationViolations(migrations)).toEqual([]);
  });

  describe('negative controls (the checks above can fail)', () => {
    const later = (sql: string): Migration[] => [{ file: '0999_control.sql', sql }];
    /** 0063 with ONE real statement rewritten (comments dropped), so a mutation can never land in a comment. */
    const mutated = (pick: RegExp, change: (statement: string) => string): ReturnType<typeof parseFix> => {
      const text = fs.readFileSync(path.join(MIGRATIONS, FIX), 'utf-8');
      const statements = splitSqlStatements(text);
      const hits = statements.filter((st) => pick.test(st));
      expect(hits).toHaveLength(1);
      return parseFix(statements.map((st) => (pick.test(st) ? change(st) : st)).join(';\n') + ';');
    };

    it('the mutation helper reproduces the real parse when it changes nothing', () => {
      expect(mutated(/^grant insert/i, (st) => st)).toEqual(fix);
    });

    it('flags a grant that includes a server-owned column', () => {
      const bad = mutated(/^grant insert/i, (st) => st.replace('customer_id,', 'customer_id, status,'));
      expect(bad.granted).toContain('status');
      expect(h1Violations({ payloadKeys: fullKeys, inventory, fix: bad })).toContain('0063 grants INSERT on a non-client column: status');
    });

    it('flags an app payload that starts sending a server-owned column', () => {
      expect(h1Violations({ payloadKeys: [...fullKeys, 'status'], inventory, fix })).toContain(
        'app insert sends a non-client column: status',
      );
    });

    it('flags a new bookings column that nobody classified', () => {
      const grown = bookingsColumns([...migrations, { file: '0999_control.sql', sql: 'alter table public.bookings add column if not exists risk_score int;' }]);
      expect(h1Violations({ payloadKeys: fullKeys, inventory: grown, fix })).toContain('unclassified bookings column: risk_score');
    });

    it('flags a policy that lost a pin or gained an OR', () => {
      const lost = mutated(/^create policy "bookings_insert_own"/i, (st) => st.replace(/\s+and status = 'pending'/, ''));
      expect(lost.conjuncts).not.toContain("status = 'pending'");
      expect(h1Violations({ payloadKeys: fullKeys, inventory, fix: lost }).some((v) => v.startsWith('bookings_insert_own conjuncts differ'))).toBe(true);
      const widened = mutated(/^create policy "bookings_insert_own"/i, (st) => st.replace('auth.uid() = customer_id', 'auth.uid() = customer_id or true'));
      expect(h1Violations({ payloadKeys: fullKeys, inventory, fix: widened }).some((v) => v.startsWith('bookings_insert_own conjuncts differ'))).toBe(true);
    });

    it('flags a missing table-wide revoke', () => {
      const noRevoke = mutated(/^revoke insert/i, () => 'select 1');
      expect(h1Violations({ payloadKeys: fullKeys, inventory, fix: noRevoke })).toContain(
        '0063 must revoke table-wide INSERT on public.bookings from public, anon and authenticated',
      );
    });

    it('flags later migrations that re-open the insert path', () => {
      expect(laterMigrationViolations(later('grant insert (status) on table public.bookings to authenticated;'))).toHaveLength(1);
      expect(laterMigrationViolations(later('grant all on public.bookings to anon;'))).toHaveLength(1);
      expect(laterMigrationViolations(later('grant insert, update on all tables in schema public to authenticated;'))).toHaveLength(1);
      expect(laterMigrationViolations(later('create policy "x" on public.bookings for insert with check (true);'))).toHaveLength(1);
      expect(laterMigrationViolations(later('create policy "x" on public.bookings using (true);'))).toHaveLength(1);
      expect(laterMigrationViolations(later('drop policy if exists "bookings_insert_own" on public.bookings;'))).toHaveLength(1);
      expect(laterMigrationViolations(later('alter table public.bookings disable row level security;'))).toHaveLength(1);
    });

    it('does not flag harmless later statements, or mere mentions inside comments', () => {
      expect(
        laterMigrationViolations(
          later(
            [
              '-- grant insert (status) on table public.bookings to authenticated;',
              'grant select on public.bookings to authenticated;',
              'create policy "y" on public.bookings for select using (true);',
              'create policy "z" on public.bookings as restrictive for all to authenticated using (true);',
              'grant insert (status) on table public.bookings to service_role;',
            ].join('\n'),
          ),
        ),
      ).toEqual([]);
    });
  });
});
