/**
 * auth-link-bridge.test.tsx — the web HTTPS bridge component: reads the fragment once, takes it out
 * of the URL, keeps the values in memory, and hands off to the app only on an explicit action.
 * It never touches Supabase or the network and never renders or logs the token hash.
 *
 * The removal itself (Expo Router navigation, history entries, back/forward, refresh) is specified
 * in auth-link-bridge-history.test.tsx.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthLinkBridge, type BridgeWindow } from '@/components/auth/auth-link-bridge';

jest.mock('expo-router/head', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/lib/supabase', () => {
  throw new Error('the web bridge must never import the Supabase client');
});

const HASH = 'f'.repeat(64);
const REC = 'kwikserve://auth/recovery';
const CONF = 'kwikserve://auth/confirm';
const frag = (parts: Record<string, string>) => '#' + Object.entries(parts).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

type FakeBrowser = Omit<BridgeWindow, 'hash'> & {
  hash: string; // mutable here: `clearFragment` models the browser dropping the fragment
  search: string;
  replacedRoutes: string[];
  cleared: string[];
  navigated: string[];
};

function fakeBrowser(hash: string, search = '', pathname = '/auth/recovery'): FakeBrowser {
  const b: FakeBrowser = {
    hash,
    search,
    pathname,
    replacedRoutes: [],
    cleared: [],
    navigated: [],
    replaceRoute(path: string) {
      b.replacedRoutes.push(path);
    },
    clearFragment(path: string) {
      b.cleared.push(path);
      b.hash = '';
    },
    navigate(url: string) {
      b.navigated.push(url);
    },
  };
  return b;
}

describe('AuthLinkBridge — lifecycle', () => {
  it('captures a valid recovery fragment once, takes it out of the URL, and offers only the explicit app action', () => {
    const browser = fakeBrowser(frag({ token_hash: HASH, type: 'recovery', redirect_to: REC }));
    render(<AuthLinkBridge type="recovery" browser={browser} />);
    expect(screen.getByText('Open KwikServe to reset your password')).toBeOnTheScreen();
    expect(browser.cleared).toEqual(['/auth/recovery']);
    expect(browser.replacedRoutes).toEqual(['/auth/recovery']); // removal goes through the router
    expect(browser.navigated).toEqual([]); // no automatic navigation
    expect(screen.getByRole('button', { name: 'Open KwikServe' })).toBeOnTheScreen();
    expect(screen.queryByText(/Continue in browser/i)).toBeNull();
  });

  it('opens the exact canonical app URL only when the user presses the button, and guards duplicate clicks', () => {
    const browser = fakeBrowser(frag({ token_hash: HASH, type: 'recovery', redirect_to: REC }));
    render(<AuthLinkBridge type="recovery" browser={browser} />);
    fireEvent.press(screen.getByText('Open KwikServe'));
    fireEvent.press(screen.getByText('Open KwikServe'));
    expect(browser.navigated).toEqual([`${REC}?token_hash=${HASH}&type=recovery`]);
    expect(screen.getByText(/If the app didn't open/)).toBeOnTheScreen();
    expect(screen.getByText(/install the KwikServe app on this phone/)).toBeOnTheScreen();
  });

  it('confirmation variant uses the confirmation copy and destination', () => {
    const browser = fakeBrowser(frag({ token_hash: HASH, type: 'signup', redirect_to: CONF }), '', '/auth/confirm');
    render(<AuthLinkBridge type="signup" browser={browser} />);
    expect(screen.getByText('Open KwikServe to confirm your email')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Open KwikServe'));
    expect(browser.navigated).toEqual([`${CONF}?token_hash=${HASH}&type=signup`]);
    expect(browser.cleared).toEqual(['/auth/confirm']);
    expect(browser.replacedRoutes).toEqual(['/auth/confirm']);
  });

  it('a refresh loads a new document with no fragment and shows the invalid state (nothing persisted)', () => {
    const first = fakeBrowser(frag({ token_hash: HASH, type: 'recovery', redirect_to: REC }));
    render(<AuthLinkBridge type="recovery" browser={first} />).unmount();
    render(<AuthLinkBridge type="recovery" browser={fakeBrowser('')} />); // a refresh is a new window
    expect(screen.getByText('This link is invalid or has expired.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Open KwikServe' })).toBeNull();
  });
});

describe('AuthLinkBridge — fail closed', () => {
  it.each([
    ['no fragment', ''],
    ['query-string token is not a fallback', ''],
    ['wrong type', frag({ token_hash: HASH, type: 'signup', redirect_to: REC })],
    ['bad token', frag({ token_hash: 'nope', type: 'recovery', redirect_to: REC })],
    ['missing destination', frag({ token_hash: HASH, type: 'recovery' })],
    ['foreign destination', frag({ token_hash: HASH, type: 'recovery', redirect_to: 'https://evil.example/x' })],
    ['browser reset destination (disabled this slice)', frag({ token_hash: HASH, type: 'recovery', redirect_to: 'https://admin.example/reset-password' })],
    ['implicit tokens', '#access_token=eyJa.b.c&refresh_token=r&type=recovery'],
  ])('%s → one neutral invalid state, no actions, no navigation', (label, hash) => {
    const browser = fakeBrowser(hash, label.startsWith('query') ? `?token_hash=${HASH}&type=recovery&redirect_to=${encodeURIComponent(REC)}` : '');
    render(<AuthLinkBridge type="recovery" browser={browser} />);
    expect(screen.getByText('This link is invalid or has expired.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Open KwikServe' })).toBeNull();
    expect(screen.queryByText(/Continue in browser/i)).toBeNull();
    expect(browser.navigated).toEqual([]);
    expect(screen.getByText(/Request a new link/)).toBeOnTheScreen();
  });

  it('takes even an invalid fragment out of the URL without persisting anything', () => {
    const browser = fakeBrowser('#access_token=eyJa.b.c&type=recovery');
    render(<AuthLinkBridge type="recovery" browser={browser} />);
    expect(browser.cleared).toEqual(['/auth/recovery']);
    expect(browser.replacedRoutes).toEqual(['/auth/recovery']);
  });
});

describe('AuthLinkBridge — secrecy', () => {
  it('never renders or logs the token hash or destination', () => {
    const spies = [jest.spyOn(console, 'log'), jest.spyOn(console, 'error'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'info')].map((s) => s.mockImplementation(() => {}));
    const browser = fakeBrowser(frag({ token_hash: HASH, type: 'recovery', redirect_to: REC }));
    const view = render(<AuthLinkBridge type="recovery" browser={browser} />);
    fireEvent.press(screen.getByText('Open KwikServe'));
    const rendered = JSON.stringify(view.toJSON());
    expect(rendered).not.toContain(HASH);
    expect(rendered).not.toContain('kwikserve://');
    const all = spies.flatMap((s) => s.mock.calls.flat()).map((v) => (typeof v === 'string' ? v : JSON.stringify(v) ?? String(v)));
    for (const line of all) expect(line).not.toContain(HASH);
    spies.forEach((s) => s.mockRestore());
  });
});

describe('AuthLinkBridge — product branding', () => {
  // The emailed-link page is the first KwikServe surface a user sees, and it carried the
  // pre-rename product name. Brand text only: nothing about routing, validation or the
  // destination changes with it.
  const variants = [
    { type: 'recovery' as const, dest: REC, prompt: 'Open KwikServe to reset your password', title: 'Reset your password' },
    { type: 'signup' as const, dest: CONF, prompt: 'Open KwikServe to confirm your email', title: 'Confirm your email' },
  ];

  it.each(variants)('the $type bridge shows the KwikServe prompt and button', ({ type, dest, prompt, title }) => {
    const browser = fakeBrowser(frag({ token_hash: HASH, type: type === 'signup' ? 'signup' : 'recovery', redirect_to: dest }), '', `/auth/${type === 'signup' ? 'confirm' : 'recovery'}`);
    render(<AuthLinkBridge type={type} browser={browser} />);
    expect(screen.getByText(title)).toBeOnTheScreen();
    expect(screen.getByText(prompt)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open KwikServe' })).toBeOnTheScreen();
  });

  it.each(variants)('the rendered $type bridge contains no legacy brand string', ({ type, dest }) => {
    const browser = fakeBrowser(frag({ token_hash: HASH, type: type === 'signup' ? 'signup' : 'recovery', redirect_to: dest }), '', `/auth/${type === 'signup' ? 'confirm' : 'recovery'}`);
    const view = render(<AuthLinkBridge type={type} browser={browser} />);
    expect(JSON.stringify(view.toJSON())).not.toContain('QuickServe');
  });

  it('the fallback help text names KwikServe and appears only after the handoff', () => {
    const browser = fakeBrowser(frag({ token_hash: HASH, type: 'recovery', redirect_to: REC }));
    const view = render(<AuthLinkBridge type="recovery" browser={browser} />);
    expect(screen.queryByText(/install the KwikServe app on this phone/)).toBeNull();
    fireEvent.press(screen.getByText('Open KwikServe'));
    expect(screen.getByText(/install the KwikServe app on this phone/)).toBeOnTheScreen();
    expect(JSON.stringify(view.toJSON())).not.toContain('QuickServe');
  });

  it('renaming the brand does not change the destination the button opens', () => {
    const browser = fakeBrowser(frag({ token_hash: HASH, type: 'recovery', redirect_to: REC }));
    render(<AuthLinkBridge type="recovery" browser={browser} />);
    fireEvent.press(screen.getByText('Open KwikServe'));
    expect(browser.navigated).toEqual([`${REC}?token_hash=${HASH}&type=recovery`]);
  });

  it('the fragment is still stripped before anything is shown', () => {
    const browser = fakeBrowser(frag({ token_hash: HASH, type: 'recovery', redirect_to: REC }));
    render(<AuthLinkBridge type="recovery" browser={browser} />);
    expect(browser.hash).toBe('');
    expect(browser.cleared).toEqual(['/auth/recovery']);
    expect(browser.replacedRoutes).toEqual(['/auth/recovery']);
  });

  it('a malformed or query-carried link still fails closed with no brand button at all', () => {
    for (const browser of [
      fakeBrowser(frag({ token_hash: 'short', type: 'recovery', redirect_to: REC })),
      fakeBrowser('', `?token_hash=${HASH}&type=recovery`),
      fakeBrowser(frag({ token_hash: HASH, type: 'recovery', redirect_to: 'https://evil.example/auth/recovery' })),
    ]) {
      const view = render(<AuthLinkBridge type="recovery" browser={browser} />);
      expect(screen.getAllByText('This link is invalid or has expired.').length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: 'Open KwikServe' })).toBeNull();
      expect(JSON.stringify(view.toJSON())).not.toContain('QuickServe');
      expect(browser.navigated).toEqual([]);
      view.unmount();
    }
  });
});
