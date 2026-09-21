// services-catalog.ts — Supabase helpers for dynamic service & category management.
// Reads are RLS-scoped and never throw (return [] / null on error).
// Admin wrappers call RPCs with exact p_-prefixed params from migration 0030.
import { supabase } from '@/lib/supabase';
import { Service } from '@/constants/services';

// ── Types ──────────────────────────────────────────────────────────────────

/** A row from the service_categories table. */
export type DbCategory = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  display_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

/** Possible lifecycle states for a service row. */
export type ServiceStatus = 'draft' | 'active' | 'hidden' | 'disabled' | 'archived';

/** A row from the services table. */
export type DbService = {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  full_description: string | null;
  category_id: string | null;
  icon: string | null;
  color: string | null;
  display_order: number;
  status: ServiceStatus;
  featured: boolean;
  trending: boolean;
  emergency_available: boolean;
  inspection_required: boolean;
  available_24_7: boolean;
  estimated_duration: string | null;
  starting_price_text: string | null;
  active_from: string | null;
  active_until: string | null;
  created_at: string;
  updated_at: string;
};

// ── Reads (RLS-scoped; [] on error; never throw) ───────────────────────────

/**
 * Discriminated fetch result.
 * - `{ ok: true, data }`  → the query SUCCEEDED. `data` may be empty ([]); an
 *   empty success is a legitimate, admin-controlled "no active services" state
 *   and must NOT trigger a hardcoded fallback.
 * - `{ ok: false }`       → the query genuinely ERRORED (network / RLS / Postgres);
 *   callers may fall back to a cached/offline catalogue.
 * This lets callers separate SUCCESS_EMPTY from FETCH_ERROR — a distinction the
 * plain list* helpers (which return [] for both) cannot express.
 */
export type CatalogFetch<T> = { ok: true; data: T[] } | { ok: false; data: [] };

/**
 * Error-aware fetch of active service categories (ordered by display_order).
 * Distinguishes a successful-but-empty result from a genuine query error.
 */
export async function fetchActiveServiceCategories(): Promise<CatalogFetch<DbCategory>> {
  const { data, error } = await supabase
    .from('service_categories')
    .select('*')
    .eq('active', true)
    .order('display_order', { ascending: true });
  if (error) return { ok: false, data: [] };
  return { ok: true, data: (data as DbCategory[] | null) ?? [] };
}

/**
 * Error-aware fetch of active services (ordered by display_order).
 * Distinguishes a successful-but-empty result from a genuine query error.
 */
export async function fetchActiveServices(): Promise<CatalogFetch<DbService>> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('status', 'active')
    .order('display_order', { ascending: true });
  if (error) return { ok: false, data: [] };
  return { ok: true, data: (data as DbService[] | null) ?? [] };
}

/**
 * Returns all active service categories ordered by display_order.
 * RLS also enforces active-only for non-admin callers.
 * Thin wrapper over fetchActiveServiceCategories — returns [] on any Supabase
 * error (contract preserved for existing callers; never throws).
 */
export async function listActiveServiceCategories(): Promise<DbCategory[]> {
  return (await fetchActiveServiceCategories()).data;
}

/**
 * Returns all active services ordered by display_order.
 * Thin wrapper over fetchActiveServices — returns [] on any Supabase error
 * (contract preserved for existing callers; never throws).
 */
export async function listActiveServices(): Promise<DbService[]> {
  return (await fetchActiveServices()).data;
}

/**
 * Returns a single service by its slug, or null if not found / on error.
 * RLS returns the row only if it is active OR the caller is admin — so a
 * non-admin caller gets null for a non-active slug (T4 fallback handles this).
 */
export async function getServiceBySlugFromDb(slug: string): Promise<DbService | null> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) return null;
  return (data as DbService | null) ?? null;
}

// ── Friendly error mapping ─────────────────────────────────────────────────

/**
 * Maps a raw Supabase/PostgREST error to a user-friendly string.
 * Checks both the error code (23505 = unique_violation) and message text.
 */
export function mapRpcError(error: { code?: string; message?: string } | null): string {
  if (!error) return 'Could not save. Please try again.';
  const msg = error.message ?? '';
  const code = error.code ?? '';

  // Duplicate slug unique constraint
  if (code === '23505' && msg.toLowerCase().includes('slug')) {
    return 'A service/category with that slug already exists.';
  }
  // Duplicate name-in-category unique constraint
  if (code === '23505' && (msg.toLowerCase().includes('name') || msg.toLowerCase().includes('category'))) {
    return 'A service with that name already exists in this category.';
  }
  // Any other 23505 unique violation — still a dup slug (e.g., category slug)
  if (code === '23505') {
    return 'A service/category with that slug already exists.';
  }
  // Invalid slug format (DB raises this message)
  if (msg.toLowerCase().includes('invalid slug format')) {
    return 'Slug must be lowercase letters, numbers and hyphens.';
  }
  // Cannot deactivate category with active services
  if (msg.toLowerCase().includes('category has active services')) {
    return 'Cannot deactivate a category that still has active services.';
  }
  return 'Could not save. Please try again.';
}

// ── Admin RPC wrappers ─────────────────────────────────────────────────────

// ── Mapper: DbService → legacy Service shape ───────────────────────────────

/**
 * Parses a starting price string into a plain number (KES amount).
 * Examples: '1500' → 1500; 'KES 1,500' → 1500; null → undefined.
 * Pure function — no side effects.
 */
export function parsePrice(text: string | null): number | undefined {
  if (!text) return undefined;
  // Strip non-digit, non-period characters and take the leading numeric portion.
  // 'KES 1,500' → '1500'; '1500' → '1500'; 'from 500/hr' → '500'
  const stripped = text.replace(/,/g, '').match(/\d+(\.\d+)?/);
  if (!stripped) return undefined;
  const n = parseFloat(stripped[0]);
  return isNaN(n) ? undefined : n;
}

/**
 * Maps a DB service row to the legacy `Service` shape used throughout the app.
 * - slug → id (the legacy id field is the slug)
 * - name → title
 * - short_description → subtitle (undefined when null)
 * - icon → icon (defaults to '🧩' when null)
 * - featured → badge 'Popular'; trending → badge 'New' (featured takes precedence)
 * - startingPrice from parsePrice(starting_price_text)
 * - category from the optional categorySlug argument (defaults to 'home')
 */
export function toService(db: DbService, categorySlug?: string): Service {
  return {
    id: db.slug,
    title: db.name,
    subtitle: db.short_description ?? undefined,
    icon: db.icon ?? '🧩',
    category: (categorySlug as any) ?? 'home',
    startingPrice: parsePrice(db.starting_price_text),
    badge: db.featured ? 'Popular' : db.trending ? 'New' : undefined,
  };
}

/**
 * Optional convenience: maps a DB category row to a minimal legacy-friendly object.
 * Returns { id: slug, name, icon } — useful for building pickers / dropdowns.
 */
export function dbCategoryToLegacy(db: DbCategory): { id: string; name: string; icon: string } {
  return {
    id: db.slug,
    name: db.name,
    icon: db.icon ?? '🗂️',
  };
}
