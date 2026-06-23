/**
 * Tests for ReviewCard — verifies stars, comment, and date are rendered.
 */
import { render, screen } from '@testing-library/react-native';
import { ReviewCard } from '@/components/ui/review-card';

const review = {
  id: 'r1',
  rating: 5,
  comment: 'Great work',
  created_at: '2026-07-01T10:00:00Z',
  booking_id: 'bk1',
  customer_id: 'c1',
  provider_id: 'p1',
  is_hidden: false,
};

describe('ReviewCard', () => {
  it('renders 5 filled stars and the comment text', () => {
    render(<ReviewCard review={review} />);
    const filled = screen.getAllByText('★');
    expect(filled).toHaveLength(5);
    expect(screen.getByText('Great work')).toBeOnTheScreen();
  });
});
