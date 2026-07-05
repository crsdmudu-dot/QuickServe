# QuickServe Public Marketing Website — Verification & Deployment Guide

**Slice:** 30 (Public Marketing Website — Standalone Next.js)
**Branch:** `feat/slice-30-website`
**Related docs:** [web-admin-deploy.md](web-admin-deploy.md) · [production-readiness.md](production-readiness.md) · [apps/website/README.md](../../apps/website/README.md)
**Spec:** [docs/superpowers/specs/2026-07-05-slice-30-public-website-nextjs-design.md](../superpowers/specs/2026-07-05-slice-30-public-website-nextjs-design.md)
**Plan:** [docs/superpowers/plans/2026-07-05-slice-30-public-website-nextjs.md](../superpowers/plans/2026-07-05-slice-30-public-website-nextjs.md)

---

## Overview

The QuickServe public marketing website is a **standalone Next.js 15 App Router application** with `output: 'export'` (fully static HTML — no Node.js server required at runtime). It lives at `apps/website/` inside the QuickServe monorepo and is **completely separate** from the Expo mobile app and the web-admin panel.

- **Deploy target:** `https://quickserve.co.ke`
- **Build output:** `apps/website/out/` — fully static HTML/CSS/JS, deployable to any CDN or static host
- **Tech:** Next.js 15, React 19, TypeScript, Tailwind CSS, own `node_modules` (independent of Expo React)
- **Scope:** 12 marketing pages — no authentication, no data fetching, no Supabase connection, no backend

The Expo app, the web-admin panel (`src/app/(admin-web)/`), and all backend infrastructure (Supabase, Edge Functions, Daraja) are unaffected. The marketing site has its own lifecycle, its own deploy, and no shared runtime with any other sub-application.

---

## Static Website Verification

Verified by running `cd apps/website && npm run build` on 2026-07-05. Output written to `apps/website/out/`.

### Build result

```
next build → ✓ Generating static pages (17/17) → ✓ Exporting (2/2)
All 15 entries (12 marketing routes + /_not-found + /robots.txt + /sitemap.xml) rendered as (Static).
```

### Route checklist

| # | Route | Output file | Status |
|---|-------|-------------|--------|
| 1 | `/` (Home) | `out/index.html` | ✅ |
| 2 | `/services` | `out/services/index.html` | ✅ |
| 3 | `/how-it-works` | `out/how-it-works/index.html` | ✅ |
| 4 | `/why-quickserve` | `out/why-quickserve/index.html` | ✅ |
| 5 | `/become-a-provider` | `out/become-a-provider/index.html` | ✅ |
| 6 | `/pricing` | `out/pricing/index.html` | ✅ |
| 7 | `/faq` | `out/faq/index.html` | ✅ |
| 8 | `/contact` | `out/contact/index.html` | ✅ |
| 9 | `/support` | `out/support/index.html` | ✅ |
| 10 | `/download` | `out/download/index.html` | ✅ |
| 11 | `/privacy` | `out/privacy/index.html` | ✅ |
| 12 | `/terms` | `out/terms/index.html` | ✅ |

### Verification checklist

| Check | Evidence | Result |
|-------|----------|--------|
| Static export succeeds | `npm run build` exits 0; Next.js reports `✓ Exporting (2/2)` | ✅ PASS |
| All 12 routes generated | 12 `out/<route>/index.html` files confirmed via `find out -name index.html` (13 entries = 12 routes + 404) | ✅ PASS |
| `sitemap.xml` exists | `out/sitemap.xml` — 12 `<url>` entries, all `https://quickserve.co.ke/…`, with priority/changefreq | ✅ PASS |
| `robots.txt` exists | `out/robots.txt` — `Allow: /`, `Host: https://quickserve.co.ke`, `Sitemap: https://quickserve.co.ke/sitemap.xml` | ✅ PASS |
| JSON-LD present on every page | `grep -c 'application/ld+json'` = 1 on all 12 pages | ✅ PASS |
| Canonical URL present on every page | `grep -c 'rel="canonical"'` = 1 on all 12 pages | ✅ PASS |
| Open Graph tags present on every page | `grep -c 'property="og:title"'` = 1 on all 12 pages; `og:url`, `og:description`, `og:image`, `og:site_name` also present | ✅ PASS |
| Twitter metadata present on every page | `grep -c 'name="twitter:card"'` = 1 on all 12 pages; `twitter:title`, `twitter:description` also present | ✅ PASS |
| `<meta name="description">` present on every page | `grep -c 'meta name="description"'` = 1 on all 12 pages | ✅ PASS |
| Exactly one `<h1>` per page | `grep -o '<h1'` count = 1 on all 12 pages | ✅ PASS |
| Responsive layouts | All layout components use Tailwind responsive breakpoints (`sm:` / `md:` / `lg:` grid/flex; `MarketingHeader` has mobile hamburger menu). Verified by construction. **Manual visual QA** (desktop/tablet/mobile) is a required pre-launch step — cannot be automated here. | ✅ (automated) / ⬜ (visual QA: pre-launch manual) |

---

## SEO

### Target phrases

The following phrases from `apps/website/content/site.ts → SEO_PHRASES` are woven into page titles, descriptions, headings, and body copy across the site:

- Home Services Nairobi
- Trusted Plumbers Nairobi
- Electrician Nairobi
- Cleaning Services Nairobi
- Handyman Nairobi
- Professional Home Services Kenya

### Per-page SEO table (all 12 routes)

Evidence sourced from `apps/website/out/<route>/index.html` via grep on 2026-07-05.

| # | Route | `<title>` | Description (summary) | Canonical URL | SEO phrase(s) woven | Heading structure |
|---|-------|-----------|----------------------|---------------|---------------------|-------------------|
| 1 | `/` | QuickServe — Book Trusted Home Services in Nairobi | "Book Home Services Nairobi … Professional Home Services Kenya" | `https://quickserve.co.ke/` | Home Services Nairobi, Professional Home Services Kenya, Cleaning Services Nairobi, Trusted Plumbers Nairobi | h1 (Hero) → h2 (sections) → h3 (cards) |
| 2 | `/services` | Home Services in Nairobi, On Demand — QuickServe | "Browse 19+ on-demand services including Cleaning Services Nairobi, Trusted Plumbers Nairobi, Electrician Nairobi, Handyman Nairobi" | `https://quickserve.co.ke/services/` | Cleaning Services Nairobi, Trusted Plumbers Nairobi, Electrician Nairobi, Handyman Nairobi | h1 → h2 (category labels) |
| 3 | `/how-it-works` | How QuickServe Works — Book a Service in Minutes | "Discover how QuickServe makes booking home services in Nairobi simple" | `https://quickserve.co.ke/how-it-works/` | Home Services Nairobi | h1 → h2 (steps) |
| 4 | `/why-quickserve` | Why Choose QuickServe — Trusted Home Services in Nairobi | "Nairobi's most trusted on-demand services platform … Professional Home Services Kenya" | `https://quickserve.co.ke/why-quickserve/` | Professional Home Services Kenya, Home Services Nairobi | h1 → h2 (benefit sections) |
| 5 | `/become-a-provider` | Become a Service Provider in Nairobi — Join QuickServe | "Grow your business as a service provider in Nairobi … Professional Home Services Kenya" | `https://quickserve.co.ke/become-a-provider/` | Professional Home Services Kenya, Home Services Nairobi | h1 → h2 (benefit sections) |
| 6 | `/pricing` | Simple, Transparent Pricing — QuickServe | "No hidden fees … full price before you confirm every booking" | `https://quickserve.co.ke/pricing/` | (qualitative pricing; no misleading claims) | h1 → h2 |
| 7 | `/faq` | Frequently Asked Questions — QuickServe | "Answers to common questions about QuickServe: booking, payment, verification, coverage, app, support" | `https://quickserve.co.ke/faq/` | Home Services Nairobi (implicit) | h1 → h2 (question groups) |
| 8 | `/contact` | Contact QuickServe — Get in Touch | "Email us, find us on social media, or visit FAQ and Support" | `https://quickserve.co.ke/contact/` | (contact page — minimal keyword density) | h1 → h2 |
| 9 | `/support` | Help & Support — QuickServe | "Get help with your account, bookings, payments … contact support team" | `https://quickserve.co.ke/support/` | (support page) | h1 → h2 |
| 10 | `/download` | Download the QuickServe App — Android & iOS | "Book trusted home services in Nairobi in under a minute. Coming soon to Google Play and App Store." | `https://quickserve.co.ke/download/` | Home Services Nairobi | h1 → h2 |
| 11 | `/privacy` | Privacy Policy — QuickServe | "How we collect, use, and protect your personal data" | `https://quickserve.co.ke/privacy/` | (legal — no keyword targeting) | h1 → h2 (sections) |
| 12 | `/terms` | Terms of Service — QuickServe | "Rules governing use of our platform, bookings, payments, responsibilities" | `https://quickserve.co.ke/terms/` | (legal — no keyword targeting) | h1 → h2 (sections) |

All 12 titles are **unique** (verified by `pages.test.tsx` — Set size = 12). All 12 descriptions are unique (verified by grep; each scoped to distinct page intent).

---

## Isolation

The branch `feat/slice-30-website` introduces **zero changes** to the Expo app, Supabase schema, backend logic, or any existing file under `src/`.

### Diff summary (2026-07-05)

```
git diff main..HEAD --stat

52 files changed, 8757 insertions(+), 1 deletion(-)
```

All 52 changed files are accounted for below:

| Category | Files |
|----------|-------|
| **New website app** | `apps/website/**` — 49 files (all new) |
| **Root config scoping** | `.gitignore` (+2 lines: `apps/website/.next`, `apps/website/out`), `jest.config.js` (+1 line: testPathIgnorePatterns `/apps/website/`), `tsconfig.json` (+1 line: exclude `apps/website`) |

### Empty src/ and supabase/ greps

```bash
git diff main..HEAD --name-only | grep -E '^src/'
# (empty)

git diff main..HEAD --name-only | grep -E '^supabase/'
# (empty)
```

### Isolation guarantees

| Guarantee | Evidence |
|-----------|----------|
| `apps/website` isolated — standalone with own `node_modules`, React, toolchain | ✅ `apps/website/package.json` present; own `node_modules` (not committed) |
| Expo app source byte-unchanged | ✅ `src/` grep → empty |
| No `src/app` marketing routes added | ✅ `src/` grep → empty; no new files under `src/app/` |
| No `RootNavigator` / `_layout.tsx` change | ✅ `src/` grep → empty |
| No auth change | ✅ `src/` grep → empty |
| No payment change | ✅ `src/` grep → empty |
| No database / migration change | ✅ `supabase/` grep → empty |
| No backend / Edge Function change | ✅ `supabase/` grep → empty |
| No business-logic change | ✅ `src/` grep → empty |
| No admin-workflow change | ✅ `src/` grep → empty |

**Only non-website touches = the 3 root config-scoping lines:**
1. `tsconfig.json` — `exclude` array += `"apps/website"` (prevents root tsc from type-checking the website)
2. `jest.config.js` — `testPathIgnorePatterns` += `'/apps/website/'` (prevents root Jest from running Vitest tests)
3. `.gitignore` — += `apps/website/.next` and `apps/website/out` (prevents build artifacts from being committed)

---

## Deployment

### Target: quickserve.co.ke

The site is fully static — no Node.js server is required at runtime. Deploy to any CDN or static hosting platform.

**Build command:**
```bash
cd apps/website && npm install && npm run build
```

**Output directory:** `apps/website/out`

**Environment variables:** **NONE required.** The marketing site is a static export with no runtime secrets, no Supabase connection, no API calls, no authentication, and no server-side logic. There are no `.env` variables to set — the build is hermetic.

### Vercel (recommended)

| Setting | Value |
|---------|-------|
| Root Directory | `apps/website` |
| Framework | Next.js |
| Build Command | `npm run build` (or `next build`) |
| Output Directory | `out` |
| Environment Variables | (none) |
| Rewrites / Redirects | None needed — static export with `trailingSlash: true`; each page is its own HTML file |

Steps:
1. Connect the GitHub repo in the [Vercel dashboard](https://vercel.com/new).
2. Set **Root Directory** to `apps/website`.
3. Set **Output Directory** to `out` (override the default `.next` detection).
4. Set **Framework** to `Next.js`. Vercel will detect `output: 'export'` and skip the SPA fallback (each route is a real HTML file).
5. Add the custom domain `quickserve.co.ke` in **Project Settings → Domains** — Vercel provisions HTTPS automatically.
6. Trigger a deploy (push to the connected branch, or click **Redeploy**).

> **Note:** Unlike the web-admin SPA (which needs a `/*` → `/index.html` rewrite), the static-export marketing site does NOT need a rewrite rule — every route pre-renders to its own `index.html`.

### Netlify (alternative)

```toml
[build]
  base    = "apps/website"
  command = "npm run build"
  publish = "out"
```

No redirect rule needed (static export, each page is its own HTML file). No environment variables needed.

### Cloudflare Pages (alternative)

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Root directory (build context) | `apps/website` |
| Build output directory | `out` |

Cloudflare Pages handles each file as a static asset — no special fallback needed.

### Deployment checklist

- [ ] `cd apps/website && npm install && npm run build` completes locally without errors.
- [ ] `apps/website/out/` contains 12 route folders + `sitemap.xml` + `robots.txt`.
- [ ] Custom domain `quickserve.co.ke` configured and HTTPS certificate issued.
- [ ] Spot-check 3 pages in a browser: home (`/`), services (`/services`), become-a-provider (`/become-a-provider`).
- [ ] Browser `<title>` and meta description visible (view-source check).
- [ ] Google Search Console: submit `https://quickserve.co.ke/sitemap.xml`.
- [ ] **No** environment secrets required (confirm no `.env` values are needed).
- [ ] Manual responsive QA: verify mobile menu, grid layouts, and typography on mobile/tablet/desktop.

### Future subdomains

These are **reserved for separate, independent deployments** — they are NOT part of this slice and require their own build pipelines:

| Subdomain | Purpose | Build |
|-----------|---------|-------|
| `app.quickserve.co.ke` | Expo web app (mobile deep-link landing) | `npx expo export --platform web` |
| `admin.quickserve.co.ke` | Web admin panel (`src/app/(admin-web)/`) | `npx expo export --platform web` (see [web-admin-deploy.md](web-admin-deploy.md)) |

---

## Marketing Integrity

### Placeholder statistics

`apps/website/content/site.ts → STAT_PLACEHOLDERS` is annotated with:
```typescript
// PLACEHOLDER — not live data; replace before public launch
```

In the rendered HTML (`out/index.html`), the statistics section includes the visible on-page caption:
> "Illustrative placeholder figures — to be updated with live data at launch"

Grep result: `grep -oi "illustrative|placeholder figures" out/index.html` → matches found. ✅

### Placeholder testimonials

`apps/website/content/site.ts → TESTIMONIAL_PLACEHOLDERS` is annotated with:
```typescript
// PLACEHOLDER — illustrative, not real customers
```

In the rendered HTML, the testimonials section includes the visible on-page caption "Illustrative". Grep result confirms. ✅

### App Store / Play Store URLs

The `/download` page uses non-linked "coming soon" badge placeholders — no `play.google.com` or `apps.apple.com` URL appears in the generated HTML:

```bash
grep -c "play.google.com|apps.apple.com" out/download/index.html
# → 0 (both checks)
```

The page uses "Coming soon" labels instead. ✅

### Legal pages

`/privacy` and `/terms` both contain a visible amber "pending legal review" banner and are marked as placeholder content awaiting legal counsel. Grep confirms `"pending legal review"` present in both rendered pages. ✅

### Pricing claims

All pricing language is qualitative ("transparent pricing", "no hidden fees", "upfront quotes") — no specific price points, no false comparisons. ✅

### No admin / app route hrefs

All internal links are marketing-only (`/`, `/services`, `/download`, `/contact`, etc.). `pages.test.tsx` includes a cross-page guard: no page may contain `/admin`, `(admin-web)`, or `/app` hrefs. All 98 tests pass. ✅

---

## Rollback

The marketing website has **no database changes, no migrations, no backend changes, and no Expo app changes**. Rollback is safe and instant at any stage.

### Pre-merge abandon

```bash
git checkout main
git branch -D feat/slice-30-website
```

The Expo app is byte-unchanged. No deploy has been made. Nothing to undo.

### Per-task git revert (post-merge)

If merged and a specific task commit needs reverting:

```bash
git revert <commit-sha>  # creates a revert commit; does not force-push
```

Each task is a discrete commit — T1 (scaffold), T2 (content/components), T3 (layout + home + sitemap/robots), T4 (11 inner pages), T5 (this doc).

### Disable without reverting

To remove the website from the repo without reverting git history:

```bash
rm -rf apps/website/
# Then revert the 3 scoping lines:
git checkout main -- tsconfig.json jest.config.js .gitignore
git commit -m "chore: remove apps/website and revert config scoping"
```

The Expo app is byte-unchanged after this operation.

### Deployment rollback

1. **Vercel:** Open the project → **Deployments** → select the previous build → **Promote to Production**.
2. **Netlify:** Redeploy a previous build from deployment history.
3. **Cloudflare Pages:** Roll back to a previous deployment in the Pages dashboard.

No DB rollback, no auth rollback, no backend rollback needed.

---

## Release Gate

Results recorded 2026-07-05 on branch `feat/slice-30-website`.

| # | Check | Command | Result |
|---|-------|---------|--------|
| 1 | Website tests | `cd apps/website && npm test` | ✅ **98/98 PASS** (7 test files: smoke, content, lib, seo, components, home, pages) |
| 2 | Website static export | `cd apps/website && npm run build` | ✅ **PASS** — `out/` with 12 routes + sitemap.xml + robots.txt |
| 3 | Root test suite | `npm test` (repo root) | ✅ **1192/1192 PASS** (128 test suites) |
| 4 | Root TypeScript | `npx tsc --noEmit` (repo root) | ✅ **PASS** — clean (no output) |
| 5 | Expo web export | `npx expo export --platform web` | ✅ **PASS** — `dist/` generated |
| 6 | Expo android export | `npx expo export --platform android` | ✅ **PASS** — android bundle generated |

All 6 checks **PASS**. `git status` clean after gate run (only untracked `supabase/.temp/` which is git-ignored).
