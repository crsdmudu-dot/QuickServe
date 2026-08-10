/**
 * customer-nav-routes.test.ts
 *
 * Phase 4E.1 regression — guards the navigation ARCHITECTURE for the customer
 * screens that were unreachable inside the NativeTabs group.
 *
 * Bug (physical QA): Home's "Browse providers" / "My favorites" / "Browse all
 * categories" (+ search bar) and Profile's "Preferences" / "Trust & Safety" did
 * nothing. Root cause: providers/favorites/search/preferences/trust lived in the
 * (customer) NativeTabs group but were NOT declared <NativeTabs.Trigger>s, and
 * with NativeTabs a non-trigger route cannot be navigated to.
 *
 * Fix: those screens were moved OUT of the tabs group to root-level stack routes
 * (reachable via push, exactly like /booking, /wallet, /notification-settings),
 * and all callers were repointed from '/(customer)/X' to '/X'.
 *
 * This test proves the architecture statically — it does NOT rely on a mocked
 * router.push. Existing per-button tests assert the push target; this asserts the
 * target actually resolves to a reachable root stack route and is not a tab.
 */
import * as fs from 'fs';
import * as path from 'path';

const appDir = path.resolve(__dirname, '../app');
const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../', rel), 'utf-8');
const MOVED = ['providers', 'favorites', 'search', 'preferences', 'trust'];
const TAB_TRIGGERS = ['home', 'bookings', 'payments', 'notifications', 'profile'];

describe('customer navigation architecture (Phase 4E.1)', () => {
  it('the five screens are root-level stack routes (reachable), not in the tabs group', () => {
    for (const name of MOVED) {
      expect(fs.existsSync(path.join(appDir, `${name}.tsx`))).toBe(true);          // root route → reachable
      expect(fs.existsSync(path.join(appDir, '(customer)', `${name}.tsx`))).toBe(false); // no longer orphaned
    }
  });

  it('the root layout renders a <Stack> (so root files are pushable stack screens)', () => {
    expect(read('app/_layout.tsx')).toContain('<Stack');
  });

  it('AppTabs declares exactly the 5 intended tab triggers — none of the moved screens are tabs', () => {
    const tabs = read('components/app-tabs.tsx');
    const triggers = [...tabs.matchAll(/<NativeTabs\.Trigger\s+name="([^"]+)"/g)].map((m) => m[1]);
    expect(triggers.sort()).toEqual([...TAB_TRIGGERS].sort());
    for (const name of MOVED) expect(triggers).not.toContain(name);
  });

  it('no source references the old unreachable /(customer)/<screen> paths', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
      });
    const offenders: string[] = [];
    for (const file of [...walk(appDir), ...walk(path.resolve(__dirname, '../components'))]) {
      const src = fs.readFileSync(file, 'utf-8');
      for (const name of MOVED) {
        if (src.includes(`/(customer)/${name}`)) offenders.push(`${path.basename(file)} -> /(customer)/${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('Home and Profile push to the root paths', () => {
    const home = read('app/(customer)/home.tsx');
    expect(home).toContain("router.push('/providers')");
    expect(home).toContain("router.push('/favorites')");
    expect(home).toContain("router.push('/search')");
    const profile = read('app/(customer)/profile.tsx');
    expect(profile).toContain("router.push('/preferences')");
    expect(profile).toContain("router.push('/trust')");
  });
});
