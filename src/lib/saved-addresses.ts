// saved-addresses.ts — Supabase helpers for customer saved addresses (customer_addresses table).
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

/** A row from the customer_addresses table. */
export type SavedAddress = {
  id: string;
  customer_id: string;
  label_type: 'home' | 'work' | 'other';
  nickname: string | null;
  address: string;
  address_label: string | null;
  latitude: number | null;
  longitude: number | null;
  building_name: string | null;
  floor: string | null;
  door_number: string | null;
  landmark: string | null;
  access_notes: string | null;
  is_default: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Input for create/update. address is required; everything else is optional.
 * NOTE: customer_id is NEVER accepted from callers — createSavedAddress takes it from
 * the signed-in auth user; all other ops rely on RLS (owner-only enforced by DB).
 */
export type SavedAddressInput = {
  label_type?: 'home' | 'work' | 'other';
  nickname?: string | null;
  address: string;
  address_label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  building_name?: string | null;
  floor?: string | null;
  door_number?: string | null;
  landmark?: string | null;
  access_notes?: string | null;
  is_default?: boolean;
};

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Returns the signed-in customer's saved addresses.
 * Ordered: defaults first, then most-recently-used, then newest.
 * RLS restricts rows to the owner — no manual customer_id filter needed.
 */
export async function getMySavedAddresses(): Promise<SavedAddress[]> {
  const { data, error } = await supabase
    .from('customer_addresses')
    .select('*')
    .order('is_default', { ascending: false })
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as SavedAddress[] | null) ?? [];
}

// ── Mutations ──────────────────────────────────────────────────────────────

/**
 * Creates a new saved address for the signed-in customer.
 * customer_id is taken from auth — never passed by callers.
 */
export async function createSavedAddress(
  input: SavedAddressInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: 'You must be signed in.' };

  const { data, error } = await supabase
    .from('customer_addresses')
    .insert({
      customer_id: u.user.id,
      label_type: input.label_type ?? 'other',
      nickname: input.nickname ?? null,
      address: input.address,
      address_label: input.address_label ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      building_name: input.building_name ?? null,
      floor: input.floor ?? null,
      door_number: input.door_number ?? null,
      landmark: input.landmark ?? null,
      access_notes: input.access_notes ?? null,
      is_default: input.is_default ?? false,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: 'Could not save address. Please try again.' };
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * Updates an existing saved address. Patch may contain any subset of SavedAddressInput fields.
 * Owner-only enforced by RLS — customer_id is never accepted from callers.
 */
export async function updateSavedAddress(
  id: string,
  patch: Partial<SavedAddressInput>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('customer_addresses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: 'Could not update address.' };
  return { ok: true };
}

/** Deletes a saved address by id. Owner-only enforced by RLS. */
export async function deleteSavedAddress(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('customer_addresses')
    .delete()
    .eq('id', id);
  if (error) return { ok: false, error: 'Could not delete address.' };
  return { ok: true };
}

/**
 * Sets an address as the customer's default (clears previous default atomically via RPC).
 * Uses SECURITY DEFINER RPC so the atomic swap can bypass per-row RLS check order.
 */
export async function setDefaultSavedAddress(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('set_default_address', { p_address_id: id });
  if (error) return { ok: false, error: 'Could not set default address.' };
  return { ok: true };
}

/**
 * Stamps last_used_at = now() for the given address (call after a booking uses this address).
 * Uses SECURITY DEFINER RPC; callers may use fire-and-forget but still get the standard shape.
 */
export async function touchSavedAddress(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('touch_saved_address', { p_address_id: id });
  if (error) return { ok: false, error: 'Could not update address.' };
  return { ok: true };
}

// ── Mapper helpers (pure — no supabase) ───────────────────────────────────

/**
 * Maps a SavedAddress row to the two BookingDraft partials consumed by
 * `setLocation` and `setApartment`. Converts null → '' for all text fields;
 * keeps latitude/longitude as number | null (draft uses the same type).
 */
export function savedAddressToDraftLocation(a: SavedAddress): {
  location: {
    address: string;
    address_label: string;
    latitude: number | null;
    longitude: number | null;
  };
  apartment: {
    building_name: string;
    floor: string;
    door_number: string;
    landmark: string;
    access_notes: string;
  };
} {
  return {
    location: {
      address: a.address,
      address_label: a.address_label ?? '',
      latitude: a.latitude,
      longitude: a.longitude,
    },
    apartment: {
      building_name: a.building_name ?? '',
      floor: a.floor ?? '',
      door_number: a.door_number ?? '',
      landmark: a.landmark ?? '',
      access_notes: a.access_notes ?? '',
    },
  };
}

/**
 * Converts the booking-draft's structured address fields into a SavedAddressInput.
 * Converts '' → null for optional text fields; keeps coords as-is.
 * Pure function — no supabase — trivially unit-testable and reusable from any screen.
 */
export function draftToSavedAddressInput(
  draft: {
    address: string;
    address_label: string;
    latitude: number | null;
    longitude: number | null;
    building_name: string;
    floor: string;
    door_number: string;
    landmark: string;
    access_notes: string;
  },
  meta: {
    label_type?: 'home' | 'work' | 'other';
    nickname?: string | null;
    is_default?: boolean;
  },
): SavedAddressInput {
  return {
    address: draft.address,
    address_label: draft.address_label !== '' ? draft.address_label : null,
    latitude: draft.latitude,
    longitude: draft.longitude,
    building_name: draft.building_name !== '' ? draft.building_name : null,
    floor: draft.floor !== '' ? draft.floor : null,
    door_number: draft.door_number !== '' ? draft.door_number : null,
    landmark: draft.landmark !== '' ? draft.landmark : null,
    access_notes: draft.access_notes !== '' ? draft.access_notes : null,
    nickname: (meta.nickname ?? '') !== '' ? meta.nickname : null,
    label_type: meta.label_type ?? 'other',
    is_default: meta.is_default ?? false,
  };
}
