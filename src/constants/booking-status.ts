/**
 * booking-status.ts — canonical booking status type, ordered list, display
 * labels, and theme-color mappings used across the admin and customer UIs.
 *
 * NOTE: Task 2 will move BookingStatus into bookings.ts and re-export from
 * there.  For now it lives here so status-badge.tsx has no circular imports.
 */

import { type ThemeColor } from '@/constants/theme';

// The full 7-status lifecycle introduced in Slice 5.
export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'provider_assigned'
  | 'on_the_way'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

// Ordered list — used to drive pickers and step indicators.
export const ALL_STATUSES: BookingStatus[] = [
  'pending',
  'accepted',
  'provider_assigned',
  'on_the_way',
  'in_progress',
  'completed',
  'cancelled',
];

// Human-readable labels shown in the UI.
export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  provider_assigned: 'Provider assigned',
  on_the_way: 'On the way',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Maps each status to a ThemeColor token for badge tinting.
export const STATUS_COLORS: Record<BookingStatus, ThemeColor> = {
  pending: 'warning',
  accepted: 'primary',
  provider_assigned: 'primary',
  on_the_way: 'primary',
  in_progress: 'primary',
  completed: 'success',
  cancelled: 'error',
};

// Forward-only provider progression: each status maps to the single next step
// a provider may move to. Empty array = no provider action available.
export const PROVIDER_NEXT_STATUSES: Record<BookingStatus, BookingStatus[]> = {
  pending: [],
  accepted: [],
  provider_assigned: ['on_the_way'],
  on_the_way: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
};
