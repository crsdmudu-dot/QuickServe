# Slice 30 — Public Marketing Website Implementation Plan

> **SUPERSEDED** — the marketing site is now a standalone Next.js app (`apps/website/`), not marketing routes inside the Expo app. Use `2026-07-05-slice-30-public-website-nextjs.md` instead.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A premium, conversion-focused public marketing website (12 pages) as additive public web routes in the existing Expo static export — no backend/DB/auth/payment/business change.

**Architecture:** A `src/app/(marketing)/` route group (group stripped → clean URLs), pre-rendered by the existing `web.output: "static"` (real per-page SEO via `expo-router/head`). A single **web-only** `RootNavigator` exemption makes marketing public without touching auth/session/RLS or native behavior. Content-driven (`constants/marketing.ts`) + reusable marketing components + design-token reuse.

**Tech Stack:** Expo Router (static web), Expo RN + TS, `expo-router/head`, Jest + RNTL.

## Global Constraints

- **Public marketing routes must NOT require auth; web-admin routes MUST remain protected; mobile app behavior MUST remain unchanged.**
- **The ONLY non-marketing file touched is `src/app/_layout.tsx`** — a single web-only exemption: `if (Platform.OS === 'web' && (segments[0] as string) === '(marketing)') return;` beside the existing `(admin-web)` exemption. NO other auth-logic/session/RLS change. On native the guard is unchanged → marketing routes are never shown in-app.
- **No DB/backend/payment/business-logic change; no customer/provider/admin workflow change.** No data fetching from protected tables; **social-proof numbers are placeholders**; no links into admin/app-internal routes. CTAs route only within marketing or to `/download` / `/become-a-provider` / `/contact`.
- Reuse design tokens + `Text`/`Button`/`Card`; do NOT modify any app/admin component. `web.output: "static"` already set — no build-config change.
- Gate every task: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` AND `--platform android` succeed.

---

## File Structure

**Create**
- `src/constants/marketing.ts` — content module (categories, steps, trust badges, benefits, FAQ, stats/testimonials placeholders, nav/footer links, target-phrase copy).
- `src/components/marketing/*` — reusable components (SeoHead, MarketingHeader, MarketingFooter, Hero, SectionHeading, ServiceCategoryCard, StepCard, TrustBadge, BenefitItem, StatCard, TestimonialCard, FaqItem, CtaSection) (+ tests).
- `src/app/(marketing)/_layout.tsx` + the 12 page files.
- `docs/pilot/public-website.md` — verification doc.

**Modify**
- `src/app/_layout.tsx` — the single web-only `(marketing)` guard exemption.

**Reuse (do not modify):** `@/constants/theme`/`useTheme`, `Text`/`Button`/`Card`, `expo-router/head`, `SERVICES`, `(admin-web)` guard, all app/admin/native code.

---

## Task Order (dependency-ordered)

1. **T1** — Routing foundation: `(marketing)/_layout.tsx` (header/footer/SeoHead shell) + the web-only guard exemption + a minimal Home stub; **verify** public-unauth / admin-protected / native-unchanged.
2. **T2** — `constants/marketing.ts` + reusable marketing components (+ tests).
3. **T3** — Home page (all sections assembled) (+ tests).
4. **T4** — The other 11 pages (services/pricing/how-it-works/why/become-a-provider/faq/contact/support/download/privacy/terms) (+ tests).
5. **T5** — Verification `docs/pilot/public-website.md` (SEO meta in `dist/`, unauth/protected/native, isolation) + final gate.

Each task ends green (tests / tsc / both exports).

---

### Task 1: Routing foundation + guard exemption + verification

**Files:** Create `src/app/(marketing)/_layout.tsx`, `src/app/(marketing)/index.tsx` (Home stub), `src/components/marketing/seo-head.tsx`, `src/components/marketing/marketing-header.tsx`, `src/components/marketing/marketing-footer.tsx`; Modify `src/app/_layout.tsx`; Test `src/__tests__/marketing-routing.test.tsx`

**Build:**
- `src/app/_layout.tsx` — add ONE line in `RootNavigator`'s effect, beside the `(admin-web)` exemption:
  `if (Platform.OS === 'web' && (segments[0] as string) === '(marketing)') return;` (import `Platform`). Nothing else changes.
- `seo-head.tsx` — `SeoHead { title; description?; ogImage? }` → `expo-router/head` `<Head>` with `<title>`, `<meta name="description">`, and OG tags (`og:title`/`og:description`/`og:type=website`/`og:image`). Mirror `page-meta.tsx`'s `import Head from 'expo-router/head'`.
- `marketing-header.tsx` — logo/wordmark + responsive nav (Services, How It Works, Why, Become a Provider, Pricing, FAQ, Contact) + CTAs (*Book a Service* → `/download`, *Become a Provider* → `/become-a-provider`); a hamburger/collapsed menu below a mobile breakpoint (`useWindowDimensions`). Links via `Link`/`router.push` to marketing routes only.
- `marketing-footer.tsx` — grouped links to all 12 pages + legal (Privacy/Terms) + a short brand blurb.
- `(marketing)/_layout.tsx` — a `Stack`/`Slot` wrapping pages with `MarketingHeader` + `MarketingFooter` (scrollable content column, `MaxContentWidth`-constrained, responsive).
- `(marketing)/index.tsx` — a minimal Home stub (`SeoHead` + a Hero heading + a CTA) to make the route real (fleshed out in T3).

**Verification tests (`marketing-routing.test.tsx`):**
- Web (`Platform.OS='web'`): the `RootNavigator` guard does NOT redirect a signed-out user on a `(marketing)` segment (assert `router.replace` NOT called with `/welcome`).
- Native (`Platform.OS='android'`): the guard STILL redirects a signed-out user (marketing not exempt) → app unaffected.
- `(admin-web)` exemption still present (web-admin protection unchanged). Keep existing routing tests green.

**Steps:** `expo export --platform android` (route types) → `tsc` → `npm test` → `expo export --platform web` → commit `feat: slice30 marketing route group + web-only guard exemption`.

---

### Task 2: Marketing content + reusable components

**Files:** Create `src/constants/marketing.ts`; `src/components/marketing/{hero,section-heading,service-category-card,step-card,trust-badge,benefit-item,stat-card,testimonial-card,faq-item,cta-section}.tsx` (+ tests)

**Build:**
- `marketing.ts` — typed content arrays: `SERVICE_CATEGORIES` (15 from the spec — name/icon/blurb; extensible), `HOW_IT_WORKS_STEPS` (6), `TRUST_BADGES` (6), `CUSTOMER_BENEFITS` / `PROVIDER_BENEFITS`, `FAQ_ITEMS`, `STAT_PLACEHOLDERS` (10,000+ jobs, 4.9★, etc. — clearly placeholder), `TESTIMONIAL_PLACEHOLDERS`, `MARKETING_NAV` / `FOOTER_LINKS`, and the SEO/target-phrase strings.
- Components (token-driven, responsive, display-only):
  - `SectionHeading { level?; children }` — semantic heading (`accessibilityRole="header"` + `aria-level`); one `<h1>`-level per page.
  - `Hero { headline; subheadline?; supportingLines?; primaryCta; secondaryCta }`.
  - `ServiceCategoryCard { name; icon; blurb }`; `StepCard { index; title; body }`; `TrustBadge { icon; label }`; `BenefitItem { icon; text }`; `StatCard { value; label }` (placeholder styling); `TestimonialCard { quote; author }` (placeholder); `FaqItem { q; a }` (collapsible); `CtaSection { heading; body?; primaryCta; secondaryCta? }`.
  - A `Cta` shape `{ label; href }` used across (href = a marketing route / `/download`).

**Tests:** each component renders its props (labels/values/CTA) + collapsible FaqItem toggles; a couple assert the CTA `href` targets a marketing/download route (never an admin/app route).

**Steps:** TDD → `tsc` → commit `feat: slice30 marketing content + components`.

---

### Task 3: Home page

**Files:** Modify `src/app/(marketing)/index.tsx`; Test `src/__tests__/marketing-home.test.tsx`

**Build:** Assemble the Home from the content + components, in order: `SeoHead` (home title/description/OG + target phrases) → `Hero` (primary headline + value prop + supporting "Plumbing. Electrical…" + customer CTA *Book a Service* + provider CTA *Become a Provider*) → **Featured services** (top `ServiceCategoryCard`s) → **Trust section** (`TrustBadge`s) → **Why choose** (customer `BenefitItem`s) → **How it works** (`StepCard`s) → **Testimonials** (`TestimonialCard` placeholders) → **FAQ preview** (first few `FaqItem`s + link to `/faq`) → **Social-proof stats** (`StatCard` placeholders) → **App-download** section (→ `/download`) → expansion messaging. Every major section ends with a `CtaSection`. Footer comes from the layout.

**Tests:** Home renders the hero headline, a customer CTA + a provider CTA, ≥1 service card, the trust badges, the how-it-works steps, a stat placeholder, and the FAQ-preview link; `SeoHead` sets the home title (mock `expo-router/head`).

**Steps:** `tsc` → `npm test` → both exports → commit `feat: slice30 marketing home page`.

---

### Task 4: The other 11 pages

**Files:** Create `src/app/(marketing)/{services,pricing,how-it-works,why-quickserve,become-a-provider,faq,contact,support,download,privacy,terms}.tsx`; Test `src/__tests__/marketing-pages.test.tsx`

**Build (each: `SeoHead` with page-specific title/description/OG + target-phrase copy where relevant; a primary heading; a closing `CtaSection`):**
- **services** + **pricing** — `ServiceCategoryCard` grid (all 15) + transparent-pricing messaging.
- **how-it-works** — the 6 `StepCard`s.
- **why-quickserve** — `CUSTOMER_BENEFITS` via `BenefitItem`s + trust.
- **become-a-provider** — `PROVIDER_BENEFITS` + strong provider CTA (*Apply Today / Start Earning* → `/download`/`/contact`).
- **faq** — all `FAQ_ITEMS` as `FaqItem`s.
- **contact** / **support** — static contact/support info (mailto/links; NO backend form submission).
- **download** — app-download section (store-badge placeholders / deep-link).
- **privacy** / **terms** — legal content (reuse/expand `docs/pilot/legal-support.md` copy if present; else standard placeholders).

**Tests (`marketing-pages.test.tsx`):** each page renders its primary heading + a CTA; services/pricing render multiple category cards; become-a-provider renders the provider CTA; faq renders multiple questions; each `SeoHead` sets a distinct title. No page fetches data or links to admin routes.

**Steps:** `expo export --platform android` (route types for the 11 new routes) → `tsc` → `npm test` → `expo export --platform web` → commit `feat: slice30 remaining marketing pages`.

---

### Task 5: Verification + isolation + final gate

**Files:** Create `docs/pilot/public-website.md`

- **SEO / static export:** `expo export --platform web` → confirm the 12 marketing routes are present in `dist/` and each pre-rendered HTML contains its `<title>` + `<meta name="description">` (+ OG) — document a grep/spot-check of `dist/` for the home + a couple of pages.
- **Public-unauth verification:** the marketing routes render for a signed-out user on web (no redirect) — from the T1 test + a manual note.
- **Web-admin protected:** the `(admin-web)` guard is unchanged (still redirects non-admins) — confirm `_layout.tsx` diff is ONLY the added `(marketing)` web-only line.
- **Mobile unchanged:** native guard unchanged → marketing routes not reachable in-app; app launch/flow identical (the exemption is `Platform.OS === 'web'`-gated).
- **Isolation:** `git diff <base>..HEAD --stat` — only `(marketing)` files + `constants/marketing.ts` + `components/marketing/*` + the single `_layout.tsx` line + this doc; **NO** DB/migration, backend, payment, business-logic, admin-workflow, or native change; no data fetching from protected tables; social-proof = placeholders.
- **Final gate:** `expo export` web + android, `tsc` clean, `npm test` green, `git status` clean.
- Commit `test: slice30 public website verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-30-website`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one. Reverting T1 removes the route group + the guard exemption (marketing disappears; app/admin unaffected); T2–T4 remove content/pages.
- **Disable without full revert:** revert the T1 `_layout.tsx` exemption → signed-out web users are redirected off marketing (site effectively disabled) while the app stays intact; or delete the `(marketing)` directory (routes vanish, no other impact).
- **No backend/DB/auth-logic/payment/native involvement** — rollback is confined to the additive `(marketing)` routes/components/content + the single web-only guard line.

---

## Self-Review

- **Spec coverage:** `(marketing)` group + web-only guard exemption + public/admin/native verification (T1); content module + reusable components (T2); Home with all sections + CTAs + social-proof placeholders (T3); the other 11 pages + SEO per page + CTA routing (T4); static-export/SEO/unauth/protected/native/isolation verification (T5). Public-unauth + web-admin-protected + mobile-unchanged (T1 tests; T5 verify). No DB/backend/auth-logic(beyond the one web-only line)/payment/workflow change (constraints; T5 isolation). Responsive desktop/tablet/mobile (components use `useWindowDimensions`). Clean URLs (route group stripped). Social-proof placeholders (T2 content; T3).
- **Placeholder scan:** none in the plan; the "placeholder" stats/testimonials are intentional per spec.
- **Name consistency:** `SeoHead`/`MarketingHeader`/`MarketingFooter` (T1) used by the layout + pages; `constants/marketing.ts` arrays (T2) consumed by Home (T3) + pages (T4); component names (`Hero`/`ServiceCategoryCard`/`StepCard`/`TrustBadge`/`BenefitItem`/`StatCard`/`TestimonialCard`/`FaqItem`/`CtaSection`/`SectionHeading`) consistent T2↔T3↔T4; the `(marketing)` segment name consistent in the guard (T1) + routes; reuses `expo-router/head`/tokens/`SERVICES`.
