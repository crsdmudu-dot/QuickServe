/**
 * Tests for DiscoverySkeleton.
 *
 * Verifies that the correct number of placeholders are rendered per variant.
 * The underlying Skeleton primitive is mocked to avoid animation in tests.
 */

// Mock @/constants/motion so Skeleton doesn't start animation loops
jest.mock('@/constants/motion', () => ({
  prefersReducedMotion: jest.fn().mockResolvedValue(true),
  Durations: { fast: 150, base: 250, slow: 400 },
  Easings: {},
  Springs: { gentle: { damping: 18, stiffness: 160 }, snappy: { damping: 14, stiffness: 220 } },
}));

import { render, screen } from '@testing-library/react-native';
import { DiscoverySkeleton } from '@/components/ui/discovery-skeleton';

describe('DiscoverySkeleton', () => {
  it('renders 3 card placeholders by default (no props)', () => {
    render(<DiscoverySkeleton />);
    expect(screen.getAllByTestId('discovery-skeleton-card')).toHaveLength(3);
  });

  it('renders the requested count of card placeholders', () => {
    render(<DiscoverySkeleton variant="card" count={5} />);
    expect(screen.getAllByTestId('discovery-skeleton-card')).toHaveLength(5);
  });

  it('renders the requested count of row placeholders', () => {
    render(<DiscoverySkeleton variant="row" count={4} />);
    expect(screen.getAllByTestId('discovery-skeleton-row')).toHaveLength(4);
  });

  it('renders the requested count of grid placeholders', () => {
    render(<DiscoverySkeleton variant="grid" count={6} />);
    expect(screen.getAllByTestId('discovery-skeleton-grid')).toHaveLength(6);
  });

  it('renders 1 placeholder when count=1', () => {
    render(<DiscoverySkeleton variant="card" count={1} />);
    expect(screen.getAllByTestId('discovery-skeleton-card')).toHaveLength(1);
  });

  it('renders the outer container', () => {
    render(<DiscoverySkeleton />);
    expect(screen.getByTestId('discovery-skeleton')).toBeOnTheScreen();
  });
});
