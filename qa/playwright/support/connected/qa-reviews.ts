import { type APIRequestContext } from '@playwright/test';
import { createCustomerBooking, assignProvider, setBookingStatus, type ProviderInfo } from './qa-bookings';
import { rpc } from './qa-payments';

/**
 * qa-reviews.ts — connected reviews & ratings primitives (Phase 2C).
 *
 * Drives the REAL reviews domain of the dedicated QA project: direct RLS-guarded
 * inserts into `reviews` (the app's submit path), the `edit_review` RPC (author +
 * 24h window), admin hide/unhide, `review_private_feedback`, and the aggregate read
 * `get_provider_rating_breakdown`. No service-role bypass for behavior under test.
 * All rows cascade on booking delete, so cleanup reuses booking teardown.
 */

export type ReviewInsert = {
  booking_id: string;
  customer_id: string;
  provider_id: string;
  rating: number | string | null;
  comment?: string | null;
  tags?: string[];
  quality_rating?: number;
  would_recommend?: boolean;
};

/** Raw insert into reviews (the app's submit path) — returns HTTP status (for positive AND negative). */
export async function insertReviewRaw(
  ctx: APIRequestContext,
  r: ReviewInsert,
): Promise<{ status: number; id: string | null; text: string }> {
  const res = await ctx.post('/rest/v1/reviews', {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data: {
      booking_id: r.booking_id,
      customer_id: r.customer_id,
      provider_id: r.provider_id,
      rating: r.rating,
      ...(r.comment !== undefined ? { comment: r.comment } : {}),
      ...(r.tags !== undefined ? { tags: r.tags } : {}),
      ...(r.quality_rating !== undefined ? { quality_rating: r.quality_rating } : {}),
      ...(r.would_recommend !== undefined ? { would_recommend: r.would_recommend } : {}),
    },
  });
  const status = res.status();
  if (status === 201) {
    const arr = (await res.json()) as Record<string, unknown>[];
    return { status, id: (arr[0]?.id as string) ?? null, text: '' };
  }
  return { status, id: null, text: await res.text() };
}

/** Read reviews visible to ctx for a booking (RLS applies). */
export async function getReviewsByBooking(ctx: APIRequestContext, bookingId: string): Promise<Record<string, unknown>[]> {
  const res = await ctx.get(`/rest/v1/reviews?booking_id=eq.${bookingId}&select=id,booking_id,customer_id,provider_id,rating,comment,is_hidden`);
  if (res.status() !== 200) throw new Error(`getReviewsByBooking HTTP ${res.status()} — ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>[];
}

/** Author edits a review via the edit_review RPC (author-only, 24h window). */
export function editReview(
  ctx: APIRequestContext,
  reviewId: string,
  fields: { comment?: string; rating?: number; tags?: string[] } = {},
) {
  return rpc(ctx, 'edit_review', {
    p_review_id: reviewId,
    p_comment: fields.comment ?? null,
    p_rating: fields.rating ?? 5,
    p_quality: null,
    p_punctuality: null,
    p_communication: null,
    p_professionalism: null,
    p_value: null,
    p_would_recommend: null,
    p_tags: fields.tags ?? [],
  });
}

/** Admin hides/unhides a review (reviews_update_admin) — returns the PATCH result. */
export async function setHidden(adminCtx: APIRequestContext, reviewId: string, hidden: boolean) {
  const res = await adminCtx.patch(`/rest/v1/reviews?id=eq.${reviewId}`, {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data: { is_hidden: hidden },
  });
  const status = res.status();
  const rows = status === 200 ? ((await res.json()) as unknown[]) : [];
  return { status, changed: rows.length > 0 };
}

/** Raw DELETE on a review (to prove no delete policy) — returns HTTP status + rows deleted. */
export async function deleteReviewRaw(ctx: APIRequestContext, reviewId: string): Promise<{ status: number; deleted: number }> {
  const res = await ctx.delete(`/rest/v1/reviews?id=eq.${reviewId}`, { headers: { Prefer: 'return=representation' } });
  const status = res.status();
  const rows = status === 200 ? ((await res.json()) as unknown[]).length : 0;
  return { status, deleted: rows };
}

/** Provider-rating breakdown over NON-HIDDEN reviews (SECURITY DEFINER read). */
export async function getBreakdown(ctx: APIRequestContext, providerId: string): Promise<Record<string, unknown>> {
  const r = await rpc(ctx, 'get_provider_rating_breakdown', { p_provider_id: providerId });
  const body = r.body as Record<string, unknown>[] | Record<string, unknown>;
  return (Array.isArray(body) ? body[0] : body) ?? {};
}

/** A provider reads its OWN profile aggregates via profiles_select_own. */
export async function getOwnProfileRating(providerCtx: APIRequestContext, providerId: string): Promise<Record<string, unknown>> {
  const res = await providerCtx.get(`/rest/v1/profiles?id=eq.${providerId}&select=average_rating,review_count`);
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows[0] ?? {};
}

/** Raw insert into review_private_feedback — returns HTTP status. */
export async function insertPrivateFeedbackRaw(
  ctx: APIRequestContext,
  f: { review_id: string; customer_id: string; provider_id: string; feedback: string },
): Promise<{ status: number; text: string }> {
  const res = await ctx.post('/rest/v1/review_private_feedback', {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data: f,
  });
  return { status: res.status(), text: res.status() === 201 ? '' : await res.text() };
}

export async function readPrivateFeedback(ctx: APIRequestContext, reviewId: string): Promise<Record<string, unknown>[]> {
  const res = await ctx.get(`/rest/v1/review_private_feedback?review_id=eq.${reviewId}&select=review_id,feedback`);
  if (res.status() !== 200) return [];
  return (await res.json()) as Record<string, unknown>[];
}

/**
 * Create a booking, assign the given provider, and progress it to completed —
 * i.e. review-eligible for that provider. Returns the booking id.
 */
export async function makeCompletedBooking(opts: {
  customerCtx: APIRequestContext;
  customerId: string;
  providerCtx: APIRequestContext;
  adminCtx: APIRequestContext;
  provider: ProviderInfo;
}): Promise<string> {
  const booking = await createCustomerBooking(opts.customerCtx, opts.customerId);
  await assignProvider(opts.adminCtx, booking.id, opts.provider);
  for (const s of ['on_the_way', 'in_progress', 'completed']) {
    const r = await setBookingStatus(opts.providerCtx, booking.id, s);
    if (!r.changed) throw new Error(`progress to ${s} failed: HTTP ${r.status} — ${r.text}`);
  }
  return booking.id;
}
