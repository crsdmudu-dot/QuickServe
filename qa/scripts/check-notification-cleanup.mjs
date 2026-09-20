#!/usr/bin/env node
/**
 * check-notification-cleanup.mjs — OFFLINE static proof that the provider-onboarding notification
 * cleanup is exactly scoped.
 *
 * WHY THIS EXISTS. Creating a provider profile fires tg_notify_provider_pending (migration 0020),
 * which fans an admin notification out with p_booking_id NULL. That row has no booking, so
 * booking-scoped marker cleanup cannot reach it, and its user_id is the ADMIN recipient rather than
 * the created provider, so deleting the provider user does not remove it either. Certification runs
 * therefore accumulated one row each.
 *
 * The only safe handle is dedup_key. tg_notify_provider_pending passes a BASE of
 *     <profile id>:admin_provider_pending
 * to notify_admins, which fans out one row per approved admin and appends the recipient:
 *     p_dedup_base || ':' || r.id::text
 * so the stored value is <profile id>:admin_provider_pending:<admin id>. Matching the base
 * alone deletes NOTHING, which is precisely the defect this check now guards against.
 *
 * Cleanup must therefore match the TYPE, a NULL booking_id and an exact member of the composed
 * key set together. A bare type delete, a UUID prefix match, a LIKE pattern or a time window
 * would all be capable of destroying genuine admin notifications and none can prove ownership.
 *
 * This check reads source files only. It performs no network call, touches no database and needs no
 * dependency, so it runs in the offline stage of the release gate rather than requiring a connected
 * Playwright run.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const QA_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH = path.join(QA_ROOT, 'playwright/support/connected/qa-auth.ts');
const SPEC = path.join(QA_ROOT, 'playwright/certification/onboarding.spec.ts');

const auth = fs.readFileSync(AUTH, 'utf8');
const spec = fs.readFileSync(SPEC, 'utf8');

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
  }
}

/** Every `/rest/v1/notifications` request template in the helper source. */
const notificationQueries = [...auth.matchAll(/`\/rest\/v1\/notifications\?[^`]*`/g)].map((m) => m[0]);
/** Only the destructive ones: those passed to svc.delete(...). */
const deleteQueries = [...auth.matchAll(/svc\.delete\(\s*`(\/rest\/v1\/notifications\?[^`]*)`/g)].map((m) => m[1]);

console.log('cleanup queries found');
check('at least one notifications query exists', notificationQueries.length > 0);
check('at least one notification DELETE exists', deleteQueries.length > 0);

console.log('\nevery notification DELETE carries all three exact predicates');
for (const [i, q] of deleteQueries.entries()) {
  check(`#${i} matches the exact type`, q.includes('type=eq.${PROVIDER_PENDING_NOTIFICATION_TYPE}'));
  check(`#${i} requires booking_id IS NULL`, q.includes('booking_id=is.null'));
  check(`#${i} matches dedup_key by exact set membership`, q.includes('dedup_key=in.$'));
  check(
    `#${i} draws that set from the retained fixture id`,
    auth.includes('providerPendingDedupKeys(profileId, recipients)'),
  );
  check(`#${i} url-encodes the key`, q.includes('encodeURIComponent('));
}

console.log('\nno predicate capable of matching a genuine notification');
for (const [i, q] of deleteQueries.entries()) {
  check(`#${i} uses no LIKE/pattern match`, !/=like\.|=ilike\.|\*/.test(q));
  check(`#${i} uses no time window`, !/created_at|gte\.|lte\.|gt\.|lt\./.test(q));
  check(`#${i} is not a bare type delete`, !/^\/rest\/v1\/notifications\?type=eq\.[^&]*$/.test(q));
  check(`#${i} does not filter by user_id`, !q.includes('user_id='));
}

console.log('\ndedup key matches what notify_admins actually stores');
// The first version of this cleanup matched the BASE key alone and silently deleted nothing:
// tg_notify_provider_pending passes the base to notify_admins, which appends the recipient
// admin id per fan-out row. Assert the COMPOSITION, not just the shape of the predicates —
// shape alone is exactly what let the defect through.
check(
  'composes the key from the base AND a recipient admin id',
  /adminIds\.map\(\(adminId\) => `\$\{base\}:\$\{adminId\}`\)/.test(auth),
);
check(
  'resolves the approved admin recipients from profiles',
  auth.includes('role=eq.admin&approval_status=eq.approved'),
);
check(
  'no delete matches the bare base key',
  deleteQueries.every((q) => !q.includes('dedup_key=eq.$')),
);
check(
  'the delete reports how many rows it removed',
  auth.includes("Prefer: 'return=representation'") && /return Array\.isArray\(removed\)/.test(auth),
);

console.log('\nordering and lifecycle');
const sweepBody = auth.slice(auth.indexOf('export async function sweepEphemeralUsers'));
const sweepNotificationDelete = sweepBody.indexOf('deleteProviderPendingNotification(u.id, recipients)');
const sweepUserDelete = sweepBody.indexOf('/auth/v1/admin/users/${u.id}');
check('the sweep deletes the notification before the user', sweepNotificationDelete > -1 && sweepNotificationDelete < sweepUserDelete);
check('the base helper mirrors the trigger base format', /return `\$\{profileId\}:\$\{PROVIDER_PENDING_NOTIFICATION_TYPE\}`/.test(auth));
check('the type constant is the trigger value', auth.includes("PROVIDER_PENDING_NOTIFICATION_TYPE = 'admin_provider_pending'"));

console.log('\nonboarding fixture teardown');
check('records a pre-run baseline', spec.includes('providerPendingBaseline = await countProviderPendingNotifications()'));
check('the fixture resolves recipients before deleting', spec.includes('await approvedAdminProfileIds()'));
check('deletes each fixture notification by id', spec.includes('await deleteProviderPendingNotification(id, recipients)'));
const notifAt = spec.indexOf('await deleteProviderPendingNotification(id, recipients)');
const userAt = spec.indexOf('await adminDeleteUser(id)');
check('removes the notification before the user', notifAt > -1 && notifAt < userAt);
check('continues across ids after a failure', spec.includes('failures.push('));
check('surfaces cleanup failures instead of swallowing them', /throw new Error\(`onboarding cleanup failures/.test(spec));
check('asserts a delta-zero count, not an absolute one', spec.includes('.toBe(') && spec.includes('providerPendingBaseline'));

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
