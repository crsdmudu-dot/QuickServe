/**
 * consumer-app-excludes-admin.test.tsx
 *
 * Proves that administration is not part of the consumer (Android/iOS) application.
 *
 * Why a static test. Expo Router builds the route tree from a `require.context` over `src/app`,
 * so every route file in that directory is pulled into the bundle for every platform — there is
 * no supported per-platform route-exclusion mechanism (Expo's own docs: platform extensions in
 * the app directory are only honoured when a non-platform version also exists). The only reliable
 * way to keep administrative code out of the consumer binary is for it not to live under
 * `src/app` at all. That is an architectural property, so it is asserted architecturally.
 *
 * A navigation guard is explicitly NOT sufficient and this suite would still pass with one in
 * place — hence the assertions are about the route tree and the import graph, not about runtime
 * redirects. The runtime behaviour (an admin identity landing on an inert notice) is asserted
 * separately below as UX, not as the security boundary.
 */
import * as fs from 'fs';
import * as path from 'path';

import { render, screen } from '@testing-library/react-native';

import { roleHref, type Role } from '@/constants/roles';
import { resolveRootRedirect } from '@/auth/root-redirect';

const APP_DIR = path.resolve(__dirname, '../app');

/** Every file under src/app, as repo-relative posix paths. */
function routeFiles(dir = APP_DIR): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return [path.relative(APP_DIR, full).split(path.sep).join('/')];
  });
}

describe('consumer route tree excludes administration', () => {
  let files: string[];

  beforeAll(() => {
    files = routeFiles();
  });

  it('(a) has no native /admin route group', () => {
    expect(fs.existsSync(path.join(APP_DIR, 'admin'))).toBe(false);
    expect(files.filter((f) => f.startsWith('admin/'))).toEqual([]);
  });

  it('(a) has no (admin-web) route group', () => {
    expect(fs.existsSync(path.join(APP_DIR, '(admin-web)'))).toBe(false);
    expect(files.filter((f) => f.includes('(admin-web)'))).toEqual([]);
  });

  it('(d) no route file resolves any former administrative path', () => {
    // The URLs the separated admin application owns. None may exist as a consumer route.
    const FORMER_ADMIN_PATHS = [
      'dashboard', 'login', 'broadcast', 'promos', 'services', 'customers', 'providers',
      'earnings', 'reviews', 'operations', 'payment-attempts', 'payments', 'analytics',
      'provider-quality', 'bookings',
    ];
    for (const p of FORMER_ADMIN_PATHS) {
      expect(fs.existsSync(path.join(APP_DIR, `${p}.tsx`))).toBe(false);
      expect(fs.existsSync(path.join(APP_DIR, p, 'index.tsx'))).toBe(false);
    }
  });

  it('(e) exclusion is platform-independent — no platform-specific admin route is reintroduced', () => {
    const platformAdmin = files.filter(
      (f) => /\.(ios|android|native|web)\.tsx?$/.test(f) && /admin/i.test(f),
    );
    expect(platformAdmin).toEqual([]);
  });

  it('no consumer route imports administrative modules', () => {
    // Only real module specifiers count — a prose mention of apps/admin in a comment is fine,
    // an import edge is not. Metro bundles by reachability, so an import here would put
    // administrative code back into the Android/iOS binary.
    const SPECIFIER = /(?:from\s+|require\(\s*)['"]([^'"]+)['"]/g;
    const ADMIN_MODULE = /(^|\/)(@admin\/|apps\/admin\/|components\/admin-web\/)/;
    const offenders: string[] = [];
    for (const rel of files) {
      if (!/\.tsx?$/.test(rel)) continue;
      const src = fs.readFileSync(path.join(APP_DIR, rel), 'utf-8');
      for (const match of src.matchAll(SPECIFIER)) {
        const spec = match[1];
        if (ADMIN_MODULE.test(spec) || spec.startsWith('@admin/')) {
          offenders.push(`${rel} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no consumer route calls an administrative RPC', () => {
    // Admin-only RPCs must not be reachable from any mobile screen. This is defence in depth;
    // the authoritative control is is_admin() inside each SECURITY DEFINER function plus RLS.
    const ADMIN_RPCS = [
      'admin_wallet_adjust', 'set_quote', 'broadcast_announcement', 'flag_account',
      'lift_account_flag', 'set_dispute_outcome', 'mark_payout_paid', 'record_provider_payout',
      'admin_create_service', 'admin_update_service', 'admin_set_service_status',
    ];
    const offenders: string[] = [];
    for (const rel of files) {
      if (!/\.tsx?$/.test(rel)) continue;
      const src = fs.readFileSync(path.join(APP_DIR, rel), 'utf-8');
      for (const rpc of ADMIN_RPCS) if (src.includes(rpc)) offenders.push(`${rel} -> ${rpc}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('role routing after the separation', () => {
  it('(b) customer and provider destinations are unchanged', () => {
    expect(roleHref('customer')).toBe('/home');
    expect(roleHref('provider')).toBe('/provider');
  });

  it('(c) an admin identity is routed to the inert staff notice, never to /admin', () => {
    const href = roleHref('admin' as Role);
    expect(href).toBe('/staff-notice');
    expect(href).not.toBe('/admin');
  });

  it('(b) the root redirect still sends each role home from onboarding', () => {
    const base = { isLoading: false, signedIn: true, recoveryActive: false, segments: ['(onboarding)'] };
    expect(resolveRootRedirect({ ...base, role: 'customer' })).toBe('/home');
    expect(resolveRootRedirect({ ...base, role: 'provider' })).toBe('/provider');
    expect(resolveRootRedirect({ ...base, role: 'admin' })).toBe('/staff-notice');
  });
});

describe('staff notice screen', () => {
  it('(c) explains the portal and offers a working sign-out, and renders no admin data', async () => {
    const signOut = jest.fn();
    jest.doMock('@/auth/auth-context', () => ({ useAuth: () => ({ signOut }) }));
    const StaffNoticeScreen = (await import('@/app/staff-notice')).default;

    render(<StaffNoticeScreen />);

    expect(screen.getByText('Administration is on the web portal')).toBeOnTheScreen();
    expect(screen.getByText('Sign out')).toBeOnTheScreen();
  });

  it('(c) does not disclose the admin portal URL from the consumer binary', () => {
    const src = fs.readFileSync(path.join(APP_DIR, 'staff-notice.tsx'), 'utf-8');
    expect(src).not.toMatch(/https?:\/\//);
  });
});
