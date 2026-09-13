# Isolated QA authentication-bridge origin

`quickserve-auth-qa` is a **separate Cloudflare Worker** that exists so Supabase QA has an HTTPS
`Site URL` to put in recovery and confirmation emails, without exposing the rest of the application.

It serves exactly two documents — `/auth/recovery` and `/auth/confirm` — plus the generated assets
they need. Everything else 404s. It is **not** the Production Worker (`quickserve`, configured by
`wrangler.jsonc` and deployed automatically by Workers Builds from `main`), and it is never
deployed automatically.

| File | Role |
| --- | --- |
| `policy.json` | Single source of truth: served paths, refused query parameters, enforced CSP, build guards |
| `worker.ts` | The fail-closed request policy (runs before the assets system) |
| `build.ts` | Placeholder-configured export → pruned `dist-qa-auth/` + `.qa-auth-bridge-manifest.json` |
| `../../wrangler.qa-auth.jsonc` | Deployment target (separate Worker, `run_worker_first`, no secrets) |

Tests: `src/__tests__/qa-auth-bridge-worker.test.ts` and `src/__tests__/qa-auth-bridge-build.test.ts`
run in the ordinary `npm test` / PR CI path.

## Why the origin holds no credential

The bridge pages make no Supabase request: they read the one-time token hash from the URL
**fragment** (never sent to a server), and hand it to the app. So the export is built with the CI
**placeholder** Supabase configuration, and the build aborts if any project credential, foreign
Supabase host or credential-shaped token appears in a kept file.

## Request policy

| Request | Result |
| --- | --- |
| `GET`/`HEAD` `/auth/recovery`, `/auth/confirm` | 200, `no-store`, `no-referrer`, `noindex, nofollow`, enforced CSP |
| `GET`/`HEAD` the built `/_expo/static/(js/web\|css)/…` files, `/favicon.ico` | 200, same hardening |
| Any other path (`/`, `/signin`, admin routes, `…/`, `….html`, `/assets/*`) | 404 |
| Any method other than `GET`/`HEAD` | 405, `Allow: GET, HEAD` |
| Any query string carrying a credential-shaped key (`token_hash`, `code`, …) | 400, never forwarded, never echoed |
| Anything, while `BRIDGE_MODE` ≠ `serve` | 404 (deny-all rollback) |

The enforced CSP is `default-src 'none'` with `connect-src 'none'`: the page cannot make any network
request at all. The app shell's two boot-time calls (NetInfo's reachability probe and the services
catalogue) are blocked by design and handled by the app.

## Build and certify locally

```bash
node infra/qa-auth-bridge/build.ts          # fresh export + prune + credential scan + manifest
npx wrangler dev -c wrangler.qa-auth.jsonc --port 8787 --ip 127.0.0.1
npx wrangler dev -c wrangler.qa-auth.jsonc --var BRIDGE_MODE:deny --port 8787 --ip 127.0.0.1
npx wrangler deploy -c wrangler.qa-auth.jsonc --dry-run --outdir <scratch>
```

`--reuse-export` skips the export while iterating; it records `freshExport: false` in the manifest,
and a deployment must be built without it.

## Deployment (separate authorisation required)

Never run `npm run deploy:web` while a Cloudflare token is present: that command targets the
**Production** Worker.

1. Create a token in the Cloudflare dashboard by hand: *Account → Workers Scripts → Edit* on the one
   account, short expiry. Cloudflare cannot scope a token to a single Worker, so this token could
   also edit `quickserve`; the expiry, the `-c wrangler.qa-auth.jsonc` flag and the absence of
   `dist/` are the compensating controls.
2. Build fresh, run the local certification matrix, and keep the manifest.
3. Deploy with the token supplied in-process only (never on the command line, never in a file):

   ```bash
   CLOUDFLARE_ACCOUNT_ID=<account> WRANGLER_SEND_METRICS=false \
     npx wrangler deploy -c wrangler.qa-auth.jsonc
   ```

4. Re-run the certification matrix against the deployed `https://quickserve-auth-qa.<subdomain>.workers.dev`
   and compare every served file to `.qa-auth-bridge-manifest.json`.
5. Revoke the token.

## Rollback

Prefer closing the origin over deleting it, so version history survives:

```bash
npx wrangler deploy -c wrangler.qa-auth.jsonc --var BRIDGE_MODE:deny   # every route 404s
npx wrangler rollback --name quickserve-auth-qa                        # previous version
npx wrangler deployments list --name quickserve-auth-qa                # what is live
```

Setting `workers_dev` to `false` and redeploying removes the hostname entirely. `wrangler delete`
is a last resort and destroys version history. If the Supabase QA `Site URL` already points here,
restore the Supabase configuration snapshot first.
