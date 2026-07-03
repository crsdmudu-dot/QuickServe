/**
 * Tests for TrackingStatusBadge.
 *
 * All assertions are synchronous — the component is purely presentational.
 *
 * Label matrix (from tracking-status.ts):
 *   on_the_way + distance < 0.1  → "Arrived"
 *   on_the_way + distance < 0.5  → "Nearby"
 *   on_the_way + distance ≥ 0.5  → "Heading to you"
 *   in_progress                  → "Work started"
 *   completed                    → "Work completed"
 *   pending                      → null (renders nothing)
 */

import { render, screen } from '@testing-library/react-native';
import { TrackingStatusBadge } from '@/components/ui/tracking-status-badge';

describe('TrackingStatusBadge', () => {
  // ── on_the_way ────────────────────────────────────────────────────────────

  it('shows "Arrived" for on_the_way with distance 0.05 km (< 0.1)', () => {
    render(<TrackingStatusBadge status="on_the_way" distanceKm={0.05} />);
    expect(screen.getByText('Arrived')).toBeOnTheScreen();
  });

  it('shows "Nearby" for on_the_way with distance 0.3 km (< 0.5)', () => {
    render(<TrackingStatusBadge status="on_the_way" distanceKm={0.3} />);
    expect(screen.getByText('Nearby')).toBeOnTheScreen();
  });

  it('shows "Heading to you" for on_the_way with distance 2 km (≥ 0.5)', () => {
    render(<TrackingStatusBadge status="on_the_way" distanceKm={2} />);
    expect(screen.getByText('Heading to you')).toBeOnTheScreen();
  });

  it('shows "Heading to you" for on_the_way with no distance provided', () => {
    render(<TrackingStatusBadge status="on_the_way" />);
    expect(screen.getByText('Heading to you')).toBeOnTheScreen();
  });

  // ── in_progress ───────────────────────────────────────────────────────────

  it('shows "Work started" for in_progress', () => {
    render(<TrackingStatusBadge status="in_progress" />);
    expect(screen.getByText('Work started')).toBeOnTheScreen();
  });

  // ── completed ─────────────────────────────────────────────────────────────

  it('shows "Work completed" for completed', () => {
    render(<TrackingStatusBadge status="completed" />);
    expect(screen.getByText('Work completed')).toBeOnTheScreen();
  });

  // ── non-trackable statuses → renders nothing ──────────────────────────────

  it('renders nothing for pending status', () => {
    const { toJSON } = render(<TrackingStatusBadge status="pending" />);
    expect(toJSON()).toBeNull();
    expect(screen.queryByText('Pending')).toBeNull();
  });

  it('renders nothing for accepted status', () => {
    const { toJSON } = render(<TrackingStatusBadge status="accepted" />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing for cancelled status', () => {
    const { toJSON } = render(<TrackingStatusBadge status="cancelled" />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing for provider_assigned status', () => {
    const { toJSON } = render(
      <TrackingStatusBadge status="provider_assigned" />,
    );
    expect(toJSON()).toBeNull();
  });
});
