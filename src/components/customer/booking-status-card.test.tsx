/**
 * Tests for BookingStatusCard.
 *
 * Verifies: service title rendered, StatusBadge shown, date shown,
 * onPress fires, status variants render.
 *
 * BookingStatusCard was refactored in Slice 35 Task 5 to use useServices()
 * (getServiceBySlug) instead of SERVICES.find(). The mock now uses the
 * shared mockServicesProviderModule which mimics the 3-step fallback chain.
 */

// Mock ServicesProvider so the component can call useServices()
jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = require('../../../test/mock-services');
  return mockServicesProviderModule();
});

import { render, screen, fireEvent } from '@testing-library/react-native';
import { BookingStatusCard } from '@/components/customer/booking-status-card';

// StatusBadge calls STATUS_LABELS/STATUS_COLORS from booking-status — no mock needed as they're constants.

const BASE_BOOKING = {
  id: 'bk-1',
  service_id: 'plumbing',
  status: 'pending' as const,
  created_at: '2026-07-01T10:00:00Z',
  scheduled_for: '2026-07-05T09:00:00Z',
};

describe('BookingStatusCard', () => {
  it('renders the service title', () => {
    render(<BookingStatusCard booking={BASE_BOOKING} />);
    expect(screen.getByText('Plumbing')).toBeOnTheScreen();
  });

  it('renders a StatusBadge (Pending label)', () => {
    render(<BookingStatusCard booking={BASE_BOOKING} />);
    expect(screen.getByText('Pending')).toBeOnTheScreen();
  });

  it('renders the scheduled date', () => {
    render(<BookingStatusCard booking={BASE_BOOKING} />);
    // The date is formatted so we look for a partial match
    const dateEl = screen.getByText(/Jul|2026/);
    expect(dateEl).toBeOnTheScreen();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<BookingStatusCard booking={BASE_BOOKING} onPress={onPress} />);
    // Pressing on the service title (inside the Card pressable)
    fireEvent.press(screen.getByText('Plumbing'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders completed status badge for completed booking', () => {
    render(<BookingStatusCard booking={{ ...BASE_BOOKING, status: 'completed' }} />);
    expect(screen.getByText('Completed')).toBeOnTheScreen();
  });

  it('renders cancelled status badge for cancelled booking', () => {
    render(<BookingStatusCard booking={{ ...BASE_BOOKING, status: 'cancelled' }} />);
    expect(screen.getByText('Cancelled')).toBeOnTheScreen();
  });

  it('unknown service_id → renders generic humanized label (3-step fallback, no crash)', () => {
    // 'unknown-svc' is not in SERVICES constants, so step-3 generic fallback kicks in:
    // humanize('unknown-svc') = 'Unknown Svc'
    render(<BookingStatusCard booking={{ ...BASE_BOOKING, service_id: 'unknown-svc' }} />);
    expect(screen.getByText('Unknown Svc')).toBeOnTheScreen();
  });

  it('falls back to "Booking" when service_id is absent', () => {
    render(<BookingStatusCard booking={{ ...BASE_BOOKING, service_id: undefined }} />);
    expect(screen.getByText('Booking')).toBeOnTheScreen();
  });
});
