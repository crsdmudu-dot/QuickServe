import {
  upsertProviderLocation,
  clearProviderLocation,
  getProviderLocationForBooking,
  subscribeToProviderLocation,
  getTrackingMapUrl,
  type ProviderLocation,
} from '@/lib/tracking';

// ── Mock Supabase ──────────────────────────────────────────────────────────
//
// Extends the existing factory shape used by attempts/messages tests with
// channel / on / subscribe / removeChannel for Realtime support.

const rpc = jest.fn();
const select = jest.fn();
const eq = jest.fn();
const maybeSingle = jest.fn();
const invoke = jest.fn();
const removeChannel = jest.fn();
const subscribe = jest.fn();

// Jest factory rule: variables referenced inside jest.mock() must be prefixed "mock".
const mockRpc = rpc;
const mockSelect = select;
const mockEq = eq;
const mockMaybeSingle = maybeSingle;
const mockInvoke = invoke;
const mockRemoveChannel = removeChannel;
const mockSubscribe = subscribe;

// We capture the postgres_changes callback passed to .on() so tests can invoke it directly.
let capturedOnCallback: ((payload: { new: ProviderLocation }) => void) | null = null;
let capturedChannelObject: object | null = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    // ── RPC ──────────────────────────────────────────────────────────────
    rpc: (...a: unknown[]) => mockRpc(...a),

    // ── Table queries ─────────────────────────────────────────────────────
    from: () => ({
      select: (...a: unknown[]) => {
        mockSelect(...a);
        return {
          eq: (...b: unknown[]) => {
            mockEq(...b);
            return {
              maybeSingle: (...c: unknown[]) => mockMaybeSingle(...c),
              order: jest.fn(),
            };
          },
          order: jest.fn(),
        };
      },
    }),

    // ── Edge Functions ────────────────────────────────────────────────────
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },

    // ── Realtime channel ─────────────────────────────────────────────────
    // channel() returns an object whose .on() captures the callback,
    // then .subscribe() returns the same object (the channel reference).
    channel: (name: string) => {
      const channelObj = {
        on: (
          _event: string,
          _filter: object,
          cb: (payload: { new: ProviderLocation }) => void,
        ) => {
          capturedOnCallback = cb;
          return channelObj; // fluent chain
        },
        subscribe: (..._a: unknown[]) => {
          mockSubscribe(..._a);
          capturedChannelObject = channelObj;
          return channelObj; // subscribe() returns the channel
        },
      };
      return channelObj;
    },

    removeChannel: (...a: unknown[]) => mockRemoveChannel(...a),
  },
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const mockLoc: ProviderLocation = {
  booking_id: 'bk1',
  provider_id: 'prov1',
  latitude: -1.286389,
  longitude: 36.817223,
  heading: 90,
  speed: 12.5,
  updated_at: '2026-07-03T10:00:00Z',
};

// ── Helpers ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  capturedOnCallback = null;
  capturedChannelObject = null;
});

// ── upsertProviderLocation ─────────────────────────────────────────────────

describe('upsertProviderLocation', () => {
  it('returns { ok:true } and calls upsert_provider_location RPC with correct args', async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await upsertProviderLocation('bk1', {
      latitude: -1.286389,
      longitude: 36.817223,
      heading: 90,
      speed: 12.5,
    });
    expect(res).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('upsert_provider_location', {
      p_booking_id: 'bk1',
      p_lat: -1.286389,
      p_lng: 36.817223,
      p_heading: 90,
      p_speed: 12.5,
    });
  });

  it('defaults heading and speed to null when omitted', async () => {
    rpc.mockResolvedValue({ error: null });
    await upsertProviderLocation('bk1', { latitude: -1.286389, longitude: 36.817223 });
    expect(mockRpc).toHaveBeenCalledWith('upsert_provider_location', {
      p_booking_id: 'bk1',
      p_lat: -1.286389,
      p_lng: 36.817223,
      p_heading: null,
      p_speed: null,
    });
  });

  it('returns { ok:false, error } when RPC fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'not allowed' } });
    const res = await upsertProviderLocation('bk1', { latitude: 0, longitude: 0 });
    expect(res).toEqual({ ok: false, error: 'Could not update location.' });
  });
});

// ── clearProviderLocation ──────────────────────────────────────────────────

describe('clearProviderLocation', () => {
  it('returns { ok:true } and calls clear_provider_location RPC', async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await clearProviderLocation('bk1');
    expect(res).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('clear_provider_location', { p_booking_id: 'bk1' });
  });

  it('returns { ok:false, error } when RPC fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'boom' } });
    const res = await clearProviderLocation('bk1');
    expect(res).toEqual({ ok: false, error: 'Could not clear location.' });
  });
});

// ── getProviderLocationForBooking ──────────────────────────────────────────

describe('getProviderLocationForBooking', () => {
  it('returns the location row and calls .eq with booking_id', async () => {
    maybeSingle.mockResolvedValue({ data: mockLoc, error: null });
    const res = await getProviderLocationForBooking('bk1');
    expect(res).toEqual(mockLoc);
    expect(mockEq).toHaveBeenCalledWith('booking_id', 'bk1');
    expect(mockSelect).toHaveBeenCalledWith('*');
  });

  it('returns null when there is no row (data: null, error: null)', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await getProviderLocationForBooking('bk1');
    expect(res).toBeNull();
  });

  it('returns null on DB error', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const res = await getProviderLocationForBooking('bk1');
    expect(res).toBeNull();
  });
});

// ── subscribeToProviderLocation ────────────────────────────────────────────

describe('subscribeToProviderLocation', () => {
  it('calls channel(...).on("postgres_changes", filter, cb).subscribe()', () => {
    const onUpdate = jest.fn();
    subscribeToProviderLocation('bk1', onUpdate);

    // subscribe() must have been invoked
    expect(mockSubscribe).toHaveBeenCalled();
    // The callback must have been captured via .on()
    expect(capturedOnCallback).not.toBeNull();
  });

  it('fires onUpdate with the new location when the realtime callback is invoked', () => {
    const onUpdate = jest.fn();
    subscribeToProviderLocation('bk1', onUpdate);

    // Simulate Supabase firing a postgres_changes event
    expect(capturedOnCallback).not.toBeNull();
    capturedOnCallback!({ new: mockLoc });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(mockLoc);
  });

  it('does NOT fire onUpdate when payload.new is falsy', () => {
    const onUpdate = jest.fn();
    subscribeToProviderLocation('bk1', onUpdate);

    // Simulate a DELETE event where payload.new is null/undefined
    capturedOnCallback!({ new: null as unknown as ProviderLocation });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('returns an unsubscribe fn that calls supabase.removeChannel with the channel', () => {
    const onUpdate = jest.fn();
    const unsubscribe = subscribeToProviderLocation('bk1', onUpdate);

    // channel object was captured during subscribe()
    expect(capturedChannelObject).not.toBeNull();

    unsubscribe();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
    expect(mockRemoveChannel).toHaveBeenCalledWith(capturedChannelObject);
  });
});

// ── getTrackingMapUrl ──────────────────────────────────────────────────────

describe('getTrackingMapUrl', () => {
  const provider = { latitude: -1.286389, longitude: 36.817223 };
  const customer = { latitude: -1.292066, longitude: 36.821945 };

  it('returns mapUrl and calls invoke("tracking-map") with the 4 coords', async () => {
    invoke.mockResolvedValue({ data: { mapUrl: 'https://maps.example.com/static?key=xxx' }, error: null });
    const res = await getTrackingMapUrl(provider, customer);
    expect(res).toBe('https://maps.example.com/static?key=xxx');
    expect(mockInvoke).toHaveBeenCalledWith('tracking-map', {
      body: {
        providerLat: -1.286389,
        providerLng: 36.817223,
        customerLat: -1.292066,
        customerLng: 36.821945,
      },
    });
  });

  it('returns null when invoke returns an error', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'function not deployed' } });
    const res = await getTrackingMapUrl(provider, customer);
    expect(res).toBeNull();
  });

  it('returns null when data.mapUrl is null', async () => {
    invoke.mockResolvedValue({ data: { mapUrl: null }, error: null });
    const res = await getTrackingMapUrl(provider, customer);
    expect(res).toBeNull();
  });

  it('returns null when data itself is null', async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    const res = await getTrackingMapUrl(provider, customer);
    expect(res).toBeNull();
  });
});
