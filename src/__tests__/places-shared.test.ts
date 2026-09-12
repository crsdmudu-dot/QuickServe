/**
 * places-shared.test.ts — Jest tests for the pure Places API (New) helper functions.
 *
 * The module lives at supabase/functions/_shared/places.ts.
 * We import it via a relative path so Jest can resolve it without any
 * special module mapping (the file uses no Deno-only APIs).
 */
import {
  buildAutocompleteRequest,
  parseAutocomplete,
  buildDetailsRequest,
  parseDetails,
  staticMapUrl,
} from '../../supabase/functions/_shared/places';

// Static Maps host (unchanged — Maps Static API is not legacy).
const BASE = 'https://maps.googleapis.com/maps/api';

// ─── buildAutocompleteRequest (Places API New) ────────────────────────────────

describe('buildAutocompleteRequest (Places API New)', () => {
  const req = buildAutocompleteRequest('K', 'riverside dr');

  it('POSTs to the New autocomplete endpoint', () => {
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://places.googleapis.com/v1/places:autocomplete');
  });

  it('sends the key ONLY in the X-Goog-Api-Key header (never in the URL or body)', () => {
    expect(req.headers['X-Goog-Api-Key']).toBe('K');
    expect(req.url).not.toContain('K');
    expect(req.url.toLowerCase()).not.toContain('key=');
    expect(req.body ?? '').not.toContain('"K"');
  });

  it('sets Content-Type application/json', () => {
    expect(req.headers['Content-Type']).toBe('application/json');
  });

  it('body carries the input text', () => {
    expect(JSON.parse(req.body!).input).toBe('riverside dr');
  });

  it('restricts results to Kenya via includedRegionCodes:["ke"]', () => {
    expect(JSON.parse(req.body!).includedRegionCodes).toEqual(['ke']);
  });

  it('field mask requests only placeId + structuredFormat', () => {
    expect(req.headers['X-Goog-FieldMask']).toBe(
      'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat',
    );
  });

  it('omits sessionToken from the body when none is provided', () => {
    expect('sessionToken' in JSON.parse(req.body!)).toBe(false);
  });

  it('includes sessionToken in the body when provided', () => {
    const withTok = buildAutocompleteRequest('K', 'westlands', 'tok-123');
    expect(JSON.parse(withTok.body!).sessionToken).toBe('tok-123');
  });
});

// ─── parseAutocomplete (Places API New) ───────────────────────────────────────

describe('parseAutocomplete (Places API New)', () => {
  it('parses suggestions[].placePrediction into suggestions', () => {
    const json = {
      suggestions: [
        {
          placePrediction: {
            placeId: 'p1',
            structuredFormat: {
              mainText: { text: 'Riverside Dr' },
              secondaryText: { text: 'Nairobi' },
            },
          },
        },
      ],
    };
    expect(parseAutocomplete(json)).toEqual([
      { placeId: 'p1', primaryText: 'Riverside Dr', secondaryText: 'Nairobi' },
    ]);
  });

  it('returns [] for an empty object {}', () => {
    expect(parseAutocomplete({})).toEqual([]);
  });

  it('returns [] for null', () => {
    expect(parseAutocomplete(null)).toEqual([]);
  });

  it('skips entries missing placeId', () => {
    expect(parseAutocomplete({ suggestions: [{ placePrediction: {} }] })).toEqual([]);
  });

  it('skips non-place rows (e.g. queryPrediction with no placePrediction)', () => {
    const json = { suggestions: [{ queryPrediction: { text: { text: 'nairobi' } } }] };
    expect(parseAutocomplete(json)).toEqual([]);
  });

  it('defaults secondaryText to "" when missing', () => {
    const json = {
      suggestions: [
        {
          placePrediction: {
            placeId: 'p2',
            structuredFormat: { mainText: { text: 'Westlands' } }, // no secondaryText
          },
        },
      ],
    };
    const result = parseAutocomplete(json);
    expect(result).toHaveLength(1);
    expect(result[0].secondaryText).toBe('');
  });

  it('returns [] when suggestions is not an array', () => {
    expect(parseAutocomplete({ suggestions: 'bad' })).toEqual([]);
  });
});

// ─── buildDetailsRequest (Places API New) ─────────────────────────────────────

describe('buildDetailsRequest (Places API New)', () => {
  const req = buildDetailsRequest('K', 'p1');

  it('GETs the New place-details endpoint with the placeId in the path', () => {
    expect(req.method).toBe('GET');
    expect(req.url).toBe('https://places.googleapis.com/v1/places/p1');
  });

  it('sends the key ONLY in the X-Goog-Api-Key header (never in the URL)', () => {
    expect(req.headers['X-Goog-Api-Key']).toBe('K');
    expect(req.url).not.toContain('K');
    expect(req.url.toLowerCase()).not.toContain('key=');
  });

  it('pins the field mask to exactly formattedAddress,location (Essentials SKU)', () => {
    expect(req.headers['X-Goog-FieldMask']).toBe('formattedAddress,location');
  });

  it('has no request body (GET)', () => {
    expect(req.body).toBeUndefined();
  });

  it('appends the sessionToken as a query param when provided', () => {
    const withTok = buildDetailsRequest('K', 'p1', 'tok-123');
    expect(withTok.url).toBe(
      'https://places.googleapis.com/v1/places/p1?sessionToken=tok-123',
    );
  });

  it('omits the sessionToken query param when not provided', () => {
    expect(req.url).not.toContain('sessionToken');
  });
});

// ─── parseDetails (Places API New) ────────────────────────────────────────────

describe('parseDetails (Places API New)', () => {
  it('parses formattedAddress + location.latitude/longitude', () => {
    const json = {
      formattedAddress: '123 Riverside Dr, Nairobi',
      location: { latitude: -1.29, longitude: 36.81 },
    };
    expect(parseDetails(json)).toEqual({
      formattedAddress: '123 Riverside Dr, Nairobi',
      latitude: -1.29,
      longitude: 36.81,
    });
  });

  it('returns null for an empty object {}', () => {
    expect(parseDetails({})).toBeNull();
  });

  it('returns null for null', () => {
    expect(parseDetails(null)).toBeNull();
  });

  it('returns null when location is missing', () => {
    expect(parseDetails({ formattedAddress: '123 Riverside Dr, Nairobi' })).toBeNull();
  });

  it('returns null when latitude is missing', () => {
    const json = { formattedAddress: 'x', location: { longitude: 36.81 } };
    expect(parseDetails(json)).toBeNull();
  });

  it('returns null when longitude is missing', () => {
    const json = { formattedAddress: 'x', location: { latitude: -1.29 } };
    expect(parseDetails(json)).toBeNull();
  });

  it('returns null when formattedAddress is missing', () => {
    const json = { location: { latitude: -1.29, longitude: 36.81 } };
    expect(parseDetails(json)).toBeNull();
  });
});

// ─── staticMapUrl (UNCHANGED across the migration) ────────────────────────────

describe('staticMapUrl', () => {
  const url = staticMapUrl({ baseUrl: BASE, key: 'K', lat: -1.29, lng: 36.81 });

  it('url contains /staticmap', () => {
    expect(url).toContain('/staticmap');
  });

  it('url contains center=-1.29,36.81', () => {
    expect(url).toContain('center=-1.29,36.81');
  });

  it('url contains zoom=16 (default)', () => {
    expect(url).toContain('zoom=16');
  });

  it('url contains size=600x300 (default)', () => {
    expect(url).toContain('size=600x300');
  });

  it('url contains markers=-1.29,36.81', () => {
    expect(url).toContain('markers=-1.29,36.81');
  });

  it('url contains key=K', () => {
    expect(url).toContain('key=K');
  });

  it('respects a custom zoom and size', () => {
    const custom = staticMapUrl({
      baseUrl: BASE,
      key: 'K',
      lat: -1.29,
      lng: 36.81,
      zoom: 14,
      size: '400x200',
    });
    expect(custom).toContain('zoom=14');
    expect(custom).toContain('size=400x200');
  });

  // ─── Multi-marker mode ─────────────────────────────────────────────────────

  describe('multi-marker mode', () => {
    const multiUrl = staticMapUrl({
      baseUrl: BASE,
      key: 'K',
      markers: [
        { lat: -1.29, lng: 36.81, label: 'P', color: 'blue' },
        { lat: -1.30, lng: 36.82, label: 'C', color: 'red' },
      ],
    });

    it('url contains /staticmap', () => {
      expect(multiUrl).toContain('/staticmap');
    });

    it('url contains size=600x300 (default)', () => {
      expect(multiUrl).toContain('size=600x300');
    });

    it('url contains key=K', () => {
      expect(multiUrl).toContain('key=K');
    });

    it('url contains first marker with color:blue and label:P', () => {
      expect(multiUrl).toContain('color:blue');
      expect(multiUrl).toContain('label:P');
    });

    it('url contains second marker with color:red and label:C', () => {
      expect(multiUrl).toContain('color:red');
      expect(multiUrl).toContain('label:C');
    });

    it('url contains two separate markers= groups', () => {
      const markerCount = (multiUrl.match(/[&?]markers=/g) ?? []).length;
      expect(markerCount).toBe(2);
    });

    it('does NOT contain center= (auto-fit mode)', () => {
      expect(multiUrl).not.toContain('center=');
    });

    it('does NOT contain zoom= (auto-fit mode)', () => {
      expect(multiUrl).not.toContain('zoom=');
    });

    it('marker without label/color emits only lat,lng', () => {
      const simple = staticMapUrl({
        baseUrl: BASE,
        key: 'K',
        markers: [{ lat: -1.29, lng: 36.81 }],
      });
      // Should not contain color: or label: prefixes.
      expect(simple).not.toContain('color:');
      expect(simple).not.toContain('label:');
      expect(simple).toContain('markers=-1.29,36.81');
    });
  });

  // ─── Path mode ─────────────────────────────────────────────────────────────

  describe('path mode', () => {
    const pathUrl = staticMapUrl({
      baseUrl: BASE,
      key: 'K',
      markers: [
        { lat: -1.29, lng: 36.81, label: 'P', color: 'blue' },
        { lat: -1.30, lng: 36.82, label: 'C', color: 'red' },
      ],
      path: [
        { lat: -1.29, lng: 36.81 },
        { lat: -1.295, lng: 36.815 },
        { lat: -1.30, lng: 36.82 },
      ],
    });

    it('url contains a path= param', () => {
      expect(pathUrl).toContain('path=');
    });

    it('path param joins points with |', () => {
      expect(pathUrl).toContain('-1.29,36.81|-1.295,36.815|-1.3,36.82');
    });
  });

  // ─── Single-point still works (regression) ─────────────────────────────────

  it('single-point call still produces center + zoom + single marker (regression)', () => {
    const singleUrl = staticMapUrl({ baseUrl: BASE, key: 'K', lat: -1.29, lng: 36.81 });
    expect(singleUrl).toContain('center=-1.29,36.81');
    expect(singleUrl).toContain('zoom=16');
    expect(singleUrl).toContain('markers=-1.29,36.81');
  });
});
