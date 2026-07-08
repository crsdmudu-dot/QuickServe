// notifications.ts — Static notification constants, type catalog, and pure helpers.
// PURE constants only — no DB calls, no network, no writes.

import { type AppNotification, type NotificationPreferences } from '@/lib/notifications';

// ── Core Types ─────────────────────────────────────────────────────────────

/** The six DB-level category buckets for notifications. */
export type NotificationCategory =
  | 'booking'
  | 'payment'
  | 'promotion'
  | 'system'
  | 'quality'
  | 'chat';

/** Filter tabs shown in the notification center UI. */
export type NotificationFilter =
  | 'all'
  | 'unread'
  | 'booking'
  | 'payments'
  | 'promotions'
  | 'system';

/** Priority levels persisted on notification rows. */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

// ── Full Notification Type Catalog ─────────────────────────────────────────

/**
 * Catalog of every known notification type.
 * Includes the 8 existing types (from migration 0020) plus all new types added in Slice 36.
 */
export const NOTIFICATION_TYPES: Record<
  string,
  { label: string; icon: string; category: NotificationCategory; defaultPriority: NotificationPriority }
> = {
  // ── Existing types (migration 0020) ────────────────────────────────────────
  booking_assigned: {
    label: 'Booking Assigned',
    icon: '📋',
    category: 'booking',
    defaultPriority: 'normal',
  },
  booking_cancelled: {
    label: 'Booking Cancelled',
    icon: '❌',
    category: 'booking',
    defaultPriority: 'high',
  },
  booking_received: {
    label: 'Booking Received',
    icon: '🔔',
    category: 'booking',
    defaultPriority: 'normal',
  },
  payment_received: {
    label: 'Payment Received',
    icon: '💰',
    category: 'payment',
    defaultPriority: 'normal',
  },
  payment_confirmed: {
    label: 'Payment Confirmed',
    icon: '✅',
    category: 'payment',
    defaultPriority: 'normal',
  },
  provider_assigned: {
    label: 'Provider Assigned',
    icon: '👷',
    category: 'booking',
    defaultPriority: 'normal',
  },
  chat: {
    label: 'New Message',
    icon: '💬',
    category: 'chat',
    defaultPriority: 'normal',
  },
  generic: {
    label: 'Notification',
    icon: '🔔',
    category: 'system',
    defaultPriority: 'low',
  },

  // ── Customer types (Slice 36) ──────────────────────────────────────────────
  booking_accepted: {
    label: 'Booking Accepted',
    icon: '✅',
    category: 'booking',
    defaultPriority: 'normal',
  },
  provider_arriving: {
    label: 'Provider Arriving',
    icon: '🚗',
    category: 'booking',
    defaultPriority: 'high',
  },
  provider_arrived: {
    label: 'Provider Arrived',
    icon: '📍',
    category: 'booking',
    defaultPriority: 'high',
  },
  job_started: {
    label: 'Job Started',
    icon: '🔧',
    category: 'booking',
    defaultPriority: 'normal',
  },
  job_completed: {
    label: 'Job Completed',
    icon: '🎉',
    category: 'booking',
    defaultPriority: 'normal',
  },
  review_reminder: {
    label: 'Review Reminder',
    icon: '⭐',
    category: 'booking',
    defaultPriority: 'low',
  },
  promotion_available: {
    label: 'Promotion Available',
    icon: '🏷️',
    category: 'promotion',
    defaultPriority: 'low',
  },
  wallet_credit: {
    label: 'Wallet Credit',
    icon: '💳',
    category: 'payment',
    defaultPriority: 'normal',
  },
  refund_processed: {
    label: 'Refund Processed',
    icon: '↩️',
    category: 'payment',
    defaultPriority: 'normal',
  },
  general_announcement: {
    label: 'Announcement',
    icon: '📢',
    category: 'system',
    defaultPriority: 'normal',
  },

  // ── Provider types (Slice 36) ──────────────────────────────────────────────
  new_job: {
    label: 'New Job Available',
    icon: '💼',
    category: 'booking',
    defaultPriority: 'high',
  },
  customer_message: {
    label: 'Customer Message',
    icon: '💬',
    category: 'chat',
    defaultPriority: 'normal',
  },
  payment_released: {
    label: 'Payment Released',
    icon: '💸',
    category: 'payment',
    defaultPriority: 'normal',
  },
  quality_action: {
    label: 'Quality Action',
    icon: '📊',
    category: 'quality',
    defaultPriority: 'high',
  },
  conduct_reminder: {
    label: 'Conduct Reminder',
    icon: '📋',
    category: 'quality',
    defaultPriority: 'normal',
  },
  system_announcement: {
    label: 'System Announcement',
    icon: '📢',
    category: 'system',
    defaultPriority: 'normal',
  },

  // ── Admin types (Slice 36) ─────────────────────────────────────────────────
  new_support_case: {
    label: 'New Support Case',
    icon: '🎧',
    category: 'system',
    defaultPriority: 'normal',
  },
  new_dispute: {
    label: 'New Dispute',
    icon: '⚠️',
    category: 'system',
    defaultPriority: 'high',
  },
  new_provider_signup: {
    label: 'New Provider Signup',
    icon: '👤',
    category: 'system',
    defaultPriority: 'low',
  },
  booking_exception: {
    label: 'Booking Exception',
    icon: '🚨',
    category: 'booking',
    defaultPriority: 'urgent',
  },
  failed_payment: {
    label: 'Failed Payment',
    icon: '❌',
    category: 'payment',
    defaultPriority: 'urgent',
  },
  system_alert: {
    label: 'System Alert',
    icon: '🔴',
    category: 'system',
    defaultPriority: 'urgent',
  },
};

/**
 * Returns display metadata for a notification type.
 * Returns a safe generic fallback — never throws.
 */
export function notificationMeta(type: string): {
  label: string;
  icon: string;
  category: NotificationCategory;
  defaultPriority: NotificationPriority;
} {
  return (
    NOTIFICATION_TYPES[type] ?? {
      label: 'Notification',
      icon: '🔔',
      category: 'system' as NotificationCategory,
      defaultPriority: 'normal' as NotificationPriority,
    }
  );
}

// ── Category Labels ────────────────────────────────────────────────────────

/** Human-readable labels for each notification category. */
export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  booking: 'Booking',
  payment: 'Payments',
  promotion: 'Promotions',
  system: 'System',
  quality: 'Quality',
  chat: 'Messages',
};

// ── Priority Levels ────────────────────────────────────────────────────────

/** Display metadata for each priority level. Colors use theme token hex values. */
export const PRIORITY_LEVELS: {
  id: NotificationPriority;
  label: string;
  color: string;
}[] = [
  { id: 'low',    label: 'Low',    color: '#8C939D' }, // textTertiary — subtle
  { id: 'normal', label: 'Normal', color: '#5B6470' }, // textSecondary — subtle
  { id: 'high',   label: 'High',   color: '#F5A524' }, // warning — prominent
  { id: 'urgent', label: 'Urgent', color: '#E5484D' }, // error — prominent
];

// ── Filter Helpers ─────────────────────────────────────────────────────────

/** The filter tabs displayed in the notification center. */
export const NOTIFICATION_FILTERS: { id: NotificationFilter; label: string }[] = [
  { id: 'all',        label: 'All'        },
  { id: 'unread',     label: 'Unread'     },
  { id: 'booking',    label: 'Booking'    },
  { id: 'payments',   label: 'Payments'   },
  { id: 'promotions', label: 'Promotions' },
  { id: 'system',     label: 'System'     },
];

/**
 * PURE — returns true if a notification matches the given filter tab.
 * Category resolution: prefers `n.category`, falls back to NOTIFICATION_TYPES[type].category.
 * Used by filterNotifications in src/lib/notifications.ts.
 */
export function filterMatches(n: AppNotification, filter: NotificationFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'unread') return !n.is_read;

  // Resolve the category: use the DB column first, then fall back to type catalog
  const cat: string = n.category ?? (n.type ? (NOTIFICATION_TYPES[n.type]?.category ?? 'system') : 'system');

  if (filter === 'booking')    return cat === 'booking';
  if (filter === 'payments')   return cat === 'payment';
  if (filter === 'promotions') return cat === 'promotion';
  if (filter === 'system')     return cat === 'system';

  return false;
}

// ── Deep Link Resolver ─────────────────────────────────────────────────────

/**
 * PURE — resolves the deep link route for a notification.
 * Prefers `n.route` (set by DB triggers); falls back to type + metadata_json/booking_id.
 * Returns null when unresolvable. Never throws.
 */
export function resolveNotificationDeepLink(n: AppNotification): string | null {
  // 1. Prefer the DB-written route column
  if (n.route) return n.route;

  const type = n.type ?? '';
  const meta = n.metadata_json ?? {};
  const bookingId = n.booking_id ?? (meta.booking_id as string | undefined);

  try {
    // Booking types → /booking/:id
    if (
      [
        'booking_assigned',
        'booking_cancelled',
        'booking_received',
        'provider_assigned',
        'booking_accepted',
        'provider_arriving',
        'provider_arrived',
        'job_started',
        'job_completed',
        'new_job',
        'booking_exception',
      ].includes(type)
    ) {
      if (bookingId) return `/booking/${bookingId}`;
      return null;
    }

    // Review reminder → booking review screen
    if (type === 'review_reminder') {
      return '/booking/review';
    }

    // Payment / wallet / refund types → /wallet
    if (
      [
        'payment_received',
        'payment_confirmed',
        'payment_released',
        'wallet_credit',
        'refund_processed',
        'failed_payment',
      ].includes(type)
    ) {
      return '/wallet';
    }

    // Quality / conduct types → /provider/quality
    if (['quality_action', 'conduct_reminder'].includes(type)) {
      return '/provider/quality';
    }

    // Admin operations: support cases and disputes
    if (['new_support_case', 'new_dispute'].includes(type)) {
      const opId = meta.id as string | undefined;
      if (opId) return `/(admin-web)/operations/${opId}`;
      return null;
    }

    // Admin: new provider signup → admin provider-quality
    if (type === 'new_provider_signup') {
      const providerId = meta.provider_id as string | undefined;
      if (providerId) return `/(admin-web)/provider-quality/${providerId}`;
      return null;
    }

    // Promotion
    if (type === 'promotion_available') {
      return '/promotions';
    }

    // Chat / messages → no stable single route; return null
    // generic / system announcements → no deep link
    return null;
  } catch {
    // Never throw from a pure helper
    return null;
  }
}

// ── Preference Toggles ─────────────────────────────────────────────────────

/**
 * Ordered list of toggles shown in the Notification Settings screen.
 * Items marked `futureReady: true` are displayed but do not yet trigger
 * actual delivery (email/SMS channels are not wired in backend yet).
 *
 * NOTE: All toggles are for display preference only — they do NOT suppress
 * the durable in-app notification history. The in-app history is always written
 * by the DB RPC regardless of these settings. Email/SMS toggles are future-ready
 * placeholders only.
 */
export const PREFERENCE_TOGGLES: {
  key: keyof NotificationPreferences;
  label: string;
  description?: string;
  futureReady?: boolean;
}[] = [
  {
    key: 'booking_enabled',
    label: 'Booking updates',
    description: 'Notifications about booking status changes and assignments.',
  },
  {
    key: 'payment_enabled',
    label: 'Payments',
    description: 'Payment confirmations, wallet credits, and refunds.',
  },
  {
    key: 'marketing_enabled',
    label: 'Promotions',
    description: 'Special offers, promotions, and discounts.',
  },
  {
    key: 'quality_enabled',
    label: 'Quality',
    description: 'Quality actions and conduct reminders.',
  },
  {
    key: 'system_enabled',
    label: 'System',
    description: 'System alerts and announcements.',
  },
  {
    key: 'push_enabled',
    label: 'Push notifications',
    description: 'Enable push notifications on this device.',
  },
  {
    key: 'email_enabled',
    label: 'Email notifications',
    description: 'Receive notifications via email (coming soon).',
    futureReady: true,
  },
  {
    key: 'sms_enabled',
    label: 'SMS notifications',
    description: 'Receive notifications via SMS (coming soon).',
    futureReady: true,
  },
];

/** Note constant: in-app notification history is always written regardless of preferences. */
export const NOTIFICATION_HISTORY_NOTE =
  'In-app notification history is always saved, regardless of your preferences. ' +
  'Toggle settings only affect push, email, and SMS delivery.';
