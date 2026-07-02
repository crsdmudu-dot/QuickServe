# QuickServe Web Admin — Deployment Guide

**Slice:** 19 (Web Admin Polish + Deployment)
**Related docs:** [web-admin-release.md](web-admin-release.md) · [backend-readiness.md](backend-readiness.md)

---

## Overview

The QuickServe web admin panel is a **static single-page application (SPA)** built with Expo Router.

- Build command: `npx expo export --platform web`
- Output: `dist/` directory (static HTML + JS assets, ready for any CDN or static host)
- `app.json` sets `web.output = "static"`, so the Expo bundler emits a fully pre-rendered static bundle.
- The panel is **admin-role-gated** — the `(admin-web)/_layout.tsx` guard checks `role === 'admin'` from the `profiles` table before rendering any admin screen.
- It is **completely separate** from the mobile apps (Android / iOS). No app-store submission is involved.

Routes live under `src/app/(admin-web)/`. The route-group prefix is stripped from the browser URL by Expo Router, so the deployed site serves paths like `/`, `/login`, `/bookings`, `/providers/:id`, etc.

---

## Required environment variables (build-time, PUBLIC)

Both variables must be available **before** the export command runs — they are baked into the JS bundle at build time.

| Variable | Where to find it |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → **anon / public** key |

> **Security note:** Use the **anon (public) key only** — NEVER a service-role key in the web bundle.
> Row Level Security (RLS) is the data boundary. The `is_admin()` helper (defined in migration
> `0003_admin_dispatch.sql`) gates every admin RLS policy. No elevated key belongs in a browser-side bundle.

Set them in `.env.local` (git-ignored) for local builds, or via your CI/CD environment-variable settings for hosted deploys. See `.env.example` for the full variable list — only the two `EXPO_PUBLIC_*` variables are needed for the web build.

---

## Build

```bash
# 1. Copy the example env file and fill in the two required values.
cp .env.example .env.local
# Edit .env.local: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY

# 2. Run the static export.
npx expo export --platform web
```

Output directory: `dist/` — serve it from any static host or CDN.

---

## Vercel (primary)

`vercel.json` is committed at the repo root. It configures:

- **`buildCommand`:** `npx expo export --platform web`
- **`outputDirectory`:** `dist`
- **`rewrites`:** `/(.*) → /` — SPA fallback so every deep link (e.g. `/bookings/123`, `/providers`) resolves to the client router instead of a 404.

### Steps

1. Connect the GitHub repo in the [Vercel dashboard](https://vercel.com/new) (or run `npx vercel` / `vercel --prod` from the repo root).
2. In **Project Settings → Environment Variables**, add:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Trigger a deploy (push to the connected branch, or click **Redeploy**).
4. (Optional) Add a custom domain in **Project Settings → Domains** — Vercel provisions HTTPS automatically.

Subsequent pushes to the connected branch deploy automatically. The SPA rewrite in `vercel.json` handles all deep links.

---

## Netlify (alternative)

Do **not** commit a `netlify.toml` unless you actively use Netlify — the file below is shown for reference only.

```toml
[build]
  command = "npx expo export --platform web"
  publish = "dist"

[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200
```

The `[[redirects]]` block is the SPA fallback equivalent to the Vercel rewrite.

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in **Site settings → Environment variables** in the Netlify dashboard.

---

## Generic static host (alternative)

Any static or CDN host works:

- **Cloudflare Pages:** set build command + output directory; add env vars; Pages applies a default SPA fallback.
- **AWS S3 + CloudFront:** upload `dist/` to an S3 bucket; create a CloudFront error-page rule that maps 404 → `index.html` with status 200.
- **nginx:** `try_files $uri /index.html;` in the server block.
- **Apache:** `FallbackResource /index.html` in `.htaccess`.

**The SPA fallback (all unknown paths → `index.html`) is required.** Without it, reloading any deep link returns a 404.

Set the two `EXPO_PUBLIC_*` env vars at build time (CI environment or local `.env.local`).

---

## Deployment checklist

- [ ] `EXPO_PUBLIC_SUPABASE_URL` set (anon key only — no service-role key).
- [ ] `EXPO_PUBLIC_SUPABASE_ANON_KEY` set (anon key only — no service-role key).
- [ ] `npx expo export --platform web` completes locally without errors.
- [ ] SPA fallback configured on the host (Vercel: handled by `vercel.json`; others: see above).
- [ ] Admin account exists and is promoted in Supabase (see [backend-readiness.md](backend-readiness.md) — create the user in Auth → Users, then set `role = 'admin'` and `approval_status = 'approved'` in `public.profiles`).
- [ ] Login verified on the deployed URL: navigate to `/login`, sign in with admin credentials, dashboard loads.
- [ ] Deep link verified: open `/bookings` directly in the browser (new tab / address bar) — table loads without a 404.
- [ ] Page titles visible in the browser tab.
- [ ] Non-admin account blocked: sign in with a customer/provider account → "Not authorized" screen; no admin data visible.

---

## Rollback

The web admin panel has no schema or data changes — rollback is safe and instant.

1. **Disable the hosted deployment:** in Vercel, open the project → **Deployments** → select the previous build → **Promote to Production** (or simply delete/pause the project to take it fully offline).
2. **Netlify / other hosts:** redeploy the previous build from deployment history, or delete the site.
3. **Drop the Vercel config:** `git revert <vercel.json-commit-sha>` removes `vercel.json` from the repo; Vercel will stop using the custom config on the next deploy.
4. **No database rollback needed:** zero migrations were added or modified in this task. The mobile apps and existing database are unaffected.

See [web-admin-release.md](web-admin-release.md) for the full Slice 18 rollback procedure and the admin login flow reference.
