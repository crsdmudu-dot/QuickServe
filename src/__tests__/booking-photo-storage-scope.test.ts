/**
 * booking-photo-storage-scope.test.ts — the EFFECTIVE read scope of booking photo objects.
 *
 * WHY ORDER MATTERS. A review of the account-deletion work reported that any authenticated user
 * could read any object in the `booking-photos` bucket. That was wrong: it read `0006` in
 * isolation, where the policy is indeed `using (bucket_id = 'booking-photos')`, and missed that
 * `0016_tighten_booking_photos_storage.sql` drops and replaces it with a participant-scoped one.
 * The finding was withdrawn.
 *
 * Asserting that `0016` contains restrictive wording would repeat the same mistake in reverse: it
 * would keep passing if a later migration dropped or re-broadened the policy. So this file REPLAYS
 * every migration in version order, tracks create and drop statements for each policy, and asserts
 * on whatever definition is left standing at the end.
 *
 * Text-level, like the other migration guards here: it proves what the migration set says, not what
 * a live database enforces. The connected certification covers the latter.
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');

/** Migration files in applied order. `archive/` is excluded: the CLI globs flat, so it never runs. */
function migrationsInOrder(): { version: string; name: string; sql: string }[] {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({
      version: name.slice(0, 4),
      name,
      sql: fs.readFileSync(path.join(MIGRATIONS, name), 'utf-8'),
    }));
}

/**
 * Replays create/drop for one policy across every migration and returns the definition that
 * survives, plus the file that established it. Returns null if the policy ends up dropped.
 */
function effectivePolicy(
  policy: string,
  table: string,
): { sql: string; definedIn: string } | null {
  const createRe = new RegExp(
    `create\\s+policy\\s+"${policy}"\\s+on\\s+${table.replace('.', '\\.')}([\\s\\S]*?);`,
    'gi',
  );
  const dropRe = new RegExp(
    `drop\\s+policy\\s+(?:if\\s+exists\\s+)?"${policy}"\\s+on\\s+${table.replace('.', '\\.')}\\s*;`,
    'gi',
  );

  let current: { sql: string; definedIn: string } | null = null;

  for (const migration of migrationsInOrder()) {
    // Walk the file in statement order so a drop-then-create in one file resolves correctly.
    const events: { at: number; kind: 'create' | 'drop'; sql?: string }[] = [];
    for (const m of migration.sql.matchAll(createRe)) {
      events.push({ at: m.index ?? 0, kind: 'create', sql: m[0] });
    }
    for (const m of migration.sql.matchAll(dropRe)) {
      events.push({ at: m.index ?? 0, kind: 'drop' });
    }
    events.sort((a, b) => a.at - b.at);

    for (const event of events) {
      current =
        event.kind === 'drop' ? null : { sql: event.sql as string, definedIn: migration.name };
    }
  }

  return current;
}

describe('booking photo OBJECT reads are scoped to the booking, whatever the migration order', () => {
  const effective = effectivePolicy('booking_photos_obj_select', 'storage.objects');

  it('leaves a select policy standing', () => {
    expect(effective).not.toBeNull();
  });

  it('is established by the tightening migration, not the original', () => {
    expect(effective?.definedIn).toBe('0016_tighten_booking_photos_storage.sql');
  });

  it('restricts reads to the booking customer, its assigned provider, or an admin', () => {
    const sql = effective?.sql ?? '';
    expect(sql).toMatch(/b\.customer_id\s*=\s*auth\.uid\(\)/);
    expect(sql).toMatch(/b\.assigned_provider_id\s*=\s*auth\.uid\(\)/);
    expect(sql).toMatch(/public\.is_admin\(\)/);
  });

  it('correlates the object to a booking rather than trusting the bucket alone', () => {
    const sql = effective?.sql ?? '';
    expect(sql).toMatch(/from\s+public\.booking_photos/i);
    expect(sql).toMatch(/join\s+public\.bookings/i);
    expect(sql).toMatch(/bp\.photo_url\s*=\s*storage\.objects\.name/);
  });

  it('is not the bucket-only form that an earlier review mistook for the current policy', () => {
    const sql = (effective?.sql ?? '').replace(/\s+/g, ' ');
    // The superseded 0006 form: a using clause whose only condition is the bucket.
    expect(sql).not.toMatch(/using\s*\(\s*bucket_id\s*=\s*'booking-photos'\s*\)/i);
  });
});

describe('booking photo METADATA reads stay scoped to the same parties', () => {
  const effective = effectivePolicy('booking_photos_select', 'public.booking_photos');

  it('leaves a select policy standing', () => {
    expect(effective).not.toBeNull();
  });

  it('restricts reads to the booking customer, its assigned provider, or an admin', () => {
    const sql = effective?.sql ?? '';
    expect(sql).toMatch(/b\.customer_id\s*=\s*auth\.uid\(\)/);
    expect(sql).toMatch(/b\.assigned_provider_id\s*=\s*auth\.uid\(\)/);
    expect(sql).toMatch(/public\.is_admin\(\)/);
  });
});

describe('object deletion stays admin-only', () => {
  const effective = effectivePolicy('booking_photos_obj_delete', 'storage.objects');

  it('requires is_admin()', () => {
    expect(effective).not.toBeNull();
    expect(effective?.sql ?? '').toMatch(/public\.is_admin\(\)/);
  });
});

describe('the replay itself is trustworthy', () => {
  it('reads more than one migration', () => {
    expect(migrationsInOrder().length).toBeGreaterThan(40);
  });

  it('sees the superseded 0006 definition before the replay resolves it', () => {
    const original = migrationsInOrder().find((m) => m.version === '0006');
    expect(original?.sql ?? '').toMatch(/using\s*\(\s*bucket_id\s*=\s*'booking-photos'\s*\)/i);
  });

  it('honours a later drop, so a re-broadening migration could not pass unnoticed', () => {
    // Proves the replay is order-sensitive rather than a search for favourable wording.
    const tightening = migrationsInOrder().find((m) => m.version === '0016');
    expect(tightening?.sql ?? '').toMatch(
      /drop\s+policy\s+if\s+exists\s+"booking_photos_obj_select"\s+on\s+storage\.objects/i,
    );
  });
});
