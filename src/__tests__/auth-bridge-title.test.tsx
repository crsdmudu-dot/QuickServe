/**
 * auth-bridge-title.test.tsx — the web Auth bridge must never let the browser label its tab with
 * the emailed URL.
 *
 * Browsers fall back to the full URL — `#token_hash=…` fragment included — as the tab label when a
 * document's <title> is empty, and that label can reach history metadata, screenshots, tab sync and
 * crash reports. The bridge therefore renders one fixed, neutral title in every state, and the
 * bridge build refuses any prerendered document that does not carry exactly that title.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react-native';

import { AuthLinkBridge, type BridgeWindow } from '@/components/auth/auth-link-bridge';
import { AUTH_BRIDGE_DOCUMENT_TITLE } from '@/lib/auth-bridge-title';
import { documentTitleErrors } from '../../infra/qa-auth-bridge/build';

jest.mock('expo-router/head', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/lib/supabase', () => {
  throw new Error('the web bridge must never import the Supabase client');
});

// Synthetic, format-valid values only — never a real token or identity.
const SYNTHETIC_HASH = 'SYNTHETICtitletest' + '0'.repeat(32);
const REC = 'kwikserve://auth/recovery';
const CONF = 'kwikserve://auth/confirm';
const frag = (parts: Record<string, string>) => '#' + Object.entries(parts).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

type FakeBrowser = Omit<BridgeWindow, 'hash'> & { hash: string; search: string; cleared: string[]; navigated: string[] };

function fakeBrowser(hash: string, pathname: string): FakeBrowser {
  const b: FakeBrowser = {
    hash,
    search: '',
    pathname,
    cleared: [],
    navigated: [],
    replaceRoute() {},
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

/** Every <title> host element the bridge rendered, with its text content. */
function renderedTitles(): string[] {
  return screen.UNSAFE_root.findAll((node) => node.type === 'title').map((node) =>
    [node.props.children].flat().map((child) => String(child)).join(''),
  );
}

const STATES = [
  { name: 'valid recovery link', type: 'recovery' as const, path: '/auth/recovery', hash: frag({ token_hash: SYNTHETIC_HASH, type: 'recovery', redirect_to: REC }) },
  { name: 'valid signup link', type: 'signup' as const, path: '/auth/confirm', hash: frag({ token_hash: SYNTHETIC_HASH, type: 'signup', redirect_to: CONF }) },
  { name: 'invalid token type', type: 'signup' as const, path: '/auth/confirm', hash: frag({ token_hash: SYNTHETIC_HASH, type: 'magiclink', redirect_to: CONF }) },
  { name: 'foreign redirect_to', type: 'recovery' as const, path: '/auth/recovery', hash: frag({ token_hash: SYNTHETIC_HASH, type: 'recovery', redirect_to: 'https://evil.example/auth/recovery' }) },
  { name: 'no fragment at all', type: 'recovery' as const, path: '/auth/recovery', hash: '' },
];

describe('AUTH_BRIDGE_DOCUMENT_TITLE', () => {
  it('is exactly the neutral product name', () => {
    expect(AUTH_BRIDGE_DOCUMENT_TITLE).toBe('KwikServe');
  });

  it('can carry no URL, fragment, query, token, redirect or identity', () => {
    expect(AUTH_BRIDGE_DOCUMENT_TITLE.trim()).not.toBe('');
    expect(AUTH_BRIDGE_DOCUMENT_TITLE).not.toMatch(/[#?&=/:@]|token|redirect|recovery|confirm|signup|https?/i);
  });
});

describe('the bridge renders one fixed title in every state', () => {
  let logSpies: jest.SpyInstance[] = [];
  beforeEach(() => {
    logSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => jest.spyOn(console, level).mockImplementation(() => {}));
  });
  afterEach(() => logSpies.forEach((spy) => spy.mockRestore()));

  it.each(STATES)('$name: exactly one <title>, and it is exactly KwikServe', ({ type, path, hash }) => {
    render(<AuthLinkBridge type={type} browser={fakeBrowser(hash, path)} />);
    expect(renderedTitles()).toEqual([AUTH_BRIDGE_DOCUMENT_TITLE]);
  });

  it.each(STATES)('$name: the title is identical to every other state', ({ type, path, hash }) => {
    render(<AuthLinkBridge type={type} browser={fakeBrowser(hash, path)} />);
    const [title] = renderedTitles();
    expect(title).toBe('KwikServe');
  });

  it.each(STATES)('$name: no synthetic token text in the title, the rendered page or any log', ({ type, path, hash }) => {
    render(<AuthLinkBridge type={type} browser={fakeBrowser(hash, path)} />);
    for (const title of renderedTitles()) {
      expect(title).not.toContain(SYNTHETIC_HASH);
      expect(title).not.toMatch(/token_hash|redirect_to|#|\?/);
    }
    expect(JSON.stringify(screen.toJSON())).not.toContain(SYNTHETIC_HASH);
    for (const spy of logSpies) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(SYNTHETIC_HASH);
    }
  });

  it.each(STATES.filter((state) => state.hash !== ''))('$name: the fragment is still removed from the URL', ({ type, path, hash }) => {
    const browser = fakeBrowser(hash, path);
    render(<AuthLinkBridge type={type} browser={browser} />);
    expect(browser.cleared).toEqual([path]);
    expect(browser.hash).toBe('');
    expect(browser.navigated).toEqual([]); // still no automatic navigation
  });

  it('keeps the existing no-referrer and noindex meta tags beside the title', () => {
    render(<AuthLinkBridge type="recovery" browser={fakeBrowser('', '/auth/recovery')} />);
    const metas = screen.UNSAFE_root.findAll((node) => node.type === 'meta').map((node) => `${node.props.name}=${node.props.content}`);
    expect(metas).toEqual(expect.arrayContaining(['referrer=no-referrer', 'robots=noindex']));
  });
});

describe('documentTitleErrors — the bridge build refuses a document that could expose the link', () => {
  const doc = (head: string) => `<!DOCTYPE html><html><head>${head}<meta name="referrer" content="no-referrer"/></head><body></body></html>`;

  it('accepts the fixed title as Expo prerenders it', () => {
    expect(documentTitleErrors(doc('<title data-rh="true">KwikServe</title>'))).toEqual([]);
    expect(documentTitleErrors(doc('<title>KwikServe</title>'))).toEqual([]);
  });

  it('refuses the empty title the bridge used to prerender (the regression this fixes)', () => {
    expect(documentTitleErrors(doc('<title data-rh="true"></title>'))).toEqual([
      '<title> #1 is empty: browsers would label the tab with the full URL',
    ]);
    expect(documentTitleErrors(doc('<title>   </title>'))).toHaveLength(1);
  });

  it('refuses a document with no title at all', () => {
    expect(documentTitleErrors(doc(''))).toEqual(['has no <title> element: browsers would label the tab with the full URL']);
  });

  it.each([
    `https://links.example/auth/recovery#token_hash=${SYNTHETIC_HASH}&type=recovery`,
    `/auth/recovery#token_hash=${SYNTHETIC_HASH}`,
    `/auth/confirm?redirect_to=kwikserve%3A%2F%2Fauth%2Fconfirm`,
    'Reset your password',
    'KwikServe – invalid or expired link',
    'kwikserve',
  ])('refuses a URL-derived or state-derived title %#, without echoing it', (title) => {
    const errors = documentTitleErrors(doc(`<title data-rh="true">${title}</title>`));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/is not exactly the fixed bridge title/);
    expect(errors.join('\n')).not.toContain(SYNTHETIC_HASH);
    expect(errors.join('\n')).not.toContain(title);
  });

  it('refuses a second title, even if one of them is correct', () => {
    const errors = documentTitleErrors(doc('<title>KwikServe</title><title data-rh="true"></title>'));
    expect(errors).toContain('has 2 <title> elements; exactly one is allowed');
  });
});

describe('the fix is wired where it matters', () => {
  const root = join(__dirname, '..', '..');

  it('the bridge component renders the constant, never a computed title', () => {
    const source = readFileSync(join(root, 'src', 'components', 'auth', 'auth-link-bridge.tsx'), 'utf8');
    expect(source).toContain('<title>{AUTH_BRIDGE_DOCUMENT_TITLE}</title>');
    expect(source).not.toMatch(/document\.title\s*=/);
    expect(source.match(/<title>/g)).toHaveLength(1);
  });

  it('the bridge build checks every prerendered document before anything is kept', () => {
    const build = readFileSync(join(root, 'infra', 'qa-auth-bridge', 'build.ts'), 'utf8');
    const loop = build.slice(build.indexOf('for (const document of POLICY.documentPaths)'), build.indexOf('// Follow runtime chunk references'));
    expect(loop).toContain('documentTitleErrors(html)');
    expect(loop).toContain("does not carry the fixed bridge title");
  });

  it('the title module stays dependency-free so the plain-Node bridge build can import it', () => {
    const source = readFileSync(join(root, 'src', 'lib', 'auth-bridge-title.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).toMatch(/export const AUTH_BRIDGE_DOCUMENT_TITLE = 'KwikServe';/);
  });
});
