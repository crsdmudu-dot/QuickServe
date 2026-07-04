# Slice 30 — Public Marketing Website (Standalone Next.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A premium, SEO-optimized, responsive 12-page public marketing website for QuickServe, built as a **standalone Next.js App Router app at `apps/website/`** (static export → quickserve.co.ke), fully isolated from the Expo app.

**Architecture:** A self-contained Next.js project (own `package.json`, deps, build, tests) under `apps/website/`. App Router file routes → clean URLs; `output: 'export'` → static HTML in `apps/website/out/`. Tailwind themed to QuickServe tokens (ported values from `src/constants/theme.ts` — NOT importing RN code). Content-driven from `content/site.ts`. SEO via per-page `metadata`, `sitemap.ts`, `robots.ts`, JSON-LD. The **only** non-website repo touches are 3 config-scoping lines (`tsconfig.json`, `jest.config.js`, `.gitignore`) so the Expo toolchain ignores the new folder.

**Tech Stack:** Next.js (App Router, static export), React, TypeScript, Tailwind CSS, Vitest + React Testing Library (website-local).

**Spec:** `docs/superpowers/specs/2026-07-05-slice-30-public-website-nextjs-design.md`

## Global Constraints (copied from spec — bind every task)

- **Do NOT touch Expo app behavior.** No file under `src/`; **no `src/app` marketing routes; no RootNavigator/`_layout` exemption**; no `app.json` behavior change.
- **No database / backend / auth / payment / business-logic changes.** The website does NOT fetch data, book, sign up, or log in. All content is static/placeholder. It does NOT link to any app/admin route.
- **Website is static marketing only.** `next.config.js` `output: 'export'`. No server routes, no API routes, no runtime backend.
- **Social-proof numbers are clearly-labeled placeholders** (10,000+ Jobs, 4.9★, 500+ Providers) — no live data.
- **The only non-website touches:** `tsconfig.json` add `apps/website` to `exclude`; `jest.config.js` add `/apps/website/` to `testPathIgnorePatterns`; `.gitignore` add `apps/website/.next/` + `apps/website/out/`. Non-functional scoping only.
- **Location:** `apps/website/`. **Framework:** Next.js App Router. **Build:** static export. **Styling:** Tailwind themed to QuickServe tokens. **Tests:** website-local Vitest + RTL. **Deploy:** quickserve.co.ke (future: app./admin. subdomains).
- **Brand tokens (port verbatim into Tailwind theme):** primary `#00875A`, primaryDark `#006B47`, primaryDeep `#005A3C`, primaryTint `#E7F7F0`, primarySurface `#F2FBF7`; ink/text `#0E1116`, textSecondary `#5B6470`, textTertiary `#8C939D`; background `#FFFFFF`, surfaceMuted `#F7F8FA`; border `#ECEEF1`, borderStrong `#D5D8DC`; warning `#F5A524`, error `#E5484D`, info `#0EA5E9`. Radii sm8/md12/lg16/xl24/pill999(px). Spacing scale 2/4/8/16/24/32/64. Type: display 32/38 700, title 24/30 700, heading 18/24 600, body 16/24 400, label 14/20 500, caption 12/16 400.
- **Gate every task:** website `npm test` green + `npm run build` (static export) succeeds AND the Expo app stays green (`npm test` / `npx tsc --noEmit` / `npx expo export --platform web` + `--platform android` at repo root — all unaffected because the website is excluded).

---

## File Structure

**Create (all under `apps/website/` unless noted):**
- `package.json`, `next.config.js`, `tsconfig.json`, `next-env.d.ts`, `tailwind.config.ts`, `postcss.config.js`, `.gitignore` (local), `README.md`, `vitest.config.ts`, `vitest.setup.ts`
- `app/layout.tsx`, `app/globals.css`, `app/sitemap.ts`, `app/robots.ts`, `app/page.tsx` + 11 route folders `app/<route>/page.tsx`
- `lib/site.ts` (site URL/brand constants + `buildMetadata` helper + JSON-LD), `content/site.ts` (marketing content)
- `components/*.tsx` (Header, Footer, Hero, SectionHeading, Container, ServiceCategoryCard, StepCard, TrustBadge, BenefitItem, StatCard, TestimonialCard, FaqItem, CtaSection)
- `__tests__/*.test.tsx`

**Modify (repo root — scoping only):** `tsconfig.json`, `jest.config.js`, `.gitignore`

**Reuse (read-only, do NOT import):** `src/constants/theme.ts` (token VALUES), `src/constants/services.ts` (the 19 service titles/subtitles/icons — copy into `content/site.ts`).

---

## Task Order (dependency-ordered)

1. **T1** — Scaffold `apps/website` (Next.js + TS + Tailwind + Vitest) + root isolation changes; verify Expo untouched + website builds.
2. **T2** — Content (`content/site.ts`) + SEO/JSON-LD lib (`lib/site.ts`) + shared components.
3. **T3** — Root layout (Header/Footer/global metadata/JSON-LD) + `sitemap.ts` + `robots.ts` + Home page.
4. **T4** — The other 11 pages (each with `metadata`).
5. **T5** — Static-export + SEO + isolation verification (`docs/pilot/public-website.md`) + final gate.

Each task ends green (website test + build; Expo untouched).

---

### Task 1: Scaffold standalone Next.js app + root isolation

**Files:** Create `apps/website/{package.json,next.config.js,tsconfig.json,next-env.d.ts,tailwind.config.ts,postcss.config.js,.gitignore,README.md,vitest.config.ts,vitest.setup.ts,app/globals.css,app/layout.tsx,app/page.tsx}`; Modify root `tsconfig.json`, `jest.config.js`, `.gitignore`; Test `apps/website/__tests__/smoke.test.tsx`

**Build:**
- `package.json` — name `quickserve-website`, `private: true`; deps `next`, `react`, `react-dom`; devDeps `typescript`, `@types/react`, `@types/node`, `tailwindcss`, `postcss`, `autoprefixer`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@vitejs/plugin-react`; scripts `dev`/`build`/`start`/`test` (`vitest run`)/`test:watch`. Independent `node_modules` (own React major — no coupling to Expo's React 19).
- `next.config.js` — `{ output: 'export', images: { unoptimized: true }, trailingSlash: true }` (static-export-safe).
- `tsconfig.json` — Next's standard (does NOT extend the Expo tsconfig); `paths` `@/*` → `apps/website` root.
- `tailwind.config.ts` — `content: ['./app/**/*.{ts,tsx}','./components/**/*.{ts,tsx}']`; `theme.extend.colors` = the brand tokens (primary/primaryDark/…, ink/textSecondary/…, surfaceMuted/border/…); `borderRadius` (sm/md/lg/xl/pill); `fontFamily`/`fontSize` from the type scale; container defaults.
- `postcss.config.js` — tailwind + autoprefixer. `app/globals.css` — `@tailwind base/components/utilities` + base body styles.
- `app/layout.tsx` — minimal root (`<html lang="en"><body>{children}</body></html>`) — fleshed out in T3.
- `app/page.tsx` — minimal Home stub (`<main><h1>QuickServe</h1></main>`) — fleshed out in T3.
- `vitest.config.ts` (jsdom, react plugin, globals) + `vitest.setup.ts` (`@testing-library/jest-dom`). `apps/website/.gitignore` — `node_modules/ .next/ out/`.
- **Root isolation:** `tsconfig.json` → add `"apps/website"` to `exclude`; `jest.config.js` → `testPathIgnorePatterns: ['/node_modules/', '/apps/website/']`; root `.gitignore` → add `apps/website/.next/` and `apps/website/out/`.

**Tests (`smoke.test.tsx`):** render `app/page.tsx` (the stub) → asserts the `<h1>` renders (proves the website test runner + RTL work).

**Steps:** `cd apps/website && npm install` → `npm test` (website smoke green) → `npm run build` (static export succeeds, `out/` created) → at repo root: `npm test` (Expo unaffected) → `npx tsc --noEmit` (clean — website excluded) → `npx expo export --platform web` + `--platform android` (green) → commit `feat: slice30 scaffold standalone Next.js website + root isolation`.

---

### Task 2: Marketing content + SEO lib + shared components

**Files:** Create `apps/website/content/site.ts`, `apps/website/lib/site.ts`, `apps/website/components/{container,section-heading,header,footer,hero,service-category-card,step-card,trust-badge,benefit-item,stat-card,testimonial-card,faq-item,cta-section}.tsx`; Test `apps/website/__tests__/components.test.tsx`, `apps/website/__tests__/content.test.ts`

**Build:**
- `content/site.ts` — typed, extensible arrays:
  - `SERVICE_CATEGORIES` — the 19 services from `src/constants/services.ts` (title/subtitle/icon), extensible.
  - `HOW_IT_WORKS_STEPS` (6), `CUSTOMER_BENEFITS`, `PROVIDER_BENEFITS`, `TRUST_BADGES` (6), `FAQ_ITEMS`, `STAT_PLACEHOLDERS` (10,000+ Jobs Completed / 4.9★ Average Rating / 500+ Verified Providers / etc. — each flagged placeholder), `TESTIMONIAL_PLACEHOLDERS`.
  - `NAV_LINKS` / `FOOTER_GROUPS` (all 12 pages + legal), `SEO_PHRASES`, and per-audience CTA shapes `{ label; href }` (customer → `/download`, provider → `/become-a-provider`, secondary → `/contact`).
- `lib/site.ts` — `SITE_URL = 'https://quickserve.co.ke'`, `BRAND`, `buildMetadata({ title, description, path, ogImage? })` → Next `Metadata` (title, description, `alternates.canonical`, `openGraph`, `twitter`), and `organizationJsonLd()` (Organization/LocalBusiness — name, url, areaServed Nairobi/Kenya, sameAs socials).
- Components (Tailwind, presentational, display-only, no data fetch):
  - `Container` (max-width + responsive padding), `SectionHeading { as?; children }` (semantic `<h2>`/etc.).
  - `Header` — responsive `<nav>` (NAV_LINKS) + mobile hamburger (client component) + customer/provider CTAs; links only to marketing routes.
  - `Footer` — FOOTER_GROUPS (all 12 + legal) + brand blurb.
  - `Hero { headline; subheadline; supporting?; primaryCta; secondaryCta }`.
  - `ServiceCategoryCard { title; subtitle; icon }`, `StepCard { index; title; body }`, `TrustBadge { icon; label }`, `BenefitItem { icon; text }`, `StatCard { value; label }` (placeholder styling), `TestimonialCard { quote; author }` (placeholder), `FaqItem { q; a }` (client, collapsible), `CtaSection { heading; body?; primaryCta; secondaryCta? }`.

**Tests:** each component renders its props (labels/values/CTA text + `href`); `FaqItem` toggles open/closed on click; a test asserts CTA hrefs target marketing/`/download`/`/contact` (never `/admin`, `/(admin-web)`, or an app route); `buildMetadata` returns the expected title/description/canonical; `content.test.ts` asserts `SERVICE_CATEGORIES.length >= 15` and stats are marked placeholder.

**Steps:** `cd apps/website` → TDD → `npm test` green → `npm run build` → commit `feat: slice30 website content + SEO lib + components`.

---

### Task 3: Root layout + sitemap + robots + Home page

**Files:** Modify `apps/website/app/layout.tsx`, `apps/website/app/page.tsx`; Create `apps/website/app/sitemap.ts`, `apps/website/app/robots.ts`; Test `apps/website/__tests__/home.test.tsx`, `apps/website/__tests__/seo.test.ts`

**Build:**
- `app/layout.tsx` — `<html lang="en">`, `metadataBase` + default `metadata` (via `buildMetadata` for the site), render `<Header/>` + `<main>{children}</main>` + `<Footer/>`, inject `organizationJsonLd()` as a `<script type="application/ld+json">`. Import `globals.css`.
- `app/sitemap.ts` — `MetadataRoute.Sitemap` listing all 12 URLs (absolute, from `SITE_URL`).
- `app/robots.ts` — `MetadataRoute.Robots` allow all + `sitemap: ${SITE_URL}/sitemap.xml`.
- `app/page.tsx` — `export const metadata = buildMetadata({ title: 'QuickServe — Trusted Home Services in Nairobi', description: <home>, path: '/' })`; assemble the Home from content + components in order: `Hero` (headline "Your Trusted Home Services Platform in Nairobi" + value prop + supporting service line + customer CTA *Book a Service* → `/download` + provider CTA *Become a Provider* → `/become-a-provider`) → Featured services (top `ServiceCategoryCard`s) → Trust (`TrustBadge`s) → Why choose (customer `BenefitItem`s) → How it works (`StepCard`s ×6) → Testimonials (`TestimonialCard` placeholders) → FAQ preview (first few `FaqItem`s + link to `/faq`) → Social-proof stats (`StatCard` placeholders) → App download (→ `/download`) → expansion messaging; `CtaSection` between major sections. One `<h1>` (in Hero).

**Tests:** `home.test.tsx` — Home renders the hero `<h1>`, a customer CTA + provider CTA (correct hrefs), ≥1 service card, the trust badges, 6 how-it-works steps, a stat placeholder, the FAQ-preview link. `seo.test.ts` — `page.tsx` `metadata.title`/`description`/canonical set; `sitemap()` returns 12 URLs; `robots()` allows all + references the sitemap.

**Steps:** `cd apps/website` → `npm test` → `npm run build` (confirm `out/index.html`, `out/sitemap.xml`, `out/robots.txt`) → commit `feat: slice30 website layout + sitemap + robots + home`.

---

### Task 4: The other 11 pages

**Files:** Create `apps/website/app/{services,how-it-works,why-quickserve,become-a-provider,pricing,faq,contact,support,download,privacy,terms}/page.tsx`; Test `apps/website/__tests__/pages.test.tsx`

**Build (each page: `export const metadata = buildMetadata({...})` with a UNIQUE title/description/canonical/OG; one `<h1>`; sections from content; closing `CtaSection`; target SEO phrases woven where natural):**
- **services** — all `SERVICE_CATEGORIES` as cards (SEO phrases: Cleaning Services Nairobi, Trusted Plumbers Nairobi, Electrician Nairobi, Handyman Nairobi…).
- **how-it-works** — the 6 `StepCard`s.
- **why-quickserve** — `CUSTOMER_BENEFITS` + trust.
- **become-a-provider** — `PROVIDER_BENEFITS` + strong provider CTA (*Start Earning / Apply Today* → `/download` or `/contact`).
- **pricing** — transparent/no-hidden-fees messaging (no live prices).
- **faq** — all `FAQ_ITEMS`.
- **contact** — static contact info (`mailto:`/`tel:`/socials) — NO form submission.
- **support** — static help/support links.
- **download** — app-download section (store-badge placeholders / deep links).
- **privacy** / **terms** — legal content (reuse/expand `docs/pilot/legal-support.md` if present; else standard placeholder text).

**Tests (`pages.test.tsx`):** each of the 11 pages renders its `<h1>` + a CTA; each `metadata.title` is distinct; services renders ≥15 cards; become-a-provider renders the provider CTA (href `/download` or `/contact`); faq renders multiple items; no page imports data-fetching or links to an admin/app route (assert no `/admin`/`(admin-web)` hrefs).

**Steps:** `cd apps/website` → `npm test` → `npm run build` (confirm all 12 routes in `out/`) → commit `feat: slice30 remaining website pages`.

---

### Task 5: Verification + isolation + final gate

**Files:** Create `docs/pilot/public-website.md` (+ ensure `apps/website/README.md` covers run/build/deploy)

- **Static-export + SEO:** `cd apps/website && npm run build` → confirm `out/` has all 12 routes; spot-check that `out/index.html` + 2 more pages each contain their `<title>` + `<meta name="description">` + OG tags + the JSON-LD script; `out/sitemap.xml` lists 12 URLs; `out/robots.txt` present. Document the grep/spot-check.
- **Isolation:** `git diff <base>..HEAD --stat` → changes ONLY under `apps/website/` + the 3 root scoping lines (`tsconfig.json`, `jest.config.js`, `.gitignore`) + `docs/pilot/public-website.md`. Confirm **NO** `src/` change, **NO** `supabase/` change, **NO** migration/backend/auth/payment/business change, **NO** RootNavigator exemption, no data fetching, social-proof = placeholders, no admin/app links.
- **Expo app unchanged (prove):** repo-root `npm test` green (same count as pre-slice), `npx tsc --noEmit` clean, `npx expo export --platform web` + `--platform android` succeed — the website is excluded from all three.
- **Deployment doc:** static export → **quickserve.co.ke** (CDN/Vercel); app/admin reserved for **app.**/**admin.** subdomains; commands in `README.md`.
- **Final gate:** website `npm test` + `npm run build` green; Expo gates green; `git status` clean.
- Commit `test: slice30 website verification + deployment doc`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-30-website`. Abandon = `git checkout main` + delete branch — nothing else affected.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one task. Reverting T1 removes the whole `apps/website` scaffold + the 3 root scoping lines (site vanishes; Expo app entirely unaffected).
- **Disable without full revert:** delete the `apps/website/` directory + revert the 3 scoping lines — the Expo app is byte-for-byte unchanged (the website never shared code, routes, or the toolchain).
- **No backend/DB/auth/payment/native/Expo involvement** — rollback is confined to the additive, standalone `apps/website/` project + 3 non-functional config lines. Deployment rollback = repoint quickserve.co.ke / redeploy previous static build.

---

## Self-Review

- **Spec coverage:** standalone Next.js app at `apps/website` + static export (T1); Tailwind themed to tokens (T1); content constants (T2); SEO lib + JSON-LD (T2); shared components (T2); layout + sitemap.ts + robots.ts (T3); Home with all sections + CTA routing + placeholder social proof (T3); all 12 pages + per-page SEO metadata (T3 home + T4 eleven); responsive design (Tailwind breakpoints in components, T2); root tsconfig/jest/.gitignore isolation (T1); static-export verification + Expo-unchanged proof + rollback (T5). Every "Include" item mapped.
- **Constraint coverage:** no Expo behavior touched / no `src/app` marketing route / no RootNavigator exemption / no DB-backend-auth-payment-business change / static marketing only — pinned in Global Constraints + verified in T5 isolation.
- **Placeholder scan:** none unintended; stat/testimonial placeholders are intentional per spec.
- **Name consistency:** `buildMetadata`/`organizationJsonLd`/`SITE_URL` (T2, `lib/site.ts`) consumed by layout + every page (T3/T4); `content/site.ts` arrays (`SERVICE_CATEGORIES`/`HOW_IT_WORKS_STEPS`/`CUSTOMER_BENEFITS`/`PROVIDER_BENEFITS`/`TRUST_BADGES`/`FAQ_ITEMS`/`STAT_PLACEHOLDERS`/`TESTIMONIAL_PLACEHOLDERS`/`NAV_LINKS`/`FOOTER_GROUPS`) consumed by components (T2) + Home (T3) + pages (T4); component names (`Container`/`SectionHeading`/`Header`/`Footer`/`Hero`/`ServiceCategoryCard`/`StepCard`/`TrustBadge`/`BenefitItem`/`StatCard`/`TestimonialCard`/`FaqItem`/`CtaSection`) consistent T2↔T3↔T4; route folder names match the 12 URLs + `sitemap.ts`.
