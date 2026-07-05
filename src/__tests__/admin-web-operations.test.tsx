/**
 * Tests for the Operations Portal screens:
 *   - src/app/(admin-web)/operations/index.tsx  (list)
 *   - src/app/(admin-web)/operations/new.tsx    (create)
 *   - src/app/(admin-web)/operations/[id].tsx   (detail)
 *   - src/components/admin-web/admin-sidebar.tsx (sidebar Operations entry)
 *
 * Context-link tests (bookings/[id], providers/[id]) live in their own
 * dedicated test files (admin-web-bookings.test.tsx / admin-web-providers.test.tsx)
 * so they share the full mock setup already present there.
 *
 * All network/lib calls are mocked.
 */

// ── expo-router mock ──────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  router: { push: jest.fn(), replace: jest.fn() },
  useSegments: () => ['operations'],
}));

// ── @/lib/operations mock ─────────────────────────────────────────────────────

const mockGetSupportCases = jest.fn().mockResolvedValue([]);
const mockGetSupportCase = jest.fn().mockResolvedValue(null);
const mockGetSupportCaseNotes = jest.fn().mockResolvedValue([]);
const mockGetSupportCaseEvents = jest.fn().mockResolvedValue([]);
const mockUpdateSupportCaseStatus = jest.fn().mockResolvedValue({ ok: true });
const mockUpdateSupportCasePriority = jest.fn().mockResolvedValue({ ok: true });
const mockAssignSupportCase = jest.fn().mockResolvedValue({ ok: true });
const mockSetDisputeOutcome = jest.fn().mockResolvedValue({ ok: true });
const mockAddSupportCaseNote = jest.fn().mockResolvedValue({ ok: true });
const mockGetInternalNotes = jest.fn().mockResolvedValue([]);
const mockAddInternalNote = jest.fn().mockResolvedValue({ ok: true });
const mockGetAccountFlags = jest.fn().mockResolvedValue([]);
const mockFlagAccount = jest.fn().mockResolvedValue({ ok: true });
const mockLiftAccountFlag = jest.fn().mockResolvedValue({ ok: true });
const mockGetCaseEvidence = jest.fn().mockResolvedValue([]);
const mockCreateSupportCase = jest.fn().mockResolvedValue({ ok: true, id: 'new-case-1' });

jest.mock('@/lib/operations', () => ({
  getSupportCases: (...args: unknown[]) => mockGetSupportCases(...args),
  getSupportCase: (...args: unknown[]) => mockGetSupportCase(...args),
  getSupportCaseNotes: (...args: unknown[]) => mockGetSupportCaseNotes(...args),
  getSupportCaseEvents: (...args: unknown[]) => mockGetSupportCaseEvents(...args),
  updateSupportCaseStatus: (...args: unknown[]) => mockUpdateSupportCaseStatus(...args),
  updateSupportCasePriority: (...args: unknown[]) => mockUpdateSupportCasePriority(...args),
  assignSupportCase: (...args: unknown[]) => mockAssignSupportCase(...args),
  setDisputeOutcome: (...args: unknown[]) => mockSetDisputeOutcome(...args),
  addSupportCaseNote: (...args: unknown[]) => mockAddSupportCaseNote(...args),
  getInternalNotes: (...args: unknown[]) => mockGetInternalNotes(...args),
  addInternalNote: (...args: unknown[]) => mockAddInternalNote(...args),
  getAccountFlags: (...args: unknown[]) => mockGetAccountFlags(...args),
  flagAccount: (...args: unknown[]) => mockFlagAccount(...args),
  liftAccountFlag: (...args: unknown[]) => mockLiftAccountFlag(...args),
  getCaseEvidence: (...args: unknown[]) => mockGetCaseEvidence(...args),
  createSupportCase: (...args: unknown[]) => mockCreateSupportCase(...args),
}));

// ── @/lib/supabase mock (for "Assign to me" path in detail screen) ────────────

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin1' } } }) },
  },
}));

// ── @/auth/auth-context mock ──────────────────────────────────────────────────

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    session: { user: { id: 'admin1', email: 'admin@qs.com' } },
    signOut: jest.fn(),
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_CASE = {
  id: 'case-1',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-02T00:00:00Z',
  case_type: 'support' as const,
  status: 'open' as const,
  priority: 'medium' as const,
  subject: 'Test case subject',
  description: 'Test description',
  assigned_to: null,
  created_by: 'admin1',
  booking_id: 'bk1',
  customer_id: 'cust1',
  provider_id: null,
  payment_id: null,
  review_id: null,
  dispute_kind: null,
  resolution_outcome: null,
  resolution_notes: null,
  resolved_at: null,
};

const MOCK_DISPUTE_CASE = {
  ...MOCK_CASE,
  id: 'case-2',
  case_type: 'dispute' as const,
  booking_id: 'bk1',
  customer_id: 'cust1',
};

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import AdminWebOperationsScreen from '@/app/(admin-web)/operations/index';
import AdminWebOperationsNewScreen from '@/app/(admin-web)/operations/new';
import AdminWebOperationDetailScreen from '@/app/(admin-web)/operations/[id]';
import { AdminSidebar } from '@/components/admin-web/admin-sidebar';

// ── Operations list tests ─────────────────────────────────────────────────────

describe('AdminWebOperationsScreen (list)', () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    mockGetSupportCases.mockClear();
    (router.push as jest.Mock).mockClear();
  });

  it('renders cases returned from getSupportCases', async () => {
    mockGetSupportCases.mockResolvedValueOnce([MOCK_CASE]);
    render(<AdminWebOperationsScreen />);
    expect(await screen.findByText('Test case subject')).toBeOnTheScreen();
  });

  it('renders 5 filter chip buttons', () => {
    render(<AdminWebOperationsScreen />);
    expect(screen.getByText('Open')).toBeOnTheScreen();
    expect(screen.getByText('Urgent')).toBeOnTheScreen();
    expect(screen.getByText('Assigned to me')).toBeOnTheScreen();
    expect(screen.getByText('Unresolved')).toBeOnTheScreen();
    expect(screen.getByText('Disputes')).toBeOnTheScreen();
  });

  it('pressing a filter chip triggers getSupportCases with the new filter', async () => {
    mockGetSupportCases.mockResolvedValue([]);
    render(<AdminWebOperationsScreen />);
    fireEvent.press(screen.getByText('Open'));
    await waitFor(() =>
      expect(mockGetSupportCases).toHaveBeenCalledWith('open', expect.anything(), expect.anything()),
    );
  });

  it('"New case" button navigates to /(admin-web)/operations/new', () => {
    render(<AdminWebOperationsScreen />);
    fireEvent.press(screen.getByText('New case'));
    expect(router.push).toHaveBeenCalledWith('/(admin-web)/operations/new');
  });

  it('row press navigates to case detail', async () => {
    mockGetSupportCases.mockResolvedValueOnce([MOCK_CASE]);
    render(<AdminWebOperationsScreen />);
    const row = await screen.findByText('Test case subject');
    fireEvent.press(row);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/(admin-web)/operations/case-1'),
    );
  });
});

// ── Create (new.tsx) tests ─────────────────────────────────────────────────────

describe('AdminWebOperationsNewScreen (create)', () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
  });

  it('renders the CreateCaseForm "Open case" submit button', () => {
    // PageMeta is a no-op on native; CreateCaseForm renders its own content.
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    render(<AdminWebOperationsNewScreen />);
    // CreateCaseForm renders "Open new case" header and "Open case" button
    expect(screen.getByText('Open new case')).toBeOnTheScreen();
  });

  it('passes booking_id query param as initial.bookingId — shows linked context', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ booking_id: 'bk-test-id' });
    render(<AdminWebOperationsNewScreen />);
    // CreateCaseForm renders "Booking: #bk-test-i" when bookingId is present
    expect(screen.getByText(/Booking: #bk-test/)).toBeOnTheScreen();
  });

  it('passes customer_id query param as initial.customerId — shows linked context', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ customer_id: 'cust-test-id' });
    render(<AdminWebOperationsNewScreen />);
    expect(screen.getByText(/Customer: #cust-te/)).toBeOnTheScreen();
  });
});

// ── Case detail tests ─────────────────────────────────────────────────────────

describe('AdminWebOperationDetailScreen (detail)', () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'case-1' });
    mockGetSupportCase.mockResolvedValue(MOCK_CASE);
    mockGetSupportCaseNotes.mockResolvedValue([]);
    mockGetSupportCaseEvents.mockResolvedValue([]);
    mockGetInternalNotes.mockResolvedValue([]);
    mockGetAccountFlags.mockResolvedValue([]);
    mockGetCaseEvidence.mockResolvedValue([]);
    mockUpdateSupportCaseStatus.mockClear();
    mockSetDisputeOutcome.mockClear();
  });

  it('renders case header with subject', async () => {
    render(<AdminWebOperationDetailScreen />);
    expect(await screen.findByText('Test case subject')).toBeOnTheScreen();
  });

  it('renders status picker chips including "Open" for status=open', async () => {
    render(<AdminWebOperationDetailScreen />);
    await screen.findByText('Test case subject');
    // The status picker row renders all CASE_STATUSES as chips, including "Open"
    const openEls = screen.getAllByText('Open');
    expect(openEls.length).toBeGreaterThan(0);
  });

  it('renders the Timeline section header', async () => {
    render(<AdminWebOperationDetailScreen />);
    await screen.findByText('Test case subject');
    expect(screen.getByText('Timeline')).toBeOnTheScreen();
  });

  it('renders EvidenceLinks section ("Case evidence")', async () => {
    render(<AdminWebOperationDetailScreen />);
    await screen.findByText('Test case subject');
    expect(await screen.findByText('Case evidence')).toBeOnTheScreen();
  });

  it('changing status calls updateSupportCaseStatus with correct args', async () => {
    render(<AdminWebOperationDetailScreen />);
    await screen.findByText('Test case subject');
    // 'Resolved' status chip — scrolled into view in the status picker row
    const resolvedChip = screen.getByText('Resolved');
    fireEvent.press(resolvedChip);
    await waitFor(() =>
      expect(mockUpdateSupportCaseStatus).toHaveBeenCalledWith('case-1', 'resolved'),
    );
  });

  it('dispute outcome picker is NOT shown for non-dispute case_type=support', async () => {
    render(<AdminWebOperationDetailScreen />);
    await screen.findByText('Test case subject');
    expect(screen.queryByText('Dispute resolution')).toBeNull();
  });

  it('dispute outcome picker IS shown for case_type=dispute', async () => {
    mockGetSupportCase.mockResolvedValueOnce(MOCK_DISPUTE_CASE);
    render(<AdminWebOperationDetailScreen />);
    expect(await screen.findByText('Dispute resolution')).toBeOnTheScreen();
  });

  it('pressing a dispute outcome chip calls setDisputeOutcome', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'case-2' });
    mockGetSupportCase.mockResolvedValue(MOCK_DISPUTE_CASE);
    render(<AdminWebOperationDetailScreen />);
    await screen.findByText('Dispute resolution');
    const chip = screen.getByText('Refund Recommended');
    fireEvent.press(chip);
    await waitFor(() =>
      expect(mockSetDisputeOutcome).toHaveBeenCalledWith('case-2', 'refund_recommended', undefined),
    );
  });

  it('wallet-credit recommendation wording appears for wallet_credit_recommended outcome', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'case-2' });
    mockGetSupportCase.mockResolvedValueOnce({
      ...MOCK_DISPUTE_CASE,
      resolution_outcome: 'wallet_credit_recommended',
    });
    render(<AdminWebOperationDetailScreen />);
    expect(
      await screen.findByText('Recommendation only — no automated action taken'),
    ).toBeOnTheScreen();
    // A link button (not a wallet function call) is shown
    expect(screen.getByText('Go to wallet adjustment')).toBeOnTheScreen();
  });

  it('wallet-credit recommendation wording appears for refund_recommended outcome', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'case-2' });
    mockGetSupportCase.mockResolvedValueOnce({
      ...MOCK_DISPUTE_CASE,
      resolution_outcome: 'refund_recommended',
    });
    render(<AdminWebOperationDetailScreen />);
    expect(
      await screen.findByText('Recommendation only — no automated action taken'),
    ).toBeOnTheScreen();
    // No wallet lib is called automatically — just wording + a navigation link
    expect(screen.getByText('Go to wallet adjustment')).toBeOnTheScreen();
  });
});

// ── Sidebar — Operations entry ────────────────────────────────────────────────

describe('AdminSidebar — Operations entry', () => {
  it('renders an "Operations" nav item', () => {
    render(<AdminSidebar />);
    expect(screen.getByText('Operations')).toBeOnTheScreen();
  });
});
