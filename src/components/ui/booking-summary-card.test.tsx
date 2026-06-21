/**
 * Tests for src/components/ui/booking-summary-card.tsx
 *
 * Pure presentational component — no router or context needed.
 */

import { render, screen } from '@testing-library/react-native';

import { BookingSummaryCard } from '@/components/ui/booking-summary-card';

describe('BookingSummaryCard', () => {
  it('renders the service title, address, formatted date and notes', () => {
    const iso = '2026-07-01T10:00:00Z';
    render(
      <BookingSummaryCard
        serviceTitle="House Cleaning"
        address="Nairobi"
        scheduledFor={iso}
        notes="Gate code 12"
      />,
    );

    expect(screen.getByText('House Cleaning')).toBeOnTheScreen();
    expect(screen.getByText('Nairobi')).toBeOnTheScreen();
    expect(screen.getByText(new Date(iso).toLocaleString())).toBeOnTheScreen();
    expect(screen.getByText('Gate code 12')).toBeOnTheScreen();
  });

  it('shows "None" when notes are empty', () => {
    render(
      <BookingSummaryCard
        serviceTitle="Plumbing"
        address="Mombasa"
        scheduledFor="2026-07-01T10:00:00Z"
        notes=""
      />,
    );

    expect(screen.getByText('None')).toBeOnTheScreen();
  });
});
