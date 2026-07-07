/**
 * Tests for src/app/admin/index.tsx
 *
 * Mocks expo-router, @/lib/bookings, @/lib/providers and @/auth/auth-context
 * so no network calls are made.  Uses findBy* for async data loads.
 *
 * Slice 24 (Task 7): extended with scheduling filter + describeSchedule display
 * tests.  Fixtures use Date.now() so today/tomorrow predicates are always
 * correct regardless of when the suite runs.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const todayIso    = new Date().toISOString();
const tomorrowIso = new Date(Date.now() + 86_400_000).toISOString();
const pastIso     = new Date(Date.now() - 2 * 86_400_000).toISOString();

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// Mock ServicesProvider — admin/index.tsx uses useServices() for getServiceBySlug
jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = require('../../test/mock-services');
  return mockServicesProviderModule();
});

jest.mock('@/lib/bookings', () => ({
  getAllBookings: jest.fn().mockResolvedValue([
    {
      id: 'b1',
      service_id: 'house-cleaning',
      status: 'pending',
      scheduled_for: '2026-07-01T10:00:00Z',
      address: '123 Main St',
      notes: null,
      created_at: '2026-06-21T00:00:00Z',
      assigned_provider_name: null,
      assigned_provider_phone: null,
      admin_notes: null,
      // Slice 24 scheduling fields
      scheduling_type: 'datetime',
      time_window: null,
      window_start: null,
      window_end: null,
      recurrence: 'one_time',
    },
  ]),
}));

const mockSetProviderApproval = jest.fn().mockResolvedValue({ ok: true });
jest.mock('@/lib/providers', () => ({
  getPendingProviders: jest.fn().mockResolvedValue([
    { id: 'p1', full_name: 'Jane', phone: '0700', approval_status: 'pending' },
  ]),
  setProviderApproval: (...args: unknown[]) => mockSetProviderApproval(...args),
}));

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ signOut: jest.fn() }),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { getAllBookings } from '@/lib/bookings';
import AdminScreen from '@/app/admin/index';

// Helper — reset bookings mock to a custom fixture list then render
function renderWithBookings(fixtures: object[]) {
  (getAllBookings as jest.Mock).mockResolvedValueOnce(fixtures);
  return render(<AdminScreen />);
}

describe('AdminScreen', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    mockSetProviderApproval.mockClear();
  });

  // ── Existing tests (must stay green) ──────────────────────────────────────

  it('shows the booking status label after data loads', async () => {
    render(<AdminScreen />);
    // Wait for bookings to load then check STATUS_LABELS['pending'] = 'Pending'
    await screen.findByText('House Cleaning');
    await waitFor(() => expect(screen.getByText('Pending')).toBeOnTheScreen());
  });

  it('navigates to booking detail when a booking row is pressed', async () => {
    render(<AdminScreen />);
    const row = await screen.findByText('House Cleaning');
    fireEvent.press(row);
    expect(router.push).toHaveBeenCalledWith('/admin/booking/b1');
  });

  it('shows provider name after switching to Providers tab', async () => {
    render(<AdminScreen />);
    // Wait for initial render to settle
    await screen.findByText('House Cleaning');
    fireEvent.press(screen.getByText('Providers'));
    expect(await screen.findByText('Jane')).toBeOnTheScreen();
  });

  it('calls setProviderApproval with approved when Approve is pressed', async () => {
    render(<AdminScreen />);
    fireEvent.press(await screen.findByText('Providers'));
    fireEvent.press(await screen.findByText('Approve'));
    expect(mockSetProviderApproval).toHaveBeenCalledWith('p1', 'approved');
  });

  it('navigates to provider detail when a provider card is pressed', async () => {
    render(<AdminScreen />);
    fireEvent.press(await screen.findByText('Providers'));
    // Wait for provider name to appear then press the card (press the name text inside the card)
    const providerName = await screen.findByText('Jane');
    fireEvent.press(providerName);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/admin/provider/p1'),
    );
  });

  it('navigates to /notification-settings when "Notifications" is pressed', async () => {
    render(<AdminScreen />);
    await screen.findByText('House Cleaning');
    fireEvent.press(screen.getByText('Notifications'));
    expect(router.push).toHaveBeenCalledWith('/notification-settings');
  });

  // ── Slice 24 Task 7: filter row tests ─────────────────────────────────────

  it('default (All) renders all bookings — filter buttons are visible', async () => {
    render(<AdminScreen />);
    await screen.findByText('House Cleaning');
    // All filter buttons should be present
    expect(screen.getByText('All')).toBeOnTheScreen();
    expect(screen.getByText('Today')).toBeOnTheScreen();
    expect(screen.getByText('Tomorrow')).toBeOnTheScreen();
    expect(screen.getByText('Upcoming')).toBeOnTheScreen();
    expect(screen.getByText('Scheduled')).toBeOnTheScreen();
  });

  it('Today filter shows only the today fixture; hides past/tomorrow ones', async () => {
    renderWithBookings([
      {
        id: 'today1',
        service_id: 'plumbing',
        status: 'pending',
        scheduled_for: todayIso,
        address: '1 Today St',
        notes: null,
        created_at: todayIso,
        assigned_provider_name: null,
        assigned_provider_phone: null,
        admin_notes: null,
        scheduling_type: 'today',
        time_window: null,
        window_start: null,
        window_end: null,
        recurrence: 'one_time',
      },
      {
        id: 'tomorrow1',
        service_id: 'electrical-repairs',
        status: 'pending',
        scheduled_for: tomorrowIso,
        address: '2 Tomorrow St',
        notes: null,
        created_at: tomorrowIso,
        assigned_provider_name: null,
        assigned_provider_phone: null,
        admin_notes: null,
        scheduling_type: 'tomorrow',
        time_window: null,
        window_start: null,
        window_end: null,
        recurrence: 'one_time',
      },
      {
        id: 'past1',
        service_id: 'ac-repair',
        status: 'completed',
        scheduled_for: pastIso,
        address: '3 Past St',
        notes: null,
        created_at: pastIso,
        assigned_provider_name: null,
        assigned_provider_phone: null,
        admin_notes: null,
        scheduling_type: 'datetime',
        time_window: null,
        window_start: null,
        window_end: null,
        recurrence: 'one_time',
      },
    ]);

    // Wait for data to load
    await screen.findByText('Plumbing');

    // Press the Today filter button
    fireEvent.press(screen.getByText('Today'));

    // Today fixture should appear
    expect(screen.getByText('Plumbing')).toBeOnTheScreen();

    // Tomorrow and past fixtures should not appear
    expect(screen.queryByText('Electrical Repairs')).toBeNull();
    expect(screen.queryByText('AC Repair & Servicing')).toBeNull();
  });

  it('Scheduled filter hides asap fixture and shows non-asap fixture', async () => {
    renderWithBookings([
      {
        id: 'asap1',
        service_id: 'plumbing',
        status: 'pending',
        scheduled_for: todayIso,
        address: '1 Asap St',
        notes: null,
        created_at: todayIso,
        assigned_provider_name: null,
        assigned_provider_phone: null,
        admin_notes: null,
        scheduling_type: 'asap',
        time_window: null,
        window_start: null,
        window_end: null,
        recurrence: 'one_time',
      },
      {
        id: 'sched1',
        // Use 'electrical' — the correct service ID in SERVICES (title: 'Electrical Repairs')
        service_id: 'electrical',
        status: 'pending',
        scheduled_for: tomorrowIso,
        address: '2 Sched St',
        notes: null,
        created_at: tomorrowIso,
        assigned_provider_name: null,
        assigned_provider_phone: null,
        admin_notes: null,
        scheduling_type: 'tomorrow',
        time_window: 'morning',
        window_start: null,
        window_end: null,
        recurrence: 'one_time',
      },
    ]);

    await screen.findByText('Plumbing');

    // Press Scheduled filter — use getAllByText because "Scheduled" is also a segment label
    const scheduledBtns = screen.getAllByText('Scheduled');
    fireEvent.press(scheduledBtns[0]);

    // Non-asap fixture should be visible
    expect(screen.getByText('Electrical Repairs')).toBeOnTheScreen();

    // ASAP fixture should be hidden by the filter
    expect(screen.queryByText('Plumbing')).toBeNull();
  });

  it('describeSchedule shows ASAP for asap scheduling_type', async () => {
    renderWithBookings([
      {
        id: 'asap2',
        service_id: 'plumbing',
        status: 'pending',
        scheduled_for: todayIso,
        address: '1 Asap St',
        notes: null,
        created_at: todayIso,
        assigned_provider_name: null,
        assigned_provider_phone: null,
        admin_notes: null,
        scheduling_type: 'asap',
        time_window: null,
        window_start: null,
        window_end: null,
        recurrence: 'one_time',
      },
    ]);

    await screen.findByText('Plumbing');
    // describeSchedule returns 'ASAP' for scheduling_type === 'asap'
    expect(screen.getByText('ASAP')).toBeOnTheScreen();
  });

  it('weekly recurrence fixture shows "Weekly" pill text', async () => {
    renderWithBookings([
      {
        id: 'weekly1',
        service_id: 'house-cleaning',
        status: 'pending',
        scheduled_for: tomorrowIso,
        address: '5 Weekly Ave',
        notes: null,
        created_at: tomorrowIso,
        assigned_provider_name: null,
        assigned_provider_phone: null,
        admin_notes: null,
        scheduling_type: 'tomorrow',
        time_window: null,
        window_start: null,
        window_end: null,
        recurrence: 'weekly',
      },
    ]);

    await screen.findByText('House Cleaning');
    // recurrenceLabel('weekly') === 'Weekly'
    expect(screen.getByText('Weekly')).toBeOnTheScreen();
  });
});
