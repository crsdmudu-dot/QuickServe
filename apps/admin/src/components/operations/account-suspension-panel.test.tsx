/**
 * account-suspension-panel.test.tsx — the admin Suspend / Lift panel (F5.6b).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AccountSuspensionPanel } from '@admin/components/operations/account-suspension-panel';

const mockGetLatest = jest.fn();
const mockSuspend = jest.fn();
const mockLift = jest.fn();
const mockRetry = jest.fn();
jest.mock('@/lib/suspension', () => ({
  getLatestSuspension: (...a: unknown[]) => mockGetLatest(...a),
  suspendAccount: (...a: unknown[]) => mockSuspend(...a),
  liftSuspension: (...a: unknown[]) => mockLift(...a),
  retrySignInBlock: (...a: unknown[]) => mockRetry(...a),
}));

const U = '22222222-2222-4222-8222-222222222222';
const R = '44444444-4444-4444-8444-444444444444';
const active = (state: string) => ({
  id: 's1', reason: 'Repeated abusive messages', suspended_at: '2026-09-27T08:00:00Z', lifted_at: null, lift_note: null, auth_ban_state: state,
});
const lifted = (state: string) => ({ ...active(state), lifted_at: '2026-09-27T09:00:00Z' });

beforeEach(() => jest.clearAllMocks());

describe('AccountSuspensionPanel', () => {
  it('not suspended: suspending needs a reason and a second confirming tap, and passes the report', async () => {
    mockGetLatest.mockResolvedValue({ ok: true, suspension: null });
    mockSuspend.mockResolvedValue({ ok: true, signInBlock: 'banned', recorded: true });
    render(<AccountSuspensionPanel userId={U} reportId={R} />);
    expect(await screen.findByText('Not suspended')).toBeOnTheScreen();

    expect(screen.getByTestId('suspension-suspend')).toBeDisabled();
    fireEvent.changeText(screen.getByTestId('suspension-reason'), '  Repeated abusive messages  ');
    fireEvent.press(screen.getByTestId('suspension-suspend'));
    expect(mockSuspend).not.toHaveBeenCalled();

    mockGetLatest.mockResolvedValue({ ok: true, suspension: active('banned') });
    fireEvent.press(screen.getByTestId('suspension-confirm'));
    await waitFor(() => expect(mockSuspend).toHaveBeenCalledWith({ userId: U, reason: 'Repeated abusive messages', reportId: R }));
    expect(await screen.findByText('Account suspended. Sign-in is blocked.')).toBeOnTheScreen();
    expect(await screen.findByTestId('suspension-status')).toHaveTextContent(/Suspended since/);
  });

  it('Cancel leaves the account alone', async () => {
    mockGetLatest.mockResolvedValue({ ok: true, suspension: null });
    render(<AccountSuspensionPanel userId={U} />);
    await screen.findByText('Not suspended');
    fireEvent.changeText(screen.getByTestId('suspension-reason'), 'Spam');
    fireEvent.press(screen.getByTestId('suspension-suspend'));
    fireEvent.press(screen.getByTestId('suspension-cancel'));
    expect(mockSuspend).not.toHaveBeenCalled();
    expect(screen.queryByTestId('suspension-confirm')).toBeNull();
  });

  it('suspended: shows the reason and lifts with the optional note', async () => {
    mockGetLatest.mockResolvedValue({ ok: true, suspension: active('banned') });
    mockLift.mockResolvedValue({ ok: true, signInBlock: 'unbanned', recorded: true });
    render(<AccountSuspensionPanel userId={U} />);
    expect(await screen.findByText('Repeated abusive messages')).toBeOnTheScreen();
    expect(screen.getByTestId('suspension-sign-in')).toHaveTextContent('Sign-in is blocked.');
    expect(screen.queryByTestId('suspension-retry')).toBeNull();
    fireEvent.changeText(screen.getByTestId('suspension-lift-note'), 'Appeal accepted');
    fireEvent.press(screen.getByTestId('suspension-lift'));
    await waitFor(() => expect(mockLift).toHaveBeenCalledWith({ userId: U, note: 'Appeal accepted' }));
    expect(await screen.findByText('Suspension lifted. Sign-in works again.')).toBeOnTheScreen();
  });

  it.each([
    ['an active suspension whose sign-in block failed', active('failed'), /could not be blocked/],
    ['an active suspension whose block is not confirmed', active('pending'), /not confirmed yet/],
    ['a lifted suspension whose unblock failed', lifted('failed'), /could not be unblocked yet/],
  ])('offers Retry for %s', async (_label, suspension, text) => {
    mockGetLatest.mockResolvedValue({ ok: true, suspension });
    mockRetry.mockResolvedValue({ ok: true, signInBlock: suspension.lifted_at ? 'unbanned' : 'banned', recorded: true });
    render(<AccountSuspensionPanel userId={U} />);
    expect(await screen.findByTestId('suspension-sign-in')).toHaveTextContent(text);
    fireEvent.press(screen.getByTestId('suspension-retry'));
    await waitFor(() => expect(mockRetry).toHaveBeenCalledWith(U));
  });

  it('says so when the sign-in block could not be applied, while the account stays suspended', async () => {
    mockGetLatest.mockResolvedValue({ ok: true, suspension: null });
    mockSuspend.mockResolvedValue({ ok: true, signInBlock: 'failed', recorded: true });
    render(<AccountSuspensionPanel userId={U} />);
    await screen.findByText('Not suspended');
    fireEvent.changeText(screen.getByTestId('suspension-reason'), 'Spam');
    fireEvent.press(screen.getByTestId('suspension-suspend'));
    fireEvent.press(screen.getByTestId('suspension-confirm'));
    expect(await screen.findByTestId('suspension-message')).toHaveTextContent(/could not be blocked yet.*Use Retry/);
  });

  it('shows a refusal as an alert', async () => {
    mockGetLatest.mockResolvedValue({ ok: true, suspension: null });
    mockSuspend.mockResolvedValue({ ok: false, error: 'Only customers and providers can be suspended.' });
    render(<AccountSuspensionPanel userId={U} />);
    await screen.findByText('Not suspended');
    fireEvent.changeText(screen.getByTestId('suspension-reason'), 'Spam');
    fireEvent.press(screen.getByTestId('suspension-suspend'));
    fireEvent.press(screen.getByTestId('suspension-confirm'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only customers and providers can be suspended.');
  });

  it('a failed load offers Retry and never offers Suspend', async () => {
    mockGetLatest.mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true, suspension: null });
    render(<AccountSuspensionPanel userId={U} />);
    expect(await screen.findByText('Could not load the suspension status.')).toBeOnTheScreen();
    expect(screen.queryByTestId('suspension-suspend')).toBeNull();
    fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Not suspended')).toBeOnTheScreen();
  });
});
