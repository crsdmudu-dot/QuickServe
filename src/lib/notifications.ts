// notifications.ts — Supabase helpers for reading and marking in-app notifications.
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

/** A row from the notifications table. Written by DB triggers. */
export type AppNotification = {
  id: string;
  user_id: string;
  booking_id: string | null;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
};

// ── Queries ────────────────────────────────────────────────────────────────

/** Returns the signed-in user's notifications, newest first. RLS scopes to own rows. */
export async function getMyNotifications(): Promise<AppNotification[]> {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as AppNotification[] | null) ?? [];
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Marks a single notification as read by id. */
export async function markNotificationRead(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);
  if (error) return { ok: false, error: 'Could not mark notification as read. Please try again.' };
  return { ok: true };
}

/** Marks all of the signed-in user's unread notifications as read. */
export async function markAllNotificationsRead(): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return { ok: false, error: 'You must be signed in.' };
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false);
  if (error) return { ok: false, error: 'Could not mark notifications as read. Please try again.' };
  return { ok: true };
}
