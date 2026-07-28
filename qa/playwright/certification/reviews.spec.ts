import { test, expect, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import { anonContext, authedContextWithUser } from '../support/connected/qa-client';
import { createCustomerBooking, assignProvider, deleteBookingsByIds } from '../support/connected/qa-bookings';
import {
  makeCompletedBooking,
  insertReviewRaw,
  getReviewsByBooking,
  editReview,
  setHidden,
  deleteReviewRaw,
  getBreakdown,
  getOwnProfileRating,
  insertPrivateFeedbackRaw,
  readPrivateFeedback,
} from '../support/connected/qa-reviews';

/**
 * Phase 2C — Reviews & Ratings (CONNECTED).
 *
 * Exercises the REAL reviews domain of the dedicated QA project: eligibility +
 * booking/participant integrity, one-review-per-booking, rating + tag integrity,
 * RLS visibility, the author-only edit_review RPC, admin hide/unhide, the absence
 * of a delete path, provider-rating aggregation, and private-feedback visibility.
 * User-path tests use role tokens; admin/aggregate paths are labelled. Every
 * booking (cascading its review + private feedback + aggregate recompute) is deleted
 * in afterAll. Chromium-only; gated on certificationConfigured() (never production).
 *
 * Scope: connected database/RLS validation only — NOT the UI review flow, moderation
 * UX, push notifications, public review display, or native review behavior.
 */
const P1 = { name: 'QA Provider One', phone: '+254700000001' };
const P2 = { name: 'QA Provider Two', phone: '+254700000002' };

test.describe('Phase 2C — Reviews & Ratings', { tag: ['@certification', '@connected'] }, () => {
  let customerCtx: APIRequestContext;
  let customerId: string;
  let provider1Ctx: APIRequestContext;
  let provider1Id: string;
  let provider2Ctx: APIRequestContext;
  let provider2Id: string;
  let adminCtx: APIRequestContext;
  const bookingIds: string[] = [];

  test.beforeAll(async ({}, testInfo) => {
    if (!certificationConfigured() || testInfo.project.name !== 'chromium') return;
    const c = await authedContextWithUser('customer');
    customerCtx = c.ctx;
    customerId = c.userId;
    const p1 = await authedContextWithUser('provider1');
    provider1Ctx = p1.ctx;
    provider1Id = p1.userId;
    const p2 = await authedContextWithUser('provider2');
    provider2Ctx = p2.ctx;
    provider2Id = p2.userId;
    adminCtx = await authedContextWithUser('admin').then((a) => a.ctx);
  });

  test.afterAll(async () => {
    if (bookingIds.length) await deleteBookingsByIds(bookingIds);
    await customerCtx?.dispose();
    await provider1Ctx?.dispose();
    await provider2Ctx?.dispose();
    await adminCtx?.dispose();
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(testInfo.project.name !== 'chromium', 'Connected coverage is Chromium-only.');
  });

  /** A completed booking assigned to provider1 (review-eligible); tracked for cleanup. */
  async function completed(provider = P1, providerCtx = provider1Ctx, providerId = provider1Id) {
    const id = await makeCompletedBooking({ customerCtx, customerId, providerCtx, adminCtx, provider: { providerId, ...provider } });
    bookingIds.push(id);
    return id;
  }

  // ── Eligibility & participant integrity ───────────────────────────────────

  test('eligibility: the customer of a completed booking can review the assigned provider', { tag: ['@p1'] }, async () => {
    const bookingId = await completed();
    const r = await insertReviewRaw(customerCtx, { booking_id: bookingId, customer_id: customerId, provider_id: provider1Id, rating: 5, comment: 'Great work' });
    expect(r.status, 'review accepted').toBe(201);
    const [row] = await getReviewsByBooking(customerCtx, bookingId);
    expect(row.booking_id).toBe(bookingId);
    expect(row.customer_id).toBe(customerId);
    expect(row.provider_id).toBe(provider1Id);
    expect(Number(row.rating)).toBe(5);
    expect(row.comment).toBe('Great work');
  });

  test('eligibility: a booking that is not completed cannot be reviewed', { tag: ['@p1', '@security'] }, async () => {
    // Assigned but NOT progressed to completed.
    const booking = await createCustomerBooking(customerCtx, customerId);
    bookingIds.push(booking.id);
    await assignProvider(adminCtx, booking.id, { providerId: provider1Id, ...P1 });
    const r = await insertReviewRaw(customerCtx, { booking_id: booking.id, customer_id: customerId, provider_id: provider1Id, rating: 5 });
    expect(r.status, 'non-completed booking not reviewable').not.toBe(201);
  });

  test('authorization: a provider cannot author a customer review', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await completed();
    const r = await insertReviewRaw(provider1Ctx, { booking_id: bookingId, customer_id: provider1Id, provider_id: provider1Id, rating: 5 });
    expect(r.status, 'provider-authored review denied').not.toBe(201);
  });

  test('authorization: an anonymous user cannot create a review', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await completed();
    const anon = await anonContext();
    try {
      const res = await anon.post('/rest/v1/reviews', {
        headers: { 'Content-Type': 'application/json' },
        data: { booking_id: bookingId, customer_id: customerId, provider_id: provider1Id, rating: 5 },
      });
      expect([401, 403]).toContain(res.status());
    } finally {
      await anon.dispose();
    }
  });

  test('participant integrity: the review provider must be the booking’s assigned provider', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await completed(); // assigned to provider1
    const r = await insertReviewRaw(customerCtx, { booking_id: bookingId, customer_id: customerId, provider_id: provider2Id, rating: 5 });
    expect(r.status, 'mismatched provider_id denied').not.toBe(201);
  });

  // ── One-review-per-booking ────────────────────────────────────────────────

  test('one-review-per-booking: a second review for the same booking is rejected', { tag: ['@p1', '@integrity'] }, async () => {
    const bookingId = await completed();
    expect((await insertReviewRaw(customerCtx, { booking_id: bookingId, customer_id: customerId, provider_id: provider1Id, rating: 4 })).status).toBe(201);
    const dup = await insertReviewRaw(customerCtx, { booking_id: bookingId, customer_id: customerId, provider_id: provider1Id, rating: 3 });
    expect(dup.status, 'duplicate rejected (unique booking_id)').toBe(409);
    expect(await getReviewsByBooking(customerCtx, bookingId), 'exactly one review').toHaveLength(1);
  });

  // ── Rating & tag integrity ────────────────────────────────────────────────

  test('rating integrity: out-of-range, fractional, and null ratings are rejected; min/max are accepted', { tag: ['@p1', '@security'] }, async () => {
    const bookingA = await completed();
    for (const bad of [0, 6, 4.5, null] as (number | null)[]) {
      const r = await insertReviewRaw(customerCtx, { booking_id: bookingA, customer_id: customerId, provider_id: provider1Id, rating: bad });
      expect(r.status, `rating ${bad} rejected`).not.toBe(201);
    }
    // Failed inserts created no row → the booking is still reviewable with a valid min rating.
    expect((await insertReviewRaw(customerCtx, { booking_id: bookingA, customer_id: customerId, provider_id: provider1Id, rating: 1 })).status, 'min rating accepted').toBe(201);
    const bookingB = await completed();
    expect((await insertReviewRaw(customerCtx, { booking_id: bookingB, customer_id: customerId, provider_id: provider1Id, rating: 5 })).status, 'max rating accepted').toBe(201);
  });

  test('tag integrity: allowed tags persist and a disallowed tag is rejected', { tag: ['@p1', '@security'] }, async () => {
    const ok = await completed();
    expect((await insertReviewRaw(customerCtx, { booking_id: ok, customer_id: customerId, provider_id: provider1Id, rating: 4, tags: ['on_time', 'friendly'] })).status, 'allowed tags accepted').toBe(201);
    const bad = await completed();
    expect((await insertReviewRaw(customerCtx, { booking_id: bad, customer_id: customerId, provider_id: provider1Id, rating: 4, tags: ['bogus_tag'] })).status, 'disallowed tag rejected').not.toBe(201);
  });

  // ── Read authorization / visibility ───────────────────────────────────────

  test('RLS visibility: a review is visible to its customer, the provider (if not hidden), and admin only', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await completed();
    const ins = await insertReviewRaw(customerCtx, { booking_id: bookingId, customer_id: customerId, provider_id: provider1Id, rating: 5 });
    expect(ins.status).toBe(201);

    expect(await getReviewsByBooking(customerCtx, bookingId), 'customer sees it').toHaveLength(1);
    expect(await getReviewsByBooking(provider1Ctx, bookingId), 'provider sees non-hidden').toHaveLength(1);
    expect(await getReviewsByBooking(adminCtx, bookingId), 'admin sees it').toHaveLength(1);
    expect(await getReviewsByBooking(provider2Ctx, bookingId), 'other provider sees none').toHaveLength(0);
    const anon = await anonContext();
    try {
      const res = await anon.get(`/rest/v1/reviews?booking_id=eq.${bookingId}&select=id`);
      expect(await res.json()).toEqual([]);
    } finally {
      await anon.dispose();
    }

    // Admin hides → provider can no longer see it; customer + admin still can.
    expect((await setHidden(adminCtx, ins.id as string, true)).changed).toBe(true);
    expect(await getReviewsByBooking(provider1Ctx, bookingId), 'provider cannot see hidden').toHaveLength(0);
    expect(await getReviewsByBooking(customerCtx, bookingId), 'customer still sees own hidden review').toHaveLength(1);
    expect(await getReviewsByBooking(adminCtx, bookingId), 'admin still sees it').toHaveLength(1);
  });

  // ── Update ────────────────────────────────────────────────────────────────

  test('update: the author can edit within the window; a non-author and direct writes are denied', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await completed();
    const ins = await insertReviewRaw(customerCtx, { booking_id: bookingId, customer_id: customerId, provider_id: provider1Id, rating: 3, comment: 'ok' });
    const reviewId = ins.id as string;

    // Author edits (recent) → allowed.
    expect((await editReview(customerCtx, reviewId, { comment: 'edited', rating: 4 })).status, 'author edit ok').toBeLessThan(300);
    expect(Number((await getReviewsByBooking(customerCtx, bookingId))[0].rating)).toBe(4);

    // Non-author edit → denied by edit_review's ownership check.
    const nonAuthor = await editReview(provider1Ctx, reviewId, { comment: 'hijack', rating: 1 });
    expect(nonAuthor.status, 'non-author edit denied').toBe(400);

    // Direct table UPDATE by the customer → denied (only reviews_update_admin exists).
    const direct = await customerCtx.patch(`/rest/v1/reviews?id=eq.${reviewId}`, {
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      data: { rating: 1 },
    });
    expect(((await direct.json()) as unknown[]).length, 'customer direct update changes nothing').toBe(0);
  });

  // ── Delete (unsupported) ──────────────────────────────────────────────────

  test('delete: reviews have no delete path — neither customer nor admin can delete a review row', { tag: ['@p1', '@integrity'] }, async () => {
    const bookingId = await completed();
    const ins = await insertReviewRaw(customerCtx, { booking_id: bookingId, customer_id: customerId, provider_id: provider1Id, rating: 4 });
    const reviewId = ins.id as string;
    expect((await deleteReviewRaw(customerCtx, reviewId)).deleted, 'customer delete removes nothing').toBe(0);
    expect((await deleteReviewRaw(adminCtx, reviewId)).deleted, 'admin delete removes nothing (no delete policy)').toBe(0);
    expect(await getReviewsByBooking(adminCtx, bookingId), 'review still present').toHaveLength(1);
  });

  // ── Aggregate rating ──────────────────────────────────────────────────────

  test('aggregate: a review updates the provider count/average; hiding recomputes it', { tag: ['@p1', '@integrity'] }, async () => {
    const before = await getBreakdown(adminCtx, provider2Id);
    const count0 = Number(before.review_count ?? 0);

    const bookingId = await completed(P2, provider2Ctx, provider2Id);
    const ins = await insertReviewRaw(customerCtx, { booking_id: bookingId, customer_id: customerId, provider_id: provider2Id, rating: 4 });
    expect(ins.status).toBe(201);

    const after = await getBreakdown(adminCtx, provider2Id);
    expect(Number(after.review_count), 'count incremented by one').toBe(count0 + 1);
    expect(Number(after.overall_avg), 'average within valid range').toBeGreaterThanOrEqual(1);
    // Provider's own profile aggregate reflects it too.
    expect(Number((await getOwnProfileRating(provider2Ctx, provider2Id)).review_count)).toBe(count0 + 1);

    // Hiding excludes it from the aggregate; unhiding restores it (no inflation).
    await setHidden(adminCtx, ins.id as string, true);
    expect(Number((await getBreakdown(adminCtx, provider2Id)).review_count), 'hidden excluded').toBe(count0);
    await setHidden(adminCtx, ins.id as string, false);
    expect(Number((await getBreakdown(adminCtx, provider2Id)).review_count), 'unhide restores, no inflation').toBe(count0 + 1);
  });

  // ── Private feedback visibility ───────────────────────────────────────────

  test('private feedback: only the authoring customer (and admin) can read it — never the provider', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await completed();
    const ins = await insertReviewRaw(customerCtx, { booking_id: bookingId, customer_id: customerId, provider_id: provider1Id, rating: 5 });
    const reviewId = ins.id as string;

    const pf = await insertPrivateFeedbackRaw(customerCtx, { review_id: reviewId, customer_id: customerId, provider_id: provider1Id, feedback: 'for admin only' });
    expect(pf.status, 'author private feedback accepted').toBe(201);

    expect(await readPrivateFeedback(customerCtx, reviewId), 'author reads own feedback').toHaveLength(1);
    expect(await readPrivateFeedback(adminCtx, reviewId), 'admin reads feedback').toHaveLength(1);
    expect(await readPrivateFeedback(provider1Ctx, reviewId), 'provider can NEVER read private feedback').toHaveLength(0);
    expect(await readPrivateFeedback(provider2Ctx, reviewId), 'other provider cannot read').toHaveLength(0);
  });
});
