/**
 * Tests for CreateCaseForm
 *
 * Mocks @/lib/operations so no real Supabase calls are made.
 *
 * Covers:
 *   - Submit calls createSupportCase with merged initial + form data.
 *   - "Open case" button is disabled when subject is empty.
 *   - Dispute kind selector appears only when case type = 'dispute'.
 *   - onCreated is fired with the returned id on success.
 *   - Error message shown on createSupportCase failure.
 *   - Context ids from `initial` are displayed read-only.
 */

const mockCreateSupportCase = jest.fn();

jest.mock('@/lib/operations', () => ({
  createSupportCase: (...args: unknown[]) => mockCreateSupportCase(...args),
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { CreateCaseForm } from '@/components/admin-web/operations/create-case-form';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CreateCaseForm', () => {
  beforeEach(() => {
    mockCreateSupportCase.mockClear();
  });

  it('disables "Open case" button when subject is empty', () => {
    render(<CreateCaseForm />);
    // getByRole('button') finds the Pressable which has accessibilityState
    const btn = screen.getByRole('button', { name: 'Open case' });
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  });

  it('enables "Open case" button when subject has text', () => {
    render(<CreateCaseForm />);
    fireEvent.changeText(
      screen.getByPlaceholderText('Brief summary of the case…'),
      'Test subject',
    );
    const btn = screen.getByRole('button', { name: 'Open case' });
    expect(btn.props.accessibilityState?.disabled).toBeFalsy();
  });

  it('calls createSupportCase with merged initial + form on submit', async () => {
    mockCreateSupportCase.mockResolvedValue({ ok: true, id: 'case-111' });

    render(
      <CreateCaseForm
        initial={{ bookingId: 'booking-aaa', customerId: 'customer-bbb' }}
      />,
    );

    fireEvent.changeText(
      screen.getByPlaceholderText('Brief summary of the case…'),
      'Payment issue',
    );
    fireEvent.press(screen.getByText('Open case'));

    await waitFor(() => {
      expect(mockCreateSupportCase).toHaveBeenCalledWith(
        expect.objectContaining({
          subject:    'Payment issue',
          bookingId:  'booking-aaa',
          customerId: 'customer-bbb',
        }),
      );
    });
  });

  it('fires onCreated with the returned case id', async () => {
    mockCreateSupportCase.mockResolvedValue({ ok: true, id: 'case-999' });
    const onCreated = jest.fn();

    render(<CreateCaseForm onCreated={onCreated} />);
    fireEvent.changeText(
      screen.getByPlaceholderText('Brief summary of the case…'),
      'Refund request',
    );
    fireEvent.press(screen.getByText('Open case'));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith('case-999');
    });
  });

  it('does NOT show the dispute kind selector for support type (default)', () => {
    render(<CreateCaseForm />);
    expect(screen.queryByText('Dispute kind')).toBeNull();
  });

  it('shows the dispute kind selector when case type is switched to dispute', () => {
    render(<CreateCaseForm />);
    // Switch to dispute
    fireEvent.press(screen.getByText('Dispute'));
    expect(screen.getByText('Dispute kind')).toBeOnTheScreen();
    expect(screen.getByText('Booking Dispute')).toBeOnTheScreen();
  });

  it('shows an error message when createSupportCase fails', async () => {
    mockCreateSupportCase.mockResolvedValue({ ok: false, error: 'Not authorised' });

    render(<CreateCaseForm />);
    fireEvent.changeText(
      screen.getByPlaceholderText('Brief summary of the case…'),
      'Test',
    );
    fireEvent.press(screen.getByText('Open case'));

    await waitFor(() => {
      expect(screen.getByText('Not authorised')).toBeOnTheScreen();
    });
  });

  it('displays read-only context ids from initial', () => {
    render(
      <CreateCaseForm
        initial={{
          bookingId:  'bk1111111111111',
          customerId: 'cu2222222222222',
          providerId: 'pr3333333333333',
          paymentId:  'pm4444444444444',
          reviewId:   'rv5555555555555',
        }}
      />,
    );
    // .slice(0,8) = first 8 chars of each id
    expect(screen.getByText(/Booking: #bk111111/)).toBeOnTheScreen();
    expect(screen.getByText(/Customer: #cu222222/)).toBeOnTheScreen();
    expect(screen.getByText(/Provider: #pr333333/)).toBeOnTheScreen();
    expect(screen.getByText(/Payment: #pm444444/)).toBeOnTheScreen();
    expect(screen.getByText(/Review: #rv555555/)).toBeOnTheScreen();
  });

  it('passes dispute kind when case type is dispute', async () => {
    mockCreateSupportCase.mockResolvedValue({ ok: true, id: 'case-ddd' });

    render(<CreateCaseForm />);

    // Switch to dispute
    fireEvent.press(screen.getByText('Dispute'));
    // Select Payment Dispute
    fireEvent.press(screen.getByText('Payment Dispute'));

    fireEvent.changeText(
      screen.getByPlaceholderText('Brief summary of the case…'),
      'Payment contested',
    );
    fireEvent.press(screen.getByText('Open case'));

    await waitFor(() => {
      expect(mockCreateSupportCase).toHaveBeenCalledWith(
        expect.objectContaining({
          caseType:    'dispute',
          disputeKind: 'payment_dispute',
          subject:     'Payment contested',
        }),
      );
    });
  });
});
