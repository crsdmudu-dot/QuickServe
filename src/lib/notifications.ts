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
  // Optional extended fields (backward-compatible — absent on older rows)
  type?: string;
  category?: string;
  route?: string | null;
  dedup_key?: string | null;
  push_status?: string;
  push_error?: string | null;
  push_attempts?: number;
};

// ── Notification Preferences ───────────────────────────────────────────────

/** Shape of a row in the notification_preferences table. */
export type NotificationPreferences = {
  push_enabled: boolean;
  chat_enabled: boolean;
  booking_enabled: boolean;
  payment_enabled: boolean;
  marketing_enabled: boolean;
};

/** Safe defaults used when no row exists or on error (marketing default OFF). */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push_enabled: true,
  chat_enabled: true,
  booking_enabled: true,
  payment_enabled: true,
  marketing_enabled: false, // marketing default OFF
};

/** Own preferences; RLS scopes to the signed-in user. Absent row / error → safe defaults. */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const { data } = await supabase.from('notification_preferences').select('*').maybeSingle();
  if (!data) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  return {
    push_enabled: data.push_enabled,
    chat_enabled: data.chat_enabled,
    booking_enabled: data.booking_enabled,
    payment_enabled: data.payment_enabled,
    marketing_enabled: data.marketing_enabled,
  };
}

/** Upsert own preferences (owner-only). user_id from auth; sets updated_at. */
export async function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<{ ok: boolean; error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: 'You must be signed in.' };
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: u.user.id, ...patch, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: 'Could not update notification preferences.' };
  return { ok: true };
}

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
