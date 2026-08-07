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
  fetchActiveServices,
  fetchActiveServiceCategories,
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
  /** Active services from DB (authoritative, empty allowed); cached constants only when the fetch fails. */
  services: Service[];
  /** Active categories from DB (authoritative); cached CATEGORY_ORDER only when the fetch fails. */
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
  // True only when the catalogue fetch genuinely ERRORED (network / RLS / Postgres).
  // A successful-but-empty fetch leaves this false so the DB stays authoritative and
  // the hardcoded catalogue is NOT resurrected (admin may intentionally hide all services).
  const [failed, setFailed] = useState(false);
  // Bump this counter to trigger a re-fetch.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([fetchActiveServices(), fetchActiveServiceCategories()])
      .then(([svcRes, catRes]) => {
        if (!active) return;
        if (!svcRes.ok || !catRes.ok) {
          // Genuine query failure → fall back to the cached hardcoded catalogue.
          if (__DEV__) console.error('[ServicesProvider] catalogue fetch failed');
          setFailed(true);
          setDbServices([]);
          setDbCategories([]);
          setError('Could not load services. Showing cached data.');
        } else {
          // Success is authoritative even when it returns zero rows.
          setFailed(false);
          setDbServices(svcRes.data);
          setDbCategories(catRes.data);
        }
        setLoading(false);
      })
      .catch((err) => {
        // Unexpected throw (not a Supabase error object) — treat as a fetch failure.
        if (!active) return;
        if (__DEV__) console.error('[ServicesProvider] fetch error:', err);
        setFailed(true);
        setDbServices([]);
        setDbCategories([]);
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

  /**
   * Active services mapped to the legacy Service shape, sorted by category order
   * then display_order. The DB result is authoritative on a successful fetch —
   * even when it is empty ([]). Only a genuine fetch failure falls back to SERVICES.
   */
  const services: Service[] = failed
    ? SERVICES
    : (() => {
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
      })();

  /** Active categories in display_order. Falls back to CATEGORY_ORDER only when the fetch failed. */
  const categories: Category[] = failed
    ? CATEGORY_ORDER.map((slug, i) => ({
        slug,
        name: CATEGORY_LABELS[slug as ServiceCategory] ?? slug,
        icon: null,
        color: null,
        display_order: i,
      }))
    : dbCategories.map((cat) => ({
        slug: cat.slug,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        display_order: cat.display_order,
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
    // On a genuine fetch failure, filter the cached constants; otherwise the DB
    // result is authoritative (empty stays empty).
    if (failed) {
      return SERVICES.filter((s) => s.category === catSlug);
    }
    return services.filter((s) => s.category === catSlug);
  }

  function getFeatured(): Service[] {
    if (failed) {
      return getFeaturedServices();
    }
    return dbServices
      .filter((db) => db.featured)
      .map((db) => {
        const catSlug = db.category_id
          ? (categoryById[db.category_id]?.slug ?? undefined)
          : undefined;
        return toService(db, catSlug);
      });
  }

  function getTrending(): Service[] {
    if (failed) {
      return getTrendingServices();
    }
    return dbServices
      .filter((db) => db.trending)
      .map((db) => {
        const catSlug = db.category_id
          ? (categoryById[db.category_id]?.slug ?? undefined)
          : undefined;
        return toService(db, catSlug);
      });
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
