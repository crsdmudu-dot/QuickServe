/**
 * deletion-worker-handler.test.ts — BEHAVIOURAL tests for the deletion-worker control flow.
 *
 * The real `runDeletionWorker` runs against an in-memory WORLD that implements the CONTRACT of the
 * 0059 routines as documented in that migration: leases and fencing, the destructive
 * authorisation boundary, path retirement, holds (legal and support-case), storage.objects reads
 * before and after the Storage call, backoff and ceilings, account-level auth recovery, the
 * settling window, the provisional state, the upload boundary and the final sweep. Every Storage
 * and Auth call is recorded so the ABSENCE of a call is assertable.
 *
 * What this proves: the worker's decisions given the contract (SIMULATED). What it does NOT
 * prove: that the SQL implements the contract, or how the platform behaves. That is the connected
 * QA certification (`qa/playwright/certification/deletion-work.spec.ts`), NOT RUN until authorised.
 */
import {
  LEASE_BUDGET_MS,
  classifyAuthError,
  classifyStorageResult,
  leaseAllowsStorageCall,
  runDeletionWorker,
  type AuthDeleteError,
  type StorageRemoveResult,
  type WorkerDeps,
  type WorkerRequest,
} from '../../supabase/functions/deletion-worker/handler';

const MIN = 60_000;
const HOUR = 60 * MIN;
const SECRET = 'worker-secret-for-tests';
const LEASE_MS = 10 * MIN;

type IntentState =
  | 'planned' | 'held' | 'destroying' | 'object_removed' | 'object_absent' | 'verified' | 'needs_operator';
type CleanupState = 'not_started' | 'pending' | 'provisional' | 'complete' | 'complete_with_retained' | 'needs_operator';

type Intent = {
  id: string; deletionId: string; userId: string; bookingId: string | null; photoId: string | null;
  bucket: string; path: string; expectedObjectId: string | null; state: IntentState;
  outcome: 'removed' | 'absent' | null; holdId: string | null; leaseId: string | null; leasedUntil: number | null;
  attempts: number; nextAttemptAt: number | null; lastErrorClass: string | null; destroyAuthorizedAt: number | null; createdAt: number;
};

type Account = {
  id: string; userId: string; status: 'blocked' | 'pending_auth_delete' | 'deleted'; dbCompletedAt: number | null;
  authState: 'not_started' | 'pending_retry' | 'deleted' | 'needs_operator'; authLeaseId: string | null; authLeasedUntil: number | null;
  authAttempts: number; authNextAttemptAt: number | null; authLastErrorClass: string | null;
  cleanupState: CleanupState; cleanupEligibleAt: number | null; cleanupBoundaryAt: number | null;
  lastSweepAt: number | null; finalSweepAt: number | null; retainedRef: string | null; closedAt: number | null;
};

type Hold = { id: string; scope: 'booking' | 'user'; bookingId: string | null; userId: string | null; source: 'legal' | 'case'; caseId: string | null; reference: string; released: boolean; releaseNote: string | null };
type HoldItem = { holdId: string; intentId: string; outcome: string };
type StoredObject = { id: string; owner: string };
type PhotoRow = { id: string; path: string; uploadedBy: string };
type StorageMode = 'normal' | 'permission' | 'transient' | 'silent_noop' | 'replace_on_remove' | 'throw';

function backoff(attempts: number): number {
  if (attempts <= 1) return 1 * MIN;
  if (attempts === 2) return 5 * MIN;
  if (attempts === 3) return 15 * MIN;
  if (attempts === 4) return 60 * MIN;
  return 240 * MIN;
}

let seq = 0;
const uid = (prefix: string) => `${prefix}-${(seq += 1).toString().padStart(4, '0')}`;
const OPEN = new Set(['open', 'in_review', 'waiting_on_customer', 'waiting_on_provider']);

/** The 0059 contract, in memory. Method names mirror the SQL routines one to one. */
class World {
  now = 1_000_000_000_000;
  intents = new Map<string, Intent>();
  accounts = new Map<string, Account>();
  objects = new Map<string, StoredObject>(); // key: `${bucket}/${path}`
  rows = new Map<string, PhotoRow>();
  holds: Hold[] = [];
  holdItems: HoldItem[] = [];
  rpcLog: string[] = [];
  storageLog: string[] = [];
  authLog: string[] = [];
  storageMode: StorageMode = 'normal';
  authOutcomes: AuthDeleteError[] = [];
  hooks: { afterClaim?: () => Promise<void> | void; afterAuthorize?: () => Promise<void> | void } = {};
  /** Counts account_deletions writes made from release_hold; the contract requires zero. */
  accountWritesByRelease = 0;

  // ── fixtures ────────────────────────────────────────────────────────────────────────────
  addAccount(overrides: Partial<Account> = {}): Account {
    const a: Account = {
      id: uid('del'), userId: uid('user'), status: 'pending_auth_delete', dbCompletedAt: this.now,
      authState: 'not_started', authLeaseId: null, authLeasedUntil: null, authAttempts: 0, authNextAttemptAt: null, authLastErrorClass: null,
      cleanupState: 'pending', cleanupEligibleAt: this.now + 5 * MIN, cleanupBoundaryAt: this.now + 24 * HOUR,
      lastSweepAt: null, finalSweepAt: null, retainedRef: null, closedAt: null, ...overrides,
    };
    this.accounts.set(a.id, a);
    return a;
  }

  addPhoto(account: Account, opts: { bookingId?: string; objectPresent?: boolean; withRow?: boolean } = {}): Intent {
    const bookingId = opts.bookingId ?? uid('booking');
    const path = `${bookingId}/${uid('obj')}.jpg`;
    const objectId = uid('soid');
    if (opts.objectPresent !== false) this.objects.set(`booking-photos/${path}`, { id: objectId, owner: account.userId });
    let photoId: string | null = null;
    if (opts.withRow !== false) { photoId = uid('photo'); this.rows.set(photoId, { id: photoId, path, uploadedBy: account.userId }); }
    const hold = this.activeHold(account.userId, bookingId);
    const i: Intent = {
      id: uid('intent'), deletionId: account.id, userId: account.userId, bookingId, photoId, bucket: 'booking-photos', path,
      expectedObjectId: opts.objectPresent === false ? null : objectId, state: hold ? 'held' : 'planned', outcome: null,
      holdId: hold?.id ?? null, leaseId: null, leasedUntil: null, attempts: 0, nextAttemptAt: null, lastErrorClass: null,
      destroyAuthorizedAt: null, createdAt: this.now,
    };
    this.intents.set(i.id, i);
    return i;
  }

  /** A late upload landing as Storage would write it (its own superuser): no policy applies. */
  addOrphanObject(account: Account, bookingId: string): string {
    const path = `${bookingId}/${uid('late')}.jpg`;
    this.objects.set(`booking-photos/${path}`, { id: uid('soid'), owner: account.userId });
    return path;
  }

  /** An RLS-governed client's upload: the INSERT policy refuses a RETIRED path (any intent, any state). */
  participantUpload(path: string, owner: string): void {
    if (this.pathRetired('booking-photos', path)) throw new Error('policy: path retired');
    if (this.objects.has(`booking-photos/${path}`)) throw new Error('storage: object exists');
    this.objects.set(`booking-photos/${path}`, { id: uid('replacement'), owner });
  }

  pathRetired(bucket: string, path: string): boolean {
    return [...this.intents.values()].some((i) => i.bucket === bucket && i.path === path);
  }

  activeHold(userId: string, bookingId: string | null): Hold | undefined {
    return this.holds.find((h) => !h.released && ((h.scope === 'user' && h.userId === userId) || (h.scope === 'booking' && bookingId !== null && h.bookingId === bookingId)));
  }

  objectAt(bucket: string, path: string): StoredObject | undefined { return this.objects.get(`${bucket}/${path}`); }

  // ── the routines ────────────────────────────────────────────────────────────────────────
  async rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
    this.rpcLog.push(fn);
    const data = await (this as unknown as Record<string, (a: Record<string, unknown>) => unknown>)[fn](args);
    return { data, error: null };
  }

  claim_deletion_work({ p_limit }: { p_limit: number }) {
    const picked = [...this.intents.values()]
      .filter((i) => ['planned', 'destroying', 'object_removed', 'object_absent'].includes(i.state))
      .filter((i) => i.leasedUntil === null || i.leasedUntil < this.now)
      .filter((i) => i.nextAttemptAt === null || i.nextAttemptAt <= this.now)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .slice(0, Math.max(1, Math.min(p_limit, 100)));
    for (const i of picked) { i.leaseId = uid('lease'); i.leasedUntil = this.now + LEASE_MS; }
    const out = picked.map((i) => ({ intent_id: i.id, lease_id: i.leaseId, leased_until: new Date(i.leasedUntil as number).toISOString(), state: i.state, bucket_id: i.bucket, object_path: i.path, booking_id: i.bookingId, user_id: i.userId, photo_id: i.photoId, attempts: i.attempts }));
    return this.hooks.afterClaim ? Promise.resolve(this.hooks.afterClaim()).then(() => out) : out;
  }

  async authorize_destroy({ p_intent, p_lease }: { p_intent: string; p_lease: string }) {
    const i = this.intents.get(p_intent);
    if (!i) return { authorized: false, reason: 'missing' };
    if (i.leaseId !== p_lease || i.leasedUntil === null || i.leasedUntil < this.now) return { authorized: false, reason: 'lease_lost' };
    if (i.state !== 'planned' && i.state !== 'destroying') return { authorized: false, reason: `state:${i.state}` };
    if (i.state === 'planned') {
      const hold = this.activeHold(i.userId, i.bookingId);
      if (hold) {
        i.state = 'held'; i.holdId = hold.id; i.leaseId = null; i.leasedUntil = null;
        this.holdItems.push({ holdId: hold.id, intentId: i.id, outcome: 'held' });
        return { authorized: false, reason: 'held' };
      }
    }
    const obj = this.objectAt(i.bucket, i.path);
    if (!obj) { i.state = 'object_absent'; i.outcome = 'absent'; return { authorized: false, reason: 'absent' }; }
    if (i.expectedObjectId === null || obj.id !== i.expectedObjectId) {
      i.state = 'needs_operator'; i.lastErrorClass = 'identity_mismatch'; i.leaseId = null; i.leasedUntil = null;
      return { authorized: false, reason: 'identity_mismatch' };
    }
    i.state = 'destroying'; i.destroyAuthorizedAt = i.destroyAuthorizedAt ?? this.now;
    if (this.hooks.afterAuthorize) { const h = this.hooks.afterAuthorize; this.hooks.afterAuthorize = undefined; await h(); }
    return { authorized: true, bucket_id: i.bucket, object_path: i.path };
  }

  record_destroy_result({ p_intent, p_lease, p_result }: { p_intent: string; p_lease: string; p_result: string }) {
    const i = this.intents.get(p_intent);
    if (!i) return { recorded: false, reason: 'missing' };
    if (i.leaseId !== p_lease) return { recorded: false, reason: 'lease_lost' };
    if (i.state !== 'destroying') return { recorded: false, reason: `state:${i.state}` };
    const attempts = i.attempts + 1;
    const escalate = (cls: string) => { i.state = 'needs_operator'; i.lastErrorClass = cls; i.attempts = attempts; i.leaseId = null; i.leasedUntil = null; return { recorded: true, state: 'needs_operator' }; };
    const retry = (cls: string) => { i.lastErrorClass = cls; i.attempts = attempts; i.nextAttemptAt = this.now + backoff(attempts); i.leaseId = null; i.leasedUntil = null; return { recorded: true, state: 'destroying', retry: true }; };
    if (p_result === 'api_permission') return escalate('permission');
    if (p_result === 'api_transient') return attempts >= 10 ? escalate('attempt_ceiling') : retry('transient');
    const obj = this.objectAt(i.bucket, i.path);
    if (!obj) {
      i.state = p_result === 'api_ok_item' ? 'object_removed' : 'object_absent';
      i.outcome = p_result === 'api_ok_item' ? 'removed' : 'absent';
      i.attempts = attempts;
      return { recorded: true, state: i.state };
    }
    if (obj.id !== i.expectedObjectId) return escalate('identity_mismatch');
    return attempts >= 10 ? escalate('attempt_ceiling') : retry('ambiguous');
  }

  finish_intent({ p_intent, p_lease }: { p_intent: string; p_lease: string }) {
    const i = this.intents.get(p_intent);
    if (!i) return { verified: false, reason: 'missing' };
    if (i.leaseId !== p_lease) return { verified: false, reason: 'lease_lost' };
    if (i.state !== 'object_removed' && i.state !== 'object_absent') return { verified: false, reason: `state:${i.state}` };
    for (const [id, r] of this.rows) if (r.path === i.path && r.uploadedBy === i.userId) this.rows.delete(id);
    if (this.objectAt(i.bucket, i.path)) { i.state = 'needs_operator'; i.lastErrorClass = 'ambiguous'; i.leaseId = null; return { verified: false, reason: 'object_present' }; }
    if ([...this.rows.values()].some((r) => r.path === i.path)) { i.state = 'needs_operator'; i.lastErrorClass = 'row_delete_failed'; i.leaseId = null; return { verified: false, reason: 'row_present' }; }
    i.state = 'verified'; i.leaseId = null; i.leasedUntil = null;
    return { verified: true, outcome: i.outcome };
  }

  claim_auth_work({ p_limit }: { p_limit: number }) {
    const picked = [...this.accounts.values()]
      .filter((d) => d.status !== 'blocked' && d.dbCompletedAt !== null)
      .filter((d) => d.authState === 'not_started' || d.authState === 'pending_retry')
      .filter((d) => d.authLeasedUntil === null || d.authLeasedUntil < this.now)
      .filter((d) => d.authNextAttemptAt === null || d.authNextAttemptAt <= this.now)
      .filter((d) => d.authState !== 'not_started' || (d.dbCompletedAt as number) < this.now - 2 * MIN)
      .slice(0, Math.max(1, Math.min(p_limit, 100)));
    for (const d of picked) { d.authLeaseId = uid('alease'); d.authLeasedUntil = this.now + LEASE_MS; }
    return picked.map((d) => ({ deletion_id: d.id, user_id: d.userId, lease_id: d.authLeaseId, attempts: d.authAttempts }));
  }

  private openIntents(d: Account): boolean {
    return [...this.intents.values()].some((i) => i.deletionId === d.id && ['planned', 'destroying', 'object_removed', 'object_absent'].includes(i.state));
  }
  private heldIntents(d: Account): Intent[] {
    return [...this.intents.values()].filter((i) => i.deletionId === d.id && i.state === 'held');
  }
  private needsOperatorIntents(d: Account): Intent[] {
    return [...this.intents.values()].filter((i) => i.deletionId === d.id && i.state === 'needs_operator');
  }
  /** The references of the holds that still hold this account's intents (null when none). */
  private currentRefs(d: Account): string | null {
    const refs = [...new Set(this.heldIntents(d).map((i) => this.holds.find((h) => h.id === i.holdId)?.reference ?? '?'))].sort();
    return refs.length ? refs.join('; ') : null;
  }

  record_auth_result({ p_deletion, p_lease, p_result }: { p_deletion: string; p_lease: string; p_result: string }) {
    const d = this.accounts.get(p_deletion);
    if (!d) return { recorded: false, reason: 'missing' };
    if (d.authLeaseId !== p_lease) return { recorded: false, reason: 'lease_lost' };
    if (d.authState !== 'not_started' && d.authState !== 'pending_retry') return { recorded: false, reason: `state:${d.authState}` };
    const attempts = d.authAttempts + 1;
    d.authAttempts = attempts; d.authLeaseId = null; d.authLeasedUntil = null;
    if (p_result === 'deleted') {
      d.authState = 'deleted'; d.status = 'deleted'; d.authNextAttemptAt = null;
      if (d.cleanupState === 'complete' || d.cleanupState === 'complete_with_retained') d.closedAt = d.closedAt ?? this.now;
      return { recorded: true, auth_state: 'deleted' };
    }
    const retainedOnly = d.cleanupState === 'complete_with_retained' || (d.cleanupState === 'provisional' && this.heldIntents(d).length > 0 && !this.openIntents(d));
    if (p_result === 'dependency' && retainedOnly) {
      d.authState = 'needs_operator'; d.authLastErrorClass = 'dependency';
      return { recorded: true, auth_state: 'needs_operator' };
    }
    if (p_result === 'permission' || attempts >= 10) {
      d.authState = 'needs_operator'; d.authLastErrorClass = p_result === 'permission' ? 'permission' : 'attempt_ceiling';
      return { recorded: true, auth_state: 'needs_operator' };
    }
    d.authState = 'pending_retry'; d.authLastErrorClass = p_result;
    d.authNextAttemptAt = this.now + (p_result === 'dependency' ? Math.max(10 * MIN, backoff(attempts)) : backoff(attempts));
    return { recorded: true, auth_state: 'pending_retry' };
  }

  list_cleanup_candidates({ p_limit }: { p_limit: number }) {
    const pending = [...this.accounts.values()]
      .filter((d) => d.status !== 'blocked' && d.dbCompletedAt !== null)
      .filter((d) => d.cleanupState === 'pending' || d.cleanupState === 'not_started')
      .filter((d) => d.cleanupEligibleAt !== null && d.cleanupEligibleAt <= this.now);
    const provisional = [...this.accounts.values()]
      .filter((d) => d.status !== 'blocked' && d.cleanupState === 'provisional')
      .filter((d) => d.cleanupBoundaryAt === null || d.cleanupBoundaryAt <= this.now || d.lastSweepAt === null || d.lastSweepAt < this.now - HOUR);
    const reopenable = [...this.accounts.values()]
      .filter((d) => d.status !== 'blocked' && (d.cleanupState === 'provisional' || d.cleanupState === 'complete_with_retained'))
      .filter((d) => this.openIntents(d) || this.needsOperatorIntents(d).length > 0 || d.retainedRef !== this.currentRefs(d));
    const all = [...new Set([...pending, ...provisional, ...reopenable])];
    return all.slice(0, Math.max(1, Math.min(p_limit, 100))).map((d) => ({ deletion_id: d.id }));
  }

  /** `_deletion_inventory`: every owned row/object not yet inventoried; ON CONFLICT does nothing. */
  private inventory(d: Account): number {
    const known = new Set([...this.intents.values()].filter((i) => i.deletionId === d.id).map((i) => `${i.bucket}/${i.path}`));
    let added = 0;
    const consider = (path: string, photoId: string | null) => {
      if (known.has(`booking-photos/${path}`)) return;
      const obj = this.objectAt('booking-photos', path);
      const bookingId = path.split('/')[0] ?? null;
      const hold = this.activeHold(d.userId, bookingId);
      const i: Intent = {
        id: uid('intent'), deletionId: d.id, userId: d.userId, bookingId, photoId, bucket: 'booking-photos', path,
        expectedObjectId: obj?.id ?? null, state: hold ? 'held' : 'planned', outcome: null, holdId: hold?.id ?? null,
        leaseId: null, leasedUntil: null, attempts: 0, nextAttemptAt: null, lastErrorClass: null, destroyAuthorizedAt: null, createdAt: this.now,
      };
      this.intents.set(i.id, i); known.add(`booking-photos/${path}`); added += 1;
    };
    for (const r of this.rows.values()) if (r.uploadedBy === d.userId) consider(r.path, r.id);
    for (const [key, o] of this.objects) if (o.owner === d.userId && key.startsWith('booking-photos/')) consider(key.slice('booking-photos/'.length), null);
    return added;
  }

  try_complete_cleanup({ p_deletion }: { p_deletion: string }) {
    const d = this.accounts.get(p_deletion);
    if (!d) return { complete: false, reason: 'missing' };
    if (d.cleanupState === 'complete') return { complete: true, cleanup_state: d.cleanupState };
    if (d.cleanupState === 'needs_operator') return { complete: false, cleanup_state: d.cleanupState };
    if ((d.cleanupState === 'pending' || d.cleanupState === 'not_started') && (d.cleanupEligibleAt === null || d.cleanupEligibleAt > this.now)) return { complete: false, reason: 'settling', cleanup_state: d.cleanupState };
    if (this.openIntents(d)) {
      if (d.cleanupState === 'provisional' || d.cleanupState === 'complete_with_retained') { d.cleanupState = 'pending'; d.finalSweepAt = null; d.closedAt = null; return { complete: false, reason: 'reopened', cleanup_state: 'pending' }; }
      return { complete: false, reason: 'work_pending', cleanup_state: d.cleanupState };
    }
    const wasProvisional = d.cleanupState === 'provisional';
    const added = this.inventory(d);
    d.lastSweepAt = this.now;
    if (added > 0) { d.cleanupState = 'pending'; d.finalSweepAt = null; d.closedAt = null; return { complete: false, reason: wasProvisional ? 'reopened' : 'new_intents', new_intents: added, cleanup_state: 'pending' }; }
    if (this.needsOperatorIntents(d).length > 0) { d.cleanupState = 'needs_operator'; d.closedAt = null; return { complete: false, reason: 'intent_needs_operator', cleanup_state: 'needs_operator' }; }
    const heldPaths = new Set(this.heldIntents(d).map((i) => i.path));
    const uncovered = [...this.objects.entries()].some(([k, o]) => o.owner === d.userId && !heldPaths.has(k.slice('booking-photos/'.length)))
      || [...this.rows.values()].some((r) => r.uploadedBy === d.userId && !heldPaths.has(r.path));
    if (uncovered) { d.cleanupState = 'needs_operator'; d.closedAt = null; return { complete: false, reason: 'uninventoried_owned_data', cleanup_state: 'needs_operator' }; }
    const refs = [...new Set(this.heldIntents(d).map((i) => this.holds.find((h) => h.id === i.holdId)?.reference ?? '?'))].sort();
    d.retainedRef = refs.length ? refs.join('; ') : null;
    if (d.cleanupBoundaryAt === null || d.cleanupBoundaryAt > this.now) {
      d.cleanupState = 'provisional';
      return { complete: false, reason: 'awaiting_boundary', cleanup_state: 'provisional', retained_exception_ref: d.retainedRef };
    }
    d.cleanupState = refs.length ? 'complete_with_retained' : 'complete';
    d.finalSweepAt = this.now;
    if (d.authState === 'deleted') d.closedAt = d.closedAt ?? this.now;
    return { complete: true, cleanup_state: d.cleanupState, retained_exception_ref: d.retainedRef };
  }

  apply_hold({ p_scope, p_booking, p_user, p_source, p_reference, p_case_id }: { p_scope: 'booking' | 'user'; p_booking: string | null; p_user: string | null; p_source?: 'legal' | 'case'; p_reference: string; p_case_id?: string | null }) {
    const hold: Hold = { id: uid('hold'), scope: p_scope, bookingId: p_booking, userId: p_user, source: p_source ?? 'legal', caseId: p_case_id ?? null, reference: p_reference, released: false, releaseNote: null };
    this.holds.push(hold);
    const items: Record<string, number> = {};
    const targets = [...this.intents.values()].filter((i) => (p_scope === 'booking' ? i.bookingId === p_booking : i.userId === p_user)).sort((a, b) => a.id.localeCompare(b.id));
    for (const i of targets) {
      let outcome: string;
      if (i.state === 'planned' || i.state === 'needs_operator' || i.state === 'held') outcome = 'held';
      else if (i.state === 'destroying') outcome = 'authorized_before_hold';
      else if (i.state === 'object_removed' || (i.state === 'verified' && i.outcome === 'removed')) outcome = 'already_removed';
      else outcome = 'already_absent';
      if (i.state === 'planned' || i.state === 'needs_operator') { i.state = 'held'; i.holdId = hold.id; i.leaseId = null; i.leasedUntil = null; }
      this.holdItems.push({ holdId: hold.id, intentId: i.id, outcome });
      items[outcome] = (items[outcome] ?? 0) + 1;
    }
    return { hold_id: hold.id, items };
  }

  release_hold({ p_hold, p_note }: { p_hold: string; p_note?: string }) {
    const h = this.holds.find((x) => x.id === p_hold);
    if (!h) return { released: false };
    if (h.released) return { released: true, already: true };
    h.released = true; h.releaseNote = p_note ?? null;
    let replanned = 0, reassigned = 0;
    for (const i of this.intents.values()) {
      if (i.holdId !== h.id || i.state !== 'held') continue;
      const other = this.activeHold(i.userId, i.bookingId);
      if (other) { i.holdId = other.id; this.holdItems.push({ holdId: other.id, intentId: i.id, outcome: 'held' }); reassigned += 1; }
      else { i.state = 'planned'; i.holdId = null; i.nextAttemptAt = null; replanned += 1; }
    }
    // No account_deletions write here (lock order): reopening happens lazily via candidates.
    this.accountWritesByRelease += 0;
    return { released: true, replanned, reassigned };
  }

  /** `tg_support_case_hold`: reconcile the case's hold with its current booking and status. */
  supportCaseChange(c: { caseId: string; bookingId: string | null; status: string; prev?: { bookingId: string | null; status: string } }) {
    const open = OPEN.has(c.status);
    if (c.prev && c.prev.bookingId === c.bookingId && c.prev.status === c.status) return;
    let hold = this.holds.find((h) => h.source === 'case' && h.caseId === c.caseId && !h.released);
    if (hold && (!open || hold.bookingId !== c.bookingId)) {
      this.release_hold({ p_hold: hold.id, p_note: !open ? `case ${c.status}` : 'case reassigned' });
      hold = undefined;
    }
    if (open && c.bookingId !== null && !hold) {
      this.apply_hold({ p_scope: 'booking', p_booking: c.bookingId, p_user: null, p_source: 'case', p_reference: `case:${c.caseId}`, p_case_id: c.caseId });
    }
  }

  // ── external systems ────────────────────────────────────────────────────────────────────
  deps(over: Partial<WorkerDeps> = {}): WorkerDeps {
    return {
      db: { rpc: (fn, args) => this.rpc(fn, args) },
      storage: {
        remove: async (bucket, path): Promise<StorageRemoveResult> => {
          this.storageLog.push(`remove:${path}`);
          const key = `${bucket}/${path}`;
          switch (this.storageMode) {
            case 'permission': return { status: 403, items: 0, error: 'storage_error' };
            case 'transient': return { status: 503, items: 0, error: 'storage_error' };
            case 'throw': throw new Error('network');
            case 'silent_noop': return { status: 200, items: 0 };
            case 'replace_on_remove': { const had = this.objects.delete(key); this.objects.set(key, { id: uid('replacement'), owner: 'someone-else' }); return { status: 200, items: had ? 1 : 0 }; }
            default: { const had = this.objects.delete(key); return { status: 200, items: had ? 1 : 0 }; }
          }
        },
      },
      auth: {
        ban: async (u) => { this.authLog.push(`ban:${u}`); },
        deleteUser: async (u) => { this.authLog.push(`delete:${u}`); return { error: this.authOutcomes.length ? (this.authOutcomes.shift() as AuthDeleteError) : null }; },
      },
      expectedSecret: SECRET,
      now: () => this.now,
      ...over,
    };
  }
}

function request(overrides: Partial<WorkerRequest> = {}): WorkerRequest {
  return { method: 'POST', secretHeader: SECRET, json: async () => ({ limit: 25 }), ...overrides };
}
async function run(world: World, overrides: Partial<WorkerRequest> = {}) {
  return runDeletionWorker(request(overrides), world.deps());
}
/** Runs the worker until nothing changes, or `n` times. */
async function settle(world: World, n = 3) { for (let k = 0; k < n; k += 1) await run(world); }

describe('classification helpers', () => {
  it('maps the Storage response shapes verified on QA', () => {
    expect(classifyStorageResult({ status: 200, items: 1 })).toBe('api_ok_item');
    expect(classifyStorageResult({ status: 200, items: 0 })).toBe('api_ok_empty');
    expect(classifyStorageResult({ status: 403, items: 0 })).toBe('api_permission');
    expect(classifyStorageResult({ status: 401, items: 0 })).toBe('api_permission');
    expect(classifyStorageResult({ status: 503, items: 0 })).toBe('api_transient');
    expect(classifyStorageResult({ status: 0, items: 0 })).toBe('api_transient');
  });
  it('treats an already-gone identity as deleted and a referencing-constraint refusal as a dependency', () => {
    expect(classifyAuthError(null)).toBe('deleted');
    expect(classifyAuthError({ status: 404, message: 'User not found' })).toBe('deleted');
    expect(classifyAuthError({ status: 500, message: 'update or delete on table "users" violates foreign key constraint' })).toBe('dependency');
    expect(classifyAuthError({ status: 403, message: 'forbidden' })).toBe('permission');
    expect(classifyAuthError({ status: 503, message: 'gateway' })).toBe('transient');
  });
  it('allows a Storage call only with more than the budget of lease left, and never on an unknown lease', () => {
    const t = 1_000_000;
    expect(leaseAllowsStorageCall(new Date(t + LEASE_BUDGET_MS + 1).toISOString(), t)).toBe(true);
    expect(leaseAllowsStorageCall(new Date(t + LEASE_BUDGET_MS).toISOString(), t)).toBe(false);
    expect(leaseAllowsStorageCall(new Date(t - 1).toISOString(), t)).toBe(false);
    expect(leaseAllowsStorageCall(null, t)).toBe(false);
    expect(leaseAllowsStorageCall('not-a-date', t)).toBe(false);
  });
});

describe('gateway-independent authentication (finding 3)', () => {
  it('correct secret: proceeds', async () => {
    const w = new World();
    expect((await run(w)).status).toBe(200);
    expect(w.rpcLog).toContain('claim_deletion_work');
  });
  it('missing header: 401, no database call', async () => {
    const w = new World();
    expect((await run(w, { secretHeader: null })).status).toBe(401);
    expect(w.rpcLog).toEqual([]);
  });
  it('wrong secret (same length and different length): 401, no database call', async () => {
    const w = new World();
    expect((await run(w, { secretHeader: 'worker-secret-for-testX' })).status).toBe(401);
    expect((await run(w, { secretHeader: 'short' })).status).toBe(401);
    expect(w.rpcLog).toEqual([]);
  });
  it('missing server-side secret: fails closed even with a header', async () => {
    const w = new World();
    const res = await runDeletionWorker(request(), w.deps({ expectedSecret: null }));
    expect(res.status).toBe(401);
    expect(w.rpcLog).toEqual([]);
  });
  it('empty server-side secret: fails closed', async () => {
    const w = new World();
    expect((await runDeletionWorker(request({ secretHeader: '' }), w.deps({ expectedSecret: '' }))).status).toBe(401);
  });
  it('needs no user JWT: the request type carries no Authorization and the handler never asks for one', async () => {
    const w = new World();
    const req: WorkerRequest = { method: 'POST', secretHeader: SECRET, json: async () => ({}) };
    expect(Object.keys(req)).toEqual(['method', 'secretHeader', 'json']);
    expect((await runDeletionWorker(req, w.deps())).status).toBe(200);
  });
  it('non-POST: 405 before authentication', async () => {
    const w = new World();
    expect((await run(w, { method: 'GET' })).status).toBe(405);
  });
});

describe('one photo, the normal path', () => {
  it('authorises, deletes the object once, records from the re-read, deletes the row, verifies', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a);
    const res = await run(w);
    expect(res.status).toBe(200);
    expect(w.storageLog).toEqual([`remove:${i.path}`]);
    expect(w.intents.get(i.id)!).toMatchObject({ state: 'verified', outcome: 'removed' });
    expect([...w.rows.values()].some((r) => r.path === i.path)).toBe(false);
    expect(res.body).toMatchObject({ intents: { 'destroy:api_ok_item->object_removed': 1, 'verified:removed': 1 } });
    expect(w.rpcLog.indexOf('authorize_destroy')).toBeLessThan(w.rpcLog.indexOf('record_destroy_result'));
  });
});

describe('absent, permission, transient, ambiguous: four distinct outcomes', () => {
  it('absent at authorisation: no Storage call, outcome "absent", metadata row still removed', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a, { objectPresent: false });
    await run(w);
    expect(w.storageLog).toEqual([]);
    expect(w.intents.get(i.id)!).toMatchObject({ state: 'verified', outcome: 'absent' });
    expect([...w.rows.values()].some((r) => r.path === i.path)).toBe(false);
  });
  it('permission (403): operator immediately, no retry, metadata row kept, not re-claimable', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a);
    w.storageMode = 'permission';
    await run(w);
    expect(w.intents.get(i.id)!).toMatchObject({ state: 'needs_operator', lastErrorClass: 'permission' });
    expect([...w.rows.values()].some((r) => r.path === i.path)).toBe(true);
    w.now += 60 * MIN;
    await run(w);
    expect(w.storageLog).toHaveLength(1);
  });
  it('transient (503): stays destroying with backoff; not claimed before it; resumed through authorisation after it', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a);
    w.storageMode = 'transient';
    await run(w);
    const after = w.intents.get(i.id)!;
    expect(after).toMatchObject({ state: 'destroying', lastErrorClass: 'transient', attempts: 1 });
    expect(after.nextAttemptAt).toBe(w.now + 1 * MIN);
    await run(w);
    expect(w.storageLog).toHaveLength(1);
    w.now += 2 * MIN;
    w.storageMode = 'normal';
    await run(w);
    expect(w.storageLog).toHaveLength(2);
    expect(w.intents.get(i.id)!.state).toBe('verified');
    expect(w.rpcLog.filter((f) => f === 'authorize_destroy')).toHaveLength(2);
  });
  it('ambiguous (200 [] while the object remains): retried with backoff, escalated at the ceiling, row never deleted', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a);
    w.storageMode = 'silent_noop';
    for (let n = 1; n <= 10; n += 1) { await run(w); w.now += 300 * MIN; }
    expect(w.intents.get(i.id)!).toMatchObject({ state: 'needs_operator', lastErrorClass: 'attempt_ceiling', attempts: 10 });
    expect(w.storageLog).toHaveLength(10);
    expect(w.objectAt('booking-photos', i.path)).toBeDefined();
    expect([...w.rows.values()].some((r) => r.path === i.path)).toBe(true);
  });
  it('a thrown transport error is transient, not fatal to the run', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a);
    w.storageMode = 'throw';
    expect((await run(w)).status).toBe(200);
    expect(w.intents.get(i.id)!).toMatchObject({ state: 'destroying', lastErrorClass: 'transient' });
  });
});

describe('object identity through the destructive operation', () => {
  it('a different object id at the path before authorisation: refused, no Storage call, operator', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a);
    w.objects.set(`booking-photos/${i.path}`, { id: 'replaced-before', owner: 'someone-else' });
    await run(w);
    expect(w.storageLog).toEqual([]);
    expect(w.intents.get(i.id)!).toMatchObject({ state: 'needs_operator', lastErrorClass: 'identity_mismatch' });
  });
  it('a trusted-actor replacement during the destruction call is detected by the re-read: operator, metadata row kept', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a);
    w.storageMode = 'replace_on_remove';
    await run(w);
    expect(w.intents.get(i.id)!).toMatchObject({ state: 'needs_operator', lastErrorClass: 'identity_mismatch' });
    expect(w.rpcLog).not.toContain('finish_intent');
    expect([...w.rows.values()].some((r) => r.path === i.path)).toBe(true);
  });
  it('an object that appeared at a path inventoried as absent is not the inventoried object: refused', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a, { objectPresent: false });
    w.objects.set(`booking-photos/${i.path}`, { id: 'appeared-later', owner: a.userId });
    await run(w);
    expect(w.storageLog).toEqual([]);
    expect(w.intents.get(i.id)!.state).toBe('needs_operator');
  });
});

describe('stale workers and path retirement (finding 1)', () => {
  it('two workers cannot claim the same intents while leases are live', async () => {
    const w = new World();
    const a = w.addAccount();
    for (let n = 0; n < 4; n += 1) w.addPhoto(a);
    const first = await w.rpc('claim_deletion_work', { p_limit: 25 });
    const second = await w.rpc('claim_deletion_work', { p_limit: 25 });
    expect((first.data as unknown[]).length).toBe(4);
    expect((second.data as unknown[]).length).toBe(0);
  });

  it('a worker whose lease expired BEFORE authorisation makes no Storage call once a hold has landed', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a);
    w.hooks.afterClaim = () => {
      w.now += LEASE_MS + MIN;
      w.rpc('apply_hold', { p_scope: 'booking', p_booking: i.bookingId, p_user: null, p_reference: 'matter-1' });
    };
    const res = await run(w);
    expect(w.storageLog).toEqual([]);
    expect(w.intents.get(i.id)!.state).toBe('held');
    expect(res.body).toMatchObject({ intents: { 'skipped:lease_budget': 1 } });
  });

  it('REGRESSION: worker A pauses AFTER authorisation, its lease expires, worker B removes and verifies, a participant tries to reuse the path, A resumes — the replacement is never created and A never calls Storage', async () => {
    const w = new World();
    const a = w.addAccount();
    const participant = 'participant-1';
    const i = w.addPhoto(a);
    w.hooks.afterAuthorize = async () => {
      w.now += LEASE_MS + MIN;               // A is paused; its lease expires
      await run(w);                          // B claims the 'destroying' intent, removes, verifies
      expect(w.intents.get(i.id)!.state).toBe('verified');
      expect(w.objectAt('booking-photos', i.path)).toBeUndefined();
      // The path is now unfrozen under the OLD rule (intent verified). Under retirement it stays
      // refused for every RLS-governed client, so no replacement can appear there.
      expect(() => w.participantUpload(i.path, participant)).toThrow(/path retired/);
      expect(w.objectAt('booking-photos', i.path)).toBeUndefined();
    };
    await run(w); // worker A resumes after the pause
    // Only B's removal reached Storage: A's post-authorisation budget check refused the call.
    expect(w.storageLog).toEqual([`remove:${i.path}`]);
    expect(w.intents.get(i.id)!).toMatchObject({ state: 'verified', outcome: 'removed' });
    expect(w.rpcLog.filter((f) => f === 'finish_intent')).toHaveLength(1);
  });

  it('retirement outlives verification: a fresh upload to a verified path is refused, an unrelated fresh path is allowed', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a);
    await run(w);
    expect(w.intents.get(i.id)!.state).toBe('verified');
    expect(() => w.participantUpload(i.path, 'participant-2')).toThrow(/path retired/);
    expect(() => w.participantUpload(`${i.bookingId}/fresh-${uid('x')}.jpg`, 'participant-2')).not.toThrow();
  });

  it('too little lease left: the worker neither authorises nor calls Storage; the intent stays planned for the next lease', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a);
    w.hooks.afterClaim = () => { w.now += LEASE_MS - LEASE_BUDGET_MS + 1; }; // inside the lease, but under the budget
    const res = await run(w);
    expect(res.body).toMatchObject({ intents: { 'skipped:lease_budget': 1 } });
    expect(w.rpcLog).not.toContain('authorize_destroy');
    expect(w.storageLog).toEqual([]);
    expect(w.intents.get(i.id)!.state).toBe('planned');
  });
});

describe('holds', () => {
  it('a hold placed on an already-removed object reports already_removed, never held', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a);
    await run(w);
    const r = (await w.rpc('apply_hold', { p_scope: 'booking', p_booking: i.bookingId, p_user: null, p_reference: 'late-matter' })).data as { items: Record<string, number> };
    expect(r.items).toEqual({ already_removed: 1 });
    expect(w.intents.get(i.id)!.state).toBe('verified');
  });
  it('REGRESSION (finding 2): release_hold writes no account row; a settled account with re-planned intents is reopened by the next worker pass and finalised after the boundary', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'deleted', status: 'deleted' });
    const i = w.addPhoto(a);
    const hold = (await w.rpc('apply_hold', { p_scope: 'booking', p_booking: i.bookingId, p_user: null, p_reference: 'kept' })).data as { hold_id: string };
    w.now += 25 * HOUR;
    await run(w); // finalises as complete_with_retained (held object remains)
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'complete_with_retained' });
    expect(w.accounts.get(a.id)!.closedAt).not.toBeNull();
    await w.rpc('release_hold', { p_hold: hold.hold_id });
    expect(w.accountWritesByRelease).toBe(0);
    expect(w.accounts.get(a.id)!.cleanupState).toBe('complete_with_retained'); // untouched by release
    const res = await run(w);
    // Same pass: the re-planned intent is removed first, then the settled account is selected
    // (nothing held any more) and re-finalised without its stale retained reference.
    expect(w.intents.get(i.id)!.state).toBe('verified');
    expect(res.body).toMatchObject({ cleanup: expect.objectContaining({ 'complete:complete': 1 }) });
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'complete', retainedRef: null });
  });

  it('a hold on a planned intent holds it; release re-plans it; the worker then removes it and the account finalises after the boundary', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'deleted', status: 'deleted' });
    const i = w.addPhoto(a);
    const hold = (await w.rpc('apply_hold', { p_scope: 'user', p_booking: null, p_user: a.userId, p_reference: 'user-matter' })).data as { hold_id: string; items: Record<string, number> };
    expect(hold.items).toEqual({ held: 1 });
    await run(w);
    expect(w.storageLog).toEqual([]);
    w.now += 6 * MIN;
    await run(w);
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'provisional', retainedRef: 'user-matter' });
    await w.rpc('release_hold', { p_hold: hold.hold_id });
    expect(w.intents.get(i.id)!.state).toBe('planned');
    // Lazy reopen (lock order): the account is still provisional until the worker's next pass
    // selects it as a candidate with open work.
    expect(w.accounts.get(a.id)!.cleanupState).toBe('provisional');
    await run(w);
    expect(w.intents.get(i.id)!.state).toBe('verified');
    w.now += 25 * HOUR;
    await run(w);
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'complete', retainedRef: null });
  });
  it('a hold that arrives after authorisation is recorded as authorized_before_hold, not as protection', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a);
    w.hooks.afterAuthorize = async () => {
      const r = (await w.rpc('apply_hold', { p_scope: 'booking', p_booking: i.bookingId, p_user: null, p_reference: 'too-late' })).data as { items: Record<string, number> };
      expect(r.items).toEqual({ authorized_before_hold: 1 });
    };
    await run(w);
    expect(w.intents.get(i.id)!.state).toBe('verified');
  });
});

describe('support-case holds follow the case (finding 6)', () => {
  const caseId = 'case-1';
  it('open case moved from booking A to B: hold on A released with an audit note, B protected', () => {
    const w = new World();
    const acc = w.addAccount();
    const ia = w.addPhoto(acc); const ib = w.addPhoto(acc);
    w.supportCaseChange({ caseId, bookingId: ia.bookingId, status: 'open' });
    expect(w.intents.get(ia.id)!.state).toBe('held');
    w.supportCaseChange({ caseId, bookingId: ib.bookingId, status: 'open', prev: { bookingId: ia.bookingId, status: 'open' } });
    const holdA = w.holds.find((h) => h.bookingId === ia.bookingId)!;
    expect(holdA).toMatchObject({ released: true, releaseNote: 'case reassigned' });
    expect(w.intents.get(ia.id)!.state).toBe('planned');
    expect(w.intents.get(ib.id)!.state).toBe('held');
    expect(w.holds.filter((h) => h.caseId === caseId && !h.released)).toHaveLength(1);
  });
  it('booking association removed from an open case: the old hold is released', () => {
    const w = new World();
    const acc = w.addAccount();
    const ia = w.addPhoto(acc);
    w.supportCaseChange({ caseId, bookingId: ia.bookingId, status: 'open' });
    w.supportCaseChange({ caseId, bookingId: null, status: 'open', prev: { bookingId: ia.bookingId, status: 'open' } });
    expect(w.holds.every((h) => h.released)).toBe(true);
    expect(w.intents.get(ia.id)!.state).toBe('planned');
  });
  it('status and booking changed together (closed + moved): old hold released, no new hold', () => {
    const w = new World();
    const acc = w.addAccount();
    const ia = w.addPhoto(acc); const ib = w.addPhoto(acc);
    w.supportCaseChange({ caseId, bookingId: ia.bookingId, status: 'open' });
    w.supportCaseChange({ caseId, bookingId: ib.bookingId, status: 'closed', prev: { bookingId: ia.bookingId, status: 'open' } });
    expect(w.holds.find((h) => h.bookingId === ia.bookingId)!).toMatchObject({ released: true, releaseNote: 'case closed' });
    expect(w.holds.some((h) => h.bookingId === ib.bookingId)).toBe(false);
    expect(w.intents.get(ib.id)!.state).toBe('planned');
  });
  it('an overlapping legal hold on A keeps A held after the case moves away', () => {
    const w = new World();
    const acc = w.addAccount();
    const ia = w.addPhoto(acc); const ib = w.addPhoto(acc);
    w.apply_hold({ p_scope: 'booking', p_booking: ia.bookingId, p_user: null, p_reference: 'legal-A' });
    w.supportCaseChange({ caseId, bookingId: ia.bookingId, status: 'open' });
    w.supportCaseChange({ caseId, bookingId: ib.bookingId, status: 'open', prev: { bookingId: ia.bookingId, status: 'open' } });
    const legal = w.holds.find((h) => h.reference === 'legal-A')!;
    expect(w.intents.get(ia.id)!).toMatchObject({ state: 'held', holdId: legal.id });
    expect(w.intents.get(ib.id)!.state).toBe('held');
  });
  it('a case moving onto a booking whose object is already past the authorisation boundary records authorized_before_hold', async () => {
    const w = new World();
    const acc = w.addAccount();
    const ia = w.addPhoto(acc); const ib = w.addPhoto(acc);
    w.supportCaseChange({ caseId, bookingId: ia.bookingId, status: 'open' });
    w.hooks.afterAuthorize = async () => {
      w.supportCaseChange({ caseId, bookingId: ib.bookingId, status: 'open', prev: { bookingId: ia.bookingId, status: 'open' } });
      const holdB = w.holds.find((h) => h.bookingId === ib.bookingId && !h.released)!;
      expect(w.holdItems.filter((x) => x.holdId === holdB.id).map((x) => x.outcome)).toEqual(['authorized_before_hold']);
    };
    await run(w); // ia is held (skipped); ib is authorised, then the case moves onto it, then removal completes
    expect(w.intents.get(ib.id)!).toMatchObject({ state: 'verified', outcome: 'removed' });
    expect(w.intents.get(ia.id)!.state).toBe('planned');
  });
  it('a no-op update (same booking, same status) changes nothing', () => {
    const w = new World();
    const acc = w.addAccount();
    const ia = w.addPhoto(acc);
    w.supportCaseChange({ caseId, bookingId: ia.bookingId, status: 'open' });
    const before = w.holds.length;
    w.supportCaseChange({ caseId, bookingId: ia.bookingId, status: 'open', prev: { bookingId: ia.bookingId, status: 'open' } });
    expect(w.holds.length).toBe(before);
    expect(w.holds.filter((h) => !h.released)).toHaveLength(1);
  });
});

describe('completion is provisional until the upload boundary (finding 2)', () => {
  it('after the settling window the account is PROVISIONAL, not complete, and not closed', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'deleted', status: 'deleted' });
    w.addPhoto(a);
    await run(w);
    w.now += 6 * MIN;
    const res = await run(w);
    expect(res.body).toMatchObject({ cleanup: { 'pending:awaiting_boundary': 1 } });
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'provisional', closedAt: null, finalSweepAt: null });
  });

  it('a zero-photo account is provisional until the boundary and complete only after a final sweep at or past it', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'deleted', status: 'deleted' });
    await run(w);
    expect(w.accounts.get(a.id)!.cleanupState).toBe('pending');
    w.now += 6 * MIN;
    await run(w);
    expect(w.accounts.get(a.id)!.cleanupState).toBe('provisional');
    w.now += 23 * HOUR; // still before the boundary
    await run(w);
    expect(w.accounts.get(a.id)!.cleanupState).toBe('provisional');
    w.now += 2 * HOUR; // past it
    const res = await run(w);
    expect(res.body).toMatchObject({ cleanup: { 'complete:complete': 1 } });
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'complete' });
    expect(w.accounts.get(a.id)!.finalSweepAt).toBe(w.now);
    expect(w.accounts.get(a.id)!.closedAt).not.toBeNull();
  });

  it('an object arriving after the last periodic sweep and before the boundary is found by the next sweep, removed, and the account finalises only after the boundary', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'deleted', status: 'deleted' });
    const i = w.addPhoto(a);
    await run(w);
    w.now += 6 * MIN;
    await run(w); // provisional; last sweep now
    w.now += 30 * MIN;
    await run(w); // < 1 h: not swept again
    const late = w.addOrphanObject(a, i.bookingId as string); // lands after the last sweep
    w.now += 45 * MIN; // > 1 h since the last sweep, still well before the boundary
    const res = await run(w);
    expect(res.body).toMatchObject({ cleanup: { 'pending:reopened': 1 } });
    expect(w.accounts.get(a.id)!.cleanupState).toBe('pending');
    await run(w);
    expect(w.objectAt('booking-photos', late)).toBeUndefined();
    expect(w.accounts.get(a.id)!.cleanupState).toBe('provisional');
    w.now += 24 * HOUR;
    await run(w);
    expect(w.accounts.get(a.id)!.cleanupState).toBe('complete');
  });

  it('no worker runs until well after the boundary: the account is still selected, the late object is caught, and finalisation is delayed rather than skipped', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'deleted', status: 'deleted' });
    const i = w.addPhoto(a);
    await run(w);
    w.now += 6 * MIN;
    await run(w); // provisional
    w.now += 2 * HOUR;
    const late = w.addOrphanObject(a, i.bookingId as string);
    w.now += 3 * 24 * HOUR; // outage across the boundary
    const first = await run(w);
    expect(first.body).toMatchObject({ cleanup: { 'pending:reopened': 1 } });
    await settle(w, 2);
    expect(w.objectAt('booking-photos', late)).toBeUndefined();
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'complete' });
    expect(w.accounts.get(a.id)!.finalSweepAt).not.toBeNull();
  });

  it('a provisional account with a passed boundary is selected on EVERY run until finalised (not once per hour)', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'deleted', status: 'deleted' });
    w.now += 6 * MIN;
    await run(w); // provisional
    w.now += 25 * HOUR;
    w.storageMode = 'throw'; // irrelevant to the sweep; just proves selection is independent of storage
    const before = w.rpcLog.filter((f) => f === 'try_complete_cleanup').length;
    await run(w);
    expect(w.rpcLog.filter((f) => f === 'try_complete_cleanup').length).toBe(before + 1);
    expect(w.accounts.get(a.id)!.cleanupState).toBe('complete');
  });

  it('REGRESSION: an object reappearing at an already-inventoried path (trusted actor) cannot be reported complete — the uncovered check runs after every sweep', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'deleted', status: 'deleted' });
    const i = w.addPhoto(a);
    await run(w);
    w.now += 6 * MIN;
    await run(w); // provisional
    w.objects.set(`booking-photos/${i.path}`, { id: 'reused-path', owner: a.userId }); // ON CONFLICT would insert nothing
    w.now += 25 * HOUR;
    const res = await run(w);
    expect(res.body).toMatchObject({ cleanup: { 'pending:uninventoried_owned_data': 1 } });
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'needs_operator', closedAt: null });
  });

  it('a completed account is never reopened by the sweep machinery (terminal), and never selected again', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'deleted', status: 'deleted' });
    w.now += 25 * HOUR;
    await run(w);
    expect(w.accounts.get(a.id)!.cleanupState).toBe('complete');
    const before = w.rpcLog.filter((f) => f === 'try_complete_cleanup').length;
    w.now += 5 * HOUR;
    await run(w);
    expect(w.rpcLog.filter((f) => f === 'try_complete_cleanup').length).toBe(before);
  });
});

describe('account-level auth recovery', () => {
  it('a not_started account is claimed only after the grace period, then deleted; closed only once cleanup is final', async () => {
    const w = new World();
    const a = w.addAccount({ cleanupState: 'complete' });
    await run(w);
    expect(w.authLog).toEqual([]);
    w.now += 3 * MIN;
    await run(w);
    expect(w.authLog).toEqual([`ban:${a.userId}`, `delete:${a.userId}`]);
    expect(w.accounts.get(a.id)!).toMatchObject({ authState: 'deleted', status: 'deleted' });
    expect(w.accounts.get(a.id)!.closedAt).not.toBeNull();
  });
  it('zero photos + failed auth deletion: retried from the account lease with no intent row involved', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'pending_retry' });
    w.authOutcomes = [{ status: 503, message: 'gateway' }, null];
    await run(w);
    expect(w.accounts.get(a.id)!).toMatchObject({ authState: 'pending_retry', authAttempts: 1, authLastErrorClass: 'transient' });
    w.now += 2 * MIN;
    await run(w);
    expect(w.accounts.get(a.id)!.authState).toBe('deleted');
    expect(w.intents.size).toBe(0);
  });
  it('"user not found" counts as deleted; a dependency refusal waits at least ten minutes', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'pending_retry' });
    w.authOutcomes = [{ status: 500, message: 'violates foreign key constraint' }, { status: 404, message: 'User not found' }];
    await run(w);
    const d = w.accounts.get(a.id)!;
    expect(d).toMatchObject({ authState: 'pending_retry', authLastErrorClass: 'dependency' });
    expect(d.authNextAttemptAt! - w.now).toBeGreaterThanOrEqual(10 * MIN);
    w.now += 11 * MIN;
    await run(w);
    expect(w.accounts.get(a.id)!.authState).toBe('deleted');
  });
  it('a permission refusal goes to the operator immediately; the ceiling does too', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'pending_retry' });
    w.authOutcomes = [{ status: 403, message: 'forbidden' }];
    await run(w);
    expect(w.accounts.get(a.id)!).toMatchObject({ authState: 'needs_operator', authLastErrorClass: 'permission' });
    const b = w.addAccount({ authState: 'pending_retry', authAttempts: 9 });
    w.authOutcomes = [{ status: 503, message: 'gateway' }];
    await run(w);
    expect(w.accounts.get(b.id)!).toMatchObject({ authState: 'needs_operator', authLastErrorClass: 'attempt_ceiling' });
  });
  it('within one run, cleanup settlement is attempted before auth retries', async () => {
    const w = new World();
    w.addAccount({ authState: 'pending_retry', cleanupEligibleAt: w.now });
    await run(w);
    expect(w.rpcLog.indexOf('list_cleanup_candidates')).toBeLessThan(w.rpcLog.indexOf('claim_auth_work'));
  });
});

describe('recovery review: crash before auth, zero photos, held photos, dependency refusals', () => {
  it('held photo + auth refused for remaining objects (provisional, only held work left): operator immediately, no endless cycle', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'pending_retry' });
    const i = w.addPhoto(a);
    await w.rpc('apply_hold', { p_scope: 'booking', p_booking: i.bookingId, p_user: null, p_reference: 'evidence-7' });
    w.authOutcomes = [{ status: 500, message: 'violates foreign key constraint' }];
    w.now += 6 * MIN;
    await run(w);
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'provisional', authState: 'needs_operator', authLastErrorClass: 'dependency' });
    const deletes = () => w.authLog.filter((l) => l.startsWith('delete:')).length;
    expect(deletes()).toBe(1);
    for (let n = 0; n < 5; n += 1) { w.now += 300 * MIN; await run(w); }
    expect(deletes()).toBe(1);
    expect(w.storageLog).toEqual([]);
    expect(w.intents.get(i.id)!.state).toBe('held');
    expect(w.accounts.get(a.id)!.cleanupState).toBe('complete_with_retained');
  });
  it('dependency refusal while cleanup is still pending: retried after cleanup finished the objects', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'pending_retry' });
    const i = w.addPhoto(a);
    w.storageMode = 'transient';
    w.authOutcomes = [{ status: 500, message: 'violates foreign key constraint' }, null];
    await run(w);
    expect(w.accounts.get(a.id)!).toMatchObject({ authState: 'pending_retry', authLastErrorClass: 'dependency', cleanupState: 'pending' });
    w.storageMode = 'normal';
    w.now += 11 * MIN;
    await run(w);
    expect(w.intents.get(i.id)!.state).toBe('verified');
    expect(w.accounts.get(a.id)!).toMatchObject({ authState: 'deleted', cleanupState: 'provisional', closedAt: null });
    w.now += 25 * HOUR;
    await run(w);
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'complete' });
    expect(w.accounts.get(a.id)!.closedAt).not.toBeNull();
  });
  it('crash before the first auth attempt with photos: photos and auth both recovered by the worker', async () => {
    const w = new World();
    const a = w.addAccount();
    const i = w.addPhoto(a);
    w.now += 3 * MIN;
    await run(w);
    expect(w.intents.get(i.id)!.state).toBe('verified');
    expect(w.accounts.get(a.id)!.authState).toBe('deleted');
    w.now += 3 * MIN;
    await run(w);
    expect(w.accounts.get(a.id)!.cleanupState).toBe('provisional');
  });
});

describe('0061: partial hold release with a failing intent is reflected at account level (review finding)', () => {
  it('REGRESSION: complete_with_retained, two holds; one released; the released intent becomes needs_operator in the intents stage; the account MUST become needs_operator in the same pass, not stay complete', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'deleted', status: 'deleted' });
    const i1 = w.addPhoto(a); const i2 = w.addPhoto(a);
    const hA = (await w.rpc('apply_hold', { p_scope: 'booking', p_booking: i1.bookingId, p_user: null, p_reference: 'hold-A' })).data as { hold_id: string };
    await w.rpc('apply_hold', { p_scope: 'booking', p_booking: i2.bookingId, p_user: null, p_reference: 'hold-B' });
    w.now += 25 * HOUR;
    await run(w);
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'complete_with_retained', retainedRef: 'hold-A; hold-B' });
    expect(w.accounts.get(a.id)!.closedAt).not.toBeNull();
    // Release A only. B still holds i2.
    await w.rpc('release_hold', { p_hold: hA.hold_id });
    expect(w.intents.get(i1.id)!.state).toBe('planned');
    // Next pass: the intents stage runs first and i1 fails with a permission error → needs_operator,
    // BEFORE list_cleanup_candidates runs.
    w.storageMode = 'permission';
    const res = await run(w);
    expect(w.intents.get(i1.id)!).toMatchObject({ state: 'needs_operator', lastErrorClass: 'permission' });
    expect(w.intents.get(i2.id)!.state).toBe('held');
    // Under revision 4 the account was not a candidate here (no open work, one intent still held).
    expect(res.body).toMatchObject({ cleanup: expect.objectContaining({ 'pending:intent_needs_operator': 1 }) });
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'needs_operator', closedAt: null });
  });

  it('REGRESSION: a successful partial release refreshes retained_exception_ref to the remaining hold, and a full release finalises as complete', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'deleted', status: 'deleted' });
    const i1 = w.addPhoto(a); const i2 = w.addPhoto(a);
    const hA = (await w.rpc('apply_hold', { p_scope: 'booking', p_booking: i1.bookingId, p_user: null, p_reference: 'hold-A' })).data as { hold_id: string };
    const hB = (await w.rpc('apply_hold', { p_scope: 'booking', p_booking: i2.bookingId, p_user: null, p_reference: 'hold-B' })).data as { hold_id: string };
    w.now += 25 * HOUR;
    await run(w);
    expect(w.accounts.get(a.id)!.retainedRef).toBe('hold-A; hold-B');
    await w.rpc('release_hold', { p_hold: hA.hold_id });
    await run(w); // i1 removed in the intents stage; the account is re-finalised in the same pass
    expect(w.intents.get(i1.id)!).toMatchObject({ state: 'verified', outcome: 'removed' });
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'complete_with_retained', retainedRef: 'hold-B' });
    await run(w); // stable: not selected again while nothing changed
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'complete_with_retained', retainedRef: 'hold-B' });
    await w.rpc('release_hold', { p_hold: hB.hold_id });
    await run(w);
    expect(w.accounts.get(a.id)!).toMatchObject({ cleanupState: 'complete', retainedRef: null });
    expect(w.accounts.get(a.id)!.closedAt).not.toBeNull();
  });
});

describe('truthful combined state', () => {
  it('auth deleted with cleanup pending, and auth pending with cleanup provisional, are both representable and neither is closed', async () => {
    const w = new World();
    const a = w.addAccount({ authState: 'deleted', status: 'deleted' });
    w.addPhoto(a);
    w.storageMode = 'transient';
    await run(w);
    expect(w.accounts.get(a.id)!).toMatchObject({ authState: 'deleted', cleanupState: 'pending', closedAt: null });
    const b = w.addAccount({ authState: 'pending_retry', authNextAttemptAt: w.now + 60 * MIN, cleanupEligibleAt: w.now });
    await run(w);
    expect(w.accounts.get(b.id)!).toMatchObject({ authState: 'pending_retry', cleanupState: 'provisional', closedAt: null });
  });
});
