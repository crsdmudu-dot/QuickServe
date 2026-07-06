/**
 * Tests for ReviewEditForm.
 *
 * Verifies: pre-filled from review, submit calls editReview with edited values,
 * error shown on failure, overall-rating-required guard.
 *
 * Mocks @/lib/reviews to avoid Supabase init.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ReviewEditForm } from '@/components/customer/review-edit-form';
import { editReview, canEditReview } from '@/lib/reviews';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/reviews', () => ({
  editReview: jest.fn(),
  canEditReview: jest.fn(() => true),
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

const mockEditReview    = editReview    as jest.Mock;
const mockCanEditReview = canEditReview as jest.Mock;

// ── Fixture ───────────────────────────────────────────────────────────────────

const REVIEW = {
  id: 'rev-1',
  booking_id: 'bk-1',
  customer_id: 'c-1',
  provider_id: 'p-1',
  rating: 4,
  comment: 'Good service',
  is_hidden: false,
  created_at: new Date(Date.now() - 1000 * 60).toISOString(), // 1 min ago — within window
  quality_rating: 4,
  punctuality_rating: null,
  communication_rating: null,
  professionalism_rating: null,
  value_rating: null,
  would_recommend: true,
  tags: ['on_time'],
};

beforeEach(() => {
  mockEditReview.mockReset();
  mockCanEditReview.mockReset();
  mockCanEditReview.mockReturnValue(true);
});

describe('ReviewEditForm', () => {
  it('renders the form', () => {
    render(<ReviewEditForm review={REVIEW} onSaved={jest.fn()} />);
    expect(screen.getByTestId('review-edit-form')).toBeOnTheScreen();
  });

  it('pre-fills overall rating stars', () => {
    render(<ReviewEditForm review={REVIEW} onSaved={jest.fn()} />);
    // StarInput renders stars; overall has idPrefix="overall"
    expect(screen.getByTestId('overall-star-4')).toBeOnTheScreen();
    expect(screen.getByTestId('overall-star-5')).toBeOnTheScreen();
  });

  it('shows the pre-filled comment', () => {
    render(<ReviewEditForm review={REVIEW} onSaved={jest.fn()} />);
    expect(screen.getByDisplayValue('Good service')).toBeOnTheScreen();
  });

  it('calls editReview on submit with the current values', async () => {
    mockEditReview.mockResolvedValueOnce({ ok: true });
    const onSaved = jest.fn();
    render(<ReviewEditForm review={REVIEW} onSaved={onSaved} />);

    fireEvent.press(screen.getByText('Save changes'));

    await waitFor(() => {
      expect(mockEditReview).toHaveBeenCalledTimes(1);
      expect(mockEditReview).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewId: 'rev-1',
          rating:   4,
        }),
      );
    });
  });

  it('calls onSaved when editReview returns ok: true', async () => {
    mockEditReview.mockResolvedValueOnce({ ok: true });
    const onSaved = jest.fn();
    render(<ReviewEditForm review={REVIEW} onSaved={onSaved} />);

    fireEvent.press(screen.getByText('Save changes'));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });

  it('shows inline error when editReview returns ok: false', async () => {
    mockEditReview.mockResolvedValueOnce({ ok: false, error: 'Could not update review.' });
    render(<ReviewEditForm review={REVIEW} onSaved={jest.fn()} />);

    fireEvent.press(screen.getByText('Save changes'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-error')).toBeOnTheScreen();
      expect(screen.getByText('Could not update review.')).toBeOnTheScreen();
    });
  });

  it('shows error and does NOT call editReview when overall rating is 0', async () => {
    const zeroReview = { ...REVIEW, rating: 0 };
    render(<ReviewEditForm review={zeroReview} onSaved={jest.fn()} />);

    fireEvent.press(screen.getByText('Save changes'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-error')).toBeOnTheScreen();
    });
    expect(mockEditReview).not.toHaveBeenCalled();
  });

  it('shows edit-window-closed when canEditReview returns false', () => {
    mockCanEditReview.mockReturnValue(false);
    render(<ReviewEditForm review={REVIEW} onSaved={jest.fn()} />);
    expect(screen.getByTestId('edit-window-closed')).toBeOnTheScreen();
    expect(screen.getByText('Edit window closed')).toBeOnTheScreen();
  });

  it('calls onCancel when cancel button is pressed', () => {
    const onCancel = jest.fn();
    render(<ReviewEditForm review={REVIEW} onSaved={jest.fn()} onCancel={onCancel} />);

    fireEvent.press(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
