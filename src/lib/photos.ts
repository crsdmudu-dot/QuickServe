// photos.ts — Supabase helpers for uploading and reading booking job photos.
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

/** The role/purpose a photo was taken for. */
export type PhotoType = 'issue' | 'before' | 'after' | 'completion';

/** A row from the booking_photos table. */
export type BookingPhoto = {
  id: string;
  booking_id: string;
  uploaded_by: string;
  photo_url: string;
  photo_type: PhotoType;
  caption: string | null;
  is_verified: boolean;
  created_at: string;
};

/** BookingPhoto with a short-lived signed URL attached for display. */
export type BookingPhotoView = BookingPhoto & { signedUrl: string | null };

// ── Helpers ────────────────────────────────────────────────────────────────

/** Generates a UUID, falling back to a timestamp+random string. */
function randomUuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Derives a lowercase file extension from a URI, defaulting to 'jpg'. */
function extFromUri(uri: string): string {
  const match = uri.match(/\.([a-zA-Z0-9]+)(\?|$)/);
  return match ? match[1].toLowerCase() : 'jpg';
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Uploads a photo file and inserts a booking_photos metadata row. */
export async function uploadBookingPhoto(input: {
  bookingId: string;
  uri: string;
  photoType: PhotoType;
  caption?: string;
}): Promise<{ ok: boolean; error?: string }> {
  // Ensure user is signed in
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: 'You must be signed in to upload photos.' };

  const ext = extFromUri(input.uri);
  const path = `${input.bookingId}/${randomUuid()}.${ext}`;
  const contentType = `image/${ext === 'png' ? 'png' : 'jpeg'}`;

  // Read the file bytes from the local URI
  const bytes = await (await fetch(input.uri)).arrayBuffer();

  // Upload to Storage
  const { error: uploadError } = await supabase.storage
    .from('booking-photos')
    .upload(path, bytes, { contentType });
  if (uploadError) return { ok: false, error: 'Could not upload photo. Please try again.' };

  // Insert metadata row
  const { error: insertError } = await supabase.from('booking_photos').insert({
    booking_id: input.bookingId,
    uploaded_by: data.user.id,
    photo_url: path,
    photo_type: input.photoType,
    caption: input.caption ?? null,
  });
  if (insertError) return { ok: false, error: 'Could not save photo record. Please try again.' };

  return { ok: true };
}

/** Deletes the storage object then the metadata row. */
export async function deleteBookingPhoto(photo: {
  id: string;
  photo_url: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error: removeError } = await supabase.storage
    .from('booking-photos')
    .remove([photo.photo_url]);
  if (removeError) return { ok: false, error: 'Could not delete photo file. Please try again.' };

  const { error: deleteError } = await supabase
    .from('booking_photos')
    .delete()
    .eq('id', photo.id);
  if (deleteError) return { ok: false, error: 'Could not delete photo record. Please try again.' };

  return { ok: true };
}

/** Admin: marks a photo as verified (or unverified). */
export async function setPhotoVerified(
  id: string,
  value: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('booking_photos')
    .update({ is_verified: value })
    .eq('id', id);
  if (error) return { ok: false, error: 'Could not update photo. Please try again.' };
  return { ok: true };
}

// ── Queries ────────────────────────────────────────────────────────────────

/** Returns all photos for a booking, newest first, each with a 1-hour signed URL. */
export async function getBookingPhotos(bookingId: string): Promise<BookingPhotoView[]> {
  const { data, error } = await supabase
    .from('booking_photos')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  // Attach a signed URL to each row for display
  const rows = data as BookingPhoto[];
  const views: BookingPhotoView[] = await Promise.all(
    rows.map(async (row) => {
      const { data: urlData, error: urlError } = await supabase.storage
        .from('booking-photos')
        .createSignedUrl(row.photo_url, 3600);
      return {
        ...row,
        signedUrl: urlError || !urlData ? null : urlData.signedUrl,
      };
    }),
  );
  return views;
}
