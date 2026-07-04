# Slice 30 — Public Marketing Website (Separate Next.js App) — Design Spec

**Date:** 2026-07-05
**Status:** Design → (user review, then implementation plan)
**Supersedes:** `2026-07-05-slice-30-public-website-design.md` (the earlier "marketing routes inside the Expo app" approach — abandoned).

## 1. Decision & Rationale

Slice 30 is a **dedicated, standalone Next.js public marketing website** living in the repo at **`apps/website/`** — a self-contained project with its own `package.json`, dependencies, build, and tests. It is **completely separate** from the Expo app.

- The Expo mobile/customer/provider/admin app is **untouched** — no `src/app` marketing routes, **no `RootNavigator`/`_layout` exemption**, no auth/session/RLS involvement.
- Expo web-admin stays separate and protected exactly as today.
- Deployment: the public site → **quickserve.co.ke**; the app/admin can later move to **app.quickserve.co.ke** / **admin.quickserve.co.ke** (separate hosts — no coupling required for this slice).

**Why a separate Next.js app (vs. the earlier in-Expo approach):**
- **Perfect isolation** — zero risk to the app's auth/routing/business logic; the only repo-level touches are config exclusions so the Expo toolchain ignores the new folder.
- **Best-in-class SEO** — Next.js App Router gives real static HTML per page, the `metadata`/`generateMetadata` API (title/description/canonical/OpenGraph/Twitter), `sitemap.ts` + `robots.ts`, JSON-LD structured data, and semantic HTML — stronger than react-native-web's DOM output.
- **Premium marketing DX** — plain React + CSS/Tailwind, standard responsive design, fast static hosting on any CDN.

**Trade-off accepted:** design tokens/components are **not** shared with the RN app (different rendering targets). We port the **token values** (colors, spacing, radii, typography scale) from `src/constants/theme.ts` into the website's own theme so the look matches — we do not import RN components.

## 2. Scope & Constraints (hard rules)

**In scope:** a public, SEO-optimized, responsive 12-page marketing website; marketing strategy/copy; SEO metadata; reusable presentational components; content module; its own tests; deployment config; a verification doc.

**Out of scope / MUST NOT change:**
- **No database changes. No backend changes** (no Supabase queries, no Edge Functions, no data fetching from any protected/private table — content is static/placeholder).
- **No Expo app workflow changes** — no file under `src/`, no `app.json` behavior change, no `RootNavigator` exemption, no auth/session/RLS.
- **No auth / payment / business-logic changes.** The website does **not** perform bookings, signups, or logins. It is marketing only.
- **Does not expose private/admin routes** — no links into the app/admin; CTAs route only within the site or to app-store/deep-link/contact targets.
- Social-proof numbers (10,000+ jobs, 4.9★, etc.) are **clearly-labeled placeholders** — no live data.

**The only repo-level (non-website) touches** — minimal, non-functional, so the Expo toolchain keeps ignoring the new project (root `tsconfig.json` already `include`s `**/*.tsx`, and `jest.config.js` scans everything outside `node_modules`):
1. `tsconfig.json` → add `apps/website` to `exclude` (so `tsc --noEmit` doesn't compile the Next.js project; mirrors the existing Deno `supabase/functions/*` exclusions).
2. `jest.config.js` → add `/apps/website/` to `testPathIgnorePatterns` (so `npm test` doesn't try to run the website's tests under jest-expo).
3. `.gitignore` → ignore Next.js build artifacts (`apps/website/.next/`, `apps/website/out/`); nested `node_modules/` is already ignored.

These three are configuration-scoping only — they change **no** Expo app behavior, code, or workflow.

## 3. Architecture

```
apps/website/                     # self-contained Next.js app (own package.json, deps, build, tests)
  package.json                    # next, react, react-dom, typescript, tailwind, testing libs (isolated)
  next.config.js                  # output: 'export' (static site → any CDN / Vercel)
  tsconfig.json                   # website-local TS config (does NOT extend the Expo one)
  tailwind.config.ts              # QuickServe palette/spacing/radii/type ported from src/constants/theme.ts
  postcss.config.js
  app/                            # App Router — file-based routes = clean URLs
    layout.tsx                    # <html>/<body>, Header + Footer, global metadata defaults, JSON-LD (Organization)
    globals.css
    sitemap.ts                    # all 12 URLs
    robots.ts                     # allow all; point to sitemap
    page.tsx                      # / (Home)
    services/page.tsx             # /services
    how-it-works/page.tsx         # /how-it-works
    why-quickserve/page.tsx       # /why-quickserve
    become-a-provider/page.tsx    # /become-a-provider
    pricing/page.tsx              # /pricing
    faq/page.tsx                  # /faq
    contact/page.tsx              # /contact
    support/page.tsx              # /support
    download/page.tsx             # /download
    privacy/page.tsx              # /privacy
    terms/page.tsx                # /terms
  components/                     # presentational React components (Header, Footer, Hero, cards, …)
  content/                        # site.ts — categories, steps, benefits, FAQ, stats/testimonials (placeholders), nav/footer links, SEO copy
  lib/                            # metadata helper (buildMetadata), constants (site URL, brand)
  __tests__/                      # component + page smoke tests (website-local runner)
  README.md                      # run/build/deploy + domain notes
```

- **Rendering:** `next.config.js` `output: 'export'` → fully static HTML/CSS/JS in `apps/website/out/`, deployable to any static host/CDN (Vercel, Netlify, Cloudflare Pages). No server, no runtime backend.
- **Routing:** App Router file paths → clean URLs (`/services`, `/how-it-works`, …). No dynamic/server routes.
- **Styling:** Tailwind CSS themed to the QuickServe brand (palette/spacing/radii/typography values ported from `src/constants/theme.ts`) for the premium look; responsive utility classes for desktop/tablet/mobile.
- **Content-driven:** all copy/lists live in `content/site.ts` (typed, extensible arrays) so pages stay declarative and the service catalog is easy to extend.

## 4. Pages (all 12 — preserved from the original brief)

Each page: a Next.js `metadata` export (unique title/description/canonical/OG/Twitter), one semantic `<h1>`, marketing copy, relevant sections, and a closing CTA. Target SEO phrases woven into copy where natural.

1. **/ (Home)** — Hero (headline e.g. *"Your Trusted Home Services Platform in Nairobi"* + value prop + supporting service line + **customer CTA** *Book a Service* → `/download` + **provider CTA** *Become a Provider* → `/become-a-provider`) → Featured services → Trust section → Why choose QuickServe (customer benefits) → How it works (6 steps) → Testimonials (placeholder) → FAQ preview (+ link to `/faq`) → Social-proof stats (placeholders) → App-download section → expansion messaging. CTA between major sections.
2. **/services** — full service catalog (~15 categories, extensible) as cards; each with a short blurb; CTA.
3. **/how-it-works** — the 6-step customer journey.
4. **/why-quickserve** — customer benefits + trust/safety differentiators.
5. **/become-a-provider** — provider value prop + benefits + strong provider CTA (*Start Earning / Apply Today* → `/download` or `/contact`).
6. **/pricing** — transparent-pricing / no-hidden-fees messaging (marketing framing; no live prices).
7. **/faq** — full FAQ list (collapsible items).
8. **/contact** — static contact info (email/phone/social; `mailto:`/`tel:` links) — **no backend form submission**.
9. **/support** — help/support info + links (static).
10. **/download** — app-download section (store-badge placeholders / deep links).
11. **/privacy** — privacy policy (reuse/expand existing `docs/pilot/legal-support.md` copy if present; else standard placeholder content).
12. **/terms** — terms of service (same sourcing note).

## 5. Reusable Components (presentational, React + Tailwind)

`Header` (responsive nav + mobile menu + CTAs), `Footer` (grouped links to all 12 pages + legal + brand blurb), `Hero`, `SectionHeading` (semantic `<h2>`/etc.), `ServiceCategoryCard`, `StepCard`, `TrustBadge`, `BenefitItem`, `StatCard` (placeholder styling), `TestimonialCard` (placeholder), `FaqItem` (collapsible — client component), `CtaSection`, `Container`/layout primitives. All display-only, fed from `content/site.ts`. No data fetching.

## 6. SEO (preserved & strengthened)

- Per-page `metadata`/`generateMetadata`: unique **title**, **meta description**, **canonical**, **OpenGraph** (`og:title/description/type=website/url/image`), **Twitter card**.
- Global defaults + `metadataBase` (`https://quickserve.co.ke`) in `app/layout.tsx`.
- **Semantic HTML**: one `<h1>` per page, `<header>/<nav>/<main>/<section>/<footer>`, descriptive alt text.
- **Clean URLs** via file-based routing.
- **`sitemap.ts`** (all 12 URLs) + **`robots.ts`** (allow all → sitemap).
- **JSON-LD** structured data (`Organization` / `LocalBusiness` — name, area served = Nairobi/Kenya, sameAs socials) in the root layout for rich results.
- **Target phrases** (woven naturally): *Home Services Nairobi, Trusted Plumbers Nairobi, Electrician Nairobi, Cleaning Services Nairobi, Handyman Nairobi, Professional Home Services Kenya* (+ per-service variants on `/services`).

## 7. Responsive Design (preserved)

Mobile-first Tailwind breakpoints → polished desktop / tablet / mobile: fluid grids for service/step/benefit cards, a collapsing mobile nav (hamburger), readable type scale, generous spacing, rounded cards, premium/clean aesthetic consistent with the QuickServe brand tokens. Comparable in polish to Uber/Airbnb/TaskRabbit/Thumbtack/Angi marketing sites.

## 8. Marketing Strategy / Copy (preserved from the original brief)

- **Positioning:** premium, trusted, on-demand home services in **Nairobi** (with expansion messaging), maximizing **customer bookings** and **provider signups**.
- **Headlines** (examples): *"Your Trusted Home Services Platform in Nairobi"*, *"Home Services, On Demand."* — value-prop subheadline + supporting service line (Plumbing · Electrical · Cleaning · …).
- **Customer benefits:** vetted/verified professionals, fast booking, transparent pricing, secure payment, ratings & reviews, support.
- **Provider benefits:** steady jobs/earnings, flexible schedule, fast payouts, grow your business — with strong provider CTAs.
- **Trust section:** verification, secure payments, ratings, support/guarantee.
- **Service catalog:** ~15 categories (extensible) drawn from the QuickServe service list.
- **How it works:** 6 steps (e.g. choose service → book → matched with a pro → track → job done → rate).
- **Social proof:** placeholder stats (10,000+ Jobs Completed, 4.9★ Average Rating, 500+ Verified Providers, etc.) + placeholder testimonials — clearly non-live.
- **FAQ:** common customer/provider questions.
- **CTA strategy:** dual audience throughout — customer *Book a Service*/*Download* → `/download`; provider *Become a Provider*/*Start Earning* → `/become-a-provider` (or `/contact`).

## 9. Testing

The website is self-contained with its **own** test runner (React Testing Library + Vitest or Jest, configured inside `apps/website/`, independent of the root jest-expo setup). Tests: each of the 12 pages renders its `<h1>` + a CTA; key components render their props; the collapsible `FaqItem` toggles; each page exports a distinct `metadata.title`; no component fetches data or links to an admin/app route. These run via `apps/website`'s own `npm test`; the root `npm test` (Expo) is unaffected (excluded).

## 10. Verification & Deployment

- **Build/SEO:** `apps/website` → `npm run build` (Next static export) → confirm `out/` contains all 12 routes and each pre-rendered `index.html` has its `<title>` + `<meta name="description">` + OG + JSON-LD; `sitemap.xml`/`robots.txt` present.
- **Isolation:** `git diff` shows changes only under `apps/website/` + the 3 config-scoping lines (`tsconfig.json`, `jest.config.js`, `.gitignore`) + the doc — **no** `src/` change, **no** migration/backend, **no** auth/payment/business change.
- **Expo app unchanged:** root `npm test` / `npx tsc --noEmit` / `expo export` (web + android) stay green (the website is excluded from all three).
- **Deployment:** static export deployed to **quickserve.co.ke** (CDN/Vercel); app + admin reserved for **app.**/**admin.** subdomains later. Documented in `docs/pilot/public-website.md` + `apps/website/README.md`.

## 11. Recommended Choices (flagged for review)

- **Location:** `apps/website/` (recommended; `website/` is an equivalent alternative).
- **Framework:** Next.js **App Router**, **static export** (`output: 'export'`).
- **Styling:** **Tailwind CSS** themed to QuickServe tokens.
- **Test runner:** website-local **Vitest + React Testing Library** (lightweight for Next) — or Jest + RTL; either is self-contained.

## 12. Open Assumptions

- Next.js + React major versions are pinned inside `apps/website` independently of the Expo app's React 19 (separate `node_modules`); no version coupling.
- Privacy/Terms copy reuses existing `docs/pilot/legal-support.md` content if available, else standard placeholder legal text (to be finalized before public launch).
- No CMS — copy lives in `content/site.ts` (extensible); a CMS is out of scope for this slice.
