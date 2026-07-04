// reviews.ts — Supabase helpers for submitting and reading booking reviews.
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

/** A tag that customers can attach to a review (9 total: 5 positive, 4 negative). */
export type ReviewTag = { key: string; label: string; sentiment: 'positive' | 'negative' };

/** The 9 allowed tags that customers can select when leaving a review. */
export const REVIEW_TAGS: ReviewTag[] = [
  { key: 'on_time',            label: 'On time',            sentiment: 'positive' },
  { key: 'friendly',           label: 'Friendly',           sentiment: 'positive' },
  { key: 'clean_work',         label: 'Clean work',         sentiment: 'positive' },
  { key: 'good_communication', label: 'Good communication', sentiment: 'positive' },
  { key: 'fair_price',         label: 'Fair price',         sentiment: 'positive' },
  { key: 'late',               label: 'Late',               sentiment: 'negative' },
  { key: 'messy',              label: 'Messy',              sentiment: 'negative' },
  { key: 'poor_communication', label: 'Poor communication', sentiment: 'negative' },
  { key: 'overpriced',         label: 'Overpriced',         sentiment: 'negative' },
];

/** A row from the reviews table. */
export type Review = {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  rating: number;
  comment: string | null;
  is_hidden: boolean;
  created_at: string;
  // ── Category ratings (optional, added in Ratings v2) ──
  quality_rating: number | null;
  punctuality_rating: number | null;
  communication_rating: number | null;
  professionalism_rating: number | null;
  value_rating: number | null;
  would_recommend: boolean | null;
  tags: string[];
};

/**
 * Aggregated rating breakdown for a provider — returned by the
 * get_provider_rating_breakdown RPC. Used for display only.
 */
export type ProviderRatingBreakdown = {
  overall_avg: number | null;
  review_count: number;
  recommend_pct: number | null;
  quality_avg: number | null;
  punctuality_avg: number | null;
  communication_avg: number | null;
  professionalism_avg: number | null;
  value_avg: number | null;
  top_tags: string[];
};

// ── Internal helpers ───────────────────────────────────────────────────────

/** Returned by getProviderRatingBreakdown when there are no reviews or on error. */
const EMPTY_BREAKDOWN: ProviderRatingBreakdown = {
  overall_avg: null,
  review_count: 0,
  recommend_pct: null,
  quality_avg: null,
  punctuality_avg: null,
  communication_avg: null,
  professionalism_avg: null,
  value_avg: null,
  top_tags: [],
};

// ── Mutations ──────────────────────────────────────────────────────────────

/**
 * Submits a review for a completed booking.
 * - `rating` is required; all other fields are optional.
 * - `privateFeedback` is written to a separate provider-invisible table (best-effort).
 * - The DB trigger `tg_notify_review` fires automatically on insert — no client change needed.
 */
export async function submitReview(input: {
  bookingId: string;
  providerId: string;
  rating: number;
  comment?: string;
  qualityRating?: number;
  punctualityRating?: number;
  communicationRating?: number;
  professionalismRating?: number;
  valueRating?: number;
  wouldRecommend?: boolean;
  tags?: string[];
  privateFeedback?: string;
}): Promise<{ ok: boolean; error?: string }> {
  // Get the signed-in user
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: 'You must be signed in.' };

  // Insert the review and read its id (needed for private feedback)
  const { data: row, error } = await supabase
    .from('reviews')
    .insert({
      booking_id: input.bookingId,
      customer_id: u.user.id,
      provider_id: input.providerId,
      rating: input.rating,
      comment: input.comment ?? null,
      quality_rating: input.qualityRating ?? null,
      punctuality_rating: input.punctualityRating ?? null,
      communication_rating: input.communicationRating ?? null,
      professionalism_rating: input.professionalismRating ?? null,
      value_rating: input.valueRating ?? null,
      would_recommend: input.wouldRecommend ?? null,
      tags: input.tags ?? [],
    })
    .select('id')
    .single();

  if (error) {
    // Unique violation means this booking was already reviewed
    if (error.code === '23505') {
      return { ok: false, error: "You've already reviewed this booking." };
    }
    return { ok: false, error: 'Could not submit review. Please try again.' };
  }

  // Write private feedback only when provided — best-effort (don't fail the submit)
  if (input.privateFeedback?.trim()) {
    await supabase.from('review_private_feedback').insert({
      review_id: row.id,
      customer_id: u.user.id,
      provider_id: input.providerId,
      feedback: input.privateFeedback.trim(),
    });
  }

  return { ok: true };
}

/** Admin: shows or hides a review by id. */
export async function setReviewHidden(
  id: string,
  hidden: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('reviews')
    .update({ is_hidden: hidden })
    .eq('id', id);
  if (error) return { ok: false, error: 'Could not update review. Please try again.' };
  return { ok: true };
}

// ── Queries ────────────────────────────────────────────────────────────────

/** Returns the signed-in customer's own review for a booking, or null if none. */
export async function getMyReviewForBooking(bookingId: string): Promise<Review | null> {
  const { data } = await supabase
    .from('reviews')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();
  return data ?? null;
}

/** Returns all visible reviews for a provider, newest first. */
export async function getProviderReviews(providerId: string): Promise<Review[]> {
  const { data } = await supabase
    .from('reviews')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  return (data as Review[] | null) ?? [];
}

/** Admin: all reviews, newest first (admin RLS permits — includes hidden for moderation). Pass page + pageSize for pagination. */
export async function adminGetAllReviews(page?: number, pageSize?: number): Promise<Review[]> {
  let q = supabase.from('reviews').select('*').order('created_at', { ascending: false });
  if (page != null && pageSize != null) q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, error } = await q;
  if (error) return [];
  return (data as Review[] | null) ?? [];
}

/**
 * Returns aggregated rating breakdown for a provider.
 * Calls the `get_provider_rating_breakdown` RPC (security-definer, display-only).
 * Returns EMPTY_BREAKDOWN when the provider has no reviews or on error.
 */
export async function getProviderRatingBreakdown(
  providerId: string,
): Promise<ProviderRatingBreakdown> {
  const { data, error } = await supabase.rpc('get_provider_rating_breakdown', {
    p_provider_id: providerId,
  });
  if (error) return EMPTY_BREAKDOWN;
  return (data as ProviderRatingBreakdown[] | null)?.[0] ?? EMPTY_BREAKDOWN;
}

/**
 * Returns the private feedback row for a review, or null if none / not authorized.
 * RLS restricts access to the authoring customer and admins — providers always get null.
 */
export async function getReviewPrivateFeedback(
  reviewId: string,
): Promise<{ feedback: string } | null> {
  const { data } = await supabase
    .from('review_private_feedback')
    .select('*')
    .eq('review_id', reviewId)
    .maybeSingle();
  return data ?? null;
}
