/**
 * Tests for src/app/(customer)/search.tsx
 *
 * Mocks: expo-router, lib/search, booking-draft.
 * Verifies: instant results, recent+popular shown before typing,
 * clear history, no-result recommendations, booking initiation.
 */

// ── Mocks ───────────────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

// Mock ServicesProvider — search.tsx uses useServices() for the services list
jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = require('../../test/mock-services');
  return mockServicesProviderModule();
});

const mockStart = jest.fn();
jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({ start: mockStart }),
}));

const mockGetRecentSearches = jest.fn().mockResolvedValue(['Plumbing', 'Recent Massage']);
const mockAddRecentSearch = jest.fn().mockResolvedValue(undefined);
const mockClearRecentSearches = jest.fn().mockResolvedValue(undefined);
const mockSearchServices = jest.fn();
const mockNoResultRecommendations = jest.fn();
// searchSuggestions is called by the SearchSuggestions component directly
const mockSearchSuggestions = jest.fn().mockReturnValue([]);

jest.mock('@/lib/search', () => ({
  getRecentSearches: (...args: unknown[]) => mockGetRecentSearches(...args),
  addRecentSearch: (...args: unknown[]) => mockAddRecentSearch(...args),
  clearRecentSearches: (...args: unknown[]) => mockClearRecentSearches(...args),
  searchServices: (...args: unknown[]) => mockSearchServices(...args),
  noResultRecommendations: (...args: unknown[]) => mockNoResultRecommendations(...args),
  searchSuggestions: (...args: unknown[]) => mockSearchSuggestions(...args),
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import SearchScreen from '@/app/(customer)/search';

const SERVICE_CLEANING = {
  id: 'house-cleaning',
  title: 'House Cleaning',
  subtitle: 'Deep clean your home',
  icon: '🧹',
  startingPrice: 1500,
  category: 'home' as const,
  badge: 'Popular' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchServices.mockReturnValue([]);
  mockSearchSuggestions.mockReturnValue([]);
  mockNoResultRecommendations.mockReturnValue([SERVICE_CLEANING]);
  mockGetRecentSearches.mockResolvedValue(['Plumbing', 'Recent Massage']);
});

describe('SearchScreen', () => {
  it('shows recent searches and popular searches before typing', async () => {
    render(<SearchScreen />);
    // Recent searches loaded asynchronously — use unique terms that don't appear in popular
    expect(await screen.findByText('Plumbing')).toBeOnTheScreen();
    expect(screen.getByText('Recent Massage')).toBeOnTheScreen();
    // PopularSearches are always shown — 'Cleaning' is a unique popular term
    expect(screen.getByText('Cleaning')).toBeOnTheScreen();
  });

  it('shows instant results when query is typed', async () => {
    mockSearchServices.mockReturnValue([SERVICE_CLEANING]);
    render(<SearchScreen />);
    const input = screen.getByPlaceholderText('Search services...');
    fireEvent.changeText(input, 'clean');
    // Results header includes count
    await waitFor(() =>
      expect(screen.getByText(/Results/)).toBeOnTheScreen(),
    );
    expect(screen.getByText('House Cleaning')).toBeOnTheScreen();
  });

  it('tapping a service result calls start(serviceId) and navigates to /booking/address', async () => {
    mockSearchServices.mockReturnValue([SERVICE_CLEANING]);
    render(<SearchScreen />);
    const input = screen.getByPlaceholderText('Search services...');
    fireEvent.changeText(input, 'clean');
    // Wait for results to appear
    await screen.findByText('House Cleaning');
    // The ServiceCard wraps in Card → Pressable. fireEvent.press on the text
    // propagates to the Pressable. handleServicePress is async (await addRecentSearch),
    // so we use waitFor to wait for start() and router.push() to be called.
    fireEvent.press(screen.getByText('House Cleaning'));
    await waitFor(() => {
      expect(mockStart).toHaveBeenCalledWith('house-cleaning');
      expect(router.push).toHaveBeenCalledWith('/booking/address');
    });
  });

  it('clear history calls clearRecentSearches and removes the items', async () => {
    render(<SearchScreen />);
    // Wait for history to load
    await screen.findByText('Plumbing');
    const clearBtn = screen.getByText('Clear');
    fireEvent.press(clearBtn);
    expect(mockClearRecentSearches).toHaveBeenCalledTimes(1);
    // Items should disappear optimistically
    await waitFor(() =>
      expect(screen.queryByText('Plumbing')).toBeNull(),
    );
  });

  it('shows no-result empty state and recommendations when query yields no matches', async () => {
    mockSearchServices.mockReturnValue([]);
    render(<SearchScreen />);
    const input = screen.getByPlaceholderText('Search services...');
    fireEvent.changeText(input, 'xyznotaservice');
    await waitFor(() =>
      expect(screen.getByText('No results found')).toBeOnTheScreen(),
    );
    // Recommendation from noResultRecommendations
    expect(screen.getByText('You might like')).toBeOnTheScreen();
    expect(screen.getByText('House Cleaning')).toBeOnTheScreen();
  });

  it('tapping a popular/recent term sets the query (drives instant results)', async () => {
    // searchServices now takes (services: Service[], query: string) — Slice 35 Task 5
    mockSearchServices.mockImplementation((_services: unknown[], q: string) =>
      q.toLowerCase().includes('plumb') ? [SERVICE_CLEANING] : [],
    );
    render(<SearchScreen />);
    // Wait for recent search chip to appear
    const chip = await screen.findByText('Plumbing');
    fireEvent.press(chip);
    // searchServices should now be called with 'Plumbing' and return a result
    await waitFor(() =>
      expect(screen.getByText(/Results/)).toBeOnTheScreen(),
    );
  });
});
