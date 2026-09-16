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
| `worker.ts` | The fail-closed request policy (runs before the assets system) — used by **both** targets |
| `build.ts` | Placeholder-configured export → pruned `dist-qa-auth/` + `.qa-auth-bridge-manifest.json` |
| `pages-build.ts` | Packaging of the same worker and the same bytes for Cloudflare **Pages** |
| `pages-wrangler.jsonc` | The **Pages** project configuration (`kwikserve-auth-qa-bridge`), as a template copied into the build workspace |
| `../../wrangler.qa-auth.jsonc` | **Workers** target (separate Worker, `run_worker_first`, no secrets) — live, and the rollback |

Tests: `src/__tests__/qa-auth-bridge-worker.test.ts`, `qa-auth-bridge-build.test.ts`,
`qa-auth-bridge-pages-build.test.ts` and `qa-auth-bridge-pages-parity.test.ts` all run in the
ordinary `npm test` / PR CI path.

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

## The Cloudflare Pages target (second target, same bridge)

The Workers origin can only be reached at `https://quickserve-auth-qa.<subdomain>.workers.dev`,
because attaching a custom hostname to a Worker needs the DNS zone on Cloudflare.
`hiredcorp.co.ke` is on external nameservers. **Cloudflare Pages can attach a custom domain whose
zone is managed elsewhere, by CNAME**, so a Pages target is what allows the emailed authentication
links to sit on a `hiredcorp.co.ke` hostname without moving the zone. That is the only reason this
target exists — the request policy is unchanged.

### It is the same worker and the same bytes

`pages-build.ts` is packaging only. It adds no policy of its own:

- The `_worker.js` it writes is `worker.ts` bundled with esbuild — the **same module** the live
  Workers target deploys, with the runtime half of `policy.json` inlined (see below).
- The assets it deploys are copied from `dist-qa-auth/` **after** verifying every file against
  `.qa-auth-bridge-manifest.json` by SHA-256, so the Pages origin can only ever serve bytes that
  were already certified for the Workers origin.
- `qa-auth-bridge-pages-parity.test.ts` runs one request matrix against both targets and fails if
  any status, body, response header or assets-binding call differs.

### What was verified before it was written

Against the current Cloudflare Pages documentation and the **installed Wrangler 4.131.1**:

| Question | Answer used here |
| --- | --- |
| Advanced-mode output structure | A `_worker.js` in the build output directory. Pages then routes every request to it and **ignores `functions/` entirely** — the equivalent of `run_worker_first: true`. Wrangler also supports a `_worker.js/` **directory** whose entry point is `index.js` and whose sibling `**/*.js` / `**/*.mjs` files upload as additional modules. |
| How module imports are bundled | Wrangler bundles `_worker.js` with esbuild by default. In the directory form, sibling modules are marked *external* and uploaded alongside the entry point rather than inlined; with `--no-bundle`, importing another file from `_worker.js` is refused outright. This build therefore **pre-bundles to a single file**: one hashable artifact, no runtime module resolution, no dependency on which form Wrangler is in. Pages does **not** read `_worker.ts`, which is why a JS bundle is produced at all. |
| How `env.ASSETS.fetch()` resolves pretty paths | `env.ASSETS` is the default Pages binding — the same name the Workers target binds, so `worker.ts` needs no change. Pages serves an HTML file at its extension-less path, so `ASSETS.fetch('/auth/recovery')` returns `auth/recovery.html`; `/auth/recovery.html` and `/auth/recovery/` are *redirects*, and the worker's allow-list refuses both before the binding is reached. |
| Special files uploaded but never served | `_worker.js`, `_redirects`, `_headers`, `_routes.json` and `functions` (Wrangler's upload ignore list). They are deployment inputs, outside the public asset namespace. The worker's allow-list refuses them too, so the internals are unreachable by two independent mechanisms. |
| Attaching an externally managed DNS subdomain | Create the custom domain **in the Pages project first**, then add a `CNAME` at the external provider pointing the subdomain at `<project>.pages.dev`. Adding the CNAME first yields a `522`. An **apex** domain cannot be attached this way — it requires the zone to be on Cloudflare — which is another reason the proposal is a subdomain. |
| Where the Pages config may live | **Not at the repository root under its own name.** `wrangler pages dev\|deploy -c <path>` is refused outright: *"Pages does not support custom paths for the Wrangler configuration file."* With no `-c`, the Pages commands read the root `wrangler.jsonc` — the **Production** Worker — and the root `.env`; both were observed happening. Hence the deployment workspace below. |

Two Pages-specific behaviours are handled explicitly, because the Workers target configures them
and Pages does not expose them:

- **No `not_found_handling`.** Pages assumes a single-page application and falls back to `/` when
  there is no top-level `404.html`. The build therefore writes a minimal `404.html` and refuses to
  deploy an `index.html`, so the assets binding can never answer `200` for a path the worker did
  not mean. (`/404` and `/404.html` are still refused by the allow-list.)
- **Only the runtime half of `policy.json` is deployed.** `worker.ts` reads five fields; the rest
  is build-only (the placeholder Supabase configuration, the credential-scan patterns). Inlining
  the whole file would put the scan's own patterns (`service_role`, `sbp_`, …) verbatim into a
  deployable file — and trip the scan. A test asserts the deployed subset is exactly the set of
  fields the worker source reads, so it cannot drift.

### The deployment workspace

Because the Pages commands insist on finding a standard `wrangler.jsonc` by searching upward from
the working directory, the build writes a **self-contained workspace** and the Pages commands are
run from inside it:

```
<workspace>/
  wrangler.jsonc      ← ./pages-wrangler.jsonc, copied verbatim; the only config Wrangler finds
  origin/             ← the uploaded build output
    _worker.js        ← worker.ts, bundled
    404.html          ← disables the single-page-application fallback
    auth/recovery.html  auth/confirm.html  favicon.ico  _expo/static/…
```

`wrangler.jsonc` sits **outside** `origin/`, so it can never be uploaded as an asset.

Build the workspace **outside the repository working tree**. This was verified, not assumed: run
from `dist-qa-auth-pages/` inside the repository, Wrangler still resolved the repository root as the
project root — it loaded `../.env` and the Production Worker's `assets.directory: ./dist`, and
failed. Built to a directory outside the tree, the same workspace started cleanly with **no `.env`
bindings at all**.

### Build and certify locally

```bash
node infra/qa-auth-bridge/build.ts                        # Workers target: dist-qa-auth/ + manifest
node infra/qa-auth-bridge/pages-build.ts --out <outside-the-repo>
cd <outside-the-repo>
npx wrangler pages dev --port 8788 --ip 127.0.0.1                          # serve mode
npx wrangler pages dev --binding BRIDGE_MODE=deny --port 8789 --ip 127.0.0.1   # deny-all rollback
```

`pages-build.ts` refuses to run before `build.ts` has produced a certified manifest, aborts on any
drift between `dist-qa-auth/` and that manifest, validates `pages-wrangler.jsonc` before copying it,
and removes the whole workspace if the credential scan, the layout check or the bundle structure
check fails. It writes `.qa-auth-bridge-pages-manifest.json` (SHA-256 per file, plus the public path
Pages would serve each file at, or `null` where Pages serves none).

Omitting `--out` builds into `dist-qa-auth-pages/` (git-ignored) for inspection; that location is
fine for reading the manifest, but not for running the Pages commands, for the reason above.

### Certified locally against the real Pages runtime

`wrangler pages dev` on the workspace above ran the whole matrix through Pages' own asset server and
advanced-mode loader, not a mock: `/auth/recovery` and `/auth/confirm` 200 with all six hardened
headers and the enforced CSP (report-only CSP absent); the served document byte-identical to its
manifest SHA-256; the four generated assets and `/favicon.ico` 200; `HEAD` 200 with no body; every
other method 405 with `Allow: GET, HEAD`; each sensitive query key 400; a harmless `?error=…` still
200; `/`, `/index.html`, `/home`, `/admin`, `/sitemap.xml`, `/_headers`, `/_redirects`,
`/_routes.json`, `/_worker.js`, `/404`, `/404.html`, `/policy.json`, `/wrangler.jsonc`,
`/auth`, `/auth/`, `/auth/recovery/`, `/auth/recovery.html`, `/assets/icon.png` and
`/_sitemap.html` all 404; a generated-asset path that does not exist 404 rather than falling back to
a document; and with `BRIDGE_MODE=deny`, every route 404.

### Proposed QA custom hostname — NOT YET CREATED

```
links.auth-qa.hiredcorp.co.ke        →  CNAME  →  <project>.pages.dev
```

**No DNS record exists for this name, no Pages project has been created, and nothing has been
requested from the DNS provider.** It is a proposal only. `hiredcorp.co.ke` is served by external
nameservers (`cs21`/`cs22.rcnoc.com`), so the record would be created there, and only *after* the
custom domain has been added in the Pages project.

#### Correction to the earlier DNS record

An earlier note treated a CNAME as excluding records across a whole subtree. That is wrong.
**A CNAME's exclusivity applies at its exact owner name, not to descendant names.** A name that
owns a CNAME may own no other record type *at that same name* (RFC 1034 §3.6.2, RFC 2181 §10.1);
names *below* it are unaffected and can carry any records, and a CNAME at a child name places no
constraint on its parent. So `auth-qa.hiredcorp.co.ke` carrying sending-domain records (MX, SPF,
DKIM, DMARC) would **not** have been blocked by a CNAME at a child, and vice versa.

The recommendation to use the `links.auth-qa.hiredcorp.co.ke` leaf **stands**, on its own merits
rather than on that mistaken constraint: it is a childless name, so the CNAME there is
unambiguously safe under the rule above, and it keeps web routing separate from the owner name that
carries the email-sending records. One name, one job — the web hostname can be repointed or
withdrawn without touching mail delivery, and neither change can collide with the other.

## Deployment of the Pages target (separate authorisation required)

Not authorised. When it is, the gate is the same shape as the Workers one, and the **Workers origin
stays deployed throughout** as the rollback:

1. Build fresh: `node infra/qa-auth-bridge/build.ts`, then
   `node infra/qa-auth-bridge/pages-build.ts --out <outside-the-repo>`. Keep both manifests.
2. Create the Pages project by hand, named **exactly `kwikserve-auth-qa-bridge`** (direct upload,
   no Git integration, no build command). The name is not a free choice: `wrangler pages deploy`
   takes it from the `name` in the workspace `wrangler.jsonc`, which is copied verbatim from
   `pages-wrangler.jsonc`, which `pages-build.ts` refuses to copy unless it matches
   `policy.json` → `pages.projectName`. Create any other name and the deploy will not find it.
   Then deploy **from the workspace**, never from the repository root:

   ```bash
   cd <outside-the-repo>
   CLOUDFLARE_ACCOUNT_ID=<account> WRANGLER_SEND_METRICS=false npx wrangler pages deploy
   ```
3. Re-run the certification matrix against the `*.pages.dev` deployment and compare every served
   file to `.qa-auth-bridge-pages-manifest.json`.
4. Only then add the custom domain in the Pages project, and only then ask the DNS provider for the
   CNAME. Verify the hostname serves the same matrix before any Supabase `Site URL` is changed.
5. Revoke the token.

Rollback for this target: set the project variable `BRIDGE_MODE` to anything other than `serve` and
redeploy (every route 404s), or delete the custom domain, or delete the deployment. The Supabase QA
`Site URL` must be pointed back at the Workers origin before the Pages origin is withdrawn.

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
