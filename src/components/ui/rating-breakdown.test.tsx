/**
 * Tests for RatingBreakdown.
 * Verifies: populated state renders recommend %, category labels/avgs, and
 * POSITIVE strength chips; negative tags are excluded. Empty state shows
 * "No reviews yet." with no category rows.
 *
 * We mock @/lib/reviews to avoid Supabase initialization in the test env
 * (REVIEW_TAGS is a runtime constant that causes supabase.ts to execute).
 */
import { render, screen } from '@testing-library/react-native';

import { RatingBreakdown } from '@/components/ui/rating-breakdown';
import type { ProviderRatingBreakdown } from '@/lib/reviews';

// ── Mock @/lib/reviews to bypass Supabase init ────────────────────────────────
jest.mock('@/lib/reviews', () => ({
  REVIEW_TAGS: [
    { key: 'on_time',            label: 'On time',            sentiment: 'positive' },
    { key: 'friendly',           label: 'Friendly',           sentiment: 'positive' },
    { key: 'clean_work',         label: 'Clean work',         sentiment: 'positive' },
    { key: 'good_communication', label: 'Good communication', sentiment: 'positive' },
    { key: 'fair_price',         label: 'Fair price',         sentiment: 'positive' },
    { key: 'late',               label: 'Late',               sentiment: 'negative' },
    { key: 'messy',              label: 'Messy',              sentiment: 'negative' },
    { key: 'poor_communication', label: 'Poor communication', sentiment: 'negative' },
    { key: 'overpriced',         label: 'Overpriced',         sentiment: 'negative' },
  ],
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const populatedBreakdown: ProviderRatingBreakdown = {
  review_count: 12,
  overall_avg: 4.5,
  recommend_pct: 83,
  quality_avg: 4.3,
  punctuality_avg: 4.1,
  communication_avg: 4.0,
  professionalism_avg: 4.6,
  value_avg: 3.8,
  // on_time → positive, late → negative, friendly → positive
  top_tags: ['on_time', 'late', 'friendly'],
};

const emptyBreakdown: ProviderRatingBreakdown = {
  review_count: 0,
  overall_avg: null,
  recommend_pct: null,
  quality_avg: null,
  punctuality_avg: null,
  communication_avg: null,
  professionalism_avg: null,
  value_avg: null,
  top_tags: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RatingBreakdown', () => {
  describe('populated breakdown', () => {
    beforeEach(() => {
      render(<RatingBreakdown breakdown={populatedBreakdown} />);
    });

    it('renders the would-recommend line with the rounded percentage', () => {
      // Must contain "83%" and "would recommend"
      const recommendText = screen.getByText(/83%.*would recommend/i);
      expect(recommendText).toBeOnTheScreen();
    });

    it('renders category labels', () => {
      expect(screen.getByText('Quality')).toBeOnTheScreen();
      expect(screen.getByText('Punctuality')).toBeOnTheScreen();
      expect(screen.getByText('Communication')).toBeOnTheScreen();
      expect(screen.getByText('Professionalism')).toBeOnTheScreen();
      expect(screen.getByText('Value')).toBeOnTheScreen();
    });

    it('renders a numeric average for a category', () => {
      // quality_avg is 4.3
      expect(screen.getByText('4.3')).toBeOnTheScreen();
    });

    it('shows positive strength chip "On time"', () => {
      expect(screen.getByText('On time')).toBeOnTheScreen();
    });

    it('shows positive strength chip "Friendly"', () => {
      expect(screen.getByText('Friendly')).toBeOnTheScreen();
    });

    it('does NOT show the negative tag "Late"', () => {
      expect(screen.queryByText('Late')).toBeNull();
    });
  });

  describe('empty breakdown', () => {
    beforeEach(() => {
      render(<RatingBreakdown breakdown={emptyBreakdown} />);
    });

    it('renders "No reviews yet."', () => {
      expect(screen.getByText('No reviews yet.')).toBeOnTheScreen();
    });

    it('does not render any category labels', () => {
      expect(screen.queryByText('Quality')).toBeNull();
      expect(screen.queryByText('Punctuality')).toBeNull();
    });
  });
});
