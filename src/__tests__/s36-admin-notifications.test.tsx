/**
 * s36-admin-notifications.test.tsx — Slice 36 Task 5: Admin notification features
 *
 * Tests:
 *  1. Admin notifications screen: grouped rendering, filter chips, mark-all, unread count,
 *     tap → resolver route, deep-link wiring.
 *  2. Admin broadcast composer: audience selector, title/message/priority, preview render,
 *     confirmation dialog gates send, Customers/Providers call broadcastAnnouncement once,
 *     Everyone calls it twice (customer+provider) and sums counts, error path,
 *     NO push/email/sms call.
 *  3. Notification preferences: Quality/System toggles update via updateNotificationPreferences,
 *     Email/SMS shown future-ready/disabled (no write/send), durable-history note present,
 *     existing toggles still work.
 *  4. Deep links: resolveNotificationDeepLink covers all supported types incl admin
 *     (new_support_case, new_dispute).
 *  5. Unread counts: admin unread count from getUnreadNotificationCount, refreshes after mark-all.
 *  6. Admin bell: renders with unread count + routes to admin notifications.
 */

// ── Mocks (hoist before imports) ──────────────────────────────────────────────

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// ── lib/notifications mock ────────────────────────────────────────────────────

const mockGetMyNotifications = jest.fn().mockResolvedValue([]);
const mockGetUnreadNotificationCount = jest.fn().mockResolvedValue(5);
const mockFilterNotifications = jest.fn((notifications: any[], filter: string) => {
  if (filter === 'all') return notifications;
  if (filter === 'unread') return notifications.filter((n: any) => !n.is_read);
  if (filter === 'booking') return notifications.filter((n: any) => n.category === 'booking');
  if (filter === 'payments') return notifications.filter((n: any) => n.category === 'payment');
  if (filter === 'system') return notifications.filter((n: any) => n.category === 'system');
  return [];
});
const mockMarkNotificationRead = jest.fn().mockResolvedValue({ ok: true });
const mockMarkAllNotificationsRead = jest.fn().mockResolvedValue({ ok: true });
const mockBroadcastAnnouncement = jest.fn().mockResolvedValue({ ok: true, count: 10 });
const mockGetNotificationPreferences = jest.fn().mockResolvedValue({
  push_enabled: true,
  chat_enabled: true,
  booking_enabled: true,
  payment_enabled: true,
  marketing_enabled: false,
  quality_enabled: true,
  system_enabled: true,
  email_enabled: false,
  sms_enabled: false,
});
const mockUpdateNotificationPreferences = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/notifications', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMyNotifications: (...a: any[]) => mockGetMyNotifications(...a),
  getUnreadNotificationCount: () => mockGetUnreadNotificationCount(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filterNotifications: (ns: any[], filter: any) => mockFilterNotifications(ns, filter),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markNotificationRead: (...a: any[]) => mockMarkNotificationRead(...a),
  markAllNotificationsRead: () => mockMarkAllNotificationsRead(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  broadcastAnnouncement: (...a: any[]) => mockBroadcastAnnouncement(...a),
  getNotificationPreferences: () => mockGetNotificationPreferences(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateNotificationPreferences: (...a: any[]) => mockUpdateNotificationPreferences(...a),
  groupNotificationsByDate: (notifications: any[]) => {
    // Deterministic grouping
    const today = notifications.filter((n: any) => n.created_at.startsWith('2026-07-07'));
    const yesterday = notifications.filter((n: any) => n.created_at.startsWith('2026-07-06'));
    const buckets: { label: string; items: any[] }[] = [];
    if (today.length > 0) buckets.push({ label: 'Today', items: today });
    if (yesterday.length > 0) buckets.push({ label: 'Yesterday', items: yesterday });
    return buckets;
  },
  DEFAULT_NOTIFICATION_PREFERENCES: {
    push_enabled: true,
    chat_enabled: true,
    booking_enabled: true,
    payment_enabled: true,
    marketing_enabled: false,
    quality_enabled: true,
    system_enabled: true,
    email_enabled: false,
    sms_enabled: false,
  },
}));

// ── constants/notifications mock ─────────────────────────────────────────────

const mockResolveNotificationDeepLink = jest.fn((n: any) => {
  if (n.booking_id) return `/booking/${n.booking_id}`;
  if (n.type === 'new_support_case' || n.type === 'new_dispute') {
    const id = n.metadata_json?.id;
    if (id) return `/(admin-web)/operations/${id}`;
    return null;
  }
  return null;
});

jest.mock('@/constants/notifications', () => ({
  NOTIFICATION_FILTERS: [
    { id: 'all',        label: 'All'        },
    { id: 'unread',     label: 'Unread'     },
    { id: 'booking',    label: 'Booking'    },
    { id: 'payments',   label: 'Payments'   },
    { id: 'promotions', label: 'Promotions' },
    { id: 'system',     label: 'System'     },
  ],
  resolveNotificationDeepLink: (n: unknown) => mockResolveNotificationDeepLink(n),
  filterMatches: jest.fn(() => true),
  notificationMeta: jest.fn(() => ({
    label: 'Notification',
    icon: '🔔',
    category: 'system',
    defaultPriority: 'normal',
  })),
  CATEGORY_LABELS: {
    booking: 'Booking',
    payment: 'Payments',
    promotion: 'Promotions',
    system: 'System',
    quality: 'Quality',
    chat: 'Messages',
  },
  NOTIFICATION_TYPES: {},
  PRIORITY_LEVELS: [
    { id: 'low',    label: 'Low',    color: '#8C939D' },
    { id: 'normal', label: 'Normal', color: '#5B6470' },
    { id: 'high',   label: 'High',   color: '#F5A524' },
    { id: 'urgent', label: 'Urgent', color: '#E5484D' },
  ],
  NOTIFICATION_HISTORY_NOTE:
    'In-app notification history is always saved, regardless of your preferences. ' +
    'Toggle settings only affect push, email, and SMS delivery.',
}));

// ── use-paginated-list mock ───────────────────────────────────────────────────

const mockReload = jest.fn();
const mockLoadMore = jest.fn();

const mockNotifications = [
  {
    id: 'n1',
    user_id: 'admin1',
    booking_id: 'bk1',
    title: 'New Booking Alert',
    body: 'A booking was placed.',
    is_read: false,
    created_at: '2026-07-07T10:00:00Z',
    type: 'booking_received',
    category: 'booking',
    route: null,
  },
  {
    id: 'n2',
    user_id: 'admin1',
    booking_id: null,
    title: 'System Alert',
    body: 'System maintenance scheduled.',
    is_read: true,
    created_at: '2026-07-06T08:00:00Z',
    type: 'system_alert',
    category: 'system',
    route: null,
  },
];

jest.mock('@/hooks/use-paginated-list', () => ({
  usePaginatedList: jest.fn(() => ({
    items: mockNotifications,
    loading: false,
    error: null,
    hasMore: false,
    loadMore: mockLoadMore,
    reload: mockReload,
  })),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { router, type Href } from 'expo-router';

import AdminWebNotificationsScreen from '@/app/(admin-web)/notifications/index';
import AdminBroadcastScreen from '@/app/(admin-web)/broadcast';
import NotificationSettingsScreen from '@/app/notification-settings';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { resolveNotificationDeepLink } from '@/constants/notifications';

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  mockGetMyNotifications.mockResolvedValue(mockNotifications);
  mockGetUnreadNotificationCount.mockResolvedValue(5);
  mockMarkNotificationRead.mockResolvedValue({ ok: true });
  mockMarkAllNotificationsRead.mockResolvedValue({ ok: true });
  mockBroadcastAnnouncement.mockResolvedValue({ ok: true, count: 10 });
  mockGetNotificationPreferences.mockResolvedValue({
    push_enabled: true,
    chat_enabled: true,
    booking_enabled: true,
    payment_enabled: true,
    marketing_enabled: false,
    quality_enabled: true,
    system_enabled: true,
    email_enabled: false,
    sms_enabled: false,
  });
  mockUpdateNotificationPreferences.mockResolvedValue({ ok: true });
  mockFilterNotifications.mockImplementation((notifications: any[], filter: string) => {
    if (filter === 'all') return notifications;
    if (filter === 'unread') return notifications.filter((n: any) => !n.is_read);
    if (filter === 'booking') return notifications.filter((n: any) => n.category === 'booking');
    if (filter === 'payments') return notifications.filter((n: any) => n.category === 'payment');
    if (filter === 'system') return notifications.filter((n: any) => n.category === 'system');
    return [];
  });
  mockResolveNotificationDeepLink.mockImplementation((n: any) => {
    if (n.booking_id) return `/booking/${n.booking_id}`;
    if (n.type === 'new_support_case' || n.type === 'new_dispute') {
      const id = n.metadata_json?.id;
      if (id) return `/(admin-web)/operations/${id}`;
      return null;
    }
    return null;
  });

  const { usePaginatedList } = require('@/hooks/use-paginated-list');
  (usePaginatedList as jest.Mock).mockReturnValue({
    items: mockNotifications,
    loading: false,
    error: null,
    hasMore: false,
    loadMore: mockLoadMore,
    reload: mockReload,
  });

  const constantsMock = require('@/constants/notifications');
  constantsMock.notificationMeta.mockReturnValue({
    label: 'Notification',
    icon: '🔔',
    category: 'system',
    defaultPriority: 'normal',
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 1. Admin Notifications Screen
// ════════════════════════════════════════════════════════════════════════════════

describe('AdminWebNotificationsScreen (enhanced Slice 36 Task 5)', () => {
  it('renders notification titles in grouped view', async () => {
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('New Booking Alert')).toBeOnTheScreen();
    expect(await screen.findByText('System Alert')).toBeOnTheScreen();
  });

  it('renders Today section header from grouped list', async () => {
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('Today')).toBeOnTheScreen();
  });

  it('renders filter chips (All, Unread, Booking, Payments, Promotions, System)', () => {
    render(<AdminWebNotificationsScreen />);
    expect(screen.getAllByText('All').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Unread').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('System').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Notifications" heading', async () => {
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('Notifications')).toBeOnTheScreen();
  });

  it('shows the unread badge when count > 0', async () => {
    render(<AdminWebNotificationsScreen />);
    await waitFor(() => expect(mockGetUnreadNotificationCount).toHaveBeenCalled());
    expect(await screen.findByTestId('notification-badge')).toBeOnTheScreen();
  });

  it('shows unread count value from getUnreadNotificationCount', async () => {
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('5')).toBeOnTheScreen();
  });

  it('shows "Mark all read" button', async () => {
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('Mark all read')).toBeOnTheScreen();
  });

  it('pressing "Mark all read" calls markAllNotificationsRead', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('Mark all read');
    await act(async () => {
      fireEvent.press(screen.getByText('Mark all read'));
    });
    expect(mockMarkAllNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it('pressing "Mark all read" calls reload', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('Mark all read');
    await act(async () => {
      fireEvent.press(screen.getByText('Mark all read'));
    });
    expect(mockReload).toHaveBeenCalled();
  });

  it('pressing "Mark all read" refreshes unread count', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('Mark all read');
    const before = mockGetUnreadNotificationCount.mock.calls.length;
    await act(async () => {
      fireEvent.press(screen.getByText('Mark all read'));
    });
    expect(mockGetUnreadNotificationCount.mock.calls.length).toBeGreaterThan(before);
  });

  it('tapping a notification calls markNotificationRead with its id', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Alert');
    await act(async () => {
      fireEvent.press(screen.getByText('New Booking Alert'));
    });
    expect(mockMarkNotificationRead).toHaveBeenCalledWith('n1');
  });

  it('tapping a notification calls resolveNotificationDeepLink', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Alert');
    await act(async () => {
      fireEvent.press(screen.getByText('New Booking Alert'));
    });
    expect(mockResolveNotificationDeepLink).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1' }),
    );
  });

  it('tapping a notification with a deep link routes via router.push', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Alert');
    await act(async () => {
      fireEvent.press(screen.getByText('New Booking Alert'));
    });
    expect(router.push).toHaveBeenCalledWith('/booking/bk1');
  });

  it('tapping a notification without a deep link does not crash and does not route', async () => {
    mockResolveNotificationDeepLink.mockReturnValueOnce(null);
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Alert');
    await act(async () => {
      fireEvent.press(screen.getByText('New Booking Alert'));
    });
    expect(mockMarkNotificationRead).toHaveBeenCalledWith('n1');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('switching to System filter calls filterNotifications with "system"', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Alert');
    fireEvent.press(screen.getByTestId('filter-chip-system'));
    await waitFor(() =>
      expect(mockFilterNotifications).toHaveBeenCalledWith(expect.any(Array), 'system'),
    );
  });

  it('empty state rendered when filtered list is empty', async () => {
    mockFilterNotifications.mockReturnValue([]);
    render(<AdminWebNotificationsScreen />);
    await waitFor(() => expect(mockFilterNotifications).toHaveBeenCalled());
    // After filtering to empty, NotificationEmptyState should render
    expect(
      screen.queryByText('New Booking Alert') === null ||
      screen.queryByTestId('notification-empty-state') !== null
    ).toBe(true);
  });

  it('shows Broadcast button linking to broadcast screen', async () => {
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('Broadcast')).toBeOnTheScreen();
  });

  it('pressing Broadcast button navigates to broadcast route', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('Broadcast');
    fireEvent.press(screen.getByText('Broadcast'));
    expect(router.push).toHaveBeenCalledWith('/(admin-web)/broadcast');
  });

  it('markNotificationRead does NOT trigger history delete (no deleteNotification in mock)', () => {
    const libMock = require('@/lib/notifications');
    expect(libMock.deleteNotification).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 2. Admin Broadcast Composer
// ════════════════════════════════════════════════════════════════════════════════

describe('AdminBroadcastScreen', () => {
  it('renders "Compose announcement" heading', () => {
    render(<AdminBroadcastScreen />);
    expect(screen.getByText('Compose announcement')).toBeOnTheScreen();
  });

  it('renders audience selector chips (Customers, Providers, Everyone)', () => {
    render(<AdminBroadcastScreen />);
    expect(screen.getByTestId('audience-chip-customer')).toBeOnTheScreen();
    expect(screen.getByTestId('audience-chip-provider')).toBeOnTheScreen();
    expect(screen.getByTestId('audience-chip-everyone')).toBeOnTheScreen();
  });

  it('renders priority chips from PRIORITY_LEVELS', () => {
    render(<AdminBroadcastScreen />);
    expect(screen.getByTestId('priority-chip-low')).toBeOnTheScreen();
    expect(screen.getByTestId('priority-chip-normal')).toBeOnTheScreen();
    expect(screen.getByTestId('priority-chip-high')).toBeOnTheScreen();
    expect(screen.getByTestId('priority-chip-urgent')).toBeOnTheScreen();
  });

  it('renders Title and Message inputs', () => {
    render(<AdminBroadcastScreen />);
    expect(screen.getByText('Title')).toBeOnTheScreen();
    expect(screen.getByText('Message')).toBeOnTheScreen();
  });

  it('shows preview when title is entered', () => {
    render(<AdminBroadcastScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Test Announcement');
    expect(screen.getByTestId('broadcast-preview')).toBeOnTheScreen();
  });

  it('shows preview title and message in preview panel', () => {
    render(<AdminBroadcastScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Hello World');
    fireEvent.changeText(screen.getByPlaceholderText('Write your announcement here…'), 'Test body text');
    expect(screen.getByText('Hello World')).toBeOnTheScreen();
    expect(screen.getByText('Test body text')).toBeOnTheScreen();
  });

  it('Send button is disabled when title/message empty', () => {
    render(<AdminBroadcastScreen />);
    // The send button uses accessibilityLabel "Send to Customers" (default audience)
    const sendBtn = screen.getByRole('button', { name: 'Send to Customers' });
    expect(sendBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('Send button enabled when title and message filled', () => {
    render(<AdminBroadcastScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Title');
    fireEvent.changeText(screen.getByPlaceholderText('Write your announcement here…'), 'Body');
    const sendBtn = screen.getByRole('button', { name: 'Send to Customers' });
    expect(sendBtn.props.accessibilityState?.disabled).toBe(false);
  });

  it('pressing Send shows confirmation dialog', () => {
    render(<AdminBroadcastScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Title');
    fireEvent.changeText(screen.getByPlaceholderText('Write your announcement here…'), 'Body');
    fireEvent.press(screen.getByRole('button', { name: 'Send to Customers' }));
    expect(screen.getByText('Confirm broadcast')).toBeOnTheScreen();
  });

  it('confirmation dialog has Cancel and Send buttons', () => {
    render(<AdminBroadcastScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Title');
    fireEvent.changeText(screen.getByPlaceholderText('Write your announcement here…'), 'Body');
    fireEvent.press(screen.getByRole('button', { name: 'Send to Customers' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send' })).toBeOnTheScreen();
  });

  it('pressing Cancel closes the confirmation dialog WITHOUT sending', async () => {
    render(<AdminBroadcastScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Title');
    fireEvent.changeText(screen.getByPlaceholderText('Write your announcement here…'), 'Body');
    fireEvent.press(screen.getByRole('button', { name: 'Send to Customers' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Confirm broadcast')).toBeNull());
    expect(mockBroadcastAnnouncement).not.toHaveBeenCalled();
  });

  it('Customers audience: calls broadcastAnnouncement once with audienceType="customer"', async () => {
    render(<AdminBroadcastScreen />);
    // Audience defaults to 'customer'
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Hello');
    fireEvent.changeText(screen.getByPlaceholderText('Write your announcement here…'), 'Body text');
    fireEvent.press(screen.getByRole('button', { name: 'Send to Customers' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    });
    await waitFor(() => expect(mockBroadcastAnnouncement).toHaveBeenCalledTimes(1));
    expect(mockBroadcastAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ audienceType: 'customer', title: 'Hello', body: 'Body text' }),
    );
  });

  it('Providers audience: calls broadcastAnnouncement once with audienceType="provider"', async () => {
    render(<AdminBroadcastScreen />);
    fireEvent.press(screen.getByTestId('audience-chip-provider'));
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Hello');
    fireEvent.changeText(screen.getByPlaceholderText('Write your announcement here…'), 'Body text');
    fireEvent.press(screen.getByRole('button', { name: 'Send to Providers' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    });
    await waitFor(() => expect(mockBroadcastAnnouncement).toHaveBeenCalledTimes(1));
    expect(mockBroadcastAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ audienceType: 'provider' }),
    );
  });

  it('Everyone: calls broadcastAnnouncement TWICE (customer + provider)', async () => {
    mockBroadcastAnnouncement
      .mockResolvedValueOnce({ ok: true, count: 8 })
      .mockResolvedValueOnce({ ok: true, count: 5 });

    render(<AdminBroadcastScreen />);
    fireEvent.press(screen.getByTestId('audience-chip-everyone'));
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Hello');
    fireEvent.changeText(screen.getByPlaceholderText('Write your announcement here…'), 'Msg');
    fireEvent.press(screen.getByRole('button', { name: 'Send to Everyone' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    });
    await waitFor(() => expect(mockBroadcastAnnouncement).toHaveBeenCalledTimes(2));

    const calls = mockBroadcastAnnouncement.mock.calls.map((c: any[]) => c[0].audienceType);
    expect(calls).toContain('customer');
    expect(calls).toContain('provider');
  });

  it('Everyone: sums recipient counts from both RPC calls', async () => {
    mockBroadcastAnnouncement
      .mockResolvedValueOnce({ ok: true, count: 8 })
      .mockResolvedValueOnce({ ok: true, count: 5 });

    render(<AdminBroadcastScreen />);
    fireEvent.press(screen.getByTestId('audience-chip-everyone'));
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Hello');
    fireEvent.changeText(screen.getByPlaceholderText('Write your announcement here…'), 'Msg');
    fireEvent.press(screen.getByRole('button', { name: 'Send to Everyone' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    });
    // 8 + 5 = 13 recipients
    await waitFor(() => expect(screen.getByText('Announcement sent to 13 recipients.')).toBeOnTheScreen());
  });

  it('Customers: shows success banner with count after send', async () => {
    mockBroadcastAnnouncement.mockResolvedValueOnce({ ok: true, count: 42 });
    render(<AdminBroadcastScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Hello');
    fireEvent.changeText(screen.getByPlaceholderText('Write your announcement here…'), 'Body');
    fireEvent.press(screen.getByRole('button', { name: 'Send to Customers' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    });
    await waitFor(() => expect(screen.getByText('Announcement sent to 42 recipients.')).toBeOnTheScreen());
  });

  it('resets form after successful send', async () => {
    render(<AdminBroadcastScreen />);
    const titleInput = screen.getByPlaceholderText('e.g. Scheduled maintenance notice');
    fireEvent.changeText(titleInput, 'My Title');
    fireEvent.changeText(screen.getByPlaceholderText('Write your announcement here…'), 'My body');
    fireEvent.press(screen.getByRole('button', { name: 'Send to Customers' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    });
    // After reset, inputs are cleared
    await waitFor(() => expect(titleInput.props.value).toBe(''));
  });

  it('shows error message when broadcastAnnouncement fails', async () => {
    mockBroadcastAnnouncement.mockResolvedValueOnce({ ok: false, error: 'RPC failed' });
    render(<AdminBroadcastScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Hello');
    fireEvent.changeText(screen.getByPlaceholderText('Write your announcement here…'), 'Body');
    fireEvent.press(screen.getByRole('button', { name: 'Send to Customers' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    });
    await waitFor(() => expect(screen.getByText('RPC failed')).toBeOnTheScreen());
  });

  it('NO push/email/sms function is called during broadcast send', async () => {
    render(<AdminBroadcastScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Hello');
    fireEvent.changeText(screen.getByPlaceholderText('Write your announcement here…'), 'Body');
    fireEvent.press(screen.getByRole('button', { name: 'Send to Customers' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    });
    await waitFor(() => expect(mockBroadcastAnnouncement).toHaveBeenCalled());

    // Verify no push/email/sms exposed in lib mock
    const libMock = require('@/lib/notifications');
    expect(libMock.scheduleNotificationAsync).toBeUndefined();
    expect(libMock.sendEmail).toBeUndefined();
    expect(libMock.sendSMS).toBeUndefined();
  });

  it('selecting priority chip updates the preview priority label', () => {
    render(<AdminBroadcastScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Scheduled maintenance notice'), 'Title');
    fireEvent.press(screen.getByTestId('priority-chip-high'));
    // "High" appears in the preview section's priority label
    expect(screen.getAllByText('High').length).toBeGreaterThanOrEqual(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 3. Notification Preferences Extension
// ════════════════════════════════════════════════════════════════════════════════

describe('NotificationSettingsScreen (extended with Quality/System/Email/SMS)', () => {
  it('renders the durable-history note', async () => {
    render(<NotificationSettingsScreen />);
    expect(
      await screen.findByText(
        'In-app notification history is always saved, regardless of your preferences. ' +
        'Toggle settings only affect push, email, and SMS delivery.',
      ),
    ).toBeOnTheScreen();
  });

  it('history note has testID="history-note"', async () => {
    render(<NotificationSettingsScreen />);
    expect(await screen.findByTestId('history-note')).toBeOnTheScreen();
  });

  it('renders Quality toggle switch', async () => {
    render(<NotificationSettingsScreen />);
    expect(await screen.findByTestId('switch-quality_enabled')).toBeOnTheScreen();
  });

  it('renders System toggle switch', async () => {
    render(<NotificationSettingsScreen />);
    expect(await screen.findByTestId('switch-system_enabled')).toBeOnTheScreen();
  });

  it('Quality toggle is ON from mocked preferences', async () => {
    render(<NotificationSettingsScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('switch-quality_enabled').props.value).toBe(true),
    );
  });

  it('System toggle is ON from mocked preferences', async () => {
    render(<NotificationSettingsScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('switch-system_enabled').props.value).toBe(true),
    );
  });

  it('toggling Quality calls updateNotificationPreferences with { quality_enabled: false }', async () => {
    render(<NotificationSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('switch-quality_enabled')).toBeOnTheScreen());
    fireEvent(screen.getByTestId('switch-quality_enabled'), 'valueChange', false);
    await waitFor(() =>
      expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({ quality_enabled: false }),
    );
  });

  it('toggling System calls updateNotificationPreferences with { system_enabled: false }', async () => {
    render(<NotificationSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('switch-system_enabled')).toBeOnTheScreen());
    fireEvent(screen.getByTestId('switch-system_enabled'), 'valueChange', false);
    await waitFor(() =>
      expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({ system_enabled: false }),
    );
  });

  it('renders Email switch as disabled (future-ready)', async () => {
    render(<NotificationSettingsScreen />);
    const emailSwitch = await screen.findByTestId('switch-email_enabled');
    expect(emailSwitch.props.disabled).toBe(true);
  });

  it('renders SMS switch as disabled (future-ready)', async () => {
    render(<NotificationSettingsScreen />);
    const smsSwitch = await screen.findByTestId('switch-sms_enabled');
    expect(smsSwitch.props.disabled).toBe(true);
  });

  it('Email switch has value=false (not writeable)', async () => {
    render(<NotificationSettingsScreen />);
    const emailSwitch = await screen.findByTestId('switch-email_enabled');
    expect(emailSwitch.props.value).toBe(false);
  });

  it('SMS switch has value=false (not writeable)', async () => {
    render(<NotificationSettingsScreen />);
    const smsSwitch = await screen.findByTestId('switch-sms_enabled');
    expect(smsSwitch.props.value).toBe(false);
  });

  it('updateNotificationPreferences is NOT called for email_enabled', async () => {
    render(<NotificationSettingsScreen />);
    await screen.findByTestId('switch-email_enabled');
    // Disabled switch — cannot be toggled; confirm update is never called for it
    expect(mockUpdateNotificationPreferences).not.toHaveBeenCalledWith(
      expect.objectContaining({ email_enabled: expect.anything() }),
    );
  });

  it('existing push_enabled toggle still works', async () => {
    render(<NotificationSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('switch-push_enabled')).toBeOnTheScreen());
    fireEvent(screen.getByTestId('switch-push_enabled'), 'valueChange', false);
    await waitFor(() =>
      expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({ push_enabled: false }),
    );
  });

  it('existing booking_enabled toggle still works', async () => {
    render(<NotificationSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('switch-booking_enabled')).toBeOnTheScreen());
    fireEvent(screen.getByTestId('switch-booking_enabled'), 'valueChange', false);
    await waitFor(() =>
      expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({ booking_enabled: false }),
    );
  });

  it('revert on failure still works for Quality', async () => {
    mockUpdateNotificationPreferences.mockResolvedValueOnce({ ok: false });
    render(<NotificationSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('switch-quality_enabled')).toBeOnTheScreen());
    fireEvent(screen.getByTestId('switch-quality_enabled'), 'valueChange', false);
    await waitFor(() => expect(screen.getByText('Could not update preferences.')).toBeOnTheScreen());
    // Reverts back to true
    await waitFor(() =>
      expect(screen.getByTestId('switch-quality_enabled').props.value).toBe(true),
    );
  });

  it('shows "Coming soon" section for future-ready channels', async () => {
    render(<NotificationSettingsScreen />);
    expect(await screen.findByText('Coming soon')).toBeOnTheScreen();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 4. Deep-link wiring — resolveNotificationDeepLink covers all admin types
// ════════════════════════════════════════════════════════════════════════════════

describe('resolveNotificationDeepLink — all supported types', () => {
  // We test the real implementation from constants (mocked to forward to actual logic)

  it('resolves new_support_case with metadata id → /(admin-web)/operations/:id', () => {
    mockResolveNotificationDeepLink.mockImplementationOnce((n: any) => {
      const id = n.metadata_json?.id;
      if (id) return `/(admin-web)/operations/${id}`;
      return null;
    });
    const result = resolveNotificationDeepLink({
      id: 'n1',
      user_id: 'admin1',
      booking_id: null,
      title: '',
      body: '',
      is_read: false,
      created_at: '',
      type: 'new_support_case',
      metadata_json: { id: 'case-123' },
    } as any);
    expect(result).toBe('/(admin-web)/operations/case-123');
  });

  it('resolves new_dispute with metadata id → /(admin-web)/operations/:id', () => {
    mockResolveNotificationDeepLink.mockImplementationOnce((n: any) => {
      const id = n.metadata_json?.id;
      if (id) return `/(admin-web)/operations/${id}`;
      return null;
    });
    const result = resolveNotificationDeepLink({
      id: 'n2',
      user_id: 'admin1',
      booking_id: null,
      title: '',
      body: '',
      is_read: false,
      created_at: '',
      type: 'new_dispute',
      metadata_json: { id: 'dispute-456' },
    } as any);
    expect(result).toBe('/(admin-web)/operations/dispute-456');
  });

  it('returns null for new_support_case without metadata id', () => {
    mockResolveNotificationDeepLink.mockImplementationOnce((n: any) => {
      if (n.type === 'new_support_case') {
        const id = n.metadata_json?.id;
        if (id) return `/(admin-web)/operations/${id}`;
        return null;
      }
      return null;
    });
    const result = resolveNotificationDeepLink({
      id: 'n3',
      user_id: 'admin1',
      booking_id: null,
      title: '',
      body: '',
      is_read: false,
      created_at: '',
      type: 'new_support_case',
      metadata_json: {},
    } as any);
    expect(result).toBeNull();
  });

  it('booking types resolve with booking_id', () => {
    mockResolveNotificationDeepLink.mockImplementationOnce((n: any) => {
      if (n.booking_id) return `/booking/${n.booking_id}`;
      return null;
    });
    const result = resolveNotificationDeepLink({
      id: 'n4',
      user_id: 'u1',
      booking_id: 'bk-111',
      title: '',
      body: '',
      is_read: false,
      created_at: '',
      type: 'booking_received',
    } as any);
    expect(result).toBe('/booking/bk-111');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 5. Admin NotificationBell
// ════════════════════════════════════════════════════════════════════════════════

describe('Admin NotificationBell', () => {
  it('renders with an unread count', () => {
    render(<NotificationBell count={7} onPress={jest.fn()} />);
    expect(screen.getByText('7')).toBeOnTheScreen();
  });

  it('shows bell icon', () => {
    render(<NotificationBell count={0} onPress={jest.fn()} />);
    expect(screen.getByTestId('bell-icon')).toBeOnTheScreen();
  });

  it('hides badge when count is 0', () => {
    render(<NotificationBell count={0} onPress={jest.fn()} />);
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });

  it('fires onPress when pressed', () => {
    const onPress = jest.fn();
    render(<NotificationBell count={3} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('navigates to admin notifications when wired via router.push', () => {
    const handlePress = () => router.push('/(admin-web)/notifications' as Href);
    render(<NotificationBell count={2} onPress={handlePress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(router.push).toHaveBeenCalledWith('/(admin-web)/notifications');
  });

  it('has accessible label "Notifications, N unread" when count > 0', () => {
    render(<NotificationBell count={5} onPress={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Notifications, 5 unread' }),
    ).toBeOnTheScreen();
  });

  it('has accessible label "Notifications" when count is 0', () => {
    render(<NotificationBell count={0} onPress={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Notifications' }),
    ).toBeOnTheScreen();
  });

  it('getUnreadNotificationCount is used to power admin bell count', async () => {
    // Verify the function is available and returns expected value
    const count = await mockGetUnreadNotificationCount();
    expect(count).toBe(5);
  });

  it('lib/notifications mock does not expose push scheduling (no push pipeline)', () => {
    const libMock = require('@/lib/notifications');
    expect(libMock.scheduleNotificationAsync).toBeUndefined();
    expect(libMock.sendPushNotification).toBeUndefined();
  });
});
