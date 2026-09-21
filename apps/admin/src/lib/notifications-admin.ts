// notifications-admin.ts — admin-only notification dispatch, split out of @/lib/notifications.
//
// emit_notification and broadcast_announcement are admin-guarded RPCs; no customer or provider
// screen sends notifications. Reading, preferences, filtering and grouping stay shared.
import { supabase } from '@/lib/supabase';

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
