/**
 * deletion-work-cleanup.ts — exact-fixture teardown and authoritative checks for the Phase B1
 * deletion-work certification. Dependency-free (no Playwright import) so the decision logic is
 * exercised offline in Jest against a recording fake, and the connected suite wires it to the
 * real QA service-role API.
 *
 * Rules this module enforces:
 *   * Only rows whose ownership by THIS run is proven are removed: by exact user id, exact
 *     booking id, exact object path, exact hold/case/intent id, or an exact dedup key composed
 *     from a run subject id. Never by type, time window or name prefix.
 *   * Every HTTP response is validated. A failed request is collected as an actionable failure;
 *     independent steps continue; the caller fails the run if any failure was collected.
 *   * Reads and counts throw on non-2xx or malformed responses; they never become "0" or "[]".
 *   * Object absence is established ONLY by the service-only database read
 *     `deletion_object_exists(bucket, name)`. A Storage HTTP status is never proof of absence.
 */

export type HttpResponse = { status: number; headers: Record<string, string>; text: string };

export type HttpClient = {
  /** Service-role request against the QA project. `path` is relative to the project URL. */
  request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResponse>;
};

export type RunFixtures = {
  userIds: string[];
  bookingIds: string[];
  objectPaths: string[];         // bucket-relative paths this run created (by any actor)
  caseIds: string[];
  holdIds: string[];             // legal holds this run placed directly
  adminRecipientIds: string[];   // approved admins at the time the run's providers signed up
};

export type CleanupReport = {
  failures: string[];
  removed: Record<string, number>;
  /** paths whose absence could not be established (never treated as gone) */
  unresolvedObjects: string[];
};

export const BUCKET = 'booking-photos';
export const PROVIDER_PENDING_TYPE = 'admin_provider_pending';

function inList(ids: string[]): string {
  return `in.(${ids.join(',')})`;
}

/** Every stored dedup_key for one provider fixture (0020 fan-out): base ':' recipient. */
export function providerPendingDedupKeys(profileId: string, adminIds: string[]): string[] {
  return adminIds.map((adminId) => `${profileId}:${PROVIDER_PENDING_TYPE}:${adminId}`);
}

export class ServiceApi {
  constructor(private readonly http: HttpClient) {}

  private static parseJson(r: HttpResponse, what: string): unknown {
    try { return r.text ? JSON.parse(r.text) : null; } catch { throw new Error(`${what}: malformed JSON (HTTP ${r.status})`); }
  }

  async getRows<T = Record<string, unknown>>(path: string): Promise<T[]> {
    const r = await this.http.request('GET', path);
    if (r.status < 200 || r.status >= 300) throw new Error(`GET ${path.split('?')[0]} HTTP ${r.status}`);
    const body = ServiceApi.parseJson(r, `GET ${path.split('?')[0]}`);
    if (!Array.isArray(body)) throw new Error(`GET ${path.split('?')[0]}: expected an array`);
    return body as T[];
  }

  /** `keyCol` must be a real column of the table: `account_deletion_attempts` is keyed by `user_id` and has no `id`. */
  async count(table: string, filter = '', keyCol = 'id'): Promise<number> {
    const r = await this.http.request('GET', `/rest/v1/${table}?select=${keyCol}${filter}`, undefined, { Prefer: 'count=exact', Range: '0-0' });
    if (r.status < 200 || r.status >= 300) throw new Error(`count ${table} HTTP ${r.status}`);
    const cr = r.headers['content-range'] ?? r.headers['Content-Range'] ?? '';
    const total = Number(cr.split('/')[1]);
    if (!cr || !Number.isFinite(total)) throw new Error(`count ${table}: missing or malformed content-range "${cr}"`);
    return total;
  }

  async rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
    const r = await this.http.request('POST', `/rest/v1/rpc/${fn}`, args);
    if (r.status < 200 || r.status >= 300) throw new Error(`rpc ${fn} HTTP ${r.status}`);
    return ServiceApi.parseJson(r, `rpc ${fn}`) as T;
  }

  /** DELETE with representation: returns the number of rows removed; throws on any failure. */
  async deleteRows(path: string): Promise<number> {
    const r = await this.http.request('DELETE', path, undefined, { Prefer: 'return=representation' });
    if (r.status < 200 || r.status >= 300) throw new Error(`DELETE ${path.split('?')[0]} HTTP ${r.status}`);
    const body = ServiceApi.parseJson(r, `DELETE ${path.split('?')[0]}`);
    if (!Array.isArray(body)) throw new Error(`DELETE ${path.split('?')[0]}: expected a representation array`);
    return body.length;
  }

  /** Storage remove by exact path. Success of the CALL only; absence is checked separately. */
  async removeObject(path: string): Promise<void> {
    const r = await this.http.request('DELETE', `/storage/v1/object/${BUCKET}`, { prefixes: [path] });
    if (r.status < 200 || r.status >= 300) throw new Error(`storage remove ${path} HTTP ${r.status}`);
  }

  /** Authoritative: the database row for the object. Throws if the read itself fails. */
  async objectExists(path: string): Promise<boolean> {
    const v = await this.rpc<unknown>('deletion_object_exists', { p_bucket: BUCKET, p_name: path });
    if (typeof v !== 'boolean') throw new Error(`deletion_object_exists(${path}): non-boolean answer`);
    return v;
  }

  async authUserExists(userId: string): Promise<boolean> {
    const r = await this.http.request('GET', `/auth/v1/admin/users/${userId}`);
    if (r.status === 200) return true;
    if (r.status === 404) return false;
    throw new Error(`auth admin GET ${userId} HTTP ${r.status}`);
  }

  async deleteAuthUser(userId: string): Promise<void> {
    const r = await this.http.request('DELETE', `/auth/v1/admin/users/${userId}`);
    if (r.status === 404) return; // already gone (the function or the worker removed it)
    if (r.status < 200 || r.status >= 300) throw new Error(`auth admin DELETE ${userId} HTTP ${r.status}`);
  }
}

/**
 * Removes every row this run owns, in dependency order, collecting failures. Never sweeps by
 * type, time or prefix. Returns the report; the caller decides to fail the run.
 */
export async function cleanupRun(api: ServiceApi, f: RunFixtures): Promise<CleanupReport> {
  const report: CleanupReport = { failures: [], removed: {}, unresolvedObjects: [] };
  const step = async (name: string, fn: () => Promise<number | void>) => {
    try { const n = await fn(); if (typeof n === 'number') report.removed[name] = (report.removed[name] ?? 0) + n; }
    catch (err) { report.failures.push(`${name}: ${(err as Error).message}`); }
  };
  const users = f.userIds;
  const bookings = f.bookingIds;

  // 1. Worker-created rows, by exact ownership.
  if (users.length) {
    await step('hold_items+intents', async () => {
      const intents = await api.getRows<{ id: string }>(`/rest/v1/deletion_photo_intents?user_id=${inList(users)}&select=id`);
      let n = 0;
      if (intents.length) {
        n += await api.deleteRows(`/rest/v1/legal_hold_items?intent_id=${inList(intents.map((i) => i.id))}`);
        n += await api.deleteRows(`/rest/v1/deletion_photo_intents?id=${inList(intents.map((i) => i.id))}`);
      }
      return n;
    });
  }
  for (const c of f.caseIds) {
    await step('case_holds', async () => {
      const holds = await api.getRows<{ id: string }>(`/rest/v1/legal_holds?case_id=eq.${c}&select=id`);
      let n = 0;
      for (const h of holds) n += await api.deleteRows(`/rest/v1/legal_hold_items?hold_id=eq.${h.id}`);
      n += await api.deleteRows(`/rest/v1/legal_holds?case_id=eq.${c}`);
      return n;
    });
    await step('cases', async () => {
      let n = 0;
      n += await api.deleteRows(`/rest/v1/support_case_events?case_id=eq.${c}`);
      n += await api.deleteRows(`/rest/v1/support_case_notes?case_id=eq.${c}`);
      n += await api.deleteRows(`/rest/v1/support_cases?id=eq.${c}`);
      return n;
    });
  }
  for (const h of f.holdIds) {
    await step('legal_holds', async () => (await api.deleteRows(`/rest/v1/legal_hold_items?hold_id=eq.${h}`)) + (await api.deleteRows(`/rest/v1/legal_holds?id=eq.${h}`)));
  }
  if (bookings.length) {
    await step('booking_holds', async () => {
      const holds = await api.getRows<{ id: string }>(`/rest/v1/legal_holds?booking_id=${inList(bookings)}&select=id`);
      let n = 0;
      for (const h of holds) { n += await api.deleteRows(`/rest/v1/legal_hold_items?hold_id=eq.${h.id}`); n += await api.deleteRows(`/rest/v1/legal_holds?id=eq.${h.id}`); }
      return n;
    });
  }

  // 2. Storage objects by exact path: remove (idempotent), then PROVE absence by the database.
  for (const p of f.objectPaths) {
    await step('objects', async () => {
      await api.removeObject(p);
      const exists = await api.objectExists(p);
      if (exists) throw new Error(`object still present after remove: ${p}`);
      return 1;
    });
    await step('booking_photos_rows', () => api.deleteRows(`/rest/v1/booking_photos?photo_url=eq.${encodeURIComponent(p)}`));
  }

  // 3. Seeded financial rows (payouts RESTRICT earnings; bookings cascade the rest).
  for (const b of bookings) {
    await step('financial', async () => {
      const earnings = await api.getRows<{ id: string }>(`/rest/v1/provider_earnings?booking_id=eq.${b}&select=id`);
      let n = 0;
      if (earnings.length) n += await api.deleteRows(`/rest/v1/provider_payouts?earning_id=${inList(earnings.map((e) => e.id))}`);
      n += await api.deleteRows(`/rest/v1/provider_earnings?booking_id=eq.${b}`);
      n += await api.deleteRows(`/rest/v1/payments?booking_id=eq.${b}`);
      n += await api.deleteRows(`/rest/v1/notifications?booking_id=eq.${b}`); // owned through the run's booking
      n += await api.deleteRows(`/rest/v1/bookings?id=eq.${b}`);
      return n;
    });
  }

  // 4. Identities: notifications by exact user id or exact dedup key, audit and throttle rows,
  //    profile, then the auth identity.
  for (const id of users) {
    await step('provider_pending_notifications', async () => {
      const keys = providerPendingDedupKeys(id, f.adminRecipientIds);
      if (!keys.length) return 0;
      const list = `(${keys.map((k) => `"${k}"`).join(',')})`;
      return api.deleteRows(`/rest/v1/notifications?type=eq.${PROVIDER_PENDING_TYPE}&booking_id=is.null&dedup_key=in.${encodeURIComponent(list)}`);
    });
    await step('user_rows', async () => {
      let n = 0;
      n += await api.deleteRows(`/rest/v1/notifications?user_id=eq.${id}`);
      n += await api.deleteRows(`/rest/v1/account_flags?subject_id=eq.${id}`);
      n += await api.deleteRows(`/rest/v1/favorite_providers?or=(customer_id.eq.${id},provider_id.eq.${id})`);
      n += await api.deleteRows(`/rest/v1/account_deletions?user_id=eq.${id}`);
      n += await api.deleteRows(`/rest/v1/account_deletion_attempts?user_id=eq.${id}`);
      n += await api.deleteRows(`/rest/v1/wallets?customer_id=eq.${id}`);
      n += await api.deleteRows(`/rest/v1/profiles?id=eq.${id}`);
      return n;
    });
    await step('auth_identity', () => api.deleteAuthUser(id));
  }
  return report;
}

/**
 * Restoration proof: every category this suite creates is asserted empty for the run's exact ids
 * and paths, and the run-independent totals equal the captured baseline. Returns the list of
 * violations; empty means restored.
 */
export async function verifyRestoration(
  api: ServiceApi,
  f: RunFixtures,
  baseline: { totals: Record<string, number>; health: Record<string, unknown> },
  readTotals: () => Promise<Record<string, number>>,
): Promise<string[]> {
  const v: string[] = [];
  const users = f.userIds;
  if (users.length) {
    for (const [table, col] of [
      ['deletion_photo_intents', 'user_id'], ['account_deletions', 'user_id'], ['account_deletion_attempts', 'user_id'],
      ['profiles', 'id'], ['notifications', 'user_id'], ['account_flags', 'subject_id'], ['wallets', 'customer_id'],
    ] as const) {
      const n = await api.count(table, `&${col}=${inList(users)}`, table === 'account_deletion_attempts' ? 'user_id' : 'id');
      if (n !== 0) v.push(`${table}: ${n} row(s) still reference run users`);
    }
    for (const id of users) {
      const keys = providerPendingDedupKeys(id, f.adminRecipientIds);
      if (keys.length) {
        const list = `(${keys.map((k) => `"${k}"`).join(',')})`;
        const n = await api.count('notifications', `&dedup_key=in.${encodeURIComponent(list)}`);
        if (n !== 0) v.push(`notifications: ${n} provider-pending row(s) for ${id}`);
      }
      if (await api.authUserExists(id)) v.push(`auth identity still exists: ${id}`);
    }
  }
  if (f.bookingIds.length) {
    for (const table of ['bookings', 'payments', 'provider_earnings', 'legal_holds', 'notifications'] as const) {
      const col = table === 'bookings' ? 'id' : 'booking_id';
      const n = await api.count(table, `&${col}=${inList(f.bookingIds)}`);
      if (n !== 0) v.push(`${table}: ${n} row(s) still reference run bookings`);
    }
  }
  for (const c of f.caseIds) {
    if ((await api.count('support_cases', `&id=eq.${c}`)) !== 0) v.push(`support case remains: ${c}`);
    if ((await api.count('legal_holds', `&case_id=eq.${c}`)) !== 0) v.push(`case hold remains: ${c}`);
  }
  for (const h of f.holdIds) {
    if ((await api.count('legal_holds', `&id=eq.${h}`)) !== 0) v.push(`legal hold remains: ${h}`);
    if ((await api.count('legal_hold_items', `&hold_id=eq.${h}`)) !== 0) v.push(`hold items remain: ${h}`);
  }
  for (const p of f.objectPaths) {
    if (await api.objectExists(p)) v.push(`object remains: ${p}`);
  }
  const after = await readTotals();
  for (const k of Object.keys(baseline.totals)) {
    if (after[k] !== baseline.totals[k]) v.push(`totals.${k}: baseline ${baseline.totals[k]} now ${after[k]}`);
  }
  const health = await api.rpc<Record<string, unknown>>('deletion_work_health', {});
  for (const k of ['bucket_objects', 'retired_paths', 'active_holds'] as const) {
    if (health[k] !== baseline.health[k]) v.push(`health.${k}: baseline ${String(baseline.health[k])} now ${String(health[k])}`);
  }
  return v;
}
