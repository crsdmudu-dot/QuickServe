// notifications.ts — Supabase helpers for reading and marking in-app notifications.
import { supabase } from '@/lib/supabase';
import { type NotificationFilter, filterMatches } from '@/constants/notifications';

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
  // T1 (migration 0031) new columns
  audience_type?: 'customer' | 'provider' | 'admin' | null;
  metadata_json?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  read_at?: string | null;
};

// ── Notification Preferences ───────────────────────────────────────────────

/** Shape of a row in the notification_preferences table. */
export type NotificationPreferences = {
  push_enabled: boolean;
  chat_enabled: boolean;
  booking_enabled: boolean;
  payment_enabled: boolean;
  marketing_enabled: boolean;
  // T1 (migration 0031) new columns
  quality_enabled: boolean;
  system_enabled: boolean;
  email_enabled: boolean;  // future-ready (no send yet)
  sms_enabled: boolean;    // future-ready (no send yet)
};

/** Safe defaults used when no row exists or on error (marketing/email/sms default OFF). */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push_enabled: true,
  chat_enabled: true,
  booking_enabled: true,
  payment_enabled: true,
  marketing_enabled: false, // marketing default OFF
  quality_enabled: true,
  system_enabled: true,
  email_enabled: false,     // future-ready default OFF
  sms_enabled: false,       // future-ready default OFF
};

/** Own preferences; RLS scopes to the signed-in user. Absent row / error → safe defaults. */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const { data } = await supabase.from('notification_preferences').select('*').maybeSingle();
  if (!data) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  return {
    push_enabled: data.push_enabled ?? true,
    chat_enabled: data.chat_enabled ?? true,
    booking_enabled: data.booking_enabled ?? true,
    payment_enabled: data.payment_enabled ?? true,
    marketing_enabled: data.marketing_enabled ?? false,
    quality_enabled: data.quality_enabled ?? true,
    system_enabled: data.system_enabled ?? true,
    email_enabled: data.email_enabled ?? false,
    sms_enabled: data.sms_enabled ?? false,
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

/** Returns the signed-in user's notifications, newest first. RLS scopes to own rows. Pass page + pageSize for pagination. */
export async function getMyNotifications(page?: number, pageSize?: number): Promise<AppNotification[]> {
  let q = supabase.from('notifications').select('*').order('created_at', { ascending: false });
  if (page != null && pageSize != null) q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data } = await q;
  return (data as AppNotification[] | null) ?? [];
}

/** Returns the count of unread notifications for the signed-in user (RLS scoped). Returns 0 on error. */
export async function getUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);
  if (error) return 0;
  return count ?? 0;
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Marks a single notification as read by id. Also sets read_at timestamp. */
export async function markNotificationRead(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: 'Could not mark notification as read. Please try again.' };
  return { ok: true };
}

/** Marks all of the signed-in user's unread notifications as read. Also sets read_at timestamp. */
export async function markAllNotificationsRead(): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return { ok: false, error: 'You must be signed in.' };
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('is_read', false);
  if (error) return { ok: false, error: 'Could not mark notifications as read. Please try again.' };
  return { ok: true };
}

// ── RPC Wrappers ───────────────────────────────────────────────────────────

/**
 * Thin wrapper around the `emit_notification` RPC.
 * Inserts a durable in-app notification unconditionally — NO client push,
 * NO preference gating. The RPC handles dedup, priority, and metadata.
 */
export async function emitNotification(input: {
  userId: string;
  audienceType?: string;
  notificationType: string;
  category: string;
  title: string;
  body: string;
  deepLink?: string;
  metadata?: Record<string, unknown>;
  priority?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('emit_notification', {
    p_user_id: input.userId,
    p_audience_type: input.audienceType,
    p_notification_type: input.notificationType,
    p_category: input.category,
    p_title: input.title,
    p_body: input.body,
    p_deep_link: input.deepLink,
    p_metadata: input.metadata,
    p_priority: input.priority,
  });
  if (error) return { ok: false, error: 'Could not emit notification. Please try again.' };
  return { ok: true, id: data as string | undefined };
}

/**
 * Thin wrapper around the `broadcast_announcement` RPC.
 * Inserts a notification for every user of the given audience type.
 * Returns the count of rows inserted. NO client push, NO preference gating.
 */
export async function broadcastAnnouncement(input: {
  audienceType: 'customer' | 'provider' | 'admin';
  title: string;
  body: string;
  deepLink?: string;
  priority?: string;
}): Promise<{ ok: boolean; count?: number; error?: string }> {
  const { data, error } = await supabase.rpc('broadcast_announcement', {
    p_audience_type: input.audienceType,
    p_title: input.title,
    p_body: input.body,
    p_deep_link: input.deepLink,
    p_priority: input.priority,
  });
  if (error) return { ok: false, error: 'Could not broadcast announcement. Please try again.' };
  return { ok: true, count: data as number };
}

// ── Pure Helpers ───────────────────────────────────────────────────────────

/**
 * PURE — filters a list of notifications by the given filter tab.
 * Uses filterMatches from constants (no I/O, deterministic).
 */
export function filterNotifications(
  notifications: AppNotification[],
  filter: NotificationFilter,
): AppNotification[] {
  return notifications.filter((n) => filterMatches(n, filter));
}

/**
 * PURE — groups notifications into Today / Yesterday / Earlier buckets.
 * Preserves within-bucket order (newest first).
 * Accepts an optional `now` for testability (defaults to new Date()).
 */
export function groupNotificationsByDate(
  notifications: AppNotification[],
  now?: Date,
): { label: string; items: AppNotification[] }[] {
  const ref = now ?? new Date();

  // Build midnight boundaries
  const todayStart = new Date(ref);
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const today: AppNotification[] = [];
  const yesterday: AppNotification[] = [];
  const earlier: AppNotification[] = [];

  for (const n of notifications) {
    const d = new Date(n.created_at);
    if (d >= todayStart) {
      today.push(n);
    } else if (d >= yesterdayStart) {
      yesterday.push(n);
    } else {
      earlier.push(n);
    }
  }

  const buckets: { label: string; items: AppNotification[] }[] = [];
  if (today.length > 0) buckets.push({ label: 'Today', items: today });
  if (yesterday.length > 0) buckets.push({ label: 'Yesterday', items: yesterday });
  if (earlier.length > 0) buckets.push({ label: 'Earlier', items: earlier });
  return buckets;
}
