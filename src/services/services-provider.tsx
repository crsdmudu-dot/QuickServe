// services-provider.tsx — React context provider for the dynamic service catalog.
//
// On mount it fetches all active services + categories from Supabase (via the T3 lib).
// Consumer components call useServices() to get the cached list, lookup helpers, and
// featured/trending/popular slices — all with a 3-step fallback chain that guarantees
// old bookings never break even if the DB is unavailable.
//
// Fallback chain for getServiceBySlug(slug):
//   1. DB cache hit  → toService(dbRow, categorySlug)
//   2. Not in DB     → getServiceById(slug) from constants/services.ts (legacy shim)
//   3. Unknown slug  → generic { id: slug, title: humanize(slug), icon: '🧩', category: 'home' }

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import {
  listActiveServices,
  listActiveServiceCategories,
  toService,
  type DbService,
  type DbCategory,
} from '@/lib/services-catalog';
import {
  SERVICES,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  getServiceById,
  type Service,
  type ServiceCategory,
} from '@/constants/services';
import {
  getFeaturedServices,
  getTrendingServices,
} from '@/constants/discovery';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Converts a slug like 'house-cleaning' to a human-readable title 'House Cleaning'.
 * Pure function — no side effects.
 */
function humanize(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// ── Context shape ─────────────────────────────────────────────────────────

type Category = {
  slug: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  display_order: number;
};

type ServicesContextValue = {
  /** Active services from DB (or fallback to constants when DB is empty/failed). */
  services: Service[];
  /** Active categories from DB (or fallback to CATEGORY_ORDER/CATEGORY_LABELS). */
  categories: Category[];
  /** True while the initial DB fetch is in progress. */
  loading: boolean;
  /** Error message if the DB fetch failed (services/categories fall back to constants). */
  error: string | null;
  /** Re-fetch services and categories from the DB. */
  reload: () => void;
  /**
   * 3-step fallback lookup — NEVER throws, always returns a displayable Service:
   *   1. DB cache hit  → toService(row, categorySlug)
   *   2. Not in DB     → getServiceById(slug) from constants (legacy shim)
   *   3. Unknown slug  → generic { id: slug, title: humanize(slug), icon: '🧩', category: 'home' }
   */
  getServiceBySlug: (slug: string) => Service;
  /** Returns the category by slug, or undefined if not found. */
  getCategoryBySlug: (slug: string) => Category | undefined;
  /** Returns active services that belong to the given category slug. */
  getServicesByCategory: (catSlug: string) => Service[];
  /** Services with featured=true from DB; fallback to getFeaturedServices() when cache is empty. */
  getFeatured: () => Service[];
  /** Services with trending=true from DB; fallback to getTrendingServices() when cache is empty. */
  getTrending: () => Service[];
  /** Same as getFeatured() — popular folds into featured per spec. */
  getPopular: () => Service[];
};

const ServicesContext = createContext<ServicesContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────

export function ServicesProvider({ children }: { children: ReactNode }) {
  const [dbServices, setDbServices] = useState<DbService[]>([]);
  const [dbCategories, setDbCategories] = useState<DbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bump this counter to trigger a re-fetch.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([listActiveServices(), listActiveServiceCategories()])
      .then(([svcs, cats]) => {
        if (!active) return;
        setDbServices(svcs);
        setDbCategories(cats);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        if (__DEV__) console.error('[ServicesProvider] fetch error:', err);
        setError('Could not load services. Showing cached data.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tick]);

  function reload() {
    setTick((t) => t + 1);
  }

  // ── Build lookup maps ───────────────────────────────────────────────────

  /** id → DbCategory */
  const categoryById: Record<string, DbCategory> = {};
  for (const cat of dbCategories) {
    categoryById[cat.id] = cat;
  }

  /** slug → DbService */
  const serviceBySlug: Record<string, DbService> = {};
  for (const svc of dbServices) {
    serviceBySlug[svc.slug] = svc;
  }

  // ── Derived values ──────────────────────────────────────────────────────

  /** Active services mapped to the legacy Service shape, sorted by category order then display_order. */
  const services: Service[] =
    dbServices.length > 0
      ? (() => {
          const CATEGORY_RANK: Record<string, number> = {};
          CATEGORY_ORDER.forEach((cat, i) => {
            CATEGORY_RANK[cat] = i;
          });
          return [...dbServices]
            .sort((a, b) => {
              const catA = a.category_id ? (categoryById[a.category_id]?.slug ?? '') : '';
              const catB = b.category_id ? (categoryById[b.category_id]?.slug ?? '') : '';
              const rankA = CATEGORY_RANK[catA] ?? 999;
              const rankB = CATEGORY_RANK[catB] ?? 999;
              if (rankA !== rankB) return rankA - rankB;
              return a.display_order - b.display_order;
            })
            .map((db) => {
              const catSlug = db.category_id ? (categoryById[db.category_id]?.slug ?? undefined) : undefined;
              return toService(db, catSlug);
            });
        })()
      : SERVICES;

  /** Active categories in display_order. Falls back to CATEGORY_ORDER when DB is empty. */
  const categories: Category[] =
    dbCategories.length > 0
      ? dbCategories.map((cat) => ({
          slug: cat.slug,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          display_order: cat.display_order,
        }))
      : CATEGORY_ORDER.map((slug, i) => ({
          slug,
          name: CATEGORY_LABELS[slug as ServiceCategory] ?? slug,
          icon: null,
          color: null,
          display_order: i,
        }));

  // ── Lookup helpers ──────────────────────────────────────────────────────

  function getServiceBySlug(slug: string): Service {
    // Step 1: DB cache hit
    const dbRow = serviceBySlug[slug];
    if (dbRow) {
      const catSlug = dbRow.category_id
        ? (categoryById[dbRow.category_id]?.slug ?? undefined)
        : undefined;
      return toService(dbRow, catSlug);
    }
    // Step 2: Legacy constants shim (covers historical bookings of archived services)
    const legacy = getServiceById(slug);
    if (legacy) return legacy;
    // Step 3: Raw-slug fallback — never throws, always returns something renderable
    return {
      id: slug,
      title: humanize(slug),
      icon: '🧩',
      category: 'home' as ServiceCategory,
    };
  }

  function getCategoryBySlug(slug: string): Category | undefined {
    return categories.find((c) => c.slug === slug);
  }

  function getServicesByCategory(catSlug: string): Service[] {
    if (dbServices.length > 0) {
      return services.filter((s) => s.category === catSlug);
    }
    // Fallback: filter constants (category field is ServiceCategory = slug for legacy services)
    return SERVICES.filter((s) => s.category === catSlug);
  }

  function getFeatured(): Service[] {
    if (dbServices.length > 0) {
      return dbServices
        .filter((db) => db.featured)
        .map((db) => {
          const catSlug = db.category_id
            ? (categoryById[db.category_id]?.slug ?? undefined)
            : undefined;
          return toService(db, catSlug);
        });
    }
    return getFeaturedServices();
  }

  function getTrending(): Service[] {
    if (dbServices.length > 0) {
      return dbServices
        .filter((db) => db.trending)
        .map((db) => {
          const catSlug = db.category_id
            ? (categoryById[db.category_id]?.slug ?? undefined)
            : undefined;
          return toService(db, catSlug);
        });
    }
    return getTrendingServices();
  }

  function getPopular(): Service[] {
    return getFeatured();
  }

  return (
    <ServicesContext.Provider
      value={{
        services,
        categories,
        loading,
        error,
        reload,
        getServiceBySlug,
        getCategoryBySlug,
        getServicesByCategory,
        getFeatured,
        getTrending,
        getPopular,
      }}>
      {children}
    </ServicesContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────

/**
 * Returns the services cache and lookup helpers.
 * Must be used inside a <ServicesProvider>.
 */
export function useServices(): ServicesContextValue {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useServices must be used within ServicesProvider');
  return ctx;
}
