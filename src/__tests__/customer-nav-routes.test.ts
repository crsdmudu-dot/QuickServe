/**
 * customer-nav-routes.test.ts
 *
 * Phase 4E.1 regression — guards the navigation ARCHITECTURE for the customer
 * screens that were unreachable inside the NativeTabs group, AND the /providers
 * route-collision fix.
 *
 * Bugs (physical QA):
 *  1. Home "Browse providers"/"My favorites"/"Browse all categories" (+ search
 *     bar) and Profile "Preferences"/"Trust & Safety" did nothing — those screens
 *     lived in the (customer) NativeTabs group but were not <NativeTabs.Trigger>s,
 *     and a non-trigger route cannot be navigated to.
 *  2. After moving providers to root /providers, it collided with the admin-web
 *     route (admin-web)/providers → customer hit the admin guard ("Not authorized").
 *
 * Fixes:
 *  - Moved the customer screens to root-level stack routes (reachable, like
 *    /booking). The customer providers screen is at /browse-providers to avoid the
 *    (admin-web)/providers collision.
 *  - Repointed all callers.
 *
 * This asserts the architecture statically (not via mocked router.push).
 */
import * as fs from 'fs';
import * as path from 'path';

const appDir = path.resolve(__dirname, '../app');
const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../', rel), 'utf-8');
// Customer root-level stack routes (reachable). Note: customer providers is at
// /browse-providers, NOT /providers (which belongs to admin-web).
const CUSTOMER_ROUTES = ['browse-providers', 'favorites', 'search', 'preferences', 'trust'];
const TAB_TRIGGERS = ['home', 'bookings', 'payments', 'notifications', 'profile'];

describe('customer navigation architecture (Phase 4E.1)', () => {
  it('the customer screens are root-level stack routes (reachable), not in the tabs group', () => {
    for (const name of CUSTOMER_ROUTES) {
      expect(fs.existsSync(path.join(appDir, `${name}.tsx`))).toBe(true);
      expect(fs.existsSync(path.join(appDir, '(customer)', `${name}.tsx`))).toBe(false);
    }
  });

  it('customer providers is at /browse-providers — NO collision with admin-web /providers', () => {
    // Customer screen exists at the collision-free path.
    expect(fs.existsSync(path.join(appDir, 'browse-providers.tsx'))).toBe(true);
    // There is NO root /providers (that URL belongs to admin-web only).
    expect(fs.existsSync(path.join(appDir, 'providers.tsx'))).toBe(false);
    // The admin route is untouched and still separate.
    expect(fs.existsSync(path.join(appDir, '(admin-web)', 'providers', 'index.tsx'))).toBe(true);
  });

  it('no customer code targets the colliding /providers URL or the old /(customer)/* paths', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === '(admin-web)' ? [] : walk(p); // admin-web legitimately uses /providers
        return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
      });
    const offenders: string[] = [];
    for (const file of [...walk(appDir), ...walk(path.resolve(__dirname, '../components'))]) {
      const src = fs.readFileSync(file, 'utf-8');
      if (/router\.push\('\/providers'\)/.test(src)) offenders.push(`${path.basename(file)} -> /providers`);
      for (const name of ['providers', 'favorites', 'search', 'preferences', 'trust']) {
        if (src.includes(`/(customer)/${name}`)) offenders.push(`${path.basename(file)} -> /(customer)/${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the root layout renders a <Stack> (so root files are pushable stack screens)', () => {
    expect(read('app/_layout.tsx')).toContain('<Stack');
  });

  it('AppTabs declares exactly the 5 intended tab triggers — none of the customer screens are tabs', () => {
    const tabs = read('components/app-tabs.tsx');
    const triggers = [...tabs.matchAll(/<NativeTabs\.Trigger\s+name="([^"]+)"/g)].map((m) => m[1]);
    expect(triggers.sort()).toEqual([...TAB_TRIGGERS].sort());
    for (const name of CUSTOMER_ROUTES) expect(triggers).not.toContain(name);
  });

  it('Home and Profile push to the correct root paths', () => {
    const home = read('app/(customer)/home.tsx');
    expect(home).toContain("router.push('/browse-providers')");
    expect(home).toContain("router.push('/favorites')");
    expect(home).toContain("router.push('/search')");
    const profile = read('app/(customer)/profile.tsx');
    expect(profile).toContain("router.push('/preferences')");
    expect(profile).toContain("router.push('/trust')");
    // Favorites' browse-provider CTA also points to /browse-providers.
    expect(read('app/favorites.tsx')).toContain("router.push('/browse-providers')");
  });
});
