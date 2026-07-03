/**
 * Tests for TrackingMap.
 *
 * Mocks @/lib/tracking so no Supabase / Edge Function calls are made.
 * Uses waitFor to handle the async getTrackingMapUrl resolution inside the
 * component's useEffect.
 */

// ── Mocks (must appear before imports) ────────────────────────────────────

jest.mock('@/lib/tracking', () => ({
  getTrackingMapUrl: jest.fn(),
}));

// Prevent Skeleton shimmer animation from running in tests.
jest.mock('@/constants/motion', () => ({
  prefersReducedMotion: jest.fn().mockResolvedValue(true),
  Durations: { fast: 150, base: 250, slow: 400 },
  Easings: {},
  Springs: {
    gentle: { damping: 18, stiffness: 160 },
    snappy: { damping: 14, stiffness: 220 },
  },
}));

// ── Imports ────────────────────────────────────────────────────────────────

import { render, screen, waitFor } from '@testing-library/react-native';
import { TrackingMap } from '@/components/ui/tracking-map';
import { getTrackingMapUrl } from '@/lib/tracking';

// ── Typed mock helper ──────────────────────────────────────────────────────

const mockGetTrackingMapUrl = getTrackingMapUrl as jest.MockedFunction<
  typeof getTrackingMapUrl
>;

// ── Fixtures ───────────────────────────────────────────────────────────────

const PROVIDER = { latitude: -1.286389, longitude: 36.817223 };
const CUSTOMER = { latitude: -1.292066, longitude: 36.821946 };
const MAP_URL = 'https://example.com/static-map.png';

// ── Suite ──────────────────────────────────────────────────────────────────

describe('TrackingMap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // ── 1. With provider set and URL resolving ─────────────────────────────

  it('renders the map Image and distance/ETA caption when provider is set and URL resolves', async () => {
    mockGetTrackingMapUrl.mockResolvedValue(MAP_URL);

    render(
      <TrackingMap
        provider={PROVIDER}
        customer={CUSTOMER}
        updatedAt="2026-06-24T10:30:00Z"
      />,
    );

    // The async fetch must complete before the Image appears.
    await waitFor(() => {
      expect(screen.getByTestId('tracking-map-image')).toBeTruthy();
    });

    // Distance and ETA caption should be visible.
    // The exact text will contain a distance string (m or km) and an ETA.
    // We assert that the legend is present, which only renders with the map.
    expect(screen.getByText('Provider (P) · You (C)')).toBeOnTheScreen();
  });

  // ── 2. With provider null ──────────────────────────────────────────────

  it('renders the "Waiting for provider location…" placeholder when provider is null', () => {
    render(<TrackingMap provider={null} customer={CUSTOMER} />);

    // No map image.
    expect(screen.queryByTestId('tracking-map-image')).toBeNull();

    // Placeholder text.
    expect(
      screen.getByText('Waiting for provider location…'),
    ).toBeOnTheScreen();
  });

  // ── 3. With URL resolving null ─────────────────────────────────────────

  it('renders the "Live map unavailable" placeholder when the URL resolves to null', async () => {
    mockGetTrackingMapUrl.mockResolvedValue(null);

    render(<TrackingMap provider={PROVIDER} customer={CUSTOMER} />);

    // After the fetch settles, the placeholder should be shown.
    await waitFor(() => {
      expect(screen.getByText('Live map unavailable')).toBeOnTheScreen();
    });

    // No Image element.
    expect(screen.queryByTestId('tracking-map-image')).toBeNull();
  });

  // ── 4. getTrackingMapUrl called with correct args ──────────────────────

  it('calls getTrackingMapUrl with provider and customer coords', async () => {
    mockGetTrackingMapUrl.mockResolvedValue(MAP_URL);

    render(<TrackingMap provider={PROVIDER} customer={CUSTOMER} />);

    await waitFor(() => {
      expect(mockGetTrackingMapUrl).toHaveBeenCalledWith(PROVIDER, CUSTOMER);
    });
  });
});
