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
 * Admin: returns ALL service categories (no active filter) ordered by display_order.
 * RLS returns all rows for admin callers.
 * Returns [] on any Supabase error.
 */
export async function listAdminServiceCategories(): Promise<DbCategory[]> {
  const { data, error } = await supabase
    .from('service_categories')
    .select('*')
    .order('display_order');
  if (error) return [];
  return (data as DbCategory[] | null) ?? [];
}

/**
 * Admin: returns ALL services (all statuses) ordered by category then display_order.
 * Returns [] on any Supabase error.
 */
export async function listAdminServices(): Promise<DbService[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .order('category_id')
    .order('display_order');
  if (error) return [];
  return (data as DbService[] | null) ?? [];
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
function mapRpcError(error: { code?: string; message?: string } | null): string {
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

/**
 * Admin: creates a new service category.
 * Returns { ok: true, id } on success; { ok: false, error } on failure.
 */
export async function adminCreateCategory(input: {
  slug: string;
  name: string;
  icon?: string;
  color?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('admin_create_category', {
    p_slug: input.slug,
    p_name: input.name,
    p_icon: input.icon ?? null,
    p_color: input.color ?? null,
  });
  if (error) return { ok: false, error: mapRpcError(error) };
  return { ok: true, id: typeof data === 'string' ? data : undefined };
}

/**
 * Admin: updates a service category's mutable fields (name, icon, color).
 * Returns { ok: true } on success; { ok: false, error } on failure.
 */
export async function adminUpdateCategory(input: {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_update_category', {
    p_id: input.id,
    p_name: input.name,
    p_icon: input.icon ?? null,
    p_color: input.color ?? null,
  });
  if (error) return { ok: false, error: mapRpcError(error) };
  return { ok: true };
}

/**
 * Admin: activates or deactivates a service category.
 * Cannot deactivate if the category still has active services (DB enforced).
 * Returns { ok: true } on success; { ok: false, error } on failure.
 */
export async function adminSetCategoryActive(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_set_category_active', {
    p_id: id,
    p_active: active,
  });
  if (error) return { ok: false, error: mapRpcError(error) };
  return { ok: true };
}

/**
 * Admin: reorders service categories by providing a full ordered list of IDs.
 * Returns { ok: true } on success; { ok: false, error } on failure.
 */
export async function adminReorderCategories(
  orderedIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_reorder_categories', {
    p_ordered_ids: orderedIds,
  });
  if (error) return { ok: false, error: mapRpcError(error) };
  return { ok: true };
}

/**
 * Admin: creates a new service.
 * Returns { ok: true, id } on success; { ok: false, error } on failure.
 */
export async function adminCreateService(input: {
  slug: string;
  name: string;
  shortDescription?: string;
  fullDescription?: string;
  categoryId: string;
  icon?: string;
  color?: string;
  estimatedDuration?: string;
  startingPriceText?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('admin_create_service', {
    p_slug: input.slug,
    p_name: input.name,
    p_short_description: input.shortDescription ?? null,
    p_full_description: input.fullDescription ?? null,
    p_category_id: input.categoryId,
    p_icon: input.icon ?? null,
    p_color: input.color ?? null,
    p_estimated_duration: input.estimatedDuration ?? null,
    p_starting_price_text: input.startingPriceText ?? null,
  });
  if (error) return { ok: false, error: mapRpcError(error) };
  return { ok: true, id: typeof data === 'string' ? data : undefined };
}

/**
 * Admin: updates a service's mutable fields.
 * Note: slug is immutable — it is NOT passed to this RPC.
 * Returns { ok: true } on success; { ok: false, error } on failure.
 */
export async function adminUpdateService(input: {
  id: string;
  name: string;
  shortDescription?: string;
  fullDescription?: string;
  categoryId: string;
  icon?: string;
  color?: string;
  estimatedDuration?: string;
  startingPriceText?: string;
  featured: boolean;
  trending: boolean;
  emergencyAvailable: boolean;
  inspectionRequired: boolean;
  available247: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_update_service', {
    p_id: input.id,
    p_name: input.name,
    p_short_description: input.shortDescription ?? null,
    p_full_description: input.fullDescription ?? null,
    p_category_id: input.categoryId,
    p_icon: input.icon ?? null,
    p_color: input.color ?? null,
    p_estimated_duration: input.estimatedDuration ?? null,
    p_starting_price_text: input.startingPriceText ?? null,
    p_featured: input.featured,
    p_trending: input.trending,
    p_emergency_available: input.emergencyAvailable,
    p_inspection_required: input.inspectionRequired,
    p_available_24_7: input.available247,
  });
  if (error) return { ok: false, error: mapRpcError(error) };
  return { ok: true };
}

/**
 * Admin: changes the lifecycle status of a service.
 * Returns { ok: true } on success; { ok: false, error } on failure.
 */
export async function adminSetServiceStatus(
  id: string,
  status: ServiceStatus,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_set_service_status', {
    p_id: id,
    p_status: status,
  });
  if (error) return { ok: false, error: mapRpcError(error) };
  return { ok: true };
}

/**
 * Admin: duplicates a service row (creates a draft copy).
 * Returns { ok: true, id } with the new service's UUID on success; { ok: false, error } on failure.
 */
export async function adminDuplicateService(
  id: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('admin_duplicate_service', {
    p_id: id,
  });
  if (error) return { ok: false, error: mapRpcError(error) };
  return { ok: true, id: typeof data === 'string' ? data : undefined };
}

/**
 * Admin: reorders services within a category by providing a full ordered list of IDs.
 * Returns { ok: true } on success; { ok: false, error } on failure.
 */
export async function adminReorderServices(
  categoryId: string,
  orderedIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_reorder_services', {
    p_category_id: categoryId,
    p_ordered_ids: orderedIds,
  });
  if (error) return { ok: false, error: mapRpcError(error) };
  return { ok: true };
}

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
