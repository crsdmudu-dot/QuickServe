/**
 * places-shared.test.ts — Jest tests for the pure Google Places helper functions.
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

const BASE = 'https://maps.googleapis.com/maps/api';

// ─── buildAutocompleteRequest ─────────────────────────────────────────────────

describe('buildAutocompleteRequest', () => {
  const { url } = buildAutocompleteRequest(BASE, 'K', 'riverside dr');

  it('url contains /place/autocomplete/json', () => {
    expect(url).toContain('/place/autocomplete/json');
  });

  it('url contains encoded query input=riverside%20dr', () => {
    expect(url).toContain('input=riverside%20dr');
  });

  it('url contains key=K', () => {
    expect(url).toContain('key=K');
  });

  it('url contains components=country:ke', () => {
    expect(url).toContain('components=country:ke');
  });
});

// ─── parseAutocomplete ────────────────────────────────────────────────────────

describe('parseAutocomplete', () => {
  it('parses a valid predictions array into suggestions', () => {
    const json = {
      predictions: [
        {
          place_id: 'p1',
          structured_formatting: {
            main_text: 'Riverside Dr',
            secondary_text: 'Nairobi',
          },
        },
      ],
    };
    const result = parseAutocomplete(json);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      placeId: 'p1',
      primaryText: 'Riverside Dr',
      secondaryText: 'Nairobi',
    });
  });

  it('returns [] for an empty object {}', () => {
    expect(parseAutocomplete({})).toEqual([]);
  });

  it('returns [] for null', () => {
    expect(parseAutocomplete(null)).toEqual([]);
  });

  it('skips entries missing place_id (returns [])', () => {
    const json = {
      predictions: [{}],
    };
    expect(parseAutocomplete(json)).toEqual([]);
  });

  it('defaults secondaryText to empty string when missing', () => {
    const json = {
      predictions: [
        {
          place_id: 'p2',
          structured_formatting: {
            main_text: 'Westlands',
            // no secondary_text
          },
        },
      ],
    };
    const result = parseAutocomplete(json);
    expect(result).toHaveLength(1);
    expect(result[0].secondaryText).toBe('');
  });

  it('returns [] when predictions is not an array', () => {
    expect(parseAutocomplete({ predictions: 'bad' })).toEqual([]);
  });
});

// ─── buildDetailsRequest ──────────────────────────────────────────────────────

describe('buildDetailsRequest', () => {
  const { url } = buildDetailsRequest(BASE, 'K', 'p1');

  it('url contains /place/details/json', () => {
    expect(url).toContain('/place/details/json');
  });

  it('url contains place_id=p1', () => {
    expect(url).toContain('place_id=p1');
  });

  it('url contains key=K', () => {
    expect(url).toContain('key=K');
  });

  it('url contains fields=formatted_address,geometry', () => {
    expect(url).toContain('fields=formatted_address,geometry');
  });
});

// ─── parseDetails ─────────────────────────────────────────────────────────────

describe('parseDetails', () => {
  it('parses a valid place details response', () => {
    const json = {
      result: {
        formatted_address: '123 Riverside Dr, Nairobi',
        geometry: {
          location: {
            lat: -1.29,
            lng: 36.81,
          },
        },
      },
    };
    const result = parseDetails(json);
    expect(result).toEqual({
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

  it('returns null when geometry is missing', () => {
    const json = {
      result: {
        formatted_address: '123 Riverside Dr, Nairobi',
        // no geometry
      },
    };
    expect(parseDetails(json)).toBeNull();
  });

  it('returns null when geometry.location is missing', () => {
    const json = {
      result: {
        formatted_address: '123 Riverside Dr, Nairobi',
        geometry: {},
      },
    };
    expect(parseDetails(json)).toBeNull();
  });

  it('returns null when lat is missing', () => {
    const json = {
      result: {
        formatted_address: '123 Riverside Dr, Nairobi',
        geometry: { location: { lng: 36.81 } },
      },
    };
    expect(parseDetails(json)).toBeNull();
  });

  it('returns null when formatted_address is missing', () => {
    const json = {
      result: {
        geometry: { location: { lat: -1.29, lng: 36.81 } },
      },
    };
    expect(parseDetails(json)).toBeNull();
  });
});

// ─── staticMapUrl ─────────────────────────────────────────────────────────────

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
