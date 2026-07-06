/**
 * Tests for ProviderQualityBreakdownCard
 *
 * Verifies:
 *   - Renders the "Your ratings" heading.
 *   - Shows overall rating and review count via the RatingBreakdown primitive.
 *   - Shows would-recommend % when present.
 *   - Shows category rows (Quality, Punctuality, etc.) when data is present.
 *   - Empty state when review_count is 0 (delegated to RatingBreakdown).
 *
 * Mocks @/lib/reviews and @/components/ui/rating-breakdown to avoid Supabase init
 * and to test the breakdown card in isolation from the primitive.
 */

// Mock @/lib/reviews to avoid Supabase initialization in the test env
jest.mock('@/lib/reviews', () => ({
  REVIEW_TAGS: [],
}));

// Mock @/components/ui/rating-breakdown to test the card directly.
// We replicate the essential output so the card's own tests stay focused.
jest.mock('@/components/ui/rating-breakdown', () => {
  const { View, Text } = require('react-native');
  return {
    RatingBreakdown: ({ breakdown }: { breakdown: { review_count: number; recommend_pct: number | null; overall_avg: number | null; quality_avg: number | null; punctuality_avg: number | null; communication_avg: number | null; professionalism_avg: number | null; value_avg: number | null } }) => {
      if (breakdown.review_count === 0) {
        return <Text>No reviews yet.</Text>;
      }
      return (
        <View>
          {breakdown.overall_avg != null && <Text>{`★ ${breakdown.overall_avg.toFixed(1)}`}</Text>}
          {breakdown.recommend_pct != null && <Text>{`${Math.round(breakdown.recommend_pct)}% would recommend`}</Text>}
          {breakdown.quality_avg != null && <Text>Quality</Text>}
          {breakdown.punctuality_avg != null && <Text>Punctuality</Text>}
          {breakdown.communication_avg != null && <Text>Communication</Text>}
          {breakdown.professionalism_avg != null && <Text>Professionalism</Text>}
          {breakdown.value_avg != null && <Text>Value</Text>}
          {breakdown.quality_avg != null && <Text>{breakdown.quality_avg.toFixed(1)}</Text>}
          {breakdown.communication_avg != null && <Text>{breakdown.communication_avg.toFixed(1)}</Text>}
          {breakdown.review_count != null && <Text>{`(${breakdown.review_count})`}</Text>}
        </View>
      );
    },
  };
});

import { render, screen } from '@testing-library/react-native';
import { ProviderQualityBreakdownCard } from '@/components/provider/provider-quality-breakdown-card';
import type { ProviderRatingBreakdown } from '@/lib/reviews';

const FULL_BREAKDOWN: ProviderRatingBreakdown = {
  overall_avg: 4.6,
  review_count: 25,
  recommend_pct: 92,
  quality_avg: 4.7,
  punctuality_avg: 4.5,
  communication_avg: 4.8,
  professionalism_avg: 4.6,
  value_avg: 4.4,
  top_tags: ['on_time', 'friendly'],
};

const EMPTY_BREAKDOWN: ProviderRatingBreakdown = {
  overall_avg: null,
  review_count: 0,
  recommend_pct: null,
  quality_avg: null,
  punctuality_avg: null,
  communication_avg: null,
  professionalism_avg: null,
  value_avg: null,
  top_tags: [],
};

describe('ProviderQualityBreakdownCard', () => {
  it('renders the "Your ratings" section heading', () => {
    render(<ProviderQualityBreakdownCard breakdown={FULL_BREAKDOWN} />);
    expect(screen.getByText('Your ratings')).toBeOnTheScreen();
  });

  it('renders review count when data is present', () => {
    render(<ProviderQualityBreakdownCard breakdown={FULL_BREAKDOWN} />);
    // RatingStars renders "(25)"
    expect(screen.getByText('(25)')).toBeOnTheScreen();
  });

  it('renders would-recommend percentage when present', () => {
    render(<ProviderQualityBreakdownCard breakdown={FULL_BREAKDOWN} />);
    expect(screen.getByText(/92% would recommend/i)).toBeOnTheScreen();
  });

  it('renders all 5 category labels', () => {
    render(<ProviderQualityBreakdownCard breakdown={FULL_BREAKDOWN} />);
    expect(screen.getByText('Quality')).toBeOnTheScreen();
    expect(screen.getByText('Punctuality')).toBeOnTheScreen();
    expect(screen.getByText('Communication')).toBeOnTheScreen();
    expect(screen.getByText('Professionalism')).toBeOnTheScreen();
    expect(screen.getByText('Value')).toBeOnTheScreen();
  });

  it('renders category averages', () => {
    render(<ProviderQualityBreakdownCard breakdown={FULL_BREAKDOWN} />);
    expect(screen.getByText('4.7')).toBeOnTheScreen(); // quality_avg
    expect(screen.getByText('4.8')).toBeOnTheScreen(); // communication_avg
  });

  it('shows empty state text when review_count is 0', () => {
    render(<ProviderQualityBreakdownCard breakdown={EMPTY_BREAKDOWN} />);
    // RatingBreakdown renders "No reviews yet." for empty state
    expect(screen.getByText('No reviews yet.')).toBeOnTheScreen();
  });
});
