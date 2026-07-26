import { type Page, type Route, type Request } from '@playwright/test';

/**
 * rpc-interceptor.ts — the shared core for strict Supabase-RPC interception.
 *
 * The Executive and Detailed analytics stub modules share identical plumbing: a
 * catch-all that records unexpected analytics RPCs, per-RPC routes that record the
 * call + captured params + validate the request shape, and a tracker exposing
 * called/unexpected/badShape + assertions. Only the RPC set, the shape rules, and
 * the response payloads differ — those stay per-suite and are injected here.
 *
 * This is a small primitive, NOT a framework: it owns the bookkeeping, the suite
 * owns its data. Consumers: `analytics-stubs.ts`, `detailed-analytics-stubs.ts`.
 * The pure `createRpcTrackerState()` is also unit-tested by the framework health-tests.
 */

/** Captured request parameters. Known analytics keys are typed; extras are allowed. */
export type RpcParams = {
  p_from?: string;
  p_to?: string;
  p_bucket?: string;
  p_limit?: number;
  [key: string]: unknown;
};

export type RpcTracker = {
  /** RPC names actually requested (in order; a name repeats once per re-fetch). */
  readonly called: string[];
  /** RPC names requested that were not in the known set. */
  readonly unexpected: string[];
  /** Requests that failed shape validation, each a diagnostic string. */
  readonly badShape: string[];
  /** Throws if any unexpected RPC or bad-shaped request occurred. */
  assertNoAnomalies(): void;
  /** Throws naming any RPC in `required` that was never requested. */
  assertCalled(required: readonly string[]): void;
  /** The most recent captured params for `rpc`, or undefined. */
  lastParamsFor(rpc: string): RpcParams | undefined;
};

/** Internal mutable view (recording methods hidden behind the `RpcTracker` return type). */
type MutableRpcTracker = RpcTracker & {
  recordCalled(rpc: string, params: RpcParams | null): void;
  recordUnexpected(rpc: string): void;
  recordBadShape(detail: string): void;
};

/**
 * Pure tracker state (no browser). Extracted so the assertion/recording logic is
 * unit-testable and so each `createRpcInterceptor` install gets isolated state.
 */
export function createRpcTrackerState(): MutableRpcTracker {
  const called: string[] = [];
  const unexpected: string[] = [];
  const badShape: string[] = [];
  const paramsByRpc = new Map<string, RpcParams[]>();

  return {
    called,
    unexpected,
    badShape,
    recordCalled(rpc, params) {
      called.push(rpc);
      if (params) {
        const list = paramsByRpc.get(rpc) ?? [];
        list.push(params);
        paramsByRpc.set(rpc, list);
      }
    },
    recordUnexpected(rpc) {
      unexpected.push(rpc);
    },
    recordBadShape(detail) {
      badShape.push(detail);
    },
    assertNoAnomalies() {
      if (unexpected.length > 0) {
        throw new Error(`Unexpected RPC(s) requested: ${unexpected.join(', ')}`);
      }
      if (badShape.length > 0) {
        throw new Error(`RPC request(s) failed shape validation:\n  - ${badShape.join('\n  - ')}`);
      }
    },
    assertCalled(required) {
      const missing = required.filter((r) => !called.includes(r));
      if (missing.length > 0) {
        throw new Error(`Expected RPC(s) were never requested: ${missing.join(', ')}`);
      }
    },
    lastParamsFor(rpc) {
      const list = paramsByRpc.get(rpc);
      return list && list.length > 0 ? list[list.length - 1] : undefined;
    },
  };
}

/** `POST <supabase>/rest/v1/rpc/<name>` → `<name>`. */
export function rpcNameFromUrl(url: string): string {
  return new URL(url).pathname.split('/rpc/')[1] ?? '';
}

/** Fulfill a route with a JSON array/object body, optionally after a delay. */
export async function respondJson(route: Route, rows: unknown, delayMs?: number): Promise<void> {
  if (delayMs && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
}

/**
 * Abort a route at the network level (optionally after a delay). The app's analytics
 * wrappers convert this into safe defaults (they never throw), which is how the
 * suites drive graceful degradation.
 */
export async function abortRoute(route: Route, delayMs?: number): Promise<void> {
  if (delayMs && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  await route.abort('failed');
}

export type RpcInterceptorOptions = {
  /** Catch-all pattern that identifies the RPC family (e.g. /\/rest\/v1\/rpc\/analytics_/). */
  prefixRegex: RegExp;
  /** The known RPC names to install specific, validated handlers for. */
  rpcs: readonly string[];
  /** Per-request shape validation → list of problems (empty ⇒ well-shaped). */
  validate: (req: Request, rpc: string) => string[];
  /** Suite-owned responder for a matched RPC. */
  respond: (route: Route, rpc: string) => Promise<void>;
};

/**
 * Install strict RPC interception on `page` and return the tracker.
 * Call BEFORE navigating. Register AFTER any session mock so these specific
 * analytics routes take priority over a general REST catch-all.
 */
export async function createRpcInterceptor(
  page: Page,
  opts: RpcInterceptorOptions,
): Promise<RpcTracker> {
  const tracker = createRpcTrackerState();
  const known = new Set<string>(opts.rpcs);

  // Catch-all (registered first → lowest priority): records any family RPC not
  // covered by a specific handler as unexpected.
  await page.route(opts.prefixRegex, async (route) => {
    const name = rpcNameFromUrl(route.request().url());
    if (!known.has(name)) tracker.recordUnexpected(name);
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  // Specific handlers (registered later → higher priority).
  for (const rpc of opts.rpcs) {
    await page.route(`**/rest/v1/rpc/${rpc}`, async (route) => {
      const req = route.request();
      let body: RpcParams | null = null;
      try {
        body = req.postDataJSON() as RpcParams | null;
      } catch {
        body = null;
      }
      tracker.recordCalled(rpc, body);
      const problems = opts.validate(req, rpc);
      if (problems.length > 0) {
        tracker.recordBadShape(`${rpc} (${problems.join(', ')}; body=${JSON.stringify(body)})`);
      }
      await opts.respond(route, rpc);
    });
  }

  return tracker;
}
