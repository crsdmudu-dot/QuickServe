# QuickServe — Slice 1: Foundation Design

**Date:** 2026-06-16
**Status:** Approved (design); implementation not started
**Slice:** 1 of N — Design system + Customer Home (premium visual foundation)

---

## 1. Purpose & Context

QuickServe is a premium on-demand services app (Expo React Native + TypeScript)
for Kenya first, East Africa later. Inspiration: Uber, Urban Company, Bolt, Glovo.
The full product spans 19 services and 3 user types (Customer, Provider, Admin) with
booking, live tracking, and payments — far too large for one spec.

This document specifies **only the first slice**: a premium, data-driven visual
foundation that every later slice reuses. No backend, no auth, no booking.

**Brand personality:** Premium · Reliable · Fast · Modern · Trustworthy.
**Design direction (chosen):** *Clean & Airy* (Urban Company style) — white-dominant,
generous spacing, soft green accents, large rounded cards. Optimized for one-handed use
and non-technical users, while reading premium enough for corporate clients.

---

## 2. Scope

### In scope
- Design tokens (colors, typography, spacing, radii, elevation)
- Reusable UI kit (presentational components only)
- Splash screen (native config + animated overlay)
- Customer Home screen (data-driven)
- Service catalog as data (19 services)
- Placeholder navigation only (tapping a card logs / navigates to a stub)

### Explicitly OUT of scope (YAGNI — each is a future slice)
- Authentication / role selection
- Backend / Supabase / data fetching
- Payments
- Provider app
- Admin dashboard
- Booking flow
- Maps / live tracking
- Real search logic, service detail screens, provider listings

---

## 3. Design Tokens

Replace the generic palette in `src/constants/theme.ts`. Everything consumes these;
no screen or component hardcodes color/spacing.

### Colors (light mode now; dark-mode values defined in the same shape)
```
Primary green     #00875A   primary actions, accents
Primary dark      #006B47   pressed / active states
Primary tint      #E7F7F0   icon-chip background (soft green)
Ink               #0E1116   headings & primary text (near-black, "secondary" brand color)
Text secondary    #5B6470   muted labels, "from KES…"
Background         #FFFFFF
Surface / card    #FFFFFF   (thin border + soft shadow)
Border            #ECEEF1
Success / Warning / Error   #00875A / #F5A524 / #E5484D
```

### Typography (system fonts — fast, no font-loading cost; `ui-rounded` on iOS)
```
Display  32 / bold       Title   24 / bold
Heading  18 / semibold   Body    16 / regular
Label    14 / medium     Caption 12 / regular
```

### Spacing — keep existing scale
```
half 2 · one 4 · two 8 · three 16 · four 24 · five 32 · six 64
```

### Radii & elevation (drives "large rounded cards / luxury" feel)
```
radius:  sm 8 · md 12 · lg 16 · xl 24 · pill 999
shadow:  card = soft, low-spread (offset y2, blur 12, ~6% black)
```

### Currency
KES, formatted `from KES 1,500` (Kenya-first).

---

## 4. Reusable UI Kit

Location: `src/components/ui/`. Each component is presentational (no business logic),
reads tokens (never hardcoded values), and is independently testable. Reuses existing
`themed-text`, `themed-view`, `useTheme`, and the `@/` import alias.

| Component | Purpose / Props |
|-----------|-----------------|
| `Button.tsx` | Variants: Primary (green) · Secondary (ink outline) · Ghost. Sizes md/lg. Full-width option. Pressed + disabled states. Min height 52 for one-handed tap targets. |
| `Card.tsx` | White surface, `lg` radius, thin border + soft shadow. Pressable variant (scales/dims on press). |
| `IconChip.tsx` | Rounded square, green-tint (`#E7F7F0`) background, centered icon. Signature element on each service card. |
| `SearchBar.tsx` | Pill input, leading search icon, placeholder. Presentational only (no query logic this slice). |
| `SectionHeader.tsx` | Title + optional "See all" action. Consistent spacing/typography between home sections. |
| `Text.tsx` | Thin wrapper over `themed-text` mapping the type scale (display/title/heading/body/label/caption). |
| `ServiceCard.tsx` | Composes `Card` + `IconChip`. The most-used component in QuickServe. Props: `{ icon, title, subtitle?, startingPrice?, badge?: 'Popular' \| 'New', onPress }`. Badge = small pill, top-right. Price renders as `from KES 1,500`. |
| `EmptyState.tsx` | Props: `{ icon, title, message, action? }`. Reused for: no bookings · no search results · no providers · no notifications. |

**Icons:** use `expo-symbols` (already installed) with a sensible fallback. No new icon dependency.

---

## 5. Splash Screen

Two layers, kept deliberately simple. A professional logo will replace this later.

### Native splash (`app.json` — config only, no code)
- Change splash `backgroundColor` from `#208AEF` (blue) → **white** `#FFFFFF`.
- Mark = QuickServe symbol in primary green on white.

### Animated overlay (repurpose existing `src/components/animated-icon.tsx`)
- Already wired in `_layout.tsx` as `AnimatedSplashOverlay` — repurpose, don't add.
- Treatment: white background; green symbol centered; "QuickServe" wordmark in Ink below.
- Animation: **fade + scale-in only**, then fade out to reveal Home.
- **No spinner, no Lottie, no video, no new dependencies.** Uses `react-native-reanimated`
  already in the project.

### Symbol
- Communicates speed + reliability + on-demand.
- Use **`bolt.shield.fill`** (lightning = speed/on-demand; shield = reliability/trust)
  **if it renders reliably**.
- If Android/web support is weak, **fall back to `bolt.fill`**. Do not spend time fighting
  icon compatibility — the fallback is acceptable.

```
┌─────────────────────────────┐
│                             │
│             ◉               │   green symbol, fade + scale in
│         QuickServe          │   Ink wordmark
│                             │
└─────────────────────────────┘   white background
```

---

## 6. Service Catalog (Data Model)

**Key architectural decision:** services are *data*, not 19 hardcoded cards. One catalog
array drives the entire grid and every future service screen. This prevents sprawl.

Location: `src/constants/services.ts` (mock data — no backend).

```ts
type ServiceCategory = 'home' | 'auto' | 'delivery' | 'personal';

type Service = {
  id: string;             // 'house-cleaning'
  title: string;          // 'House Cleaning'
  subtitle?: string;      // 'Deep & regular cleaning'
  icon: string;           // expo-symbols name
  category: ServiceCategory;
  startingPrice?: number; // KES, optional
  badge?: 'Popular' | 'New';
};
```

### Categories & services (all 19)
- **Home Services (9):** House Cleaning, Plumbing, Electrical Repairs, AC Repair & Servicing,
  Home Painting, Pest Control, Handyman Services, Appliance Repair, Movers & Packers.
  *(Movers & Packers placed here — customers think of it as a home service, not auto.
  A dedicated "Moving" category is a clean future option if it grows.)*
- **Auto (3):** Mechanic On Demand, Tire Replacement, Car Towing.
- **Delivery (4):** Grocery Delivery, Food Delivery, Medicine Delivery, Package Delivery.
- **Personal Care (3):** Haircuts, Makeup, Massage.

---

## 7. Customer Home Screen

Location: `src/app/index.tsx`. Top → bottom:

```
┌─────────────────────────────┐
│  Hi, Amina 👋   (greeting)   │   header, safe-area aware
│  ╒═══ Search services ═══╕   │   SearchBar (presentational)
│                             │
│  Popular        See all     │   SectionHeader
│  [ServiceCard] [ServiceCard] │   horizontal scroll, badged
│                             │
│  Home Services              │
│  ┌────┐ ┌────┐  (2-col grid)│   ServiceCard grid
│  ┌────┐ ┌────┐              │
│  Auto · Delivery · Personal │   same pattern per category
└─────────────────────────────┘
```

- `ScrollView` + 2-column grid, generous spacing, one-handed reach.
- **Popular row** = services where `badge === 'Popular'`, shown horizontally.
- Tapping a card → `onPress` navigates to a **placeholder/stub** route (service detail is a
  later slice). No booking logic.
- `EmptyState` wired into the (future) search-results path so the empty case is ready.

---

## 8. Architecture Principles

- **Tokens → primitives → screen.** Strict one-way dependency. Screens never hardcode
  color/spacing; primitives never contain business logic; data lives in `constants/`.
- **Presentational only.** Clean seams so auth/booking slices plug in later without rework.
- **Follow existing patterns.** Reuse `themed-text`, `themed-view`, `useTheme`, the `@/`
  alias, and `NativeTabs`.

---

## 9. Files Created / Changed

```
CHANGE  src/constants/theme.ts        → QuickServe tokens
NEW     src/constants/services.ts     → Service type + 19 services as data
NEW     src/components/ui/*           → Button, Card, IconChip, SearchBar,
                                        SectionHeader, Text, ServiceCard, EmptyState
CHANGE  src/app/index.tsx             → Customer Home (data-driven grid + popular row)
CHANGE  src/components/app-tabs.tsx   → tab label/icon polish (Home stays)
CHANGE  src/components/animated-icon.tsx → repurpose overlay to QuickServe mark
CHANGE  app.json                      → splash background → white
PARK    demo-only files (explore.tsx, hint-row.tsx, web-badge.tsx) — remove only after
        confirmation; not deleted blindly.
```

---

## 10. Testing

Build slowly and cleanly with light, focused tests:

- Render/props tests for each UI primitive (renders; respects props; fires `onPress`).
- Data integrity test for `services.ts` (all 19 present; unique ids; valid categories).
- Manual: `expo start` → Home renders on iOS / Android / web; one-handed reachable;
  splash plays fade+scale and dismisses.

---

## 11. Success Criteria

- `src/constants/theme.ts` exposes the QuickServe token set; no hardcoded colors elsewhere.
- All 8 UI components exist, are presentational, and pass their tests.
- All 19 services render from `services.ts` in the correct categories, with a Popular row.
- Splash shows green symbol + "QuickServe" wordmark on white with fade+scale, no spinner.
- App runs on iOS, Android, and web with no backend/auth/booking code present.
