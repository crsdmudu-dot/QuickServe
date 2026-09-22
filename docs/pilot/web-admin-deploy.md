# KwikServe Web Admin — Deployment Guide

The admin portal is a **separate Expo application** at `apps/admin`. It is deployed to a
**Cloudflare Worker with Static Assets** named **`quickserve`**, which owns the existing admin URL.

> **Why this document was rewritten.** It previously described Vercel and Netlify and pointed at
> `src/app/(admin-web)/` and the repository-root `dist/`. None of that is true any more: the admin
> routes moved to `apps/admin`, and the root `dist/` is now the **consumer** export. The stale
> instructions were not merely out of date — following them would have deployed the wrong
> application to the admin URL.

## Topology

| | |
| --- | --- |
| Application source | `apps/admin` |
| Build output | `apps/admin/dist` |
| Cloudflare target | Worker `quickserve` (Workers with Static Assets, assets-only) |
| Configuration | `apps/admin/wrangler.jsonc` |
| Worker script | none — there is no `main`, no bindings, no runtime vars, no secrets |
| Backend | Supabase (unchanged; the Worker only serves files) |

There is deliberately **no Wrangler configuration at the repository root**. A bare `wrangler deploy`
there fails closed instead of publishing whatever `dist/` happens to contain. That matters because
the root `dist/` is reused by `expo export --platform android`, so it is frequently not even a web
bundle.

> ### ⚠️ If bare Wrangler offers to create a root configuration, CANCEL
>
> Running `wrangler deploy` from the repository root exits non-zero, but before it does it may offer
> to **scaffold a new `wrangler.jsonc`**, pre-filled with `Worker Name: quickserve` and
> `Output Directory: dist`. Accepting that prompt recreates precisely the misconfiguration this
> layout exists to prevent: the admin Worker pointed at the **consumer** export.
>
> **The operator must cancel the prompt and must never accept it.** Never commit a root
> `wrangler.jsonc`, `wrangler.json` or `wrangler.toml`.
> `src/__tests__/admin-deploy-target.test.ts` fails if one appears, but that is the last line of
> defence, not the first. Always deploy with `npm run deploy:admin`.

## Required environment variables (build-time, PUBLIC only)

| Variable | Source |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → **anon / public** key |

Both are **inlined by Expo at export time**. They must be present as Cloudflare **build**
variables; the Worker has no runtime environment, so setting them as runtime vars does nothing.

**Never** put a service-role key, a database URL or any secret in these. The admin portal
authenticates as a normal Supabase user and is authorised by RLS and `SECURITY DEFINER` RPCs.

## Build and deploy

```bash
npm ci                # from the repository ROOT — apps/admin has no node_modules of its own
npm run deploy:admin  # build → artifact check → deploy, in that order
```

`npm run deploy:admin` is the **only** supported manual deployment. It is guarded: it runs

1. `npm run build:admin` — exports the admin app to `apps/admin/dist`;
2. `npm run check:admin-artifact` — fails unless that freshly built output is unmistakably the
   **admin** app (admin route documents present, consumer-only documents absent, `_headers`
   shipped);
3. `wrangler deploy -c apps/admin/wrangler.jsonc` — the explicit, non-discovering deploy.

Because the stages are chained with `&&`, a failed shape check stops the deployment before
anything is uploaded. Do not run the three steps individually to work around a failure — a failing
check means the artifact is wrong, not that the check is.

The individual steps, if you need them for diagnosis only:

```bash
npm run build:admin          # -> apps/admin/dist
npm run check:admin-artifact # shape check on its own
```

`apps/admin` declares no dependencies and its Metro config resolves modules from the repository
root, so **every command must run from the repository root**. Setting a Cloudflare "root directory"
of `apps/admin` will fail.

Dry-run without deploying:

```bash
npx wrangler deploy -c apps/admin/wrangler.jsonc --dry-run --outdir <scratch-dir>
```

## Cloudflare settings (Workers Builds)

| Setting | Value |
| --- | --- |
| Root directory | `/` (repository root) |
| Build command | `npm run build:admin` |
| Deploy command | `npm run check:admin-artifact && npx wrangler deploy -c apps/admin/wrangler.jsonc` |
| Production branch | `main` |
| Build variables | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

Changing any of these is a production change and needs explicit authorisation.

## Routing

`app.json` sets `web.output: "static"`, so Expo emits one HTML document per route plus literal
dynamic-route files (for example `bookings/[id].html`) that no host can map to `/bookings/<id>`.
The Worker therefore uses:

- `not_found_handling: "single-page-application"` — an unmatched path returns `/index.html` with
  **200**, letting Expo Router's client-side matcher resolve dynamic and unknown routes.
- `html_handling: "drop-trailing-slash"`.

## Response headers

`apps/admin/public/_headers` ships with every export. It sets `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, a restrictive `Permissions-Policy`, `Referrer-Policy`, a global
`X-Robots-Tag: noindex` and `Cache-Control: public, max-age=0, must-revalidate`.

Two deliberate, documented gaps: the Content-Security-Policy is **Report-Only**, and **no HSTS**
header is sent. Both are tracked hardening items and each needs its own change.

Static-asset immutability is deliberately **not** claimed — the SPA fallback answers a missing
`/_expo/static/...` path with the HTML shell, so a long-lived cache rule there would let a browser
pin that fallback document to a hashed asset URL. Content-hashed filenames plus ETag revalidation
keep every deployment safe under the current policy.

## Post-deployment smoke checks

- [ ] `/login` returns 200 and renders the admin sign-in form.
- [ ] Signing in with an admin account reaches `/dashboard`.
- [ ] A deep link such as `/bookings/<id>` returns 200 and renders after a **hard refresh**.
- [ ] An unknown path returns the shell with 200, not a 404 page.
- [ ] Response headers include `X-Frame-Options: DENY` and `X-Robots-Tag: noindex`.
- [ ] `/home` and `/staff-notice` return the SPA fallback, **not** their own documents — if they
      render as real pages, the consumer app was deployed by mistake.
- [ ] No console errors referencing a missing Supabase URL or anon key.

## Rollback

Cloudflare Workers keeps previous versions. To roll back, open the `quickserve` Worker →
**Deployments**, select the last known-good version and promote it. This is a production action and
needs explicit authorisation.

Rolling back the repository alone does **not** roll back the deployment; a Workers Build must run,
or a version must be promoted.

## Guardrails

- `src/__tests__/admin-deploy-target.test.ts` — static proof that no root Wrangler config exists,
  that `apps/admin/wrangler.jsonc` targets `quickserve`, that its asset directory resolves to
  `apps/admin/dist`, that the SPA settings stay pinned, and that no package script runs an
  unqualified `wrangler deploy`.
- `scripts/check-admin-artifact.mjs` — run in PR CI immediately after the admin export; fails
  unless `apps/admin/dist` contains the admin route documents, ships `_headers`, and contains no
  consumer-only documents.
