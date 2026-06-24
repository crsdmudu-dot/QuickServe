/**
 * Tests for QuoteCard — verifies amount display, quote-status labels,
 * optional payment badge, accept/decline buttons, and admin split breakdown.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import { QuoteCard } from '@/components/ui/quote-card';

describe('QuoteCard', () => {
  it('shows formatted amount when amount is set', () => {
    render(<QuoteCard amount={1500} quoteStatus="sent" />);
    expect(screen.getByText('KES 1,500')).toBeOnTheScreen();
  });

  it('shows "No quote yet" when amount is null', () => {
    render(<QuoteCard amount={null} quoteStatus="pending" />);
    expect(screen.getByText('No quote yet')).toBeOnTheScreen();
  });

  it('shows the correct label for each quote status', () => {
    const { rerender } = render(<QuoteCard amount={null} quoteStatus="pending" />);
    expect(screen.getByText('Awaiting quote')).toBeOnTheScreen();

    rerender(<QuoteCard amount={2000} quoteStatus="sent" />);
    expect(screen.getByText('Quote sent')).toBeOnTheScreen();

    rerender(<QuoteCard amount={2000} quoteStatus="accepted" />);
    expect(screen.getByText('Quote accepted')).toBeOnTheScreen();

    rerender(<QuoteCard amount={2000} quoteStatus="declined" />);
    expect(screen.getByText('Quote declined')).toBeOnTheScreen();
  });

  it('renders a payment badge when paymentStatus is provided', () => {
    render(<QuoteCard amount={2000} quoteStatus="accepted" paymentStatus="paid" />);
    expect(screen.getByText('Paid')).toBeOnTheScreen();
  });

  it('does not render a payment badge when paymentStatus is omitted', () => {
    render(<QuoteCard amount={2000} quoteStatus="accepted" />);
    expect(screen.queryByText('Paid')).toBeNull();
    expect(screen.queryByText('Pending')).toBeNull();
  });

  it('fires onAccept when the Accept button is pressed', () => {
    const onAccept = jest.fn();
    render(<QuoteCard amount={1500} quoteStatus="sent" onAccept={onAccept} />);
    fireEvent.press(screen.getByText('Accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('fires onDecline when the Decline button is pressed', () => {
    const onDecline = jest.fn();
    render(<QuoteCard amount={1500} quoteStatus="sent" onDecline={onDecline} />);
    fireEvent.press(screen.getByText('Decline'));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('does not render Accept or Decline buttons when handlers are omitted', () => {
    render(<QuoteCard amount={1500} quoteStatus="sent" />);
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Decline')).toBeNull();
  });

  it('does not show the provider/QuickServe split when split prop is omitted', () => {
    render(<QuoteCard amount={1500} quoteStatus="sent" />);
    expect(screen.queryByText(/Provider:/)).toBeNull();
    expect(screen.queryByText(/QuickServe:/)).toBeNull();
  });

  it('shows the provider and QuickServe split when split prop is provided', () => {
    render(
      <QuoteCard
        amount={1500}
        quoteStatus="accepted"
        split={{ providerShare: 1200, quickserveShare: 300 }}
      />,
    );
    expect(screen.getByText('Provider: KES 1,200')).toBeOnTheScreen();
    expect(screen.getByText('QuickServe: KES 300')).toBeOnTheScreen();
  });
});
