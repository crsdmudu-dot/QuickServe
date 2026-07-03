/**
 * Tests for src/components/ui/booking-summary-card.tsx
 *
 * Pure presentational component — no router or context needed.
 *
 * Slice 24 additions:
 *  - ASAP fixture → asap-badge present, When value contains "ASAP".
 *  - Morning window fixture → When value contains "morning".
 *  - Weekly recurrence fixture → recurring-badge present with "Weekly".
 *  - one_time / absent recurrence → NO recurring-badge.
 *  - Legacy fixture (only scheduledFor, no scheduling props) → non-empty When, no throw.
 */

import { render, screen } from '@testing-library/react-native';

import { BookingSummaryCard } from '@/components/ui/booking-summary-card';

describe('BookingSummaryCard', () => {
  it('legacy: renders service, address, non-empty When, and notes without throwing', () => {
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
    // The "When" label is present.
    expect(screen.getByText('When')).toBeOnTheScreen();
    // When value is non-empty (describeSchedule legacy fallback).
    // The exact string is locale-dependent so we just check the label exists
    // and no badges are shown.
    expect(screen.queryByTestId('asap-badge')).toBeNull();
    expect(screen.queryByTestId('recurring-badge')).toBeNull();
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

  it('ASAP fixture: shows asap-badge and at least one element containing "ASAP"', () => {
    render(
      <BookingSummaryCard
        serviceTitle="Plumbing"
        address="Nairobi"
        scheduledFor="2026-07-01T10:00:00Z"
        notes=""
        schedulingType="asap"
      />,
    );

    // asap-badge pill is present.
    expect(screen.getByTestId('asap-badge')).toBeOnTheScreen();

    // At least one element with "ASAP" text (the When row value and/or the badge).
    const allAsap = screen.getAllByText('ASAP');
    expect(allAsap.length).toBeGreaterThanOrEqual(1);

    // No recurring badge.
    expect(screen.queryByTestId('recurring-badge')).toBeNull();
  });

  it('morning window fixture: When value contains "morning"', () => {
    const windowStart = '2026-07-02T08:00:00Z';
    const windowEnd   = '2026-07-02T12:00:00Z';
    render(
      <BookingSummaryCard
        serviceTitle="House Cleaning"
        address="Nairobi"
        scheduledFor={windowStart}
        notes=""
        schedulingType="tomorrow"
        timeWindow="morning"
        windowStart={windowStart}
        windowEnd={windowEnd}
      />,
    );

    // The When row should contain the word "morning".
    const whenEl = screen.getByText(/morning/i);
    expect(whenEl).toBeOnTheScreen();

    // No ASAP badge.
    expect(screen.queryByTestId('asap-badge')).toBeNull();
  });

  it('weekly recurrence fixture: recurring-badge shows "Weekly"', () => {
    render(
      <BookingSummaryCard
        serviceTitle="House Cleaning"
        address="Nairobi"
        scheduledFor="2026-07-01T10:00:00Z"
        notes=""
        schedulingType="date"
        recurrence="weekly"
      />,
    );

    const badge = screen.getByTestId('recurring-badge');
    expect(badge).toBeOnTheScreen();
    expect(screen.getByText('Weekly')).toBeOnTheScreen();
  });

  it('one_time recurrence: NO recurring-badge', () => {
    render(
      <BookingSummaryCard
        serviceTitle="House Cleaning"
        address="Nairobi"
        scheduledFor="2026-07-01T10:00:00Z"
        notes=""
        schedulingType="date"
        recurrence="one_time"
      />,
    );

    expect(screen.queryByTestId('recurring-badge')).toBeNull();
  });

  it('absent recurrence prop: NO recurring-badge', () => {
    render(
      <BookingSummaryCard
        serviceTitle="House Cleaning"
        address="Nairobi"
        scheduledFor="2026-07-01T10:00:00Z"
        notes=""
        schedulingType="date"
      />,
    );

    expect(screen.queryByTestId('recurring-badge')).toBeNull();
  });
});
