# Slice 16 — Premium UI/UX Overhaul + Branded Splash (Design Spec)

**Date:** 2026-06-25
**Status:** Approved design → implementation plan
**Type:** Design/UX slice — **presentation only, zero business-logic change.**

---

## 1. Goal & Hard Non-Goals

Make QuickServe feel premium, elegant, spacious, modern, native, fast, accessible, and consistent — without touching behavior.

**Non-negotiable guardrails (apply to every task):**
- **No** DB schema, RLS/permissions, business logic, or payment/security/M-Pesa flow changes.
- **No** features removed; **all** workflows preserved exactly.
- Component **public prop APIs stay stable**; rendered text/labels/`testID`s that tests rely on are preserved.
- Existing tests stay green and are **never weakened**; a test changes only when the visual change is intentional (e.g. a renamed style token) and the assertion is updated, not removed.
- Improve only: typography, color, spacing, hierarchy, motion, states, and usability.

Design language: **Claude Design** as the primary language; **Linear, Airbnb, Stripe Dashboard, Uber, Revolut, Apple HIG** as quality references only (do not copy).

---

## 2. Design System Extensions (`src/constants/theme.ts` + `src/constants/motion.ts`)

Build on the existing tokens (Colors light/dark, Spacing, Radii, Shadows, Typography). **Keep `primary = #00875A`** (brand continuity); enrich around it.

- **Color — green family:** keep `primary #00875A`; add a deeper **authority** green (`primaryDark`, ~`#005A3C`) for pressed/emphasis; keep/soften `primaryTint`; add a faint `primarySurface` for tinted fills.
- **Premium neutral ramp:** a graded neutral scale (e.g. `neutral50…neutral900`) feeding refined `background`, `surface`, `surfaceMuted`, `border` (hairline), `textSecondary`, `textTertiary`. Light-led; mirror sensible dark values.
- **Semantic:** clean `success`/`warning`/`error` (+ optional `info`), each with a matching soft surface tint for badges.
- **Elevation:** extend `Shadows` to `e1/e2/e3` (subtle, low-opacity, premium) replacing the single `card` shadow (keep `card` as an alias).
- **Typography:** keep the scale; add `letterSpacing` on `display`/`title` for a refined feel and a `weights` map; ensure consistent line-heights.
- **Radii:** reuse existing (`sm/md/lg/xl/pill`); standardize which radius each surface uses.
- **Motion (`motion.ts`):** `Durations { fast:150, base:250, slow:400 }`, easing presets, and a standard spring config — consumed by Reanimated. A `prefersReducedMotion` helper gates non-essential animation.
- **Accessibility rules:** min 44×44 touch targets; AA contrast on text/controls; `accessibilityRole`/`accessibilityLabel` on interactive elements; honor reduce-motion.

A short `docs/design/DESIGN-SYSTEM.md` documents the tokens, scales, motion, icon, and a11y rules (the source of truth for the polish).

---

## 3. Dependencies (presentation-only)

Add: `expo-linear-gradient` (splash/hero surfaces) and `expo-haptics` (subtle tap feedback on primary actions). Use installed **Reanimated 4** for motion. No other deps; no logic libs.

---

## 4. UI Audit (deliverable: `docs/design/ui-audit.md`)

Audit every screen group — auth, customer, provider, admin, bookings, payments, chat, notifications, photos, reviews, provider profiles, earnings, M-Pesa — and catalog inconsistencies (spacing, type usage, ad-hoc colors, raw `Text`/inline styles, missing loading/empty/error states, inconsistent headers/lists/badges) with a concrete correction per item. The audit drives the screen-polish tasks; it changes no code.

---

## 5. Component Polish

Refactor the reusable kit to consume the enriched tokens and add missing states, **preserving public props + test-facing output**. Priority components:
`Button` (variants, pressed/disabled/**loading** spinner, haptic on primary press), `Input` (focus ring, error state, label/helper), `Card` (elevation tiers, press state), `StatusBadge`/`PaymentStatusBadge`/`AttemptStatusBadge` (soft semantic surfaces + consistent shape), `RatingStars`, `ReviewCard`, `QuoteCard`, `PhotoGallery`, `ProfessionalCard`, `ChatThread`, `NotificationList`/`NotificationRow`, `ActivityTimeline`, `Tabs`/`AppTabs`, `EmptyState`, plus `Text`, `SearchBar`, `SectionHeader`, `ServiceCard`, `Avatar`, `IconChip`.
Add a small **`Skeleton`** component + use it for list/detail loading states (replacing bare "Loading…").

**Icon usage rule:** standardize the existing emoji-glyph approach (consistent sizing/containers via `IconChip`); document it in the design-system doc. No icon-font/asset migration this slice.

---

## 6. Screen Polish

Apply the system across all 26 screens, in waves grouped by area (auth → customer → bookings/payments/chat → provider → admin). Each screen: consistent header, spacing rhythm, token-driven colors/type, proper empty/loading/error states, aligned cards/lists/badges. No screen left inconsistent. Behavior and data flows unchanged.

---

## 7. Branded Splash (`src/components/animated-icon.tsx` → premium reveal)

Enhance the existing `AnimatedSplashOverlay` into a premium launch experience that signals a **trusted professional services brand**.
- **Backdrop:** subtle `expo-linear-gradient` (deep authority green → primary), clean and calm.
- **Logo reveal:** smooth scale + fade-in of the QuickServe mark (Reanimated).
- **Service hint:** a soft, sparse arrangement of existing service glyphs (electrician ⚡, plumber 🔧, cleaner 🧹, painter 🎨, handyman 🛠️) fading/scaling in gently around the mark — sparse and elegant, **not** a busy grid.
- **Premium loading feel:** a refined progress/settle motion; graceful fade/scale-out into the app.
- **Restraint:** tasteful, subtle, modern; honors reduce-motion (static branded frame fallback). No gimmicks, no clutter.

---

## 8. Home Screen Polish (`src/app/(customer)/index.tsx`)

Make the first post-splash screen feel premium:
- Strong **hero**: greeting + **"What do you need help with today?"**, polished `SearchBar`.
- Polished service cards with clean category hierarchy and generous spacing.
- **Active booking summary** card when the customer has an in-progress booking (uses existing booking data — no new queries beyond what's available).
- Clean visual hierarchy and premium spacing throughout.
- No change to navigation targets or data.

---

## 9. Verification

Automated (a design slice can't unit-test "premium," so this proves **no regression**):
- `npm test` green — existing suite preserved; tests updated only for intentional token renames, never weakened.
- `npx tsc --noEmit` clean (after `expo export` so route types regenerate).
- `npx expo export --platform android` succeeds; `git status` clean.

Manual (visual quality): review key flows on Expo Go / a dev build — splash, home, a booking, a payment, a chat, an admin screen — confirming consistency, spacing, motion restraint, light + dark readability, and that every existing feature still works.

---

## 10. Out of Scope

New features, schema/permission/logic changes, payment/security/M-Pesa behavior, icon-font migration, a full pixel-perfect dark redesign (dark must stay consistent and unbroken), localization, and any roadmap items beyond presentation.

---

## 11. Deliverables

1. `docs/design/ui-audit.md` (audit + corrections) and `docs/design/DESIGN-SYSTEM.md` (token/motion/icon/a11y rules).
2. `src/constants/theme.ts` enriched tokens + `src/constants/motion.ts`; `expo-linear-gradient` + `expo-haptics` added.
3. Polished reusable components (kit) + new `Skeleton`.
4. Restyled screens (all 26), wave by wave, behavior unchanged.
5. Premium branded splash.
6. Polished customer home.
7. Green verification gate (`npm test`/`tsc`/`expo export`/`git status`) + documented manual visual review.
