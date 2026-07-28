import { request, type APIRequestContext } from '@playwright/test';
import { qaSupabaseUrl, qaSupabaseAnonKey, assertNotProduction } from './qa-accounts';

/**
 * qa-storage.ts — connected storage/upload primitives (Phase 1B).
 *
 * Drives the REAL Supabase Storage API + the booking_photos metadata table of the
 * dedicated QA project. The `booking-photos` bucket is private: authenticated
 * users may read/insert objects within it; DELETE is admin-only (so cleanup uses
 * the service role). Booking-scoped authorization is enforced by the
 * booking_photos RLS policies. assertNotProduction() guards every entry point.
 */

export const BUCKET = 'booking-photos';
export const STORAGE_MARKER_PREFIX = 'qa-p1b-cert';

export function makeObjectPath(tag = 'obj'): string {
  return `${STORAGE_MARKER_PREFIX}/${tag}-${crypto.randomUUID()}.txt`;
}

async function serviceCtx(): Promise<APIRequestContext> {
  assertNotProduction();
  const key = process.env.QA_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('QA_SERVICE_ROLE_KEY is required for storage cleanup.');
  return request.newContext({
    baseURL: qaSupabaseUrl(),
    extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}` },
  });
}

/** Upload an object to the booking-photos bucket with a raw bearer token (or anon when token is null). */
export async function uploadObject(
  token: string | null,
  path: string,
  content = 'qa-p1b',
): Promise<number> {
  const headers: Record<string, string> = {
    apikey: qaSupabaseAnonKey() as string,
    'Content-Type': 'text/plain',
    'x-upsert': 'true',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = await request.newContext({ baseURL: qaSupabaseUrl(), extraHTTPHeaders: headers });
  try {
    return (await ctx.post(`/storage/v1/object/${BUCKET}/${path}`, { data: content })).status();
  } finally {
    await ctx.dispose();
  }
}

/** Download an object with a raw bearer token (or anon when token is null). Returns the HTTP status. */
export async function getObjectStatus(token: string | null, path: string): Promise<number> {
  const headers: Record<string, string> = { apikey: qaSupabaseAnonKey() as string };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = await request.newContext({ baseURL: qaSupabaseUrl(), extraHTTPHeaders: headers });
  try {
    return (await ctx.get(`/storage/v1/object/${BUCKET}/${path}`)).status();
  } finally {
    await ctx.dispose();
  }
}

/** Delete an object via the service role (bucket DELETE is admin-only) — cleanup. */
export async function deleteObjectService(path: string): Promise<void> {
  const svc = await serviceCtx();
  try {
    await svc.delete(`/storage/v1/object/${BUCKET}/${path}`);
  } finally {
    await svc.dispose();
  }
}

/** Safety-net sweep of every object under the marker prefix (service role). */
export async function sweepStorageObjects(prefix = STORAGE_MARKER_PREFIX): Promise<void> {
  const svc = await serviceCtx();
  try {
    const list = await svc.post(`/storage/v1/object/list/${BUCKET}`, {
      headers: { 'Content-Type': 'application/json' },
      data: { prefix: prefix + '/', limit: 200 },
    });
    if (list.status() !== 200) return;
    const items = (await list.json()) as { name: string }[];
    for (const it of items) {
      await svc.delete(`/storage/v1/object/${BUCKET}/${prefix}/${it.name}`);
    }
  } finally {
    await svc.dispose();
  }
}

// ── booking_photos metadata (access boundary) ──────────────────────────────

export type PhotoInsert = {
  booking_id: string;
  uploaded_by: string;
  photo_url?: string;
  photo_type: string;
  is_verified?: boolean;
};

/** Raw insert into booking_photos — returns the HTTP status (for authorization/validation tests). */
export async function insertBookingPhotoRaw(
  ctx: APIRequestContext,
  p: PhotoInsert,
): Promise<{ status: number; id: string | null; text: string }> {
  const res = await ctx.post('/rest/v1/booking_photos', {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data: {
      booking_id: p.booking_id,
      uploaded_by: p.uploaded_by,
      photo_url: p.photo_url ?? `${BUCKET}/${makeObjectPath()}`,
      photo_type: p.photo_type,
      ...(p.is_verified !== undefined ? { is_verified: p.is_verified } : {}),
    },
  });
  const status = res.status();
  if (status === 201) {
    const arr = (await res.json()) as Record<string, unknown>[];
    return { status, id: (arr[0]?.id as string) ?? null, text: '' };
  }
  return { status, id: null, text: await res.text() };
}

/** Read booking_photos visible to ctx for a booking (RLS applies). */
export async function readBookingPhotos(
  ctx: APIRequestContext,
  bookingId: string,
): Promise<Record<string, unknown>[]> {
  const res = await ctx.get(`/rest/v1/booking_photos?booking_id=eq.${bookingId}&select=id,photo_type,uploaded_by`);
  if (res.status() !== 200) throw new Error(`readBookingPhotos failed: HTTP ${res.status()} — ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>[];
}
