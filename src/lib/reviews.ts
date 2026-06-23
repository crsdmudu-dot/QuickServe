// reviews.ts — Supabase helpers for submitting and reading booking reviews.
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

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
};

// ── Mutations ──────────────────────────────────────────────────────────────

/** Submits a review for a completed booking. Customer id is taken from the signed-in user. */
export async function submitReview(input: {
  bookingId: string;
  providerId: string;
  rating: number;
  comment?: string;
}): Promise<{ ok: boolean; error?: string }> {
  // Get the signed-in user
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: 'You must be signed in.' };

  const { error } = await supabase.from('reviews').insert({
    booking_id: input.bookingId,
    customer_id: data.user.id,
    provider_id: input.providerId,
    rating: input.rating,
    comment: input.comment ?? null,
  });

  if (error) {
    // Unique violation means this booking was already reviewed
    if (error.code === '23505') {
      return { ok: false, error: "You've already reviewed this booking." };
    }
    return { ok: false, error: 'Could not submit review. Please try again.' };
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
