# Slice 16 — Premium UI/UX Overhaul + Branded Splash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make QuickServe feel premium/elegant/consistent by enriching the design system and restyling every component and screen + a branded splash — **presentation only, zero behavior change**.

**Architecture:** Extend the existing token system (`theme.ts` + new `motion.ts`), document it, then restyle the reusable component kit, then restyle screens in waves, then the splash and home. Reanimated 4 for motion; `expo-linear-gradient` + `expo-haptics` for premium surfaces/feedback.

**Tech Stack:** Expo RN + TS, Expo Router, Reanimated 4, expo-linear-gradient, expo-haptics, Jest + RNTL.

## Global Constraints (apply to EVERY task)

- **Presentation only.** No DB/schema, no RLS/permissions, no auth/payment/M-Pesa/business-logic changes. No features removed; all workflows preserved.
- **Component public prop APIs stay stable**; rendered text/labels/`testID`s that tests assert on are preserved.
- **Tests stay green and are NEVER weakened** — a test changes only for an intentional token/style rename, and the assertion is updated (not deleted/loosened). If a restyle would break a test, prefer preserving the test-facing output.
- Keep `primary = #00875A`; enrich around it. Light-led; dark stays consistent and unbroken (no pixel-perfect dark redesign).
- Tasteful motion only (Durations fast/base/slow), honor reduce-motion. Min 44×44 touch targets, AA contrast, `accessibilityRole`/`Label` on interactive elements.
- Merge gate every task: `npm test` green, `npx tsc --noEmit` clean (after `expo export` so route types regenerate), Android bundle exports.

---

## File Structure

**Create**
- `docs/design/ui-audit.md` — audit + per-item corrections (drives screen waves).
- `docs/design/DESIGN-SYSTEM.md` — token/scale/motion/icon/a11y source of truth.
- `src/constants/motion.ts` — durations, easings, spring, `prefersReducedMotion`.
- `src/components/ui/skeleton.tsx` (+ test) — loading placeholder.

**Modify**
- `src/constants/theme.ts` — enriched color ramp, semantic surfaces, elevation `e1/e2/e3`, typography refinements.
- `package.json` / `app.json` — add `expo-linear-gradient`, `expo-haptics`.
- `src/components/ui/*` — the reusable kit (waves W2–W3).
- `src/app/**` — all 26 screens (waves W4–W7).
- `src/components/animated-icon.tsx` (+ `.web.tsx`) — branded splash.
- `src/app/(customer)/index.tsx` — customer home.

---

## Task Order

1. **T1 — UI audit doc** (no code).
2. **T2 — Design tokens + motion + DESIGN-SYSTEM.md** (foundation).
3. **T3 — Dependency install** (`expo-linear-gradient`, `expo-haptics`) + `Skeleton`.
4. **T4 — Component polish Wave A** (primitives): `Text`, `Button`, `Input`, `Card`, `IconChip`, `SearchBar`, `SectionHeader`, `Avatar`, `EmptyState`.
5. **T5 — Component polish Wave B** (composites): badges (`StatusBadge`/`PaymentStatusBadge`/`AttemptStatusBadge`/`VerifiedBadge`), `RatingStars`/`StarInput`, `ServiceCard`, `BookingSummaryCard`, `ReviewCard`, `QuoteCard`, `ProfessionalCard`, `PhotoGallery`/`PhotoThumb`/`PhotoUploadButton`, `ChatThread`/`MessageBubble`, `NotificationList`/`NotificationRow`, `ActivityTimeline`, `Tabs`/`AppTabs`.
6. **T6 — Screen polish Wave 1**: auth + onboarding (`welcome`, `login`, `register`, `provider`, `admin`, `profile`).
7. **T7 — Screen polish Wave 2**: customer bookings + booking flow + booking detail + payments tab.
8. **T8 — Screen polish Wave 3**: provider (tabs, job detail, earnings, chat) + chat screens.
9. **T9 — Screen polish Wave 4**: admin (index, booking detail, provider detail, payments, payment-attempts) + notifications.
10. **T10 — Branded interactive splash**.
11. **T11 — Customer home polish**.
12. **T12 — Dark-mode consistency + accessibility pass**.
13. **T13 — Verification & final gate**.

Each task ends green (tests/tsc/bundle). T4+ depend on T2/T3.

---

### Task 1: UI audit

**Files:** Create `docs/design/ui-audit.md`

Walk every screen group (auth, customer, provider, admin, bookings, payments, chat, notifications, photos, reviews, provider profiles, earnings, M-Pesa). For each, list concrete inconsistencies (ad-hoc colors/spacing, raw `Text`/inline styles, missing loading/empty/error states, inconsistent headers/lists/badges) and the exact correction. No code change.

**Checks:** doc complete (every group covered); commit `docs: slice16 UI audit`.

---

### Task 2: Design tokens + motion + system doc

**Files:** Modify `src/constants/theme.ts`; Create `src/constants/motion.ts`, `docs/design/DESIGN-SYSTEM.md`

- `theme.ts`: keep `primary #00875A`; add deeper `primaryDark` (~`#005A3C`), `primarySurface`; a graded neutral ramp feeding `surface`/`surfaceMuted`/refined hairline `border`/`textTertiary`; soft semantic surfaces (`successSurface`/`warningSurface`/`errorSurface`); `Shadows.e1/e2/e3` (keep `card` alias); `Typography` letterSpacing on `display`/`title` + `weights`. **Add only — keep every existing token key** so current components compile unchanged.
- `motion.ts`: `Durations { fast:150, base:250, slow:400 }`, easing presets, spring config, `prefersReducedMotion()` (wraps `AccessibilityInfo.isReduceMotionEnabled`).
- `DESIGN-SYSTEM.md`: document tokens, scales, elevation, motion, emoji-icon usage rule, a11y rules.

**Checks:** `npx tsc --noEmit` clean; `npm test` green (no existing token removed → no breakage). Commit `feat: slice16 design tokens + motion system`.

---

### Task 3: Dependencies + Skeleton

**Files:** Modify `package.json`, `app.json`; Create `src/components/ui/skeleton.tsx` (+ `src/components/ui/skeleton.test.tsx`)

- `npx expo install expo-linear-gradient expo-haptics` (SDK-56 versions). If offline, add matching versions manually + `npm install` (note in report).
- `Skeleton`: props `{ width?, height?, radius? }`; a token-tinted block with a subtle Reanimated shimmer (reduce-motion → static). Test: renders with given dimensions; no crash.

**Checks:** `tsc` clean, `npm test` green (+ skeleton test); commit `feat: slice16 add gradient/haptics + skeleton`.

---

### Task 4: Component polish — Wave A (primitives)

**Files:** Modify `src/components/ui/{text,button,input,card,icon-chip,search-bar,section-header,avatar,empty-state}.tsx` (+ keep their tests green)

Restyle to consume the enriched tokens. Specifics: `Button` — variant colors via tokens, pressed/disabled states, **loading** prop (spinner, keeps label space), `expo-haptics` light impact on primary press; `Input` — focus ring, error border + helper text slot, 44px min height; `Card` — `elevation` prop mapping to `e1/e2/e3`, press feedback; `EmptyState` — refined icon container + spacing; others — token alignment. **Do not rename exported props or change rendered labels/testIDs.**

**Checks:** update only tests whose intentional output changed (never weaken); `npm test` green, `tsc` clean; commit `feat: slice16 component polish wave A`.

---

### Task 5: Component polish — Wave B (composites)

**Files:** Modify the remaining `src/components/ui/*` (badges, rating, service/booking/review/quote/professional cards, photos, chat, notifications, activity timeline, tabs)

Token-drive all; badges use soft semantic surfaces with consistent pill shape + preserved label text; cards use `e1` elevation + consistent radius/spacing; chat bubbles refined; lists get consistent row rhythm; tabs get a refined active indicator. Preserve all props/labels/testIDs.

**Checks:** `npm test` green (update intentional assertions only), `tsc` clean; commit `feat: slice16 component polish wave B`.

---

### Task 6–9: Screen polish waves

**Files (by wave):**
- **T6:** `src/app/(onboarding)/*`, `src/app/.../welcome|login|register|provider|admin|profile` screens.
- **T7:** `src/app/(customer)/{index excluded→T11, bookings, payments}`, `src/app/booking/*` (flow + `[id]` + chat already W3).
- **T8:** `src/app/provider/**` (tabs, `job/[id]`, `earnings`, chat).
- **T9:** `src/app/admin/**` + `src/app/(customer)/notifications` + provider notifications.

For each screen: consistent header, spacing rhythm, token colors/type, proper empty/loading (use `Skeleton`)/error states, aligned cards/lists/badges. **No change to navigation targets, data calls, or conditional logic** — only presentation. Keep each screen's existing test green.

**Checks (each wave):** `npx expo export` → `tsc` clean → `npm test` green; commit `feat: slice16 screen polish wave N`.

---

### Task 10: Branded interactive splash

**Files:** Modify `src/components/animated-icon.tsx` (+ `src/components/animated-icon.web.tsx`)

Premium reveal: `expo-linear-gradient` backdrop (deep authority green → primary); Reanimated logo scale+fade; a sparse, elegant fade/scale-in of service glyphs (⚡🔧🧹🎨🛠️) around the mark; refined settle/loading motion; graceful fade/scale-out. `prefersReducedMotion()` → static branded frame. Tasteful, uncluttered. Keep the overlay's existing mount/dismiss contract so `_layout.tsx` is unaffected.

**Checks:** `tsc` clean, `npm test` green (splash has no asserted logic; keep any existing test passing); commit `feat: slice16 branded splash`.

---

### Task 11: Customer home polish

**Files:** Modify `src/app/(customer)/index.tsx`

Strong hero (greeting + "What do you need help with today?" + polished `SearchBar`), polished service cards with clean category hierarchy + premium spacing, and an **active booking summary** card when the customer has an in-progress booking (derive from the data the screen already loads — no new queries/logic). Navigation targets and data unchanged.

**Checks:** keep `customer-*`/home tests green; `expo export` → `tsc` → `npm test`; commit `feat: slice16 home polish`.

---

### Task 12: Dark-mode consistency + accessibility pass

**Files:** Touch-ups across `theme.ts` dark values + any component using a hardcoded color

Verify dark tokens read well for every restyled surface (no invisible text, no broken contrast); fix any hardcoded light-only color to a token. Accessibility: confirm 44×44 targets on `Button`/`Input`/tappable cards, `accessibilityRole`/`Label` on icon-only controls, reduce-motion honored by splash/skeleton.

**Checks:** `npm test` green, `tsc` clean; commit `feat: slice16 dark-mode + a11y pass`.

---

### Task 13: Verification & final gate

**Files:** Create `docs/superpowers/verification/slice-16-ui.md` (manual visual review checklist)

- **Automated (no-regression):** `npx expo export --platform android` → `npx tsc --noEmit` clean → `npm test` green → `git status` clean.
- **Manual visual review (documented):** splash, home, a booking detail, a payment + M-Pesa screen, a chat, an admin screen — in **light and dark** — confirming consistency, spacing, motion restraint, readability, and that **every existing feature still works** (book → quote → pay → chat → review → notifications unaffected).
- Commit `test: slice16 verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-16-ui`. Abandon = `git checkout main` + delete branch; `main` untouched.
- **Per-wave revert:** each task/wave is an independent commit — `git revert <commit>` rolls back one wave (components/screens/splash/home/tokens) without affecting the others; token-only revert (T2) is the broadest single undo.
- **Dependency revert:** if `expo-linear-gradient`/`expo-haptics` cause build issues, `git revert` T3 and remove the imports they introduced (only splash/home/Button use them).
- **No data/schema involved** — nothing to migrate or restore; rollback is purely code.

---

## Self-Review

- **Spec coverage:** audit (T1), design system + doc (T2), deps + skeleton (T3), component polish (T4–T5), screen polish all 26 (T6–T9), splash (T10), home (T11), dark-mode + a11y (T12), verification + rollback (T13 + sections). Presentation-only guardrail repeated in Global Constraints + every task.
- **Placeholder scan:** none; checks are concrete.
- **Type consistency:** new tokens are additive (no existing key removed) so all components compile; `motion.ts` (`Durations`/`prefersReducedMotion`) consumed by `Skeleton` (T3) + splash (T10); `Skeleton` props consistent T3↔screen waves.
