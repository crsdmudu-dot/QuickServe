// provider-quality-admin.test.ts — Tests for src/lib/provider-quality-admin.ts
//
// Mocks: @/lib/supabase, @/lib/providers, @/lib/reviews, @/lib/operations,
//        @/lib/provider-completeness

// ── Mock fns (must have "mock" prefix for jest.mock factory rule) ──────────

const mockRpc         = jest.fn();
const mockSelect      = jest.fn();
const mockEq          = jest.fn();
const mockOrder       = jest.fn();
const mockMaybeSingle = jest.fn();

// Per-table response registry
const mockTableResults: Record<string, unknown> = {};

// ── Mock: @/lib/supabase ──────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => ({
  supabase: {
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
          eq:     (...a: unknown[]) => { mockEq(...a);     return node(); },
          order:  (...a: unknown[]) => { mockOrder(...a);  return node(); },
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

// ── Mock: @/lib/operations ────────────────────────────────────────────────

const mockGetAccountFlags = jest.fn();
jest.mock('@/lib/operations', () => ({
  getAccountFlags: (...a: unknown[]) => mockGetAccountFlags(...a),
}));

// ── Mock: @/lib/provider-completeness ─────────────────────────────────────

const mockCalculateProviderCompleteness = jest.fn();
jest.mock('@/lib/provider-completeness', () => ({
  calculateProviderCompleteness: (...a: unknown[]) => mockCalculateProviderCompleteness(...a),
}));

import {
  recordProviderQualityAction,
  getProviderQualityActions,
  getProviderConductAcceptance,
  getProviderFlagsSummary,
  getProviderQualitySummary,
} from '@/lib/provider-quality-admin';

// ── Helpers ────────────────────────────────────────────────────────────────

function setTable(table: string, value: unknown) {
  mockTableResults[table] = value;
}

function makeProfile(overrides = {}) {
  return {
    id: 'p1',
    full_name: 'Test Provider',
    phone: '+254700000001',
    approval_status: 'approved',
    profile_photo_url: null,
    bio: null,
    years_experience: null,
    skills: null,
    is_verified: false,
    completed_jobs_count: 0,
    average_rating: null,
    review_count: 0,
    availability_status: 'available',
    ...overrides,
  };
}

function makeBreakdown(overrides = {}) {
  return {
    overall_avg: null,
    review_count: 0,
    recommend_pct: null,
    quality_avg: null,
    punctuality_avg: null,
    communication_avg: null,
    professionalism_avg: null,
    value_avg: null,
    top_tags: [],
    ...overrides,
  };
}

function makeFlag(overrides = {}) {
  return {
    id: 'f1',
    created_at: '2025-01-01',
    subject_id: 'p1',
    subject_role: 'provider',
    kind: 'flag',
    reason: 'Late arrival',
    active: true,
    created_by: 'admin1',
    lifted_by: null,
    lifted_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockTableResults)) delete mockTableResults[k];
});

// ── recordProviderQualityAction ───────────────────────────────────────────

describe('recordProviderQualityAction', () => {
  it('calls the record_provider_quality_action RPC with correct p_ params', async () => {
    mockRpc.mockResolvedValue({ data: 'new-action-id', error: null });

    const result = await recordProviderQualityAction({
      providerId:      'p-abc',
      actionType:      'coaching_needed',
      note:            'Needs punctuality coaching',
      providerVisible: true,
    });

    expect(result).toEqual({ ok: true, id: 'new-action-id' });
    expect(mockRpc).toHaveBeenCalledWith('record_provider_quality_action', {
      p_provider_id:      'p-abc',
      p_action_type:      'coaching_needed',
      p_note:             'Needs punctuality coaching',
      p_provider_visible: true,
    });
  });

  it('sends p_note: null when note is omitted', async () => {
    mockRpc.mockResolvedValue({ data: 'id-2', error: null });

    await recordProviderQualityAction({
      providerId:      'p-abc',
      actionType:      'no_action',
      providerVisible: false,
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'record_provider_quality_action',
      expect.objectContaining({ p_note: null }),
    );
  });

  it('sends p_provider_visible: false correctly', async () => {
    mockRpc.mockResolvedValue({ data: 'id-3', error: null });

    const result = await recordProviderQualityAction({
      providerId:      'p-abc',
      actionType:      'warning_given',
      providerVisible: false,
    });

    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith(
      'record_provider_quality_action',
      expect.objectContaining({ p_provider_visible: false }),
    );
  });

  it('returns {ok:false, error} on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Unauthorized' } });

    const result = await recordProviderQualityAction({
      providerId:      'p-abc',
      actionType:      'coaching_needed',
      providerVisible: true,
    });

    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

// ── getProviderQualityActions ─────────────────────────────────────────────

describe('getProviderQualityActions', () => {
  it('selects all rows for a provider ordered by created_at desc', async () => {
    const rows = [
      { id: 'qa1', provider_id: 'p1', action_type: 'warning_given',   note: null,   provider_visible: false, created_by: 'admin1', created_at: '2025-03-01' },
      { id: 'qa2', provider_id: 'p1', action_type: 'coaching_needed', note: 'text', provider_visible: true,  created_by: 'admin1', created_at: '2025-01-01' },
    ];
    setTable('provider_quality_actions', { data: rows, error: null });

    const result = await getProviderQualityActions('p1');

    expect(result).toEqual(rows);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('provider_id', 'p1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    setTable('provider_quality_actions', { data: null, error: { message: 'DB error' } });
    const result = await getProviderQualityActions('p1');
    expect(result).toEqual([]);
  });

  it('returns [] when data is null with no error', async () => {
    setTable('provider_quality_actions', { data: null, error: null });
    const result = await getProviderQualityActions('p1');
    expect(result).toEqual([]);
  });
});

// ── getProviderConductAcceptance ──────────────────────────────────────────

describe('getProviderConductAcceptance', () => {
  it('returns accepted:true with accepted_at when row exists', async () => {
    setTable('provider_conduct_acceptances', {
      data: { accepted_at: '2025-03-15T09:00:00Z' },
      error: null,
    });
    const result = await getProviderConductAcceptance('p1');
    expect(result).toEqual({ accepted: true, accepted_at: '2025-03-15T09:00:00Z' });
  });

  it('returns accepted:false when no row exists', async () => {
    setTable('provider_conduct_acceptances', { data: null, error: null });
    const result = await getProviderConductAcceptance('p1');
    expect(result).toEqual({ accepted: false, accepted_at: null });
  });

  it('returns accepted:false on error', async () => {
    setTable('provider_conduct_acceptances', { data: null, error: { message: 'DB error' } });
    const result = await getProviderConductAcceptance('p1');
    expect(result).toEqual({ accepted: false, accepted_at: null });
  });

  it('filters by provider_id and version', async () => {
    setTable('provider_conduct_acceptances', { data: null, error: null });
    await getProviderConductAcceptance('p-xyz', 'v1');
    const eqCalls = (mockEq as jest.Mock).mock.calls;
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        ['provider_id', 'p-xyz'],
        ['version',     'v1'],
      ]),
    );
  });
});

// ── getProviderFlagsSummary ────────────────────────────────────────────────

describe('getProviderFlagsSummary', () => {
  it('returns correct total, active, and byKind from flags', async () => {
    mockGetAccountFlags.mockResolvedValue([
      makeFlag({ kind: 'flag',       active: true  }),
      makeFlag({ kind: 'flag',       active: false }),
      makeFlag({ kind: 'suspension', active: true  }),
    ]);

    const result = await getProviderFlagsSummary('p1');
    expect(result.total).toBe(3);
    expect(result.active).toBe(2);
    expect(result.byKind).toEqual({ flag: 2, suspension: 1 });
  });

  it('calls getAccountFlags with the correct providerId', async () => {
    mockGetAccountFlags.mockResolvedValue([]);
    await getProviderFlagsSummary('p-test');
    expect(mockGetAccountFlags).toHaveBeenCalledWith('p-test');
  });

  it('returns {total:0, active:0, byKind:{}} when there are no flags', async () => {
    mockGetAccountFlags.mockResolvedValue([]);
    const result = await getProviderFlagsSummary('p1');
    expect(result).toEqual({ total: 0, active: 0, byKind: {} });
  });

  it('returns {total:0, active:0, byKind:{}} when getAccountFlags throws', async () => {
    mockGetAccountFlags.mockRejectedValue(new Error('Network error'));
    const result = await getProviderFlagsSummary('p1');
    expect(result).toEqual({ total: 0, active: 0, byKind: {} });
  });

  it('does not call any write/mutation RPC (read-only)', async () => {
    mockGetAccountFlags.mockResolvedValue([makeFlag()]);
    await getProviderFlagsSummary('p1');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

// ── getProviderQualitySummary ──────────────────────────────────────────────

describe('getProviderQualitySummary', () => {
  function setupDefaults() {
    mockGetProviderProfile.mockResolvedValue(makeProfile());
    mockGetProviderRatingBreakdown.mockResolvedValue(makeBreakdown());
    mockGetProviderReviews.mockResolvedValue([
      { id: 'r1', rating: 5 },
      { id: 'r2', rating: 4 },
    ]);
    mockGetAccountFlags.mockResolvedValue([
      makeFlag({ kind: 'flag', active: true }),
    ]);
    setTable('provider_quality_actions', {
      data: [{ id: 'qa1', provider_id: 'p1', action_type: 'no_action', note: null, provider_visible: false, created_by: 'admin1', created_at: '2025-01-01' }],
      error: null,
    });
    setTable('provider_conduct_acceptances', { data: { accepted_at: '2025-02-01' }, error: null });
    mockCalculateProviderCompleteness.mockReturnValue({
      percent: 50,
      items: [],
      missing: ['Bio'],
    });
  }

  it('returns AdminQualitySummary with expected shape', async () => {
    setupDefaults();
    const result = await getProviderQualitySummary('p1');
    expect(result).toHaveProperty('profile');
    expect(result).toHaveProperty('breakdown');
    expect(result).toHaveProperty('recentReviews');
    expect(result).toHaveProperty('completeness');
    expect(result).toHaveProperty('qualityActions');
    expect(result).toHaveProperty('conduct');
    expect(result).toHaveProperty('flagsSummary');
  });

  it('passes providerId to getProviderProfile, getProviderRatingBreakdown, getProviderReviews', async () => {
    setupDefaults();
    await getProviderQualitySummary('p-xyz');
    expect(mockGetProviderProfile).toHaveBeenCalledWith('p-xyz');
    expect(mockGetProviderRatingBreakdown).toHaveBeenCalledWith('p-xyz');
    expect(mockGetProviderReviews).toHaveBeenCalledWith('p-xyz');
  });

  it('flagsSummary reflects getAccountFlags output', async () => {
    setupDefaults();
    mockGetAccountFlags.mockResolvedValue([
      makeFlag({ kind: 'flag', active: true  }),
      makeFlag({ kind: 'flag', active: false }),
    ]);
    const result = await getProviderQualitySummary('p1');
    expect(result.flagsSummary.total).toBe(2);
    expect(result.flagsSummary.active).toBe(1);
    expect(result.flagsSummary.byKind).toEqual({ flag: 2 });
  });

  it('qualityActions includes rows regardless of provider_visible (admin sees all)', async () => {
    setupDefaults();
    setTable('provider_quality_actions', {
      data: [
        { id: 'qa1', provider_id: 'p1', action_type: 'warning_given',   note: null, provider_visible: false, created_by: 'admin1', created_at: '2025-03-01' },
        { id: 'qa2', provider_id: 'p1', action_type: 'coaching_needed', note: null, provider_visible: true,  created_by: 'admin1', created_at: '2025-01-01' },
      ],
      error: null,
    });
    const result = await getProviderQualitySummary('p1');
    expect(result.qualityActions).toHaveLength(2);
    expect(result.qualityActions.some((a) => a.provider_visible === false)).toBe(true);
  });

  it('conduct.accepted is true when acceptance row found', async () => {
    setupDefaults();
    const result = await getProviderQualitySummary('p1');
    expect(result.conduct.accepted).toBe(true);
  });

  it('completeness comes from calculateProviderCompleteness', async () => {
    setupDefaults();
    mockCalculateProviderCompleteness.mockReturnValue({
      percent: 67,
      items: [],
      missing: ['Bio', 'Photo'],
    });
    const result = await getProviderQualitySummary('p1');
    expect(result.completeness.percent).toBe(67);
  });

  it('recentReviews is capped at 10', async () => {
    setupDefaults();
    mockGetProviderReviews.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, rating: 5 })),
    );
    const result = await getProviderQualitySummary('p1');
    expect(result.recentReviews.length).toBe(10);
  });
});
