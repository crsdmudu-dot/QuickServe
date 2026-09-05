/**
 * Tests for Slice 33 Task 5 provider quality screens + admin page + entry points.
 *
 * Covers:
 *   1. provider/quality.tsx        — dashboard, privacy guardrail
 *   2. provider/code-of-conduct.tsx — sections, acceptance flow
 *   3. (admin-web)/provider-quality/[id].tsx — admin summary page
 *   4. Entry points — provider profile + admin providers/[id]
 *
 * All network/lib calls are mocked; expo-router is mocked throughout.
 */

// ── expo-router mock ───────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'prov1' }),
  router: { push: jest.fn() },
}));

// ── @/lib/provider-quality mock ───────────────────────────────────────────────

const mockGetMyQualityDashboard = jest.fn();
const mockGetMyConductAcceptance = jest.fn();
const mockAcceptConduct = jest.fn();

jest.mock('@/lib/provider-quality', () => ({
  getMyQualityDashboard: (...args: unknown[]) => mockGetMyQualityDashboard(...args),
  getMyConductAcceptance: (...args: unknown[]) => mockGetMyConductAcceptance(...args),
  acceptConduct: (...args: unknown[]) => mockAcceptConduct(...args),
}));

// ── @/lib/provider-quality-admin mock ─────────────────────────────────────────

const mockGetProviderQualitySummary = jest.fn();
const mockRecordProviderQualityAction = jest.fn();

jest.mock('@/lib/provider-quality-admin', () => ({
  getProviderQualitySummary: (...args: unknown[]) => mockGetProviderQualitySummary(...args),
  recordProviderQualityAction: (...args: unknown[]) => mockRecordProviderQualityAction(...args),
}));

// ── @/lib/provider-achievements mock ─────────────────────────────────────────
// The admin page imports deriveProviderAchievements — mock it for isolation.

jest.mock('@/lib/provider-achievements', () => ({
  deriveProviderAchievements: () => [
    {
      key: 'first_job',
      label: 'First Job Done',
      icon: '🎉',
      earned: true,
      progress: { current: 5, target: 1 },
    },
  ],
}));

// ── @/lib/provider-completeness mock ─────────────────────────────────────────

jest.mock('@/lib/provider-completeness', () => ({
  calculateProviderCompleteness: () => ({
    percent: 80,
    items: [
      { key: 'photo', label: 'Profile photo', done: true, futureReady: false },
    ],
    missing: [],
  }),
}));

// ── @/lib/reviews mock ────────────────────────────────────────────────────────

jest.mock('@/lib/reviews', () => ({
  getProviderReviews: jest.fn().mockResolvedValue([]),
  getProviderRatingBreakdown: jest.fn().mockResolvedValue({
    overall_avg: 4.5,
    review_count: 8,
    recommend_pct: 88,
    quality_avg: 4.6,
    punctuality_avg: 4.2,
    communication_avg: 4.8,
    professionalism_avg: 4.5,
    value_avg: 4.1,
    top_tags: ['on_time', 'friendly'],
  }),
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

// ── @/lib/providers mock ─────────────────────────────────────────────────────

jest.mock('@/lib/providers', () => ({
  getProviderProfile: jest.fn().mockResolvedValue({
    id: 'prov1',
    full_name: 'Jane Doe',
    phone: '0700000000',
    approval_status: 'approved',
    profile_photo_url: null,
    bio: 'Experienced plumber',
    years_experience: 8,
    skills: ['Plumbing'],
    is_verified: true,
    completed_jobs_count: 12,
    average_rating: 4.7,
    review_count: 8,
    availability_status: 'available',
  }),
  updateMyProviderProfile: jest.fn().mockResolvedValue({ ok: true }),
  setProviderApproval: jest.fn().mockResolvedValue({ ok: true }),
  adminUpdateProviderProfile: jest.fn().mockResolvedValue({ ok: true }),
}));

// ── @/lib/earnings mock ───────────────────────────────────────────────────────

jest.mock('@/lib/earnings', () => ({
  // Provider Payout V1: figures come from the ledger view; the legacy mark-paid path is gone.
  getProviderEarningsSummary: jest.fn().mockResolvedValue({
    entitlement: 0,
    deductions: 0,
    net_payable: 0,
    disbursed: 0,
    outstanding: 0,
  }),
  getMyPayoutLedger: jest.fn().mockResolvedValue([]),
  adminGetProviderPayoutLedger: jest.fn().mockResolvedValue([]),
}));

// ── @/lib/operations mock ─────────────────────────────────────────────────────

jest.mock('@/lib/operations', () => ({
  getInternalNotes: jest.fn().mockResolvedValue([]),
  addInternalNote: jest.fn().mockResolvedValue({ ok: true }),
  getAccountFlags: jest.fn().mockResolvedValue([]),
  flagAccount: jest.fn().mockResolvedValue({ ok: true }),
  liftAccountFlag: jest.fn().mockResolvedValue({ ok: true }),
  getCaseEvidence: jest.fn().mockResolvedValue([]),
  getSupportCases: jest.fn().mockResolvedValue([]),
  getSupportCase: jest.fn().mockResolvedValue(null),
  getSupportCaseNotes: jest.fn().mockResolvedValue([]),
  getSupportCaseEvents: jest.fn().mockResolvedValue([]),
  updateSupportCaseStatus: jest.fn().mockResolvedValue({ ok: true }),
  updateSupportCasePriority: jest.fn().mockResolvedValue({ ok: true }),
  assignSupportCase: jest.fn().mockResolvedValue({ ok: true }),
  setDisputeOutcome: jest.fn().mockResolvedValue({ ok: true }),
  addSupportCaseNote: jest.fn().mockResolvedValue({ ok: true }),
  createSupportCase: jest.fn().mockResolvedValue({ ok: true, id: 'new-case-1' }),
}));

// ── @/auth/auth-context mock ──────────────────────────────────────────────────

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    approvalStatus: 'approved',
    session: { user: { id: 'prov1' } },
    signOut: jest.fn(),
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_BREAKDOWN = {
  overall_avg: 4.7,
  review_count: 12,
  recommend_pct: 92,
  quality_avg: 4.8,
  punctuality_avg: 4.5,
  communication_avg: 4.9,
  professionalism_avg: 4.7,
  value_avg: 4.5,
  top_tags: ['on_time', 'friendly', 'clean_work'],
};

const MOCK_COMPLETENESS = {
  percent: 80,
  items: [
    { key: 'photo', label: 'Profile photo', done: true, futureReady: false },
    { key: 'bio', label: 'Bio', done: true, futureReady: false },
  ],
  missing: ['experience'],
};

const MOCK_ACHIEVEMENTS = [
  {
    key: 'first_job' as const,
    label: 'First Job Done',
    icon: '🎉',
    earned: true,
    progress: { current: 12, target: 1 },
  },
];

const MOCK_DASHBOARD = {
  profile: {
    id: 'prov1',
    full_name: 'Jane Doe',
    phone: '0700000000',
    approval_status: 'approved' as const,
    profile_photo_url: null,
    bio: 'Experienced plumber',
    years_experience: 8,
    skills: ['Plumbing'],
    is_verified: true,
    completed_jobs_count: 12,
    average_rating: 4.7,
    review_count: 8,
    availability_status: 'available' as const,
  },
  breakdown: MOCK_BREAKDOWN,
  recentReviews: [
    {
      id: 'rev1',
      booking_id: 'bk1',
      customer_id: 'cust1',
      provider_id: 'prov1',
      rating: 5,
      comment: 'Excellent work!',
      is_hidden: false,
      created_at: '2026-06-01T00:00:00Z',
    },
  ],
  recentCompletedJobs: [
    {
      id: 'job1',
      service_id: 'plumbing',
      status: 'completed' as const,
      customer_id: 'cust1',
      address: '123 Main St',
      scheduled_for: '2026-06-01T10:00:00Z',
      notes: null,
      quoted_amount: null,
      provider_share: null,
      quote_status: 'none' as const,
      assigned_provider_id: 'prov1',
      assigned_provider_name: null,
      assigned_provider_phone: null,
      admin_notes: null,
      created_at: '2026-06-01T00:00:00Z',
    },
  ],
  completeness: MOCK_COMPLETENESS,
  achievements: MOCK_ACHIEVEMENTS,
  tags: { strengths: ['on_time', 'friendly'], improvements: ['late'] },
  visibleActions: [
    {
      id: 'qa1',
      provider_id: 'prov1',
      action_type: 'coaching_needed' as const,
      note: 'Please improve punctuality',
      provider_visible: true,
      created_by: 'admin1',
      created_at: '2026-06-05T00:00:00Z',
    },
  ],
  conduct: { accepted: true, accepted_at: '2026-05-01T00:00:00Z' },
  accountStatus: 'approved' as const,
};

const MOCK_ADMIN_SUMMARY = {
  profile: MOCK_DASHBOARD.profile,
  breakdown: MOCK_BREAKDOWN,
  recentReviews: MOCK_DASHBOARD.recentReviews,
  completeness: MOCK_COMPLETENESS,
  qualityActions: [
    {
      id: 'qa1',
      provider_id: 'prov1',
      action_type: 'coaching_needed' as const,
      note: 'Please improve punctuality',
      provider_visible: true,
      created_by: 'admin1',
      created_at: '2026-06-05T00:00:00Z',
    },
    {
      id: 'qa2',
      provider_id: 'prov1',
      action_type: 'warning_given' as const,
      note: 'Internal warning',
      provider_visible: false,
      created_by: 'admin1',
      created_at: '2026-06-04T00:00:00Z',
    },
  ],
  conduct: { accepted: true, accepted_at: '2026-05-01T00:00:00Z' },
  flagsSummary: { total: 2, active: 1, byKind: { account_review: 1, quality: 1 } },
};

// ── Imports (after all mocks) ─────────────────────────────────────────────────

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import ProviderQualityDashboardScreen from '@/app/provider/quality';
import ProviderCodeOfConductScreen from '@/app/provider/code-of-conduct';
import AdminProviderQualityScreen from '@/app/(admin-web)/provider-quality/[id]';
import ProviderProfileScreen from '@/app/provider/(tabs)/profile';
import AdminWebProviderDetailScreen from '@/app/(admin-web)/providers/[id]';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Provider Quality Dashboard
// ═══════════════════════════════════════════════════════════════════════════════

describe('ProviderQualityDashboardScreen', () => {
  beforeEach(() => {
    mockGetMyQualityDashboard.mockClear();
    mockGetMyQualityDashboard.mockResolvedValue(MOCK_DASHBOARD);
    (router.push as jest.Mock).mockClear();
  });

  it('shows loading spinner while dashboard is loading', () => {
    // Delay resolution so spinner is visible synchronously
    mockGetMyQualityDashboard.mockReturnValue(new Promise(() => {}));
    render(<ProviderQualityDashboardScreen />);
    expect(screen.getByTestId('quality-loading')).toBeOnTheScreen();
  });

  it('renders "Profile Health" section with CompletenessCard and achievements', async () => {
    render(<ProviderQualityDashboardScreen />);
    expect(await screen.findByText('Profile Health')).toBeOnTheScreen();
    // CompletenessCard renders "Profile completeness"
    expect(screen.getByText('Profile completeness')).toBeOnTheScreen();
    // AchievementGrid renders "First Job Done"
    expect(screen.getByText('First Job Done')).toBeOnTheScreen();
  });

  it('renders "Service Quality" section with breakdown, job count, tags, reviews', async () => {
    render(<ProviderQualityDashboardScreen />);
    expect(await screen.findByText('Service Quality')).toBeOnTheScreen();
    // ProviderQualityBreakdownCard renders "Your ratings"
    expect(screen.getByText('Your ratings')).toBeOnTheScreen();
    // Total completed jobs
    expect(screen.getByText('Total completed jobs')).toBeOnTheScreen();
    // Feedback tags section
    expect(screen.getByText('Feedback tags')).toBeOnTheScreen();
    // Recent review comment
    expect(screen.getByText('Excellent work!')).toBeOnTheScreen();
  });

  it('renders "Account Status" section with approval_status and visible action', async () => {
    render(<ProviderQualityDashboardScreen />);
    expect(await screen.findByText('Account Status')).toBeOnTheScreen();
    // Account status = approval_status only
    expect(screen.getByText('Approved')).toBeOnTheScreen();
    // Coaching section shows the visible action (action_type label)
    expect(screen.getByText('Coaching needed')).toBeOnTheScreen();
    // Action note
    expect(screen.getByText('Please improve punctuality')).toBeOnTheScreen();
  });

  it('shows conduct accepted status and "View Code of Conduct" button', async () => {
    render(<ProviderQualityDashboardScreen />);
    await screen.findByText('Account Status');
    expect(screen.getByText('View Code of Conduct')).toBeOnTheScreen();
    // Conduct accepted
    expect(screen.getAllByText('Accepted').length).toBeGreaterThan(0);
  });

  it('navigates to /provider/code-of-conduct when "View Code of Conduct" is pressed', async () => {
    render(<ProviderQualityDashboardScreen />);
    await screen.findByText('View Code of Conduct');
    fireEvent.press(screen.getByText('View Code of Conduct'));
    expect(router.push).toHaveBeenCalledWith('/provider/code-of-conduct');
  });

  it('shows gentle error state when dashboard returns null', async () => {
    mockGetMyQualityDashboard.mockResolvedValue(null);
    render(<ProviderQualityDashboardScreen />);
    expect(await screen.findByText('Could not load quality dashboard.')).toBeOnTheScreen();
  });

  // ── PRIVACY TEST ────────────────────────────────────────────────────────────
  it('(privacy) does not import @/lib/operations or reference internal tables in code', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../app/provider/quality.tsx'),
      'utf8',
    );
    // Strip single-line comments and multi-line JSDoc blocks before checking.
    // This allows documentation comments to mention what is forbidden without
    // causing the test to false-positive.
    const codeOnly = src
      .split('\n')
      .filter((line: string) => !/^\s*\*/.test(line) && !/^\s*\/\//.test(line))
      .join('\n');
    // Must not have an actual import statement for operations lib
    expect(codeOnly).not.toMatch(/from ['"]@\/lib\/operations['"]/);
    // Must not reference private admin tables in actual code lines
    expect(codeOnly).not.toMatch(/support_cases/);
    expect(codeOnly).not.toMatch(/internal_notes/);
    expect(codeOnly).not.toMatch(/review_private_feedback/);
    expect(codeOnly).not.toMatch(/account_flags/);
  });

  it('(privacy) only references visibleActions (not allActions or rawActions)', async () => {
    render(<ProviderQualityDashboardScreen />);
    await screen.findByText('Account Status');
    // The fixture has exactly 1 visible action — confirm it appears once
    const badges = screen.getAllByText('Coaching needed');
    expect(badges).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Provider Code of Conduct
// ═══════════════════════════════════════════════════════════════════════════════

describe('ProviderCodeOfConductScreen', () => {
  beforeEach(() => {
    mockGetMyConductAcceptance.mockClear();
    mockAcceptConduct.mockClear();
    mockGetMyConductAcceptance.mockResolvedValue({ accepted: false, accepted_at: null });
    mockAcceptConduct.mockResolvedValue({ ok: true });
  });

  it('renders CODE_OF_CONDUCT section headings', async () => {
    render(<ProviderCodeOfConductScreen />);
    // The first and last sections from CODE_OF_CONDUCT
    expect(await screen.findByText('Professional behaviour')).toBeOnTheScreen();
    expect(screen.getByText('Dispute expectations')).toBeOnTheScreen();
  });

  it('renders CODE_OF_CONDUCT section body text', async () => {
    render(<ProviderCodeOfConductScreen />);
    expect(
      await screen.findByText(/Always conduct yourself with professionalism/),
    ).toBeOnTheScreen();
  });

  it('shows "Not yet accepted" when conduct not accepted', async () => {
    render(<ProviderCodeOfConductScreen />);
    // ConductAcceptanceCard renders "Not yet accepted"
    expect(await screen.findByText('Not yet accepted')).toBeOnTheScreen();
    // Accept button visible
    expect(screen.getByText('Accept')).toBeOnTheScreen();
  });

  it('shows "Accepted" status when conduct already accepted', async () => {
    mockGetMyConductAcceptance.mockResolvedValue({
      accepted: true,
      accepted_at: '2026-05-01T00:00:00Z',
    });
    render(<ProviderCodeOfConductScreen />);
    // ConductAcceptanceCard renders "✓ Accepted" (with checkmark prefix)
    expect(await screen.findByText(/Accepted/)).toBeOnTheScreen();
    // Accept button should not be visible when already accepted
    expect(screen.queryByText('Accept')).not.toBeOnTheScreen();
  });

  it('calls acceptConduct(CONDUCT_VERSION) when Accept is pressed', async () => {
    // Initial load: not accepted. After accept (second call): accepted.
    mockGetMyConductAcceptance
      .mockResolvedValueOnce({ accepted: false, accepted_at: null })
      .mockResolvedValue({ accepted: true, accepted_at: '2026-07-01T00:00:00Z' });

    render(<ProviderCodeOfConductScreen />);
    const acceptBtn = await screen.findByText('Accept');
    fireEvent.press(acceptBtn);

    // acceptConduct must be called with the current conduct version
    await waitFor(() => expect(mockAcceptConduct).toHaveBeenCalledWith('v1'));
    // getMyConductAcceptance should be called at least twice (initial + refresh)
    await waitFor(() =>
      expect(mockGetMyConductAcceptance).toHaveBeenCalledTimes(2),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Admin Provider Quality page
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminProviderQualityScreen', () => {
  beforeEach(() => {
    mockGetProviderQualitySummary.mockClear();
    mockRecordProviderQualityAction.mockClear();
    mockGetProviderQualitySummary.mockResolvedValue(MOCK_ADMIN_SUMMARY);
    mockRecordProviderQualityAction.mockResolvedValue({ ok: true, id: 'qa-new' });
  });

  it('renders provider name and verification badge', async () => {
    render(<AdminProviderQualityScreen />);
    expect(await screen.findByText('Jane Doe')).toBeOnTheScreen();
    expect(screen.getByText('Verified by KwikServe')).toBeOnTheScreen();
  });

  it('renders approval status', async () => {
    render(<AdminProviderQualityScreen />);
    await screen.findByText('Jane Doe');
    expect(screen.getByText('Approved')).toBeOnTheScreen();
  });

  it('renders CompletenessCard', async () => {
    render(<AdminProviderQualityScreen />);
    await screen.findByText('Jane Doe');
    // CompletenessCard renders "Profile completeness" — may appear in SectionHeader + Card
    expect(screen.getAllByText('Profile completeness').length).toBeGreaterThan(0);
  });

  it('renders AchievementGrid with achievement from mock', async () => {
    render(<AdminProviderQualityScreen />);
    await screen.findByText('Jane Doe');
    expect(screen.getByText('First Job Done')).toBeOnTheScreen();
  });

  it('renders ProviderQualityBreakdownCard', async () => {
    render(<AdminProviderQualityScreen />);
    await screen.findByText('Jane Doe');
    expect(screen.getByText('Your ratings')).toBeOnTheScreen();
  });

  it('renders recent reviews', async () => {
    render(<AdminProviderQualityScreen />);
    await screen.findByText('Jane Doe');
    expect(await screen.findByText('Excellent work!')).toBeOnTheScreen();
  });

  it('renders quality action history — both visible and internal actions', async () => {
    render(<AdminProviderQualityScreen />);
    await screen.findByText('Jane Doe');
    // Both actions in the history — may appear multiple times (form selector + badge)
    expect(await screen.findByText('Quality action history')).toBeOnTheScreen();
    expect(screen.getAllByText('Coaching needed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Warning given').length).toBeGreaterThan(0);
    // Internal flag present (appears in action card and may also appear in form toggle)
    expect(screen.getAllByText('Internal only').length).toBeGreaterThan(0);
    // Visible to provider flag present
    expect(screen.getAllByText('Visible to provider').length).toBeGreaterThan(0);
  });

  it('renders conduct acceptance status', async () => {
    render(<AdminProviderQualityScreen />);
    await screen.findByText('Jane Doe');
    expect(await screen.findByText('Code of Conduct')).toBeOnTheScreen();
    expect(screen.getByText('Accepted')).toBeOnTheScreen();
  });

  it('renders flags summary (read-only)', async () => {
    render(<AdminProviderQualityScreen />);
    await screen.findByText('Jane Doe');
    expect(await screen.findByText('Account flags summary')).toBeOnTheScreen();
    expect(screen.getByText(/Total:\s*2/)).toBeOnTheScreen();
    expect(screen.getByText(/Active:\s*1/)).toBeOnTheScreen();
  });

  it('renders AdminRecordQualityActionForm with record-only disclaimer', async () => {
    render(<AdminProviderQualityScreen />);
    await screen.findByText('Jane Doe');
    expect(await screen.findByText('Record quality action')).toBeOnTheScreen();
    // Disclaimer text from AdminRecordQualityActionForm
    expect(
      screen.getByText(/Record-only.*does not suspend/),
    ).toBeOnTheScreen();
  });

  it('reloads summary after successful record action', async () => {
    mockGetProviderQualitySummary.mockResolvedValue(MOCK_ADMIN_SUMMARY);
    render(<AdminProviderQualityScreen />);
    await screen.findByText('Jane Doe');

    // The form's onRecorded fires after record; verify summary reloads.
    // Select action type "No action" (avoid label clashes with history badges).
    // The form renders QUALITY_ACTION_TYPES as pressable chips with the label text.
    const noActionChips = screen.getAllByText('No action');
    // Press the first match (the chip inside the form's type selector)
    fireEvent.press(noActionChips[0]);
    fireEvent.press(screen.getByText('Record action'));

    await waitFor(() =>
      expect(mockRecordProviderQualityAction).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'prov1', actionType: 'no_action' }),
      ),
    );
    // Summary should be reloaded (called once on mount + once after record)
    await waitFor(() =>
      expect(mockGetProviderQualitySummary).toHaveBeenCalledTimes(2),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Entry points
// ═══════════════════════════════════════════════════════════════════════════════

describe('Entry points — ProviderProfileScreen', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
  });

  it('renders "Quality Dashboard" button in the approved profile', async () => {
    render(<ProviderProfileScreen />);
    expect(await screen.findByText('Quality Dashboard')).toBeOnTheScreen();
  });

  it('navigates to /provider/quality when "Quality Dashboard" is pressed', async () => {
    render(<ProviderProfileScreen />);
    await screen.findByText('Quality Dashboard');
    fireEvent.press(screen.getByText('Quality Dashboard'));
    expect(router.push).toHaveBeenCalledWith('/provider/quality');
  });

  it('renders "Code of Conduct" button in the approved profile', async () => {
    render(<ProviderProfileScreen />);
    expect(await screen.findByText('Code of Conduct')).toBeOnTheScreen();
  });

  it('navigates to /provider/code-of-conduct when "Code of Conduct" is pressed', async () => {
    render(<ProviderProfileScreen />);
    await screen.findByText('Code of Conduct');
    fireEvent.press(screen.getByText('Code of Conduct'));
    expect(router.push).toHaveBeenCalledWith('/provider/code-of-conduct');
  });
});

describe('Entry points — AdminWebProviderDetailScreen', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
  });

  it('renders "View provider quality" button', async () => {
    render(<AdminWebProviderDetailScreen />);
    expect(await screen.findByText('View provider quality')).toBeOnTheScreen();
  });

  it('navigates to /(admin-web)/provider-quality/{id} when pressed', async () => {
    render(<AdminWebProviderDetailScreen />);
    await screen.findByText('View provider quality');
    fireEvent.press(screen.getByText('View provider quality'));
    expect(router.push).toHaveBeenCalledWith('/(admin-web)/provider-quality/prov1');
  });
});
