import { searchPlaces, getPlaceDetails } from '@/lib/places';
import type { PlaceSuggestion, PlaceDetailsWithMap } from '@/lib/places';

// ── Mock Supabase ──────────────────────────────────────────────────────────────

const invoke = jest.fn();

// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
const mockInvoke = invoke;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── searchPlaces ───────────────────────────────────────────────────────────────

describe('searchPlaces', () => {
  it('returns [] and does NOT call functions.invoke for an empty query', async () => {
    const result = await searchPlaces('');
    expect(result).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('returns [] and does NOT call functions.invoke for a whitespace-only query', async () => {
    const result = await searchPlaces('   ');
    expect(result).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('calls places-autocomplete with the trimmed query and returns suggestions on success', async () => {
    const suggestions: PlaceSuggestion[] = [
      { placeId: 'p1', primaryText: 'Riverside Dr', secondaryText: 'Nairobi' },
    ];
    invoke.mockResolvedValue({ data: { suggestions }, error: null });

    const result = await searchPlaces('  Riverside  ');
    expect(result).toEqual(suggestions);
    expect(mockInvoke).toHaveBeenCalledWith('places-autocomplete', {
      body: { query: 'Riverside' },
    });
  });

  it('returns [] when the Edge Function returns an error', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'not configured' } });
    const result = await searchPlaces('Karen');
    expect(result).toEqual([]);
  });

  it('returns [] when data.suggestions is missing', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    const result = await searchPlaces('Karen');
    expect(result).toEqual([]);
  });
});

// ── getPlaceDetails ────────────────────────────────────────────────────────────

describe('getPlaceDetails', () => {
  it('returns null and does NOT call functions.invoke for an empty placeId', async () => {
    const result = await getPlaceDetails('');
    expect(result).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('calls place-details with the placeId and returns details on success', async () => {
    const details: PlaceDetailsWithMap = {
      formattedAddress: '123 Riverside Dr, Nairobi',
      latitude: -1.29,
      longitude: 36.81,
      mapUrl: 'https://maps.example.com/staticmap?center=-1.29,36.81',
    };
    invoke.mockResolvedValue({ data: { details }, error: null });

    const result = await getPlaceDetails('place-abc');
    expect(result).toEqual(details);
    expect(mockInvoke).toHaveBeenCalledWith('place-details', {
      body: { placeId: 'place-abc' },
    });
  });

  it('returns null when the Edge Function returns an error', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'not found' } });
    const result = await getPlaceDetails('place-abc');
    expect(result).toBeNull();
  });

  it('returns null when data.details is missing', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    const result = await getPlaceDetails('place-abc');
    expect(result).toBeNull();
  });
});
