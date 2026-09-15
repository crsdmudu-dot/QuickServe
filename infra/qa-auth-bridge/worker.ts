/**
 * worker.ts — the isolated QA authentication-bridge Worker (`quickserve-auth-qa`).
 *
 * Purpose: expose ONLY the two emailed-link landing documents of the web export
 * (`/auth/recovery`, `/auth/confirm`) and the exact generated assets they reference, on a QA-only
 * origin, so Supabase can use that origin as its QA Site URL. Nothing else about the application
 * is reachable, and the origin is built from a placeholder configuration, so it carries no project
 * credential of any kind.
 *
 * Deployment is a separate, individually authorised gate. This Worker is deployed with
 * `wrangler.qa-auth.jsonc` against the pruned directory produced by `build.js`; it is never part
 * of the Production Worker (`wrangler.jsonc`), which stays assets-only.
 *
 * Policy (single source of truth: ./policy.json, shared with the build script):
 *   1. `BRIDGE_MODE` other than "serve" (or unset) → every request 404. This is the deny-all
 *      rollback switch: one redeploy closes the origin without deleting the Worker.
 *   2. Only GET and HEAD are answered; anything else is 405 with `Allow: GET, HEAD`.
 *   3. A request carrying a sensitive credential-shaped query parameter is refused with 400 and
 *      never forwarded to the assets binding. The emailed link keeps its one-time token hash in
 *      the URL *fragment*, which browsers never send, so a token in the query string means a
 *      malformed or hostile link, not a legitimate one.
 *   4. The path must be an exact bridge document, an exact generated-asset path, or the favicon.
 *      Everything else fails closed, without touching the assets binding at all.
 *   5. Only a 200 from the assets binding is forwarded; redirects and errors become the same
 *      neutral 404.
 *   6. Every response is uncacheable, referrer-free, unindexed and served under an enforced CSP
 *      that forbids all network access from the page (`connect-src 'none'`).
 *
 * The Worker never logs, never reads the request body, never inspects cookies and never contacts
 * any origin other than its own assets binding.
 */
import policy from './policy.json';

/** The Cloudflare Static Assets binding (the only capability this Worker holds). */
export type BridgeAssets = { fetch(request: Request): Promise<Response> };

export type BridgeEnv = {
  ASSETS: BridgeAssets;
  /** "serve" (or unset) serves the bridge; any other value closes the origin. */
  BRIDGE_MODE?: string;
};

const DOCUMENT_PATHS: ReadonlySet<string> = new Set(policy.documentPaths);
const EXTRA_PATHS: ReadonlySet<string> = new Set(policy.extraPaths);
const ASSET_PATH = new RegExp(policy.assetPathPattern);
const SENSITIVE_QUERY_KEYS: ReadonlySet<string> = new Set(policy.sensitiveQueryKeys.map((key) => key.toLowerCase()));

/** Applied to every response, including refusals. */
const HARDENED_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': policy.contentSecurityPolicy,
};

function refuse(status: number, message: string, method: string, extra?: Record<string, string>): Response {
  return new Response(method === 'HEAD' ? null : message, {
    status,
    headers: { ...HARDENED_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...extra },
  });
}

function isAllowedPath(pathname: string): boolean {
  return DOCUMENT_PATHS.has(pathname) || EXTRA_PATHS.has(pathname) || ASSET_PATH.test(pathname);
}

function hasSensitiveQuery(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) return true;
  }
  return false;
}

export default {
  async fetch(request: Request, env: BridgeEnv): Promise<Response> {
    const { method } = request;

    // 1. Deny-all rollback: anything other than an explicit "serve" closes the origin.
    if ((env.BRIDGE_MODE ?? 'serve') !== 'serve') return refuse(404, 'Not Found', method);

    // 2. Read-only surface.
    if (method !== 'GET' && method !== 'HEAD') {
      return refuse(405, 'Method Not Allowed', method, { Allow: 'GET, HEAD' });
    }

    const url = new URL(request.url);

    // 3. Credential-shaped query parameters are refused, never forwarded, never echoed.
    if (hasSensitiveQuery(url.searchParams)) return refuse(400, 'Bad Request', method);

    // 4. Exact allow-list.
    if (!isAllowedPath(url.pathname)) return refuse(404, 'Not Found', method);

    // 5. Fetch the canonical path only: the query string is not passed on.
    const asset = await env.ASSETS.fetch(
      new Request(`${url.origin}${url.pathname}`, { method, headers: request.headers }),
    );
    if (asset.status !== 200) return refuse(404, 'Not Found', method);

    // 6. Harden the asset response: the export's report-only CSP is replaced by an enforced one.
    const headers = new Headers(asset.headers);
    headers.delete('Content-Security-Policy-Report-Only');
    for (const [name, value] of Object.entries(HARDENED_HEADERS)) headers.set(name, value);

    return new Response(method === 'HEAD' ? null : asset.body, { status: 200, headers });
  },
};
