/**
 * auth-bridge-intake.ts — read the emailed link's URL fragment ONCE, into memory only.
 *
 * Why this is a module and not component state: removing the fragment has to go through Expo
 * Router's navigation (see `AuthLinkBridge`), and that navigation gives the screen a new route key,
 * so React unmounts and mounts the bridge again. Component state would be destroyed by exactly the
 * step that cleans the URL, and the page would then show "invalid link" for a link that was fine.
 *
 * The capture therefore lives here, keyed by the browser object it was read from (a `WeakMap`, so
 * tests are isolated and nothing is retained beyond the page). It is memory only: never
 * localStorage, sessionStorage, cookies, a query parameter, a log or a network request. It lives
 * exactly as long as the document does; a refresh starts over with a URL that no longer has the
 * fragment, which is why a refreshed page correctly shows the invalid state.
 */
import { parseAuthBridgeFragment, type BridgeLink } from '@/lib/auth-bridge';
import type { AuthLinkType } from '@/lib/auth-links';

/** The minimal browser surface the bridge uses, injectable for tests. */
export type BridgeWindow = {
  /** `window.location.hash`, read once. */
  readonly hash: string;
  /** `window.location.pathname` — the only value ever written back to the URL. */
  readonly pathname: string;
  /** Expo Router's navigation (`router.replace`): the router's own removal of the fragment. */
  replaceRoute(path: string): void;
  /** `history.replaceState` — the closing assertion, never the primary mechanism. */
  clearFragment(path: string): void;
  /** Open the app (custom scheme), only on an explicit user action. */
  navigate(url: string): void;
};

export type BridgeIntake = {
  readonly link: BridgeLink;
  /** True when the page was opened with a fragment, whatever it contained. */
  readonly hadFragment: boolean;
};

const captured = new WeakMap<BridgeWindow, Map<AuthLinkType, BridgeIntake>>();

/** Intakes whose removal has already been asked for; kept here, not on the record the UI holds. */
const removalClaimed = new WeakSet<BridgeIntake>();

const NO_FRAGMENT: BridgeIntake = Object.freeze({
  link: { ok: false, reason: 'missing' } as BridgeLink,
  hadFragment: false,
});

/**
 * The parsed link for this page load. The fragment is read on the first call only; every later
 * call (including the one after the router remounts the screen) returns the same record.
 */
export function captureAuthBridgeIntake(type: AuthLinkType, browser: BridgeWindow | null | undefined): BridgeIntake {
  if (!browser) return NO_FRAGMENT; // static render / no DOM: nothing to read, nothing to remove
  let byType = captured.get(browser);
  if (!byType) {
    byType = new Map<AuthLinkType, BridgeIntake>();
    captured.set(browser, byType);
  }
  const existing = byType.get(type);
  if (existing) return existing;
  const hash = browser.hash ?? '';
  const intake: BridgeIntake = Object.freeze({
    link: parseAuthBridgeFragment(hash, type),
    hadFragment: hash.length > 0,
  });
  byType.set(type, intake);
  return intake;
}

/**
 * True exactly once per captured link: the caller owns removing the fragment. The claim is held
 * here rather than on the intake record, so the component never modifies a value a hook returned,
 * and so the remount caused by the router navigation cannot start a second navigation.
 */
export function claimFragmentRemoval(intake: BridgeIntake): boolean {
  if (!intake.hadFragment || removalClaimed.has(intake)) return false;
  removalClaimed.add(intake);
  return true;
}
