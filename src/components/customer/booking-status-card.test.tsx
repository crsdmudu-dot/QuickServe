/**
 * Tests for BookingStatusCard.
 *
 * Verifies: service title rendered, StatusBadge shown, date shown,
 * onPress fires, status variants render.
 *
 * Mocks @/constants/services to avoid pulling the full constant list.
 */
import { render, screen, fireEvent } from '@testing-library/react-native';
import { BookingStatusCard } from '@/components/customer/booking-status-card';

// ── Mock services ──────────────────────────────────────────────────────────────
jest.mock('@/constants/services', () => ({
  SERVICES: [
    { id: 'plumbing', title: 'Plumbing', icon: '🔧', category: 'home', startingPrice: 2000 },
    { id: 'house-cleaning', title: 'House Cleaning', icon: '🧹', category: 'home', startingPrice: 1500 },
  ],
}));

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

  it('falls back to service_id when service is unknown', () => {
    render(<BookingStatusCard booking={{ ...BASE_BOOKING, service_id: 'unknown-svc' }} />);
    expect(screen.getByText('unknown-svc')).toBeOnTheScreen();
  });

  it('falls back to "Booking" when service_id is absent', () => {
    render(<BookingStatusCard booking={{ ...BASE_BOOKING, service_id: undefined }} />);
    expect(screen.getByText('Booking')).toBeOnTheScreen();
  });
});
