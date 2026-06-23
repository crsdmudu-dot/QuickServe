/**
 * Tests for RatingStars — verifies filled star count and "Not yet rated" fallback.
 */
import { render, screen } from '@testing-library/react-native';
import { RatingStars } from '@/components/ui/rating-stars';

describe('RatingStars', () => {
  it('renders 4 filled stars and the count when value=4 count=3', () => {
    render(<RatingStars value={4} count={3} />);
    const filled = screen.getAllByText('★');
    expect(filled).toHaveLength(4);
    expect(screen.getByText('(3)')).toBeOnTheScreen();
  });

  it('renders "Not yet rated" when value is null', () => {
    render(<RatingStars value={null} />);
    expect(screen.getByText('Not yet rated')).toBeOnTheScreen();
  });
});
