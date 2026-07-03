/**
 * Tests for ReviewCard.
 * LEGACY: a review with all v2 fields null/empty renders exactly as before
 * (stars + comment + date, no category block, no tags, no recommend line).
 * ENRICHED: a v2 review shows category ratings, would-recommend, and tag chips.
 *
 * We mock @/lib/reviews to avoid Supabase initialization in the test env
 * (REVIEW_TAGS is a runtime constant that causes supabase.ts to execute).
 */
import { render, screen } from '@testing-library/react-native';
import { ReviewCard } from '@/components/ui/review-card';

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

/** Legacy review — all v2 fields absent. Existing test must stay green. */
const review = {
  id: 'r1',
  rating: 5,
  comment: 'Great work',
  created_at: '2026-07-01T10:00:00Z',
  booking_id: 'bk1',
  customer_id: 'c1',
  provider_id: 'p1',
  is_hidden: false,
  quality_rating: null,
  punctuality_rating: null,
  communication_rating: null,
  professionalism_rating: null,
  value_rating: null,
  would_recommend: null,
  tags: [],
};

/** Enriched review — uses v2 category ratings, would_recommend, and tags. */
const enrichedReview = {
  ...review,
  id: 'r2',
  rating: 4,
  comment: 'Excellent service',
  quality_rating: 4,
  value_rating: 5,
  would_recommend: true,
  tags: ['on_time'],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReviewCard', () => {
  describe('legacy review (all v2 fields absent)', () => {
    it('renders 5 filled stars and the comment text', () => {
      render(<ReviewCard review={review} />);
      const filled = screen.getAllByText('★');
      expect(filled).toHaveLength(5);
      expect(screen.getByText('Great work')).toBeOnTheScreen();
    });

    it('does not show any category ratings', () => {
      render(<ReviewCard review={review} />);
      expect(screen.queryByText(/Quality \d\/5/)).toBeNull();
      expect(screen.queryByText(/Punctuality \d\/5/)).toBeNull();
    });

    it('does not show a would-recommend indicator', () => {
      render(<ReviewCard review={review} />);
      expect(screen.queryByText(/Would recommend/)).toBeNull();
    });

    it('does not show any tag chips', () => {
      render(<ReviewCard review={review} />);
      expect(screen.queryByText('On time')).toBeNull();
    });
  });

  describe('enriched review (v2 fields present)', () => {
    beforeEach(() => {
      render(<ReviewCard review={enrichedReview} />);
    });

    it('shows "Quality 4/5" category rating', () => {
      expect(screen.getByText('Quality 4/5')).toBeOnTheScreen();
    });

    it('shows "Value 5/5" category rating', () => {
      expect(screen.getByText('Value 5/5')).toBeOnTheScreen();
    });

    it('shows the Would recommend indicator', () => {
      expect(screen.getByText('👍 Would recommend')).toBeOnTheScreen();
    });

    it('shows the "On time" tag chip', () => {
      expect(screen.getByText('On time')).toBeOnTheScreen();
    });
  });
});
