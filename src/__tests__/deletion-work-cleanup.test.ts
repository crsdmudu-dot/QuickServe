/**
 * deletion-work-cleanup.test.ts — offline regressions for the certification teardown logic
 * (revision-3 review, finding 1). The module under test is the exact-fixture cleanup used by
 * `qa/playwright/certification/deletion-work.spec.ts`; here it runs against an in-memory service
 * API that records every request, so we can prove:
 *   a) an unrelated notification created during the same time window SURVIVES;
 *   b) a failed cleanup request FAILS the teardown (collected, not swallowed);
 *   c) a Storage 500/403, or a non-boolean answer, is NEVER accepted as proof an object is gone;
 *   d) reads and counts throw on failed or malformed responses instead of returning "empty".
 */
import {
  ServiceApi,
  cleanupRun,
  providerPendingDedupKeys,
  verifyRestoration,
  type HttpClient,
  type HttpResponse,
  type RunFixtures,
} from '../../qa/playwright/support/connected/deletion-work-cleanup';

type Table = Record<string, unknown>[];

class FakeService implements HttpClient {
  tables: Record<string, Table> = {
    notifications: [], deletion_photo_intents: [], legal_hold_items: [], legal_holds: [], support_cases: [],
    support_case_events: [], support_case_notes: [], provider_earnings: [], provider_payouts: [], payments: [],
    bookings: [], booking_photos: [], account_flags: [], favorite_providers: [], account_deletions: [],
    account_deletion_attempts: [], wallets: [], profiles: [],
  };
  objects = new Set<string>();
  authUsers = new Set<string>();
  log: string[] = [];
  /** Injected faults: path substring → status */
  faults: { match: string; status: number; body?: string }[] = [];
  objectExistsAnswer: ((path: string) => unknown) | null = null;

  private respond(status: number, body: unknown = null, headers: Record<string, string> = {}): HttpResponse {
    return { status, headers, text: body === null ? '' : typeof body === 'string' ? body : JSON.stringify(body) };
  }

  /** Minimal PostgREST filter support: col=eq.v, col=in.(a,b), col=is.null, or=(a.eq.x,b.eq.y), dedup_key=in.("k1","k2") */
  private matches(row: Record<string, unknown>, filters: string[]): boolean {
    return filters.every((f) => {
      if (f.startsWith('or=(')) {
        return f.slice(4, -1).split(',').some((clause) => { const [col, , v] = clause.split('.'); return String(row[col]) === v; });
      }
      const [col, expr] = f.split('=');
      if (col === 'select') return true;
      if (expr.startsWith('eq.')) return String(row[col]) === decodeURIComponent(expr.slice(3));
      if (expr.startsWith('neq.')) return String(row[col]) !== expr.slice(4);
      if (expr === 'is.null') return row[col] === null || row[col] === undefined;
      if (expr.startsWith('in.')) {
        const list = decodeURIComponent(expr.slice(4, -1)).split(',').map((s) => s.replace(/^"|"$/g, ''));
        return list.includes(String(row[col]));
      }
      if (expr.startsWith('gt.')) return String(row[col]) > decodeURIComponent(expr.slice(3));
      return true;
    });
  }

  async request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<HttpResponse> {
    this.log.push(`${method} ${path}`);
    const fault = this.faults.find((f) => path.includes(f.match));
    if (fault) return this.respond(fault.status, fault.body ?? { message: 'injected' });
    if (path.startsWith('/rest/v1/rpc/deletion_object_exists')) {
      const p = (body as { p_name: string }).p_name;
      return this.respond(200, this.objectExistsAnswer ? this.objectExistsAnswer(p) : this.objects.has(p));
    }
    if (path.startsWith('/rest/v1/rpc/deletion_work_health')) return this.respond(200, { bucket_objects: this.objects.size, retired_paths: this.tables.deletion_photo_intents.length, active_holds: this.tables.legal_holds.length });
    if (path.startsWith('/storage/v1/object/booking-photos')) {
      for (const p of (body as { prefixes: string[] }).prefixes) this.objects.delete(p);
      return this.respond(200, []);
    }
    if (path.startsWith('/auth/v1/admin/users/')) {
      const id = path.split('/').pop() as string;
      if (method === 'GET') return this.respond(this.authUsers.has(id) ? 200 : 404, this.authUsers.has(id) ? { id } : { message: 'not found' });
      if (this.authUsers.delete(id)) return this.respond(200, {});
      return this.respond(404, { message: 'not found' });
    }
    const m = path.match(/^\/rest\/v1\/([a-z_]+)\?(.*)$/);
    if (!m) return this.respond(404);
    const [, table, qs] = m;
    const rows = this.tables[table] ?? [];
    const filters = qs.split('&').filter((f) => !f.startsWith('select='));
    const hit = rows.filter((r) => this.matches(r, filters));
    if (method === 'GET') {
      const isCount = /(^|&)select=[a-z_]+(&|$)/.test(qs);
      return this.respond(200, hit, isCount ? { 'content-range': `0-0/${hit.length}` } : {});
    }
    if (method === 'DELETE') {
      this.tables[table] = rows.filter((r) => !hit.includes(r));
      return this.respond(200, hit);
    }
    return this.respond(405);
  }
}

const ADMINS = ['admin-1', 'admin-2'];

function seedRun(svc: FakeService): RunFixtures {
  const f: RunFixtures = { userIds: ['user-A', 'user-B'], bookingIds: ['booking-1'], objectPaths: ['booking-1/a.png', 'booking-1/b.png'], caseIds: ['case-1'], holdIds: ['hold-legal'], adminRecipientIds: ADMINS };
  svc.authUsers.add('user-A'); svc.authUsers.add('user-B');
  svc.tables.profiles.push({ id: 'user-A' }, { id: 'user-B' });
  svc.tables.bookings.push({ id: 'booking-1' });
  svc.tables.payments.push({ id: 'pay-1', booking_id: 'booking-1' });
  svc.tables.provider_earnings.push({ id: 'earn-1', booking_id: 'booking-1' });
  svc.tables.deletion_photo_intents.push({ id: 'intent-1', user_id: 'user-A' });
  svc.tables.legal_hold_items.push({ id: 'item-1', intent_id: 'intent-1', hold_id: 'hold-legal' });
  svc.tables.legal_holds.push({ id: 'hold-legal', booking_id: 'booking-1', case_id: null }, { id: 'hold-case', booking_id: 'booking-1', case_id: 'case-1' });
  svc.tables.support_cases.push({ id: 'case-1' });
  svc.tables.account_deletions.push({ id: 'del-1', user_id: 'user-A' });
  svc.tables.account_deletion_attempts.push({ user_id: 'user-A' });
  svc.tables.booking_photos.push({ id: 'photo-1', photo_url: 'booking-1/a.png' });
  svc.objects.add('booking-1/b.png');
  // Notifications: owned by the run (user, booking, dedup key) and UNRELATED (same window, same types).
  svc.tables.notifications.push(
    { id: 'n-user', user_id: 'user-A', booking_id: null, type: 'booking_update', dedup_key: null, created_at: '2026-09-23T10:00:05Z' },
    { id: 'n-booking', user_id: 'other-user', booking_id: 'booking-1', type: 'booking_update', dedup_key: null, created_at: '2026-09-23T10:00:06Z' },
    { id: 'n-pending', user_id: 'admin-1', booking_id: null, type: 'admin_provider_pending', dedup_key: providerPendingDedupKeys('user-B', ADMINS)[0], created_at: '2026-09-23T10:00:07Z' },
    { id: 'n-unrelated-pending', user_id: 'admin-1', booking_id: null, type: 'admin_provider_pending', dedup_key: providerPendingDedupKeys('someone-else', ADMINS)[0], created_at: '2026-09-23T10:00:08Z' },
    { id: 'n-unrelated-discrepancy', user_id: 'admin-2', booking_id: null, type: 'admin_attempt_discrepancy', dedup_key: 'x', created_at: '2026-09-23T10:00:09Z' },
  );
  return f;
}

describe('exact-run cleanup (finding 1)', () => {
  it('a) removes only rows owned by the run; unrelated notifications in the same window and of the same types survive', async () => {
    const svc = new FakeService();
    const f = seedRun(svc);
    const report = await cleanupRun(new ServiceApi(svc), f);
    expect(report.failures).toEqual([]);
    const left = svc.tables.notifications.map((n) => n.id).sort();
    expect(left).toEqual(['n-unrelated-discrepancy', 'n-unrelated-pending']);
    expect(svc.tables.deletion_photo_intents).toEqual([]);
    expect(svc.tables.legal_hold_items).toEqual([]);
    expect(svc.tables.legal_holds).toEqual([]);
    expect(svc.tables.support_cases).toEqual([]);
    expect(svc.tables.bookings).toEqual([]);
    expect(svc.tables.profiles).toEqual([]);
    expect(svc.authUsers.size).toBe(0);
    expect(svc.objects.size).toBe(0);
    // No request ever filtered by a time window or bare type.
    expect(svc.log.some((l) => /created_at=gt\./.test(l))).toBe(false);
    expect(svc.log.some((l) => /notifications\?type=in\./.test(l))).toBe(false);
  });

  it('b) a failed cleanup request is collected as a failure and independent steps still run', async () => {
    const svc = new FakeService();
    const f = seedRun(svc);
    svc.faults.push({ match: '/rest/v1/account_flags', status: 500 });
    const report = await cleanupRun(new ServiceApi(svc), f);
    expect(report.failures).toEqual(expect.arrayContaining([expect.stringMatching(/user_rows: DELETE \/rest\/v1\/account_flags HTTP 500/)]));
    // Independent steps proceeded: objects and bookings were still cleaned.
    expect(svc.objects.size).toBe(0);
    expect(svc.tables.bookings).toEqual([]);
    // The failing step stopped before the profile delete of that user (ordering is preserved), so
    // the identity is reported by restoration rather than silently lost.
    expect(report.failures.length).toBeGreaterThan(0);
  });

  it('c) a Storage 500/403 or a non-boolean existence answer is never accepted as proof of absence', async () => {
    const svc = new FakeService();
    const f = seedRun(svc);
    svc.faults.push({ match: '/storage/v1/object/booking-photos', status: 500 });
    let report = await cleanupRun(new ServiceApi(svc), f);
    expect(report.failures).toEqual(expect.arrayContaining([expect.stringMatching(/objects: storage remove booking-1\/b\.png HTTP 500/)]));
    expect(svc.objects.has('booking-1/b.png')).toBe(true);

    const svc2 = new FakeService();
    const f2 = seedRun(svc2);
    svc2.faults.push({ match: '/storage/v1/object/booking-photos', status: 403 });
    report = await cleanupRun(new ServiceApi(svc2), f2);
    expect(report.failures.some((x) => /HTTP 403/.test(x))).toBe(true);

    const svc3 = new FakeService();
    const f3 = seedRun(svc3);
    svc3.objectExistsAnswer = () => ({ maybe: true }); // a JSON answer that is not a boolean
    report = await cleanupRun(new ServiceApi(svc3), f3);
    expect(report.failures.some((x) => /non-boolean answer/.test(x))).toBe(true);

    const svc4 = new FakeService();
    const f4 = seedRun(svc4);
    svc4.objectExistsAnswer = () => true; // remove "succeeded" but the row is still there
    report = await cleanupRun(new ServiceApi(svc4), f4);
    expect(report.failures.some((x) => /object still present after remove/.test(x))).toBe(true);
  });

  it('REGRESSION (QA run 1): counting a table keyed by user_id selects that column, never a non-existent id', async () => {
    const svc = new FakeService();
    const api = new ServiceApi(svc);
    svc.tables.account_deletion_attempts.push({ user_id: 'u1' }, { user_id: 'u2' });
    await expect(api.count('account_deletion_attempts', '', 'user_id')).resolves.toBe(2);
    expect(svc.log.pop()).toContain('/rest/v1/account_deletion_attempts?select=user_id');
  });

  it('d) reads and counts throw on failed or malformed responses instead of yielding an empty result', async () => {
    const svc = new FakeService();
    const api = new ServiceApi(svc);
    svc.faults.push({ match: '/rest/v1/profiles', status: 500 });
    await expect(api.count('profiles')).rejects.toThrow(/HTTP 500/);
    await expect(api.getRows('/rest/v1/profiles?select=id')).rejects.toThrow(/HTTP 500/);
    svc.faults = [{ match: '/rest/v1/bookings', status: 200, body: 'not json' }];
    await expect(api.getRows('/rest/v1/bookings?select=id')).rejects.toThrow(/malformed JSON/);
    svc.faults = [{ match: '/rest/v1/payments', status: 200, body: '{"not":"an array"}' }];
    await expect(api.getRows('/rest/v1/payments?select=id')).rejects.toThrow(/expected an array/);
    await expect(api.count('payments')).rejects.toThrow(/content-range/);
    await expect(api.authUserExists('u')).resolves.toBe(false);
    svc.faults = [{ match: '/auth/v1/admin/users/u', status: 503 }];
    await expect(api.authUserExists('u')).rejects.toThrow(/HTTP 503/);
  });

  it('restoration reports every category that is not back to baseline, by exact id', async () => {
    const svc = new FakeService();
    const f = seedRun(svc);
    const api = new ServiceApi(svc);
    const totals = async () => ({ profiles: await api.count('profiles'), bookings: await api.count('bookings') });
    const baseline = { totals: { profiles: 0, bookings: 0 }, health: { bucket_objects: 0, retired_paths: 0, active_holds: 0 } };
    const before = await verifyRestoration(api, f, baseline, totals);
    expect(before).toEqual(expect.arrayContaining([
      expect.stringMatching(/^deletion_photo_intents: 1/), expect.stringMatching(/^account_deletions: 1/), expect.stringMatching(/^profiles: 2/),
      expect.stringMatching(/^notifications: 1 provider-pending row\(s\) for user-B/), expect.stringMatching(/^auth identity still exists: user-A/),
      expect.stringMatching(/^bookings: 1/), expect.stringMatching(/^support case remains: case-1/), expect.stringMatching(/^legal hold remains: hold-legal/),
      expect.stringMatching(/^object remains: booking-1\/b\.png/), expect.stringMatching(/^totals\.profiles/), expect.stringMatching(/^health\.bucket_objects/),
    ]));
    await cleanupRun(api, f);
    expect(await verifyRestoration(api, f, baseline, totals)).toEqual([]);
  });
});
