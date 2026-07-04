// promotions.ts — Supabase helpers for promo codes and redemptions.
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

/** The three promo discount strategies. */
export type PromoType = 'percentage' | 'fixed' | 'wallet_credit';

/** A row from the promo_codes table. */
export type PromoCode = {
  id: string;
  code: string;
  discount_type: PromoType;
  discount_value: number;
  max_discount: number | null;
  max_redemptions: number | null;
  per_user_limit: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

/** A row from the promo_redemptions table. */
export type PromoRedemption = {
  id: string;
  promo_code_id: string;
  customer_id: string;
  booking_id: string | null;
  payment_id: string | null;
  discount_type: string;
  discount_amount: number;
  created_at: string;
};

// ── Customer helpers ───────────────────────────────────────────────────────

/**
 * Applies a promo code to a pending payment via the `redeem_promo` RPC.
 * The DB raises friendly messages like 'Promo already applied' — these are
 * surfaced directly as `error` so the UI can display them without mapping.
 * Returns `{ ok: true, discount }` on success; `{ ok: false, error }` on failure.
 */
export async function redeemPromo(
  paymentId: string,
  code: string,
): Promise<{ ok: boolean; discount?: number; error?: string }> {
  const { data, error } = await supabase.rpc('redeem_promo', {
    p_payment_id: paymentId,
    p_code: code,
  });
  if (error) return { ok: false, error: error.message ?? 'Could not apply promo code.' };
  return { ok: true, discount: typeof data === 'number' ? data : Number(data) };
}

/**
 * Returns the signed-in customer's promo redemption history, newest first.
 * Returns an empty array on error.
 */
export async function getMyPromoRedemptions(): Promise<PromoRedemption[]> {
  const { data, error } = await supabase
    .from('promo_redemptions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as PromoRedemption[] | null) ?? [];
}

// ── Admin helpers ──────────────────────────────────────────────────────────

/**
 * Admin: returns all promo codes, newest first.
 * Returns an empty array on error.
 */
export async function adminGetPromoCodes(): Promise<PromoCode[]> {
  const { data, error } = await supabase
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as PromoCode[] | null) ?? [];
}

/**
 * Admin: creates a new promo code.
 * The code is trimmed and uppercased before insert.
 * Returns `{ ok: true }` on success; `{ ok: false, error }` on failure.
 */
export async function adminCreatePromoCode(input: {
  code: string;
  discount_type: PromoType;
  discount_value: number;
  max_discount?: number | null;
  max_redemptions?: number | null;
  per_user_limit?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('promo_codes')
    .insert({ ...input, code: input.code.trim().toUpperCase() });
  if (error) return { ok: false, error: 'Could not create promo code.' };
  return { ok: true };
}

/**
 * Admin: updates a promo code's mutable fields.
 * Returns `{ ok: true }` on success; `{ ok: false, error }` on failure.
 */
export async function adminUpdatePromoCode(
  id: string,
  patch: Partial<{ is_active: boolean; ends_at: string | null; max_redemptions: number | null }>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('promo_codes').update(patch).eq('id', id);
  if (error) return { ok: false, error: 'Could not update promo code.' };
  return { ok: true };
}

/**
 * Admin: returns promo redemptions, optionally filtered to a single promo code, newest first.
 * Returns an empty array on error. Pass page + pageSize for pagination.
 */
export async function adminGetPromoRedemptions(promoCodeId?: string, page?: number, pageSize?: number): Promise<PromoRedemption[]> {
  let q = supabase.from('promo_redemptions').select('*');
  if (promoCodeId !== undefined) {
    q = q.eq('promo_code_id', promoCodeId);
  }
  q = q.order('created_at', { ascending: false });
  if (page != null && pageSize != null) q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, error } = await q;
  if (error) return [];
  return (data as PromoRedemption[] | null) ?? [];
}
