// services-provider.test.tsx — Tests for ServicesProvider and useServices()
// Mocks @/lib/services-catalog to avoid real Supabase calls.

import { render, screen, waitFor, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ServicesProvider, useServices } from '@/services/services-provider';
import { SERVICES } from '@/constants/services';
import {
  getFeaturedServices,
  getTrendingServices,
} from '@/constants/discovery';
import type { DbService, DbCategory } from '@/lib/services-catalog';

// ── Mock the T3 lib ────────────────────────────────────────────────────────
// We mock the ENTIRE module to avoid loading supabase.ts (which throws if env vars are absent).
// toService and parsePrice are pure functions — re-implemented inline inside the factory.
// jest.mock() hoists to the top of the file; factory functions cannot reference out-of-scope vars.

const mockListActiveServices = jest.fn();
const mockListActiveServiceCategories = jest.fn();

jest.mock('@/lib/services-catalog', () => ({
  listActiveServices: jest.fn(),
  listActiveServiceCategories: jest.fn(),
  // Inline re-implementation of parsePrice (pure, no Supabase deps).
  parsePrice(text: string | null): number | undefined {
    if (!text) return undefined;
    const stripped = text.replace(/,/g, '').match(/\d+(\.\d+)?/);
    if (!stripped) return undefined;
    const n = parseFloat(stripped[0]);
    return isNaN(n) ? undefined : n;
  },
  // Inline re-implementation of toService (pure, no Supabase deps).
  toService(db: any, categorySlug?: string) {
    function parseP(t: string | null): number | undefined {
      if (!t) return undefined;
      const s = t.replace(/,/g, '').match(/\d+(\.\d+)?/);
      if (!s) return undefined;
      const n = parseFloat(s[0]);
      return isNaN(n) ? undefined : n;
    }
    return {
      id: db.slug,
      title: db.name,
      subtitle: db.short_description ?? undefined,
      icon: db.icon ?? '🧩',
      category: categorySlug ?? 'home',
      startingPrice: parseP(db.starting_price_text),
      badge: db.featured ? 'Popular' : db.trending ? 'New' : undefined,
    };
  },
}));

// Wire up the jest.fn() instances to our named mocks so tests can control them.
beforeAll(() => {
  const catalog = require('@/lib/services-catalog');
  (catalog.listActiveServices as jest.Mock).mockImplementation((...a: unknown[]) => mockListActiveServices(...a));
  (catalog.listActiveServiceCategories as jest.Mock).mockImplementation((...a: unknown[]) => mockListActiveServiceCategories(...a));
});

// ── Fixtures ───────────────────────────────────────────────────────────────

const CAT_HOME: DbCategory = {
  id: 'cat-home',
  slug: 'home',
  name: 'Home Services',
  icon: '🏠',
  color: null,
  display_order: 0,
  active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const CAT_AUTO: DbCategory = {
  id: 'cat-auto',
  slug: 'auto',
  name: 'Auto Services',
  icon: '🚗',
  color: null,
  display_order: 1,
  active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

function makeSvc(overrides: Partial<DbService>): DbService {
  return {
    id: 'svc-1',
    slug: 'house-cleaning',
    name: 'House Cleaning',
    short_description: 'Deep & regular cleaning',
    full_description: null,
    category_id: 'cat-home',
    icon: '🧹',
    color: null,
    display_order: 0,
    status: 'active',
    featured: false,
    trending: false,
    emergency_available: false,
    inspection_required: false,
    available_24_7: false,
    estimated_duration: null,
    starting_price_text: '1500',
    active_from: null,
    active_until: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

const DB_SVC_CLEANING = makeSvc({});
const DB_SVC_MECHANIC = makeSvc({
  id: 'svc-2',
  slug: 'mechanic',
  name: 'Mechanic On Demand',
  short_description: 'Roadside & at-home',
  category_id: 'cat-auto',
  icon: '🚗',
  display_order: 0,
  featured: true,
  starting_price_text: '2000',
});
const DB_SVC_PLUMBING = makeSvc({
  id: 'svc-3',
  slug: 'plumbing',
  name: 'Plumbing',
  short_description: 'Leaks, fittings & repairs',
  category_id: 'cat-home',
  icon: '🔧',
  display_order: 1,
  trending: true,
  starting_price_text: '2000',
});

// ── Probe component ────────────────────────────────────────────────────────

function Probe({ slug }: { slug?: string }) {
  const { services, loading, error, getFeatured, getTrending, getPopular, getServiceBySlug, getServicesByCategory } = useServices();
  const slugResult = slug ? getServiceBySlug(slug) : null;
  return (
    <>
      <Text testID="loading">{loading ? 'loading' : 'done'}</Text>
      <Text testID="error">{error ?? 'none'}</Text>
      <Text testID="count">{services.length}</Text>
      <Text testID="featured">{getFeatured().map((s) => s.id).join(',')}</Text>
      <Text testID="trending">{getTrending().map((s) => s.id).join(',')}</Text>
      <Text testID="popular">{getPopular().map((s) => s.id).join(',')}</Text>
      <Text testID="home-cat">{getServicesByCategory('home').length}</Text>
      {slugResult && <Text testID="slug-result">{`${slugResult.id}:${slugResult.title}:${slugResult.icon}`}</Text>}
    </>
  );
}

function wrap(ui: React.ReactElement) {
  return render(<ServicesProvider>{ui}</ServicesProvider>);
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ServicesProvider — loading state', () => {
  it('starts in loading state then resolves', async () => {
    mockListActiveServices.mockResolvedValue([DB_SVC_CLEANING]);
    mockListActiveServiceCategories.mockResolvedValue([CAT_HOME]);
    wrap(<Probe />);
    // Initially loading
    expect(screen.getByTestId('loading').props.children).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    expect(screen.getByTestId('count').props.children).toBe(1);
  });
});

describe('ServicesProvider — maps DB services correctly', () => {
  it('maps DB rows to Service shape via toService', async () => {
    mockListActiveServices.mockResolvedValue([DB_SVC_CLEANING, DB_SVC_MECHANIC, DB_SVC_PLUMBING]);
    mockListActiveServiceCategories.mockResolvedValue([CAT_HOME, CAT_AUTO]);
    wrap(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    expect(screen.getByTestId('count').props.children).toBe(3);
  });

  it('sorts by category order then display_order', async () => {
    // PLUMBING is home/display_order 1, CLEANING is home/display_order 0, MECHANIC is auto/display_order 0
    mockListActiveServices.mockResolvedValue([DB_SVC_PLUMBING, DB_SVC_MECHANIC, DB_SVC_CLEANING]);
    mockListActiveServiceCategories.mockResolvedValue([CAT_HOME, CAT_AUTO]);

    function OrderProbe() {
      const { services } = useServices();
      return <Text testID="order">{services.map((s) => s.id).join(',')}</Text>;
    }

    render(<ServicesProvider><OrderProbe /></ServicesProvider>);
    await waitFor(() =>
      expect(screen.getByTestId('order').props.children).toBe('house-cleaning,plumbing,mechanic'),
    );
  });
});

describe('ServicesProvider — reload', () => {
  it('reload() re-fetches from the DB', async () => {
    mockListActiveServices.mockResolvedValue([DB_SVC_CLEANING]);
    mockListActiveServiceCategories.mockResolvedValue([CAT_HOME]);

    function ReloadProbe() {
      const { services, reload } = useServices();
      return (
        <>
          <Text testID="count">{services.length}</Text>
          <Text testID="reload" onPress={reload}>reload</Text>
        </>
      );
    }

    render(<ServicesProvider><ReloadProbe /></ServicesProvider>);
    await waitFor(() => expect(screen.getByTestId('count').props.children).toBe(1));

    // Set up updated mock response with 2 services
    mockListActiveServices.mockResolvedValue([DB_SVC_CLEANING, DB_SVC_MECHANIC]);
    mockListActiveServiceCategories.mockResolvedValue([CAT_HOME, CAT_AUTO]);

    await act(async () => {
      screen.getByTestId('reload').props.onPress();
    });
    await waitFor(() => expect(screen.getByTestId('count').props.children).toBe(2));
  });
});

describe('ServicesProvider — error / empty fallback', () => {
  it('falls back to constants SERVICES when DB returns empty array', async () => {
    mockListActiveServices.mockResolvedValue([]);
    mockListActiveServiceCategories.mockResolvedValue([]);
    wrap(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    // Should fall back to constants (19 services)
    expect(screen.getByTestId('count').props.children).toBe(SERVICES.length);
    expect(screen.getByTestId('error').props.children).toBe('none');
  });

  it('falls back to constants SERVICES on read error and sets error message', async () => {
    mockListActiveServices.mockRejectedValue(new Error('Network error'));
    mockListActiveServiceCategories.mockRejectedValue(new Error('Network error'));
    wrap(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    expect(screen.getByTestId('count').props.children).toBe(SERVICES.length);
    expect(screen.getByTestId('error').props.children).not.toBe('none');
  });
});

describe('getServiceBySlug — 3-step fallback chain', () => {
  it('step 1: DB cache hit — maps correctly', async () => {
    mockListActiveServices.mockResolvedValue([DB_SVC_CLEANING]);
    mockListActiveServiceCategories.mockResolvedValue([CAT_HOME]);
    wrap(<Probe slug="house-cleaning" />);
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    const result = screen.getByTestId('slug-result').props.children;
    expect(result).toBe('house-cleaning:House Cleaning:🧹');
  });

  it('step 2: not in DB but in constants — returns constants shim', async () => {
    // DB returns mechanic only; request 'plumbing' which is in constants but not DB
    mockListActiveServices.mockResolvedValue([DB_SVC_MECHANIC]);
    mockListActiveServiceCategories.mockResolvedValue([CAT_AUTO]);
    wrap(<Probe slug="plumbing" />);
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    const result = screen.getByTestId('slug-result').props.children;
    // 'plumbing' exists in constants SERVICES
    expect(result).toContain('plumbing:Plumbing:🔧');
  });

  it('step 3: unknown slug — returns generic object, no throw', async () => {
    mockListActiveServices.mockResolvedValue([DB_SVC_CLEANING]);
    mockListActiveServiceCategories.mockResolvedValue([CAT_HOME]);
    wrap(<Probe slug="some-future-service" />);
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    const result = screen.getByTestId('slug-result').props.children;
    // Humanized: 'Some Future Service', fallback icon '🧩'
    expect(result).toBe('some-future-service:Some Future Service:🧩');
  });

  it('never throws for any slug', async () => {
    mockListActiveServices.mockResolvedValue([]);
    mockListActiveServiceCategories.mockResolvedValue([]);

    function NeverThrowProbe() {
      const { getServiceBySlug } = useServices();
      const slugs = ['', 'a-b-c', '---', 'house-cleaning', 'unknown-123'];
      const results = slugs.map((s) => {
        try { return getServiceBySlug(s).id; }
        catch { return 'THREW'; }
      });
      return <Text testID="results">{results.join('|')}</Text>;
    }

    render(<ServicesProvider><NeverThrowProbe /></ServicesProvider>);
    await waitFor(() => {
      const text = screen.getByTestId('results').props.children as string;
      expect(text).not.toContain('THREW');
    });
  });
});

describe('getFeatured / getTrending / getPopular', () => {
  it('getFeatured returns DB featured services when cache is populated', async () => {
    mockListActiveServices.mockResolvedValue([DB_SVC_CLEANING, DB_SVC_MECHANIC, DB_SVC_PLUMBING]);
    mockListActiveServiceCategories.mockResolvedValue([CAT_HOME, CAT_AUTO]);
    wrap(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    // Only mechanic has featured=true
    expect(screen.getByTestId('featured').props.children).toBe('mechanic');
  });

  it('getTrending returns DB trending services when cache is populated', async () => {
    mockListActiveServices.mockResolvedValue([DB_SVC_CLEANING, DB_SVC_MECHANIC, DB_SVC_PLUMBING]);
    mockListActiveServiceCategories.mockResolvedValue([CAT_HOME, CAT_AUTO]);
    wrap(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    // Only plumbing has trending=true
    expect(screen.getByTestId('trending').props.children).toBe('plumbing');
  });

  it('getPopular equals getFeatured', async () => {
    mockListActiveServices.mockResolvedValue([DB_SVC_CLEANING, DB_SVC_MECHANIC]);
    mockListActiveServiceCategories.mockResolvedValue([CAT_HOME, CAT_AUTO]);
    wrap(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    const featured = screen.getByTestId('featured').props.children;
    const popular = screen.getByTestId('popular').props.children;
    expect(popular).toBe(featured);
  });

  it('getFeatured falls back to discovery constants when DB cache is empty', async () => {
    mockListActiveServices.mockResolvedValue([]);
    mockListActiveServiceCategories.mockResolvedValue([]);
    wrap(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    const fallbackIds = getFeaturedServices().map((s) => s.id).join(',');
    expect(screen.getByTestId('featured').props.children).toBe(fallbackIds);
  });

  it('getTrending falls back to discovery constants when DB cache is empty', async () => {
    mockListActiveServices.mockResolvedValue([]);
    mockListActiveServiceCategories.mockResolvedValue([]);
    wrap(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    const fallbackIds = getTrendingServices().map((s) => s.id).join(',');
    expect(screen.getByTestId('trending').props.children).toBe(fallbackIds);
  });
});

describe('getServicesByCategory', () => {
  it('filters DB services by category slug', async () => {
    mockListActiveServices.mockResolvedValue([DB_SVC_CLEANING, DB_SVC_MECHANIC, DB_SVC_PLUMBING]);
    mockListActiveServiceCategories.mockResolvedValue([CAT_HOME, CAT_AUTO]);
    wrap(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    // home: cleaning + plumbing = 2
    expect(screen.getByTestId('home-cat').props.children).toBe(2);
  });

  it('filters constants by category when DB cache is empty', async () => {
    mockListActiveServices.mockResolvedValue([]);
    mockListActiveServiceCategories.mockResolvedValue([]);
    wrap(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('done'));
    // constants has 9 home services
    expect(screen.getByTestId('home-cat').props.children).toBe(9);
  });
});

describe('useServices — must be inside provider', () => {
  it('throws when used outside ServicesProvider', () => {
    // Suppress the expected error from React
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    function Bare() {
      useServices();
      return null;
    }
    expect(() => render(<Bare />)).toThrow('useServices must be used within ServicesProvider');
    spy.mockRestore();
  });
});
