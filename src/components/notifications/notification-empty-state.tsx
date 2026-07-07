/**
 * notification-empty-state.tsx — Friendly empty state for the notification center.
 *
 * Wraps the existing EmptyState primitive with per-variant copy.
 * No mutation, no DB calls.
 */

import { EmptyState } from '@/components/ui/empty-state';

export type NotificationEmptyStateVariant = 'all' | 'unread' | 'filtered';

export type NotificationEmptyStateProps = {
  /** Which tab/context the empty state appears in. Defaults to 'all'. */
  variant?: NotificationEmptyStateVariant;
};

const COPY: Record<
  NotificationEmptyStateVariant,
  { title: string; message: string }
> = {
  all: {
    title: "You're all caught up",
    message: 'No notifications yet. Check back later for updates.',
  },
  unread: {
    title: 'No unread notifications',
    message: "You've read everything — nice work!",
  },
  filtered: {
    title: 'No notifications in this filter',
    message: 'Try switching to a different category to see more.',
  },
};

/**
 * NotificationEmptyState — per-variant friendly empty state.
 */
export function NotificationEmptyState({ variant = 'all' }: NotificationEmptyStateProps) {
  const { title, message } = COPY[variant];
  return <EmptyState icon="🔔" title={title} message={message} />;
}
