# Slice 30 — Public Marketing Website (Design Spec)

**Date:** 2026-07-05
**Status:** Approved design → (implementation plan pending approval)
**Builds on (reuses):** the Expo Router app + `web.output: "static"` (already set → routes pre-render to HTML with per-page `<Head>` meta), the design tokens (`@/constants/theme`, `useTheme`), `Text`/`Button`/`Card`, `expo-router/head` (already used by `PageMeta`), `SERVICES`, and the admin-web responsive-breakpoint approach. Nothing in the backend/DB/auth/payment/business layer is touched.

---

## 1. Goal & Non-Goals

A polished, conversion-focused public marketing website (premium, like Uber/Airbnb/TaskRabbit) that explains QuickServe and drives **customer bookings** + **provider signups** — as additive **public web routes** in the existing Expo static export.

**Non-goals / out of scope (rules):** NO database/backend/auth/payment/business-logic change, NO customer/provider/admin workflow change. Marketing website ONLY. Public routes are unauthenticated; **web-admin routes stay protected; mobile apps unchanged; no private/admin functionality exposed.** The site is static content — it does NOT perform bookings/signups (CTAs route to the app download / provider page / contact); "social proof" numbers are **placeholders** (no live queries).

---

## 2. Architecture — a public `(marketing)` route group in the static web export

- **`src/app/(marketing)/` route group** (the group is stripped from URLs) → 12 clean public URLs. `web.output: "static"` (already configured) pre-renders each to HTML, so `expo-router/head` meta is real per-page SEO. **Web/tablet/mobile-web responsive** via `useWindowDimensions` breakpoints.
- **The ONE necessary routing touch — a web-only guard exemption** (no auth/session/RLS change): the `RootNavigator` redirect currently sends signed-out users off any non-`(admin-web)`/`(onboarding)` route to `/welcome`. Add an exemption so `(marketing)` is public **on web only**:
  `if (Platform.OS === 'web' && (segments[0] as string) === '(marketing)') return;` (placed beside the existing `(admin-web)` exemption). On **native** the guard is unchanged → marketing routes are never shown in the app → **mobile apps unchanged**. This is a routing exemption, not an authentication change (login/sessions/RLS untouched).
- **`(marketing)/_layout.tsx`:** a public `MarketingHeader` (logo + nav + CTAs) + `MarketingFooter`; wraps each page. A `SeoHead` component (reuses `expo-router/head`) sets per-page title/description/Open-Graph.
- **Content-driven:** a `src/constants/marketing.ts` module holds service categories, how-it-works steps, trust badges, benefit lists, FAQ, stat placeholders, and testimonial placeholders — so categories/copy extend by editing an array (flexible architecture as required).
- **Reuse the design system:** tokens + `Text`/`Button`/`Card`; add marketing components (below). No app/admin component is modified.

---

## 3. Routes & Pages (12 — clean URLs)

`/` Home · `/services` Services · `/how-it-works` How It Works · `/why-quickserve` Why QuickServe · `/become-a-provider` Become a Provider · `/pricing` Pricing / Service Categories · `/faq` FAQ · `/contact` Contact · `/support` Support · `/download` Download the App · `/privacy` Privacy Policy · `/terms` Terms of Service.

### Home (`(marketing)/index.tsx`) — assembled from sections
Hero (primary headline e.g. *"Your Trusted Home Services Platform in Nairobi"* + value prop + supporting line "Plumbing. Electrical. Cleaning…" + **customer CTA** *Book a Service* + **provider CTA** *Become a Provider*) → Featured services → Trust section → Why choose QuickServe → How it works → Testimonials placeholder → FAQ preview → Social-proof stats → App-download section → Footer. Expansion messaging ("Currently serving Nairobi. Expanding across Kenya soon. Your city could be next.").

### Other pages
- **Services / Pricing** — attractive category cards (Plumbing, Electrical, Cleaning, Painting, Carpentry, Appliance Repair, Gardening, Pest Control, Movers, Handyman, Roofing, Masonry, Welding, Interior Design, CCTV Installation — from the content module; easy to extend) + transparent-pricing messaging.
- **How It Works** — the 6 visual steps (Choose service → Date & time → Get matched → Track provider → Completed → Rate).
- **Why QuickServe** — customer benefits (book in <2 min, transparent pricing, live tracking, secure payments, trusted pros, verified reviews, easy rebooking, fast support).
- **Become a Provider** — provider benefits (flexible schedule, earn more, grow business, more customers, professional profile, weekly payouts, support, easy onboarding) + strong CTA (*Become a Provider / Apply Today / Start Earning*).
- **FAQ** — the common questions (how to book, payments, verification, cancel, cities, become a provider, pricing).
- **Contact / Support** — contact details + a support info section (static; no form submission to the backend — mailto/links or a note, since no backend change).
- **Download** — app-download section (store-badge placeholders / deep-link).
- **Privacy / Terms** — legal content (reuse/expand any existing legal copy from `docs/pilot/legal-support.md` if present).

---

## 4. Marketing components (reusable, token-driven, responsive)

`MarketingHeader` (responsive nav + hamburger on mobile), `MarketingFooter` (all links + legal + social), `SeoHead` (title/description/OG via expo-router/head), `Hero`, `SectionHeading` (semantic heading via `accessibilityRole="header"` + `aria-level`), `ServiceCategoryCard`, `StepCard` (numbered), `TrustBadge`, `BenefitItem`, `StatCard` (placeholder number + label), `TestimonialCard` (placeholder), `FaqItem` (expand/collapse), `CtaSection` (heading + customer/provider CTA buttons — every major section ends with one). CTAs route within the marketing site or to `/download` (customer app) / `/become-a-provider` / `/contact` — never to admin/app-internal routes.

---

## 5. SEO

- **Per-page `SeoHead`:** `<title>` + `<meta name="description">` + Open-Graph (`og:title`/`og:description`/`og:type`/`og:image`) via `expo-router/head` — emitted into the pre-rendered static HTML (`web.output: "static"`).
- **Target phrases** woven into copy: Home Services Nairobi, Trusted Plumbers Nairobi, Electrician Nairobi, Cleaning Services Nairobi, Handyman Nairobi, Professional Home Services Kenya.
- **Semantic headings** via `SectionHeading` (`accessibilityRole="header"` + aria-level → `role="heading"` in HTML). **Clean URLs** (route group stripped). One `<h1>`-level heading per page.

---

## 6. Backward Compatibility & Guardrails

- **No DB/backend/auth/payment/business-logic change; no customer/provider/admin workflow change.** The ONLY non-marketing file touched is `_layout.tsx` — a single **web-only routing-guard exemption** for `(marketing)` (mirrors the existing `(admin-web)` exemption); no change to authentication, sessions, RLS, or the native app's behavior.
- **Public routes are unauthenticated; web-admin stays protected** (its own `(admin-web)` guard is untouched); **mobile apps unchanged** (native guard unchanged → marketing routes not reachable in-app). **No private/admin functionality is exposed** — marketing pages are static content with no data fetching from protected tables and no links into admin/app-internal routes.
- **Social-proof stats are placeholders** (no live analytics query). Reuse the design system; don't modify app/admin components. Static export (`web.output: "static"`) already set — no build-config change.

---

## 7. Testing

- **Components (RNTL):** each marketing component renders (Hero headline/CTAs, ServiceCategoryCard, StepCard, TrustBadge, FaqItem expand, CtaSection buttons, MarketingHeader nav + mobile menu, MarketingFooter links). `SeoHead` sets the title (mock `expo-router/head`).
- **Pages:** each of the 12 pages renders its key sections/headings + a primary CTA; Home renders all its sections in order.
- **Guard:** on web, a `(marketing)` route is NOT redirected (signed-out); on native the guard still redirects (marketing unaffected). Keep existing app/admin/onboarding routing tests green (the exemption is additive + web-gated).
- **Isolation:** only marketing files + the single `_layout` exemption change; no DB/auth/payment/business/admin/native change.
- **Gate:** `npm test`, `npx tsc --noEmit`, `expo export --platform web` (marketing pages present in `dist/`) + `--platform android` (unchanged).

---

## 8. Deliverables

1. `src/app/(marketing)/_layout.tsx` (header/footer/SeoHead wrapper) + the web-only `_layout.tsx` guard exemption + `src/constants/marketing.ts` content module.
2. Marketing components (`SeoHead`, `MarketingHeader`/`Footer`, `Hero`, `SectionHeading`, `ServiceCategoryCard`, `StepCard`, `TrustBadge`, `BenefitItem`, `StatCard`, `TestimonialCard`, `FaqItem`, `CtaSection`) (+ tests).
3. The 12 marketing pages (+ tests), with per-page SeoHead + target-phrase copy.
4. Home page assembled from all its sections.
5. `docs/pilot/public-website.md` — verification (SEO meta in the static `dist/`, public routes unauthenticated, admin protected, mobile unchanged) + isolation; green gate.
