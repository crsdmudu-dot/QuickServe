// provider-quality.test.ts — Tests for src/lib/provider-quality.ts
//
// Mocks: @/lib/supabase, @/lib/providers, @/lib/reviews, @/lib/bookings,
//        @/lib/provider-completeness, @/lib/provider-achievements
// Includes purity/privacy check: asserts the module does NOT import
// @/lib/operations and does NOT reference any private internal tables.

import * as fs from 'fs';
import * as path from 'path';

// ── Mock fns (must have "mock" prefix for jest.mock factory rule) ──────────

const mockGetUser     = jest.fn();
const mockRpc         = jest.fn();
const mockSelect      = jest.fn();
const mockEq          = jest.fn();
const mockOrder       = jest.fn();
const mockMaybeSingle = jest.fn();

// Per-table response registry — set per-test
const mockTableResults: Record<string, unknown> = {};

// ── Mock: @/lib/supabase ──────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (table: string) => {
      const resolve = () =>
        Promise.resolve(mockTableResults[table] ?? { data: null, error: null });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function node(): Record<string, unknown> & PromiseLike<any> {
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          then: (res?: any, rej?: any) => resolve().then(res, rej),
          select: (...a: unknown[]) => { mockSelect(...a); return node(); },
          eq: (...a: unknown[]) => { mockEq(...a); return node(); },
          order: (...a: unknown[]) => { mockOrder(...a); return node(); },
          maybeSingle: (...a: unknown[]) => { mockMaybeSingle(...a); return resolve(); },
        };
      }
      void table;
      return node();
    },
  },
}));

// ── Mock: @/lib/providers ────────────────────────────────────────────────

const mockGetProviderProfile = jest.fn();
jest.mock('@/lib/providers', () => ({
  getProviderProfile: (...a: unknown[]) => mockGetProviderProfile(...a),
}));

// ── Mock: @/lib/reviews ──────────────────────────────────────────────────

const mockGetProviderRatingBreakdown = jest.fn();
const mockGetProviderReviews         = jest.fn();
jest.mock('@/lib/reviews', () => ({
  getProviderRatingBreakdown: (...a: unknown[]) => mockGetProviderRatingBreakdown(...a),
  getProviderReviews:         (...a: unknown[]) => mockGetProviderReviews(...a),
}));

// ── Mock: @/lib/bookings ──────────────────────────────────────────────────

const mockGetProviderJobs = jest.fn();
jest.mock('@/lib/bookings', () => ({
  getProviderJobs: (...a: unknown[]) => mockGetProviderJobs(...a),
}));

// ── Mock: @/lib/provider-completeness ─────────────────────────────────────

const mockCalculateProviderCompleteness = jest.fn();
jest.mock('@/lib/provider-completeness', () => ({
  calculateProviderCompleteness: (...a: unknown[]) => mockCalculateProviderCompleteness(...a),
}));

// ── Mock: @/lib/provider-achievements ─────────────────────────────────────

const mockDeriveProviderAchievements = jest.fn();
jest.mock('@/lib/provider-achievements', () => ({
  deriveProviderAchievements: (...a: unknown[]) => mockDeriveProviderAchievements(...a),
}));

import {
  getMyProviderId,
  getMyVisibleQualityActions,
  getMyConductAcceptance,
  acceptConduct,
  getMyRecentCompletedJobs,
  getMyQualityDashboard,
} from '@/lib/provider-quality';
import type { Booking } from '@/lib/bookings';

// ── Helpers ────────────────────────────────────────────────────────────────

function setTable(table: string, value: unknown) {
  mockTableResults[table] = value;
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    service_id: 's1',
    address: '123 Test St',
    scheduled_for: '2025-01-01T10:00:00Z',
    notes: null,
    status: 'completed',
    created_at: '2025-01-01T09:00:00Z',
    assigned_provider_name: null,
    assigned_provider_phone: null,
    admin_notes: null,
    assigned_provider_id: 'p1',
    quoted_amount: null,
    provider_share: null,
    quote_status: 'pending',
    customer_id: 'c1',
    address_label: null,
    latitude: null,
    longitude: null,
    building_name: null,
    floor: null,
    door_number: null,
    landmark: null,
    access_notes: null,
    scheduling_type: 'datetime',
    time_window: null,
    window_start: null,
    window_end: null,
    recurrence: 'one_time',
    ...overrides,
  };
}

function makeProfile(overrides = {}) {
  return {
    id: 'p1',
    full_name: 'Test Provider',
    phone: '+254700000001',
    approval_status: 'approved',
    profile_photo_url: 'https://example.com/photo.jpg',
    bio: 'Bio',
    years_experience: 5,
    skills: ['plumbing'],
    is_verified: false,
    completed_jobs_count: 10,
    average_rating: 4.9,
    review_count: 5,
    availability_status: 'available',
    ...overrides,
  };
}

function makeBreakdown(overrides = {}) {
  return {
    overall_avg: 4.9,
    review_count: 5,
    recommend_pct: 80,
    quality_avg: null,
    punctuality_avg: null,
    communication_avg: null,
    professionalism_avg: null,
    value_avg: null,
    top_tags: ['on_time', 'friendly', 'late'],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockTableResults)) delete mockTableResults[k];
});

// ── Purity / Privacy check ─────────────────────────────────────────────────

describe('purity / privacy guardrails', () => {
  const libPath = path.resolve(__dirname, 'provider-quality.ts');
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(libPath, 'utf8');
  });

  it('does NOT import @/lib/operations', () => {
    expect(src).not.toMatch(/@\/lib\/operations/);
  });

  it('does NOT reference support_cases', () => {
    expect(src).not.toMatch(/support_cases/);
  });

  it('does NOT reference internal_notes', () => {
    expect(src).not.toMatch(/internal_notes/);
  });

  it('does NOT reference review_private_feedback', () => {
    expect(src).not.toMatch(/review_private_feedback/);
  });

  it('does NOT reference account_flags', () => {
    expect(src).not.toMatch(/account_flags/);
  });
});

// ── getMyProviderId ────────────────────────────────────────────────────────

describe('getMyProviderId', () => {
  it('returns user id when authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-123' } } });
    const result = await getMyProviderId();
    expect(result).toBe('uid-123');
  });

  it('returns null when user is null', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const result = await getMyProviderId();
    expect(result).toBeNull();
  });

  it('returns null when data is empty', async () => {
    mockGetUser.mockResolvedValue({ data: {} });
    const result = await getMyProviderId();
    expect(result).toBeNull();
  });
});

// ── getMyVisibleQualityActions ─────────────────────────────────────────────

describe('getMyVisibleQualityActions', () => {
  it('returns rows from provider_quality_actions ordered by created_at desc', async () => {
    const rows = [
      { id: 'qa1', provider_id: 'p1', action_type: 'coaching_needed', note: null, provider_visible: true, created_by: 'admin1', created_at: '2025-02-01' },
      { id: 'qa2', provider_id: 'p1', action_type: 'warning_given',   note: 'text', provider_visible: true, created_by: 'admin1', created_at: '2025-01-01' },
    ];
    setTable('provider_quality_actions', { data: rows, error: null });

    const result = await getMyVisibleQualityActions();

    expect(result).toEqual(rows);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    setTable('provider_quality_actions', { data: null, error: { message: 'RLS denied' } });
    const result = await getMyVisibleQualityActions();
    expect(result).toEqual([]);
  });

  it('returns [] when data is null with no error', async () => {
    setTable('provider_quality_actions', { data: null, error: null });
    const result = await getMyVisibleQualityActions();
    expect(result).toEqual([]);
  });

  it('does NOT manually filter by provider_visible (RLS enforces it)', async () => {
    setTable('provider_quality_actions', { data: [], error: null });
    await getMyVisibleQualityActions();
    // eq should not be called with 'provider_visible'
    const eqCalls = (mockEq as jest.Mock).mock.calls;
    const hasProviderVisibleFilter = eqCalls.some(
      ([col]: [string]) => col === 'provider_visible',
    );
    expect(hasProviderVisibleFilter).toBe(false);
  });
});

// ── getMyConductAcceptance ─────────────────────────────────────────────────

describe('getMyConductAcceptance', () => {
  it('returns accepted:true with accepted_at when row exists', async () => {
    setTable('provider_conduct_acceptances', {
      data: { accepted_at: '2025-03-01T12:00:00Z' },
      error: null,
    });
    const result = await getMyConductAcceptance();
    expect(result).toEqual({ accepted: true, accepted_at: '2025-03-01T12:00:00Z' });
  });

  it('returns accepted:false when no row (null data, no error)', async () => {
    setTable('provider_conduct_acceptances', { data: null, error: null });
    const result = await getMyConductAcceptance();
    expect(result).toEqual({ accepted: false, accepted_at: null });
  });

  it('returns accepted:false on error', async () => {
    setTable('provider_conduct_acceptances', { data: null, error: { message: 'DB error' } });
    const result = await getMyConductAcceptance();
    expect(result).toEqual({ accepted: false, accepted_at: null });
  });

  it('filters by version = CONDUCT_VERSION by default', async () => {
    setTable('provider_conduct_acceptances', { data: null, error: null });
    await getMyConductAcceptance();
    const eqCalls = (mockEq as jest.Mock).mock.calls;
    const hasVersionFilter = eqCalls.some(
      ([col, val]: [string, string]) => col === 'version' && val === 'v1',
    );
    expect(hasVersionFilter).toBe(true);
  });

  it('accepts a custom version argument', async () => {
    setTable('provider_conduct_acceptances', { data: { accepted_at: '2025-04-01' }, error: null });
    const result = await getMyConductAcceptance('v2');
    const eqCalls = (mockEq as jest.Mock).mock.calls;
    const hasV2Filter = eqCalls.some(
      ([col, val]: [string, string]) => col === 'version' && val === 'v2',
    );
    expect(hasV2Filter).toBe(true);
    expect(result.accepted).toBe(true);
  });
});

// ── acceptConduct ──────────────────────────────────────────────────────────

describe('acceptConduct', () => {
  it('calls accept_provider_conduct rpc with correct p_version', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await acceptConduct();

    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('accept_provider_conduct', { p_version: 'v1' });
  });

  it('passes custom version to the rpc', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await acceptConduct('v2');

    expect(mockRpc).toHaveBeenCalledWith('accept_provider_conduct', { p_version: 'v2' });
  });

  it('returns {ok:false, error} on rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not allowed' } });

    const result = await acceptConduct();

    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

// ── getMyRecentCompletedJobs ───────────────────────────────────────────────

describe('getMyRecentCompletedJobs', () => {
  it('returns only completed jobs, newest first, capped at default limit 5', async () => {
    const jobs = [
      makeBooking({ id: 'b1', status: 'completed',  created_at: '2025-06-01' }),
      makeBooking({ id: 'b2', status: 'in_progress', created_at: '2025-05-01' }),
      makeBooking({ id: 'b3', status: 'completed',  created_at: '2025-04-01' }),
      makeBooking({ id: 'b4', status: 'completed',  created_at: '2025-03-01' }),
      makeBooking({ id: 'b5', status: 'completed',  created_at: '2025-02-01' }),
      makeBooking({ id: 'b6', status: 'completed',  created_at: '2025-01-01' }),
      makeBooking({ id: 'b7', status: 'completed',  created_at: '2024-12-01' }),
    ];
    mockGetProviderJobs.mockResolvedValue(jobs);

    const result = await getMyRecentCompletedJobs();

    // Only completed, capped at 5
    expect(result.every((j) => j.status === 'completed')).toBe(true);
    expect(result.length).toBe(5);
    // b1, b3, b4, b5, b6 are the first 5 completed jobs in order
    expect(result.map((j) => j.id)).toEqual(['b1', 'b3', 'b4', 'b5', 'b6']);
  });

  it('respects custom limit', async () => {
    const jobs = [
      makeBooking({ id: 'b1', status: 'completed' }),
      makeBooking({ id: 'b2', status: 'completed' }),
      makeBooking({ id: 'b3', status: 'completed' }),
    ];
    mockGetProviderJobs.mockResolvedValue(jobs);

    const result = await getMyRecentCompletedJobs(2);
    expect(result.length).toBe(2);
  });

  it('returns [] when no completed jobs exist', async () => {
    mockGetProviderJobs.mockResolvedValue([
      makeBooking({ status: 'pending' }),
      makeBooking({ status: 'in_progress' }),
    ]);
    const result = await getMyRecentCompletedJobs();
    expect(result).toEqual([]);
  });

  it('returns [] when getProviderJobs throws', async () => {
    mockGetProviderJobs.mockRejectedValue(new Error('Network error'));
    const result = await getMyRecentCompletedJobs();
    expect(result).toEqual([]);
  });
});

// ── getMyQualityDashboard ──────────────────────────────────────────────────

describe('getMyQualityDashboard', () => {
  function setupDefaults() {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-p1' } } });
    mockGetProviderProfile.mockResolvedValue(makeProfile());
    mockGetProviderRatingBreakdown.mockResolvedValue(makeBreakdown());
    mockGetProviderReviews.mockResolvedValue([
      { id: 'r1', rating: 5 },
      { id: 'r2', rating: 4 },
    ]);
    mockGetProviderJobs.mockResolvedValue([
      makeBooking({ id: 'bj1', status: 'completed' }),
    ]);
    setTable('provider_quality_actions', {
      data: [{ id: 'qa1', action_type: 'coaching_needed', provider_visible: true, created_by: 'admin1', created_at: '2025-01-01', note: null, provider_id: 'uid-p1' }],
      error: null,
    });
    setTable('provider_conduct_acceptances', {
      data: { accepted_at: '2025-02-01' },
      error: null,
    });
    mockCalculateProviderCompleteness.mockReturnValue({
      percent: 83,
      items: [],
      missing: ['Government verification'],
    });
    mockDeriveProviderAchievements.mockReturnValue([
      { key: 'first_job', label: 'First Job Done', icon: '🎉', earned: true },
    ]);
  }

  it('returns null when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const result = await getMyQualityDashboard();
    expect(result).toBeNull();
  });

  it('returns a QualityDashboard with expected shape when authenticated', async () => {
    setupDefaults();
    const result = await getMyQualityDashboard();
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('profile');
    expect(result).toHaveProperty('breakdown');
    expect(result).toHaveProperty('recentReviews');
    expect(result).toHaveProperty('recentCompletedJobs');
    expect(result).toHaveProperty('completeness');
    expect(result).toHaveProperty('achievements');
    expect(result).toHaveProperty('tags');
    expect(result).toHaveProperty('visibleActions');
    expect(result).toHaveProperty('conduct');
    expect(result).toHaveProperty('accountStatus');
  });

  it('accountStatus comes from profile.approval_status only', async () => {
    setupDefaults();
    mockGetProviderProfile.mockResolvedValue(makeProfile({ approval_status: 'pending' }));
    const result = await getMyQualityDashboard();
    expect(result?.accountStatus).toBe('pending');
  });

  it('accountStatus is null when profile is null', async () => {
    setupDefaults();
    mockGetProviderProfile.mockResolvedValue(null);
    const result = await getMyQualityDashboard();
    expect(result?.accountStatus).toBeNull();
  });

  it('passes correct uid to getProviderProfile and getProviderRatingBreakdown', async () => {
    setupDefaults();
    await getMyQualityDashboard();
    expect(mockGetProviderProfile).toHaveBeenCalledWith('uid-p1');
    expect(mockGetProviderRatingBreakdown).toHaveBeenCalledWith('uid-p1');
    expect(mockGetProviderReviews).toHaveBeenCalledWith('uid-p1');
  });

  it('recentReviews is capped at 5', async () => {
    setupDefaults();
    mockGetProviderReviews.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, rating: 5 })),
    );
    const result = await getMyQualityDashboard();
    expect(result?.recentReviews.length).toBe(5);
  });

  it('tags comes from partitionTags(breakdown.top_tags)', async () => {
    setupDefaults();
    mockGetProviderRatingBreakdown.mockResolvedValue(
      makeBreakdown({ top_tags: ['on_time', 'friendly', 'late'] }),
    );
    const result = await getMyQualityDashboard();
    expect(result?.tags.strengths).toContain('on_time');
    expect(result?.tags.strengths).toContain('friendly');
    expect(result?.tags.improvements).toContain('late');
  });

  it('conduct.accepted is true when acceptance row found', async () => {
    setupDefaults();
    const result = await getMyQualityDashboard();
    expect(result?.conduct.accepted).toBe(true);
  });

  it('conduct.accepted is false when no acceptance row', async () => {
    setupDefaults();
    setTable('provider_conduct_acceptances', { data: null, error: null });
    const result = await getMyQualityDashboard();
    expect(result?.conduct.accepted).toBe(false);
  });

  it('visibleActions contains rows from provider_quality_actions', async () => {
    setupDefaults();
    const result = await getMyQualityDashboard();
    expect(result?.visibleActions).toHaveLength(1);
    expect(result?.visibleActions[0].id).toBe('qa1');
  });

  it('returns null (does not throw) when a sub-read throws unexpectedly', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-p1' } } });
    mockGetProviderProfile.mockRejectedValue(new Error('Unexpected DB failure'));
    mockGetProviderRatingBreakdown.mockResolvedValue(makeBreakdown());
    mockGetProviderReviews.mockResolvedValue([]);
    mockGetProviderJobs.mockResolvedValue([]);
    setTable('provider_quality_actions', { data: [], error: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockCalculateProviderCompleteness.mockReturnValue({ percent: 0, items: [], missing: [] });
    mockDeriveProviderAchievements.mockReturnValue([]);

    const result = await getMyQualityDashboard();
    expect(result).toBeNull();
  });
});
