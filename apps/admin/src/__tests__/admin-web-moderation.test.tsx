/**
 * Tests for the web-admin Moderation queue (src/app/moderation/index.tsx) and the legacy
 * /admin/booking/<id> redirect (src/app/admin/booking/[id].tsx).
 *
 * Uses the REAL @/lib/moderation wrappers; only supabase.rpc is mocked, routed by function name,
 * so each test checks the exact server call an admin action makes.
 */

const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ id: 'booking-123' }),
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
}));

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

// The suspension panel (F5.6b) has its own tests; here only its placement and inputs are checked.
const mockGetLatestSuspension = jest.fn().mockResolvedValue({ ok: true, suspension: null });
const mockSuspendAccount = jest.fn().mockResolvedValue({ ok: true, signInBlock: 'banned', recorded: true });
jest.mock('@/lib/suspension', () => ({
  getLatestSuspension: (...args: unknown[]) => mockGetLatestSuspension(...args),
  suspendAccount: (...args: unknown[]) => mockSuspendAccount(...args),
  liftSuspension: jest.fn(),
  retrySignInBlock: jest.fn(),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import AdminWebModerationScreen from '@admin/app/moderation/index';
import LegacyAdminBookingRedirect from '@admin/app/admin/booking/[id]';

const HOUR = 3_600_000;
const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR).toISOString();

const MESSAGE_REPORT = {
  report_id: 'rep-msg-1',
  created_at: iso(30),
  target_type: 'message',
  target_id: 'msg-1',
  reason: 'harassment',
  status: 'open',
  reporter_id: 'cust-1',
  reporter_name: 'Asha Customer',
  reported_user_id: 'prov-1',
  reported_name: 'Baraka Provider',
  reported_role: 'provider',
  booking_id: 'booking-12345678',
  content_text: 'Synthetic rude message',
  content_hidden: false,
  resolved_at: null,
  resolution_note: null,
};

const PROVIDER_REPORT = {
  ...MESSAGE_REPORT,
  report_id: 'rep-user-1',
  created_at: iso(2),
  target_type: 'user',
  target_id: 'prov-1',
  reason: 'scam',
  booking_id: null,
  content_text: 'Synthetic bio text',
};

let queue: Record<string, unknown[]>;

beforeEach(() => {
  mockRpc.mockReset();
  mockRedirect.mockReset();
  queue = { open: [MESSAGE_REPORT, PROVIDER_REPORT], actioned: [], dismissed: [] };
  mockRpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    if (fn === 'admin_get_content_reports') {
      return Promise.resolve({ data: queue[args.p_status as string], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
});

describe('AdminWebModerationScreen', () => {
  it('lists open reports with the reported text and flags one past 24 hours', async () => {
    render(<AdminWebModerationScreen />);
    expect(await screen.findByText('Synthetic rude message')).toBeOnTheScreen();
    expect(screen.getByText('Synthetic bio text')).toBeOnTheScreen();
    expect(mockRpc).toHaveBeenCalledWith('admin_get_content_reports', { p_status: 'open' });
    expect(screen.getByTestId('report-age-rep-msg-1')).toHaveTextContent(/^Over 24 h/);
    expect(screen.getByTestId('report-age-rep-user-1')).toHaveTextContent('2 h ago');
  });

  it('Hide sends the message id, the report and the note, then reloads', async () => {
    render(<AdminWebModerationScreen />);
    await screen.findByText('Synthetic rude message');
    fireEvent.changeText(screen.getAllByPlaceholderText('What you checked or did')[0], 'Abusive');
    fireEvent.press(screen.getByTestId('report-toggle-hidden-rep-msg-1'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('admin_set_message_hidden', {
        p_message_id: 'msg-1',
        p_hidden: true,
        p_report_id: 'rep-msg-1',
        p_note: 'Abusive',
      }),
    );
    await waitFor(() =>
      expect(mockRpc.mock.calls.filter(([fn]) => fn === 'admin_get_content_reports')).toHaveLength(2),
    );
  });

  it('a reported provider offers "Clear bio and skills"; a chat message does not', async () => {
    render(<AdminWebModerationScreen />);
    await screen.findByText('Synthetic bio text');
    expect(screen.queryByTestId('report-clear-profile-rep-msg-1')).toBeNull();
    fireEvent.press(screen.getByTestId('report-clear-profile-rep-user-1'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('admin_clear_profile_text', {
        p_user_id: 'prov-1',
        p_report_id: 'rep-user-1',
        p_note: '',
      }),
    );
  });

  it('"Action taken" and "Dismiss" close the report with the right outcome', async () => {
    render(<AdminWebModerationScreen />);
    await screen.findByText('Synthetic rude message');
    fireEvent.press(screen.getByTestId('report-actioned-rep-msg-1'));
    fireEvent.press(screen.getByTestId('report-dismiss-rep-user-1'));
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('admin_resolve_content_report', {
        p_report_id: 'rep-msg-1',
        p_outcome: 'actioned',
        p_note: '',
      });
      expect(mockRpc).toHaveBeenCalledWith('admin_resolve_content_report', {
        p_report_id: 'rep-user-1',
        p_outcome: 'dismissed',
        p_note: '',
      });
    });
  });

  it('shows the server refusal as a fixed message on the card', async () => {
    mockRpc.mockImplementation((fn: string, args: Record<string, unknown>) =>
      fn === 'admin_get_content_reports'
        ? Promise.resolve({ data: queue[args.p_status as string], error: null })
        : Promise.resolve({ data: null, error: { message: 'report_not_open', code: 'P0002' } }),
    );
    render(<AdminWebModerationScreen />);
    await screen.findByText('Synthetic rude message');
    fireEvent.press(screen.getByTestId('report-actioned-rep-msg-1'));
    expect(
      await screen.findByText('Could not update the report. It may already be closed.'),
    ).toBeOnTheScreen();
  });

  it('the filter loads closed reports, which show no actions', async () => {
    queue.dismissed = [
      { ...MESSAGE_REPORT, status: 'dismissed', resolved_at: iso(1), resolution_note: 'Not abusive' },
    ];
    render(<AdminWebModerationScreen />);
    await screen.findByText('Synthetic rude message');
    fireEvent.press(screen.getByTestId('moderation-filter-dismissed'));
    expect(await screen.findByText(/Not abusive/)).toBeOnTheScreen();
    expect(mockRpc).toHaveBeenCalledWith('admin_get_content_reports', { p_status: 'dismissed' });
    expect(screen.queryByTestId('report-actioned-rep-msg-1')).toBeNull();
  });

  it('an empty queue says so; a failed load offers Retry', async () => {
    queue.open = [];
    render(<AdminWebModerationScreen />);
    expect(await screen.findByTestId('moderation-empty')).toBeOnTheScreen();

    mockRpc.mockResolvedValue({ data: null, error: { message: 'Admin only', code: '42501' } });
    fireEvent.press(screen.getByTestId('moderation-filter-actioned'));
    expect(await screen.findByText('Could not load reports.')).toBeOnTheScreen();
    expect(screen.getByText('Retry')).toBeOnTheScreen();
  });

  it('opens the suspension panel for the reported provider, linked to the report (F5.6b)', async () => {
    render(<AdminWebModerationScreen />);
    await screen.findByText('Synthetic rude message');
    expect(screen.queryByTestId('suspension-panel')).toBeNull();
    fireEvent.press(screen.getByTestId('report-suspension-toggle-rep-msg-1'));
    expect(await screen.findByText('Not suspended')).toBeOnTheScreen();
    expect(mockGetLatestSuspension).toHaveBeenCalledWith('prov-1');
    fireEvent.changeText(screen.getByTestId('suspension-reason'), 'Repeated harassment in chat');
    fireEvent.press(screen.getByTestId('suspension-suspend'));
    fireEvent.press(screen.getByTestId('suspension-confirm'));
    await waitFor(() =>
      expect(mockSuspendAccount).toHaveBeenCalledWith({ userId: 'prov-1', reason: 'Repeated harassment in chat', reportId: 'rep-msg-1' }),
    );
  });

  it('offers no suspension for a report without a customer or provider behind it', async () => {
    queue.open = [{ ...MESSAGE_REPORT, report_id: 'rep-x', reported_user_id: null, reported_role: null }];
    render(<AdminWebModerationScreen />);
    await screen.findByText('Synthetic rude message');
    expect(screen.queryByTestId('report-suspension-toggle-rep-x')).toBeNull();
  });
});

describe('legacy /admin/booking/<id> links', () => {
  it('redirect to the admin booking page', () => {
    render(<LegacyAdminBookingRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith('/bookings/booking-123');
  });
});
