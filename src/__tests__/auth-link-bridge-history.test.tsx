/**
 * auth-link-bridge-history.test.tsx — the bridge must take the one-time token hash out of the
 * address bar and out of session history, and Expo Router must not be able to put it back.
 *
 * Why this suite exists: stripping the fragment with `history.replaceState` alone does NOT work in
 * the real app. Expo Router (react-navigation `useLinking` + `createMemoryHistory`) rewrites the
 * URL after the bridge has cleaned it, from two sources it captured at boot:
 *   1. `route.path` — the ORIGINAL URL, fragment included, reused while name and params still match;
 *   2. `location.hash` — read live and re-appended when the focused route key has not changed.
 * The model below reproduces exactly that call order (router sync → bridge strip → router sync),
 * which is what was observed in the browser against the built export.
 *
 * The bridge therefore has to remove the fragment through the router's own navigation, so the
 * router's remembered path is replaced and its route key changes; a raw history write is only a
 * closing assertion. The navigation remounts the screen, so the captured link must live in memory
 * that survives a remount — never in storage.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthLinkBridge, type BridgeWindow } from '@/components/auth/auth-link-bridge';

jest.mock('expo-router/head', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));

const ORIGIN = 'https://bridge.example';
const HASH = 'a'.repeat(64);
const REC = 'kwikserve://auth/recovery';
const CONF = 'kwikserve://auth/confirm';
const frag = (parts: Record<string, string>) =>
  '#' + Object.entries(parts).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const validRecovery = frag({ token_hash: HASH, type: 'recovery', redirect_to: REC });

/**
 * A faithful-enough model of Expo Router's web history integration.
 * `sync()` is what the router does on every navigation state change.
 */
class RouterModel implements BridgeWindow {
  entries: string[];
  index = 0;
  /** `route.path` — captured at boot from the full URL, fragment included. */
  routePath: string;
  routeKey = 'key-0';
  private keys = 0;
  readonly routerReplacements: string[] = [];
  readonly rawClears: string[] = [];
  readonly navigations: string[] = [];
  readonly writes: string[] = [];

  constructor(url: string) {
    this.entries = [url];
    this.routePath = url;
  }

  get current(): string {
    return this.entries[this.index];
  }

  get hash(): string {
    const at = this.current.indexOf('#');
    return at < 0 ? '' : this.current.slice(at);
  }

  get pathname(): string {
    return this.current.split('#')[0].split('?')[0];
  }

  private write(url: string) {
    this.entries[this.index] = url;
    this.writes.push(url);
  }

  /** The router's state-change write: reuse the remembered path, else derive and re-append the hash. */
  sync() {
    this.write(this.routePath.includes('#') ? this.routePath : this.routePath + this.hash);
  }

  /** `router.replace(path)`: replaces the current route (new key, new remembered path), then syncs. */
  replaceRoute(path: string) {
    this.routerReplacements.push(path);
    this.routePath = path;
    this.routeKey = `key-${++this.keys}`;
    this.sync();
  }

  /** `history.replaceState(null, '', path)`: rewrites the current entry only. */
  clearFragment(path: string) {
    this.rawClears.push(path);
    this.write(path);
  }

  navigate(url: string) {
    this.navigations.push(url);
  }

  back() {
    if (this.index > 0) this.index -= 1;
  }

  forward() {
    if (this.index < this.entries.length - 1) this.index += 1;
  }
}

const carriesToken = (value: string) => value.includes(HASH) || value.includes('token_hash');

describe('fragment removal survives the router', () => {
  it('the router cannot restore the fragment after the bridge has removed it', () => {
    const model = new RouterModel(`${ORIGIN}/auth/recovery${validRecovery}`.replace(ORIGIN, ''));
    render(<AuthLinkBridge type="recovery" browser={model} />);
    model.sync(); // the router's post-mount write, the one that used to bring the fragment back
    model.sync();
    expect(model.current).toBe('/auth/recovery');
    expect(model.hash).toBe('');
    expect(model.writes.filter(carriesToken)).toEqual([]);
  });

  it('removes the fragment through the router navigation, with the bare pathname', () => {
    const model = new RouterModel(`/auth/recovery${validRecovery}`);
    render(<AuthLinkBridge type="recovery" browser={model} />);
    expect(model.routerReplacements).toEqual(['/auth/recovery']);
    for (const target of model.routerReplacements) {
      expect(target).not.toContain('#');
      expect(target).not.toContain('?');
      expect(carriesToken(target)).toBe(false);
    }
    expect(model.routePath).toBe('/auth/recovery'); // the router's remembered path no longer has it
  });

  it('keeps working when the navigation remounts the screen, and does not navigate twice', () => {
    const model = new RouterModel(`/auth/recovery${validRecovery}`);
    const view = render(<AuthLinkBridge type="recovery" browser={model} />);
    // `router.replace` gives the screen a new route key, so React unmounts and mounts it again.
    view.unmount();
    render(<AuthLinkBridge type="recovery" browser={model} />);
    model.sync();
    expect(screen.getByText('Open KwikServe to reset your password')).toBeOnTheScreen();
    expect(model.routerReplacements).toEqual(['/auth/recovery']); // no loop
    expect(model.current).toBe('/auth/recovery');
  });

  it('leaves no history entry carrying the token, and adds none', () => {
    const model = new RouterModel(`/auth/recovery${validRecovery}`);
    render(<AuthLinkBridge type="recovery" browser={model} />);
    model.sync();
    expect(model.entries).toEqual(['/auth/recovery']);
    expect(model.entries.filter(carriesToken)).toEqual([]);
  });

  it('going back and forward never reaches the token', () => {
    const model = new RouterModel(`/auth/recovery${validRecovery}`);
    render(<AuthLinkBridge type="recovery" browser={model} />);
    model.sync();
    model.back();
    expect(carriesToken(model.current)).toBe(false);
    model.forward();
    expect(carriesToken(model.current)).toBe(false);
    expect(model.entries.some(carriesToken)).toBe(false);
  });

  it('a refresh after removal shows the invalid state and attempts no navigation', () => {
    const model = new RouterModel(`/auth/recovery${validRecovery}`);
    const view = render(<AuthLinkBridge type="recovery" browser={model} />);
    model.sync();
    view.unmount();

    const reloaded = new RouterModel(model.current); // the browser reloads the cleaned URL
    render(<AuthLinkBridge type="recovery" browser={reloaded} />);
    expect(screen.getByText('This link is invalid or has expired.')).toBeOnTheScreen();
    expect(reloaded.routerReplacements).toEqual([]);
    expect(reloaded.rawClears).toEqual([]);
    expect(reloaded.navigations).toEqual([]);
  });
});

describe('fragment removal for every link shape', () => {
  it.each([
    ['valid recovery', '/auth/recovery', 'recovery' as const, validRecovery],
    ['valid confirmation', '/auth/confirm', 'signup' as const, frag({ token_hash: HASH, type: 'signup', redirect_to: CONF })],
    ['wrong type', '/auth/recovery', 'recovery' as const, frag({ token_hash: HASH, type: 'signup', redirect_to: REC })],
    ['implicit tokens', '/auth/recovery', 'recovery' as const, '#access_token=eyJa.b.c&refresh_token=r&type=recovery'],
    ['unapproved destination', '/auth/recovery', 'recovery' as const, frag({ token_hash: HASH, type: 'recovery', redirect_to: 'https://evil.example/x' })],
  ])('%s is removed from the URL and cannot be restored', (_label, path, type, fragment) => {
    const model = new RouterModel(`${path}${fragment}`);
    render(<AuthLinkBridge type={type} browser={model} />);
    model.sync();
    expect(model.current).toBe(path);
    expect(model.hash).toBe('');
    expect(model.writes.some((w) => w.includes('access_token') || carriesToken(w))).toBe(false);
  });

  it('the confirmation route hands off to its own destination only', () => {
    const model = new RouterModel(`/auth/confirm${frag({ token_hash: HASH, type: 'signup', redirect_to: CONF })}`);
    render(<AuthLinkBridge type="signup" browser={model} />);
    model.sync();
    fireEvent.press(screen.getByText('Open KwikServe'));
    expect(model.navigations).toEqual([`${CONF}?token_hash=${HASH}&type=signup`]);
    expect(model.current).toBe('/auth/confirm');
  });
});

describe('the token stays in memory only', () => {
  it('never reaches storage, the URL, the rendered output or the console', () => {
    const storage = { local: [] as string[], session: [] as string[] };
    const spyStorage = (target: Storage, sink: string[]) =>
      jest.spyOn(target, 'setItem').mockImplementation((key, value) => {
        sink.push(`${key}=${value}`);
      });
    const storages =
      typeof localStorage === 'undefined'
        ? []
        : [spyStorage(localStorage, storage.local), spyStorage(sessionStorage, storage.session)];
    const logs = [jest.spyOn(console, 'log'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'error'), jest.spyOn(console, 'info')].map(
      (spy) => spy.mockImplementation(() => {}),
    );

    const model = new RouterModel(`/auth/recovery${validRecovery}`);
    const view = render(<AuthLinkBridge type="recovery" browser={model} />);
    model.sync();
    fireEvent.press(screen.getByText('Open KwikServe'));

    expect(storage.local).toEqual([]);
    expect(storage.session).toEqual([]);
    expect(JSON.stringify(view.toJSON())).not.toContain(HASH);
    expect(model.entries.some(carriesToken)).toBe(false);
    expect(model.routerReplacements.some(carriesToken)).toBe(false);
    expect(model.rawClears.some(carriesToken)).toBe(false);
    for (const spy of logs) {
      for (const call of spy.mock.calls.flat()) {
        expect(typeof call === 'string' ? call : JSON.stringify(call) ?? '').not.toContain(HASH);
      }
    }
    // the app handoff is the only place the token may appear, in the app scheme, after an explicit press
    expect(model.navigations).toEqual([`${REC}?token_hash=${HASH}&type=recovery`]);

    [...logs, ...storages].forEach((spy) => spy.mockRestore());
  });
});
