// services-catalog-admin.ts — admin-only catalogue management, split out of
// @/lib/services-catalog.
//
// These list inactive rows or call admin_* RPCs that raise unless is_admin(). The active-catalogue
// readers and the row/Service mappers stay shared — the consumer app renders the catalogue.
import { supabase } from '@/lib/supabase';
import { mapRpcError, type DbCategory, type DbService, type ServiceStatus } from '@/lib/services-catalog';

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
