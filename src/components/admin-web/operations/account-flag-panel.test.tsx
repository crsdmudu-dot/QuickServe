/**
 * Tests for AccountFlagPanel
 *
 * Mocks @/lib/operations so no real Supabase calls are made.
 *
 * Covers:
 *   - Renders active flags (kind, reason, active state).
 *   - Renders lifted flags (shows "Lifted" state).
 *   - Shows the "record only / no enforcement" copy.
 *   - "Record flag" calls flagAccount with correct kind + reason, then reloads.
 *   - "Lift" button calls liftAccountFlag with the right id.
 *   - No "Lift" button on already-lifted flags.
 */

const mockGetAccountFlags = jest.fn();
const mockFlagAccount     = jest.fn();
const mockLiftAccountFlag = jest.fn();

jest.mock('@/lib/operations', () => ({
  getAccountFlags:  (...args: unknown[]) => mockGetAccountFlags(...args),
  flagAccount:      (...args: unknown[]) => mockFlagAccount(...args),
  liftAccountFlag:  (...args: unknown[]) => mockLiftAccountFlag(...args),
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AccountFlagPanel } from '@/components/admin-web/operations/account-flag-panel';
import type { AccountFlag } from '@/constants/operations';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ACTIVE_FLAG: AccountFlag = {
  id:           'flag-001',
  subject_id:   'user-abc',
  subject_role: 'customer',
  kind:         'flag',
  reason:       'Suspicious activity',
  active:       true,
  created_by:   'admin-11111111-0000-0000-0000-000000000000',
  created_at:   '2024-01-01T08:00:00Z',
  lifted_by:    null,
  lifted_at:    null,
};

const LIFTED_FLAG: AccountFlag = {
  id:           'flag-002',
  subject_id:   'user-abc',
  subject_role: 'customer',
  kind:         'suspension',
  reason:       'Repeated violations',
  active:       false,
  created_by:   'admin-22222222-0000-0000-0000-000000000000',
  created_at:   '2024-01-02T08:00:00Z',
  lifted_by:    'admin-33333333-0000-0000-0000-000000000000',
  lifted_at:    '2024-01-03T08:00:00Z',
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AccountFlagPanel', () => {
  beforeEach(() => {
    mockGetAccountFlags.mockClear();
    mockFlagAccount.mockClear();
    mockLiftAccountFlag.mockClear();
  });

  it('renders active flag with kind and reason', async () => {
    mockGetAccountFlags.mockResolvedValue([ACTIVE_FLAG]);
    render(<AccountFlagPanel subjectId="user-abc" subjectRole="customer" />);
    await waitFor(() => {
      expect(screen.getByText('Suspicious activity')).toBeOnTheScreen();
    });
    // Should show Active state
    expect(screen.getByText('Active')).toBeOnTheScreen();
  });

  it('renders lifted flag with "Lifted" state', async () => {
    mockGetAccountFlags.mockResolvedValue([LIFTED_FLAG]);
    render(<AccountFlagPanel subjectId="user-abc" subjectRole="customer" />);
    await waitFor(() => {
      expect(screen.getByText('Repeated violations')).toBeOnTheScreen();
    });
    expect(screen.getByText('Lifted')).toBeOnTheScreen();
  });

  it('shows the "record only / no enforcement" copy', async () => {
    mockGetAccountFlags.mockResolvedValue([]);
    render(<AccountFlagPanel subjectId="user-abc" subjectRole="customer" />);
    await waitFor(() => {
      expect(screen.getByText(/Record only/i)).toBeOnTheScreen();
      expect(screen.getByText(/does NOT block/i)).toBeOnTheScreen();
    });
  });

  it('calls flagAccount with correct args on record submit', async () => {
    mockGetAccountFlags.mockResolvedValue([]);
    mockFlagAccount.mockResolvedValue({ ok: true, id: 'new-flag-id' });

    render(<AccountFlagPanel subjectId="user-abc" subjectRole="customer" />);
    // Wait for list to load (loading → empty state)
    await waitFor(() => screen.getByText('No flags recorded for this account.'));

    fireEvent.changeText(
      screen.getByPlaceholderText('Describe the reason for this flag…'),
      'Bad behaviour',
    );
    // Button has accessibilityLabel "Record flag"
    const recordBtns = screen.getAllByText('Record flag');
    // The last one is the button (section header is the first)
    fireEvent.press(recordBtns[recordBtns.length - 1]);

    await waitFor(() => {
      expect(mockFlagAccount).toHaveBeenCalledWith(
        'user-abc',
        'customer',
        'flag',
        'Bad behaviour',
      );
    });
    // Should reload
    expect(mockGetAccountFlags.mock.calls.length).toBeGreaterThan(1);
  });

  it('calls liftAccountFlag with the correct flag id when Lift is pressed', async () => {
    mockGetAccountFlags.mockResolvedValue([ACTIVE_FLAG]);
    mockLiftAccountFlag.mockResolvedValue({ ok: true });

    render(<AccountFlagPanel subjectId="user-abc" subjectRole="customer" />);
    await waitFor(() => screen.getByText('Lift'));

    fireEvent.press(screen.getByText('Lift'));
    await waitFor(() => {
      expect(mockLiftAccountFlag).toHaveBeenCalledWith('flag-001');
    });
  });

  it('does not show a Lift button for lifted flags', async () => {
    mockGetAccountFlags.mockResolvedValue([LIFTED_FLAG]);
    render(<AccountFlagPanel subjectId="user-abc" subjectRole="customer" />);
    await waitFor(() => screen.getByText('Repeated violations'));
    expect(screen.queryByText('Lift')).toBeNull();
  });

  it('records a suspension when suspension kind is selected', async () => {
    mockGetAccountFlags.mockResolvedValue([]);
    mockFlagAccount.mockResolvedValue({ ok: true, id: 'susp-id' });

    render(<AccountFlagPanel subjectId="user-abc" subjectRole="provider" />);
    await waitFor(() => screen.getByText('No flags recorded for this account.'));

    // Switch to suspension kind
    fireEvent.press(screen.getByText('Suspension'));

    fireEvent.changeText(
      screen.getByPlaceholderText('Describe the reason for this flag…'),
      'Fraud detected',
    );
    fireEvent.press(screen.getByText('Record suspension'));

    await waitFor(() => {
      expect(mockFlagAccount).toHaveBeenCalledWith(
        'user-abc',
        'provider',
        'suspension',
        'Fraud detected',
      );
    });
  });
});
