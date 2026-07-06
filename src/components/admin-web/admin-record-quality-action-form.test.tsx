/**
 * Tests for AdminRecordQualityActionForm
 *
 * Mocks @/lib/provider-quality-admin so no real Supabase calls are made.
 *
 * Covers:
 *   - Record-only disclaimer copy is shown.
 *   - All 6 action type chips are rendered.
 *   - Submit calls recordProviderQualityAction with correct args.
 *   - provider_visible toggle flips the value (defaults to Internal only / false).
 *   - Disabled when no action type selected.
 *   - onRecorded fires with the returned id on success.
 *   - Error shown on failure.
 *   - Form clears after successful submit.
 */

const mockRecordProviderQualityAction = jest.fn();

jest.mock('@/lib/provider-quality-admin', () => ({
  recordProviderQualityAction: (...args: unknown[]) =>
    mockRecordProviderQualityAction(...args),
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AdminRecordQualityActionForm } from '@/components/admin-web/admin-record-quality-action-form';

const PROVIDER_ID = 'provider-abc-123';

describe('AdminRecordQualityActionForm', () => {
  beforeEach(() => {
    mockRecordProviderQualityAction.mockClear();
  });

  it('shows the record-only disclaimer copy', () => {
    render(<AdminRecordQualityActionForm providerId={PROVIDER_ID} />);
    expect(
      screen.getByText(
        /Record-only — this does not suspend, pause, or change dispatch\/payouts/i,
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(/Informational coaching record/i),
    ).toBeOnTheScreen();
  });

  it('renders all 6 action type chips', () => {
    render(<AdminRecordQualityActionForm providerId={PROVIDER_ID} />);
    expect(screen.getByText('Coaching needed')).toBeOnTheScreen();
    expect(screen.getByText('Coaching completed')).toBeOnTheScreen();
    expect(screen.getByText('Warning given')).toBeOnTheScreen();
    expect(screen.getByText('Improvement observed')).toBeOnTheScreen();
    expect(screen.getByText('Temporary pause recommended')).toBeOnTheScreen();
    expect(screen.getByText('No action')).toBeOnTheScreen();
  });

  it('disables "Record action" button when no action type is selected', () => {
    render(<AdminRecordQualityActionForm providerId={PROVIDER_ID} />);
    const btn = screen.getByRole('button', { name: 'Record action' });
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  });

  it('enables "Record action" button after selecting an action type', () => {
    render(<AdminRecordQualityActionForm providerId={PROVIDER_ID} />);
    fireEvent.press(screen.getByText('Coaching needed'));
    const btn = screen.getByRole('button', { name: 'Record action' });
    expect(btn.props.accessibilityState?.disabled).toBeFalsy();
  });

  it('calls recordProviderQualityAction with selected action type, note, and providerVisible=false by default', async () => {
    mockRecordProviderQualityAction.mockResolvedValue({ ok: true, id: 'qa-111' });

    render(<AdminRecordQualityActionForm providerId={PROVIDER_ID} />);

    fireEvent.press(screen.getByText('Coaching needed'));
    fireEvent.changeText(
      screen.getByPlaceholderText(/Optional coaching note/i),
      'Great attitude shown',
    );
    fireEvent.press(screen.getByText('Record action'));

    await waitFor(() => {
      expect(mockRecordProviderQualityAction).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: PROVIDER_ID,
          actionType: 'coaching_needed',
          note: 'Great attitude shown',
          providerVisible: false,
        }),
      );
    });
  });

  it('provider_visible toggle flips to true when "Visible to provider" chip is pressed', async () => {
    mockRecordProviderQualityAction.mockResolvedValue({ ok: true, id: 'qa-222' });

    render(<AdminRecordQualityActionForm providerId={PROVIDER_ID} />);

    fireEvent.press(screen.getByText('Coaching needed'));
    // Press the "Visible to provider" chip
    fireEvent.press(screen.getByLabelText('Visible to provider'));
    fireEvent.press(screen.getByText('Record action'));

    await waitFor(() => {
      expect(mockRecordProviderQualityAction).toHaveBeenCalledWith(
        expect.objectContaining({
          providerVisible: true,
        }),
      );
    });
  });

  it('provider_visible toggle reverts to false when "Internal only" chip is pressed after enabling', async () => {
    mockRecordProviderQualityAction.mockResolvedValue({ ok: true, id: 'qa-333' });

    render(<AdminRecordQualityActionForm providerId={PROVIDER_ID} />);

    fireEvent.press(screen.getByText('Coaching needed'));
    // Enable visible
    fireEvent.press(screen.getByLabelText('Visible to provider'));
    // Revert to internal
    fireEvent.press(screen.getByLabelText('Not visible to provider'));
    fireEvent.press(screen.getByText('Record action'));

    await waitFor(() => {
      expect(mockRecordProviderQualityAction).toHaveBeenCalledWith(
        expect.objectContaining({
          providerVisible: false,
        }),
      );
    });
  });

  it('fires onRecorded with the returned id on success', async () => {
    mockRecordProviderQualityAction.mockResolvedValue({ ok: true, id: 'qa-999' });
    const onRecorded = jest.fn();

    render(
      <AdminRecordQualityActionForm
        providerId={PROVIDER_ID}
        onRecorded={onRecorded}
      />,
    );

    fireEvent.press(screen.getByText('Warning given'));
    fireEvent.press(screen.getByText('Record action'));

    await waitFor(() => {
      expect(onRecorded).toHaveBeenCalledWith('qa-999');
    });
  });

  it('shows error message when recordProviderQualityAction fails', async () => {
    mockRecordProviderQualityAction.mockResolvedValue({
      ok: false,
      error: 'Not authorised to record',
    });

    render(<AdminRecordQualityActionForm providerId={PROVIDER_ID} />);

    fireEvent.press(screen.getByText('No action'));
    fireEvent.press(screen.getByText('Record action'));

    await waitFor(() => {
      expect(screen.getByText('Not authorised to record')).toBeOnTheScreen();
    });
  });

  it('clears the form after a successful submit', async () => {
    mockRecordProviderQualityAction.mockResolvedValue({ ok: true, id: 'qa-444' });

    render(<AdminRecordQualityActionForm providerId={PROVIDER_ID} />);

    fireEvent.press(screen.getByText('Coaching needed'));
    fireEvent.changeText(
      screen.getByPlaceholderText(/Optional coaching note/i),
      'Some note',
    );
    fireEvent.press(screen.getByText('Record action'));

    await waitFor(() => {
      // Button should be disabled again (no action type selected after clear)
      const btn = screen.getByRole('button', { name: 'Record action' });
      expect(btn.props.accessibilityState?.disabled).toBe(true);
    });
  });
});
