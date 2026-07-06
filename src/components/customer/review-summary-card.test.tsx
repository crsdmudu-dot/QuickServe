/**
 * Tests for ReviewSummaryCard.
 *
 * Verifies: renders with a valid breakdown (via RatingBreakdown reuse),
 * shows review count, handles zero-review state.
 *
 * Mocks @/lib/reviews to avoid Supabase init.
 */
import { render, screen } from '@testing-library/react-native';
import { ReviewSummaryCard } from '@/components/customer/review-summary-card';

// ── Mock @/lib/reviews ─────────────────────────────────────────────────────────
jest.mock('@/lib/reviews', () => ({
  REVIEW_TAGS: [
    { key: 'on_time', label: 'On time', sentiment: 'positive' },
    { key: 'friendly', label: 'Friendly', sentiment: 'positive' },
  ],
}));

// ── Fixtures ───────────────────────────────────────────────────────────────────

const FULL_BREAKDOWN = {
  overall_avg:          4.5,
  review_count:         20,
  recommend_pct:        90,
  quality_avg:          4.6,
  punctuality_avg:      4.4,
  communication_avg:    4.3,
  professionalism_avg:  4.7,
  value_avg:            4.2,
  top_tags:             ['on_time'],
};

const EMPTY_BREAKDOWN = {
  overall_avg:          null,
  review_count:         0,
  recommend_pct:        null,
  quality_avg:          null,
  punctuality_avg:      null,
  communication_avg:    null,
  professionalism_avg:  null,
  value_avg:            null,
  top_tags:             [],
};

describe('ReviewSummaryCard', () => {
  it('renders the Reviews section header', () => {
    render(<ReviewSummaryCard breakdown={FULL_BREAKDOWN} />);
    expect(screen.getByText('Reviews')).toBeOnTheScreen();
  });

  it('renders the review count', () => {
    render(<ReviewSummaryCard breakdown={FULL_BREAKDOWN} />);
    // RatingStars shows count as "(20)"
    expect(screen.getByText('(20)')).toBeOnTheScreen();
  });

  it('renders the recommend percentage', () => {
    render(<ReviewSummaryCard breakdown={FULL_BREAKDOWN} />);
    expect(screen.getByText(/90%.*would recommend/)).toBeOnTheScreen();
  });

  it('renders the "On time" strength tag', () => {
    render(<ReviewSummaryCard breakdown={FULL_BREAKDOWN} />);
    expect(screen.getByText('On time')).toBeOnTheScreen();
  });

  it('renders "No reviews yet." for an empty breakdown', () => {
    render(<ReviewSummaryCard breakdown={EMPTY_BREAKDOWN} />);
    expect(screen.getByText('No reviews yet.')).toBeOnTheScreen();
  });
});
