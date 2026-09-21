/**
 * admin-login-automation-contract.test.tsx
 *
 * Guards the contract between the Playwright admin-login helper and the login screen the admin
 * application actually serves.
 *
 * Connected certification failed in global setup with a 30 s timeout on
 * getByPlaceholder('admin@example.com'). The placeholder was never wrong. Two runtime faults, each
 * introduced when the admin app was separated out of the consumer app, meant no React tree mounted
 * at all on /login:
 *
 *   1. `main` pointed at "expo-router/entry", which resolves OUTSIDE apps/admin in a hoisted
 *      install. Expo's web dev server emitted "/../../node_modules/expo-router/entry.bundle";
 *      a browser normalises that to "/node_modules/expo-router/entry.bundle", Metro resolved it
 *      against the project root, found nothing, and answered 404 with a JSON error the browser
 *      refused to execute.
 *   2. The admin root layout called useAuth() with no AuthProvider above it — the consumer root
 *      layout used to supply that — so every admin route threw at render.
 *
 * Neither was caught by the existing suites: every other admin test builds its own provider tree
 * around the layout instead of letting the app supply one, and no test looked at the entry path.
 * These tests fail against both pre-fix states.
 */
import * as fs from 'fs';
import * as path from 'path';
import { render, screen } from '@testing-library/react-native';

const ADMIN_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(ADMIN_ROOT, '../..');

// ── supabase: no session, no network ─────────────────────────────────────────
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signInWithPassword: jest.fn(),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: jest.fn() }) }) }),
  },
}));

jest.mock('@/lib/services-catalog', () => ({
  fetchActiveServices: jest.fn().mockResolvedValue({ ok: true, data: [] }),
  fetchActiveServiceCategories: jest.fn().mockResolvedValue({ ok: true, data: [] }),
  listActiveServices: jest.fn().mockResolvedValue([]),
  listActiveServiceCategories: jest.fn().mockResolvedValue([]),
  toService: (r: unknown) => r,
}));

jest.mock('expo-router/head', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/monitoring', () => ({ reportError: jest.fn(), initMonitoring: jest.fn() }));

// ── expo-router: the login route is the active segment ───────────────────────
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    __esModule: true,
    useSegments: () => ['login'],
    useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
    router: { replace: jest.fn(), push: jest.fn() },
    Slot: () => React.createElement(require('@admin/app/login').default),
    Redirect: () => null,
    Stack: ({ children }: { children: unknown }) => children ?? null,
  };
});

import AdminWebLayout from '@admin/app/_layout';

/** Placeholders the Playwright helper drives, read from the helper itself rather than retyped. */
function helperLocators() {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'qa/playwright/support/auth.ts'),
    'utf8',
  );
  const email = src.match(/ADMIN_EMAIL_PLACEHOLDER\s*=\s*'([^']+)'/)?.[1];
  const password = src.match(/getByPlaceholder\('([^']+)'\)\.fill\(env\.adminPassword/)?.[1];
  const loginPath = src.match(/ADMIN_LOGIN_PATH\s*=\s*'([^']+)'/)?.[1];
  const button = src.match(/getByRole\('button',\s*\{\s*name:\s*\/([^/]+)\//)?.[1];
  return { email, password, loginPath, button };
}

describe('admin web entry', () => {
  it('resolves to a file inside the admin project root', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ADMIN_ROOT, 'package.json'), 'utf8'));
    expect(typeof pkg.main).toBe('string');

    // A bare package specifier resolves into the hoisted install at the repository root, which is
    // outside apps/admin. The dev server cannot express that as a root-relative URL.
    const resolved = path.resolve(ADMIN_ROOT, pkg.main);
    const relative = path.relative(ADMIN_ROOT, resolved);
    expect(relative.startsWith('..')).toBe(false);
    expect(path.isAbsolute(relative)).toBe(false);
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it('re-exports the expo-router entry rather than reimplementing it', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ADMIN_ROOT, 'package.json'), 'utf8'));
    const entry = fs.readFileSync(path.resolve(ADMIN_ROOT, pkg.main), 'utf8');
    expect(entry).toContain('expo-router/entry');
  });
});

describe('admin root layout supplies its own contexts', () => {
  it('renders the login route with no provider wrapper around it', () => {
    // No AuthProvider/ServicesProvider here on purpose: the app root must supply them. Before the
    // fix this threw "useAuth must be used within AuthProvider" and nothing mounted.
    expect(() => render(<AdminWebLayout />)).not.toThrow();
    expect(screen.getByText('Admin Panel')).toBeOnTheScreen();
  });
});

describe('the Playwright login helper matches the rendered form', () => {
  it('reads its locators from the helper source', () => {
    const { email, password, loginPath, button } = helperLocators();
    expect(email).toBeTruthy();
    expect(password).toBeTruthy();
    expect(button).toBeTruthy();
    expect(loginPath).toBe('/login');
  });

  it('exposes every placeholder and control the helper drives', () => {
    const { email, password, button } = helperLocators();
    render(<AdminWebLayout />);

    // The helper's locators must resolve against the real screen, unwrapped, exactly as the
    // browser sees it.
    expect(screen.getByPlaceholderText(email as string)).toBeOnTheScreen();
    expect(screen.getByPlaceholderText(password as string)).toBeOnTheScreen();
    // The helper scopes the button by ROLE, so assert the same way: the heading text also
    // contains "Sign in", and a bare text query would match both.
    expect(
      screen.getByRole('button', { name: new RegExp(button as string, 'i') }),
    ).toBeOnTheScreen();
  });

  it('waits for hydration before it types, because /login is server-rendered', () => {
    // web.output is "static", so the form is in the raw HTML before the client bundle runs.
    // Filling that static DOM is discarded when React hydrates and the click is lost, which
    // surfaces as a 30 s waitForURL timeout that looks like a credential or selector fault.
    const appJson = JSON.parse(fs.readFileSync(path.join(ADMIN_ROOT, 'app.json'), 'utf8'));
    expect(appJson.expo.web.output).toBe('static');

    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'qa/playwright/support/auth.ts'),
      'utf8',
    );
    expect(src).toContain('waitForAdminLoginHydration');

    const hydrateAt = src.indexOf(`await waitForAdminLoginHydration(page)`);
    const firstFillAt = src.indexOf(`.fill(env.adminEmail`);
    expect(hydrateAt).toBeGreaterThan(-1);
    expect(firstFillAt).toBeGreaterThan(-1);
    expect(hydrateAt).toBeLessThan(firstFillAt);

    // A precondition, not a timing cushion.
    expect(src).not.toMatch(/waitForTimeout/);
  });

  it('keeps the email placeholder distinct from the consumer onboarding login', () => {
    const { email } = helperLocators();
    // Onboarding login uses you@example.com; the helper relies on the admin form differing.
    expect(email).not.toBe('you@example.com');
    const loginSrc = fs.readFileSync(path.join(ADMIN_ROOT, 'src/app/login.tsx'), 'utf8');
    expect(loginSrc).toContain(`placeholder="${email}"`);
  });
});
