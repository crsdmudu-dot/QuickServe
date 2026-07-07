/**
 * mock-services.ts — Shared test helper that provides a default useServices()
 * fixture for any screen test that uses ServicesProvider / useServices().
 *
 * Usage:
 *   jest.mock('@/services/services-provider', () => mockServicesProviderModule());
 *   // or with a custom override:
 *   jest.mock('@/services/services-provider', () => mockServicesProviderModule({ loading: true }));
 *
 * The fixture's getServiceBySlug mimics the real 3-step fallback chain:
 *   1. fixtureMap lookup (active slugs supplied to the test)
 *   2. constants getServiceById (covers archived/historical slugs)
 *   3. generic humanized label (unknown slug — never throws)
 */

import { SERVICES, getServiceById, type Service } from '@/constants/services';

// ── Helpers ──────────────────────────────────────────────────────────────────

function humanize(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// ── Default fixture services ──────────────────────────────────────────────────

/** The full constants list as the default "active" services in tests. */
const DEFAULT_SERVICES: Service[] = SERVICES;

// ── Fixture factory ───────────────────────────────────────────────────────────

export type MockServicesOverrides = {
  services?: Service[];
  loading?: boolean;
  error?: string | null;
};

/**
 * Returns a mock implementation of the @/services/services-provider module.
 * Pass overrides to customise individual fields.
 *
 * Example:
 *   jest.mock('@/services/services-provider', () => mockServicesProviderModule());
 */
export function mockServicesProviderModule(overrides: MockServicesOverrides = {}) {
  const services = overrides.services ?? DEFAULT_SERVICES;

  // Build a fast slug→Service map from the fixture list.
  const serviceMap: Record<string, Service> = {};
  for (const svc of services) {
    serviceMap[svc.id] = svc;
  }

  function getServiceBySlug(slug: string): Service {
    // Step 1: fixture map hit (active/current services)
    if (serviceMap[slug]) return serviceMap[slug];
    // Step 2: constants shim (covers archived/historical service slugs)
    const legacy = getServiceById(slug);
    if (legacy) return legacy;
    // Step 3: raw-slug generic fallback — never throws
    return {
      id: slug,
      title: humanize(slug),
      icon: '🧩',
      category: 'home' as const,
    };
  }

  const categories = [
    { slug: 'home',     name: 'Home Services',     icon: null, color: null, display_order: 0 },
    { slug: 'auto',     name: 'Auto Services',      icon: null, color: null, display_order: 1 },
    { slug: 'delivery', name: 'Delivery Services',  icon: null, color: null, display_order: 2 },
    { slug: 'personal', name: 'Personal Care',      icon: null, color: null, display_order: 3 },
  ];

  function getServicesByCategory(catSlug: string): Service[] {
    return services.filter((s) => s.category === catSlug);
  }

  function getFeatured(): Service[] {
    return services.filter((s) => s.badge === 'Popular');
  }

  function getTrending(): Service[] {
    return services.filter((s) => s.badge === 'New');
  }

  function getPopular(): Service[] {
    return getFeatured();
  }

  const ctx = {
    services,
    categories,
    loading: overrides.loading ?? false,
    error: overrides.error ?? null,
    reload: jest.fn(),
    getServiceBySlug,
    getCategoryBySlug: (slug: string) => categories.find((c) => c.slug === slug),
    getServicesByCategory,
    getFeatured,
    getTrending,
    getPopular,
  };

  return {
    ServicesProvider: ({ children }: { children: React.ReactNode }) => children,
    useServices: () => ctx,
  };
}

/**
 * Returns just the useServices() fixture value (for use when the module mock
 * only needs to override useServices, not ServicesProvider).
 */
export function makeUseServicesFixture(overrides: MockServicesOverrides = {}) {
  return mockServicesProviderModule(overrides).useServices();
}
