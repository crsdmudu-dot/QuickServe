# QuickServe Design System

> **Version 1.0** — Slice 16 Premium UI/UX Overhaul  
> All token names below map 1-to-1 to `src/constants/theme.ts` and `src/constants/motion.ts`.

---

## 1. Color System

### 1.1 Green Ecosystem (brand palette)

| Token | Light | Dark | When to use |
|---|---|---|---|
| `primary` | `#00875A` | `#00875A` | CTAs, active tab indicators, links, toggles |
| `primaryDark` | `#006B47` | `#006B47` | Pressed/active state of primary; authority accent |
| `primaryTint` | `#E7F7F0` | `#10271F` | Chip/badge background on light; subtle highlight row |
| `primaryDeep` | `#005A3C` | `#1A4D38` | Deep authority accent — hero gradients, top nav bar bg |
| `primarySurface` | `#F2FBF7` | `#0C1F18` | Card or section backgrounds with a soft green wash |

**Rule:** only use `primary` for interactive affordances. Reserve `primarySurface` for non-interactive containers so users do not confuse decoration with tappability.

### 1.2 Neutral Ramp

| Token | Light | Dark | Role |
|---|---|---|---|
| `neutral50` | `#F9FAFB` | `#18191C` | Page wash / zebra stripes |
| `neutral100` | `#F3F4F6` | `#212225` | Input backgrounds, skeleton loaders |
| `neutral200` | `#E5E7EB` | `#2E3135` | Dividers, inactive icon fill |
| `neutral300` | `#D1D5DB` | `#3D4147` | Hairline borders when `border` is too faint |
| `neutral400` | `#9CA3AF` | `#5B6470` | Placeholder text |
| `neutral500` | `#6B7280` | `#8C939D` | Captions, metadata |
| `neutral600` | `#4B5563` | `#B0B4BA` | Secondary body text |
| `neutral700` | `#374151` | `#C8CBD0` | Strong secondary text |
| `neutral800` | `#1F2937` | `#E0E1E6` | Subheadings |
| `neutral900` | `#111827` | `#F3F4F6` | Headings (prefer `ink` for body copy) |

**Rule:** prefer the named semantic aliases (`text`, `textSecondary`, `textTertiary`) over raw neutral steps in components. Reserve raw neutrals for layout primitives (separators, skeletons, illustration fills).

### 1.3 Surface / Background Hierarchy

| Token | Light | Dark | Role |
|---|---|---|---|
| `background` | `#FFFFFF` | `#000000` | Root screen background |
| `surface` | `#FFFFFF` | `#0F1011` | Elevated cards, modals, sheets |
| `surfaceMuted` | `#F7F8FA` | `#18191C` | Sections that recede (sidebar, filter bar) |
| `backgroundElement` | `#F0F0F3` | `#212225` | Chip backgrounds, avatar ring, skeleton fill |
| `backgroundSelected` | `#E0E1E6` | `#2E3135` | Row/item selected state |

**Rule:** use `background` → `surface` → `surfaceMuted` to create depth without shadows on flat areas.

### 1.4 Border Hierarchy

| Token | Light | Dark | Role |
|---|---|---|---|
| `border` | `#ECEEF1` | `#26282B` | Default card stroke, input outline |
| `borderStrong` | `#D5D8DC` | `#3A3D42` | Focused input outline, important dividers |

### 1.5 Text Hierarchy

| Token | Light | Dark | Role |
|---|---|---|---|
| `ink` / `text` | `#0E1116` | `#FFFFFF` | Primary body copy and headings |
| `textSecondary` | `#5B6470` | `#B0B4BA` | Supporting text, subtitles |
| `textTertiary` | `#8C939D` | `#6E757E` | Metadata, timestamps, helper hints |

### 1.6 Semantic Colours + Surfaces

| Concept | Base token | Surface token | Usage |
|---|---|---|---|
| Success | `success` `#00875A` | `successSurface` `#ECFDF5` / `#052E1A` | Booking confirmed, payment received |
| Warning | `warning` `#F5A524` | `warningSurface` `#FFFBEB` / `#2D1E00` | Pending action, expiring offer |
| Error | `error` `#E5484D` | `errorSurface` `#FFF1F2` / `#2D0A0B` | Validation errors, failed payment |
| Info | `info` `#0EA5E9` / `#38BDF8` | `infoSurface` `#F0F9FF` / `#082030` | Tips, system notices |

**Rule:** use the *surface* tint for badge/chip backgrounds and the *base* colour for text or icon inside that badge. Never use a base semantic colour as a background fill — contrast will fail.

---

## 2. Typography

All variants live in `Typography` from `src/constants/theme.ts`.

| Variant | fontSize | lineHeight | fontWeight | letterSpacing | Usage |
|---|---|---|---|---|---|
| `display` | 32 | 38 | 700 | -0.5 | Hero numbers, large stat callouts |
| `title` | 24 | 30 | 700 | -0.3 | Screen titles, modal headings |
| `heading` | 18 | 24 | 600 | — | Section headers, card titles |
| `body` | 16 | 24 | 400 | — | All paragraph/list copy |
| `label` | 14 | 20 | 500 | — | Button labels, tab text, form labels |
| `caption` | 12 | 16 | 400 | — | Timestamps, image captions, fine print |

### 2.1 Font Weights

Use the `Weights` constant for consistent numeric weight strings:

```ts
import { Weights } from '@/constants/theme';
// Weights.regular = '400'
// Weights.medium  = '500'
// Weights.semibold = '600'
// Weights.bold    = '700'
```

### 2.2 Rules

- Never drop below `caption` (12 px) for readable copy.
- Negative `letterSpacing` is only applied to `display` and `title` — large sizes benefit from tighter tracking. Do not set `letterSpacing` on `body` or smaller.
- `lineHeight` is always at least 1.3× the `fontSize`. Respect this for custom text styles.
- Use `fontWeight: Weights.semibold` (600) as the minimum weight for any colour-on-coloured-background label.

---

## 3. Spacing Scale

All values are from `Spacing` in `src/constants/theme.ts`.

| Token | Value | Common use |
|---|---|---|
| `half` | 2 | Icon gap, hairline separator offset |
| `one` | 4 | Tight icon-to-label gap |
| `two` | 8 | Inner padding for compact chips |
| `three` | 16 | Standard internal padding, list item gap |
| `four` | 24 | Card padding, section gap |
| `five` | 32 | Large section spacing, hero padding |
| `six` | 64 | Full-screen vertical rhythm |

**Rule:** prefer the named tokens over raw numbers. If a value falls between two steps, choose the larger step — spaciousness is a design principle here.

---

## 4. Radius Scale

All values are from `Radii` in `src/constants/theme.ts`.

| Token | Value | Use |
|---|---|---|
| `sm` | 8 | Compact chips, small badges, tooltips |
| `md` | 12 | Input fields, secondary buttons |
| `lg` | 16 | Cards, primary buttons, bottom-sheet top corners |
| `xl` | 24 | Large modals, hero image corners |
| `pill` | 999 | Fully-rounded tags, toggle switches |

**Rule:** use `lg` (16) as the default card radius throughout the app — it defines the "premium rounded" aesthetic. Never mix radii within a single card component (all four corners must match).

---

## 5. Elevation (Shadows)

From `Shadows` in `src/constants/theme.ts`. All shadows use `shadowColor: '#000000'` with very low opacities for a premium, barely-there depth effect.

| Shadow | shadowOpacity | shadowRadius | elevation | Usage |
|---|---|---|---|---|
| `e1` | 0.04 | 4 | 1 | Flat list items, inactive tabs |
| `card` | 0.06 | 12 | 2 | Standard content cards (default) |
| `e2` | 0.08 | 16 | 4 | Hovered/focused cards, dropdown panels |
| `e3` | 0.12 | 28 | 8 | Bottom sheets, modals, toasts |

**Rule:** elevation communicates interactivity. Use `e1` for static elements, `card` for tappable cards, `e2` for state changes (press/hover), and `e3` only for overlaying elements (sheets, popovers). Never stack shadows.

---

## 6. Motion

From `src/constants/motion.ts`.

### 6.1 Durations

| Token | Value (ms) | Use |
|---|---|---|
| `fast` | 150 | Micro-interactions — icon swap, toggle, ripple |
| `base` | 250 | Standard transitions — tab change, screen enter |
| `slow` | 400 | Deliberate animations — hero entrance, large sheet open |

### 6.2 Easing Presets

| Token | Curve | When |
|---|---|---|
| `standard` | ease-in-out cubic | General purpose transitions (in AND out) |
| `decelerate` | ease-out cubic | Elements entering the screen (start fast, settle) |
| `accelerate` | ease-in cubic | Elements leaving the screen (start slow, exit fast) |

**Rule:** match easing to direction. Entering elements use `decelerate`; exiting elements use `accelerate`. Use `standard` only for in-place state changes.

### 6.3 Spring Presets (react-native-reanimated `withSpring`)

| Token | damping | stiffness | Use |
|---|---|---|---|
| `gentle` | 18 | 160 | Drawers, modal slides, list item reveals |
| `snappy` | 14 | 220 | Button press feedback, checkbox toggles |

### 6.4 Reduced Motion

Always check accessibility before running animation:

```ts
import { prefersReducedMotion, Durations } from '@/constants/motion';

const reduced = await prefersReducedMotion();
const duration = reduced ? 0 : Durations.base;
```

If `prefersReducedMotion()` returns `true`, skip or replace animations with instant state changes. Never conditionally skip *content* — only skip the *motion*.

---

## 7. Component Guidelines

### 7.1 Buttons

- **Primary:** `background: primary`, `text: #FFFFFF`, `Radii.lg`, `Spacing.three` vertical padding, `Typography.label`.
- **Secondary:** `border: border`, `background: surface`, `text: primary`, same radius and padding.
- **Ghost:** transparent background, `text: primary`, no border. Use only on `primarySurface` backgrounds.
- **Pressed state:** primary darkens to `primaryDark`; secondary border moves to `borderStrong`.
- **Disabled:** opacity 0.4. Never change colour completely — maintain brand identity.
- **Minimum tap target:** 44 × 44 pt (see Accessibility).

### 7.2 Inputs

- Border: `border` at rest → `borderStrong` on focus → `error` on validation failure.
- Background: `surfaceMuted` (resting), `surface` (focused).
- Radius: `Radii.md` (12).
- Label: `Typography.label`, colour `textSecondary`.
- Placeholder: `neutral400`.
- Error message: `Typography.caption`, colour `error`.
- Helper text: `Typography.caption`, colour `textTertiary`.

### 7.3 Cards

- Background: `surface`.
- Shadow: `Shadows.card` by default.
- Radius: `Radii.lg` (16) — all four corners.
- Padding: `Spacing.four` (24) standard; `Spacing.three` (16) for compact cards.
- Title: `Typography.heading`. Body: `Typography.body`. Meta: `Typography.caption`.

### 7.4 Badges & Chips

- Radius: `Radii.pill` for status badges; `Radii.sm` for filter chips.
- Semantic badges: use `successSurface`/`warningSurface`/`errorSurface`/`infoSurface` as background, and the base semantic colour (`success`/`warning`/`error`/`info`) as text/icon colour.
- Label: `Typography.caption`, `Weights.semibold`.
- Minimum height: 24 pt for inline badges; 32 pt for filter chips.

### 7.5 Lists

- Row height: minimum 56 pt for icon+text rows; 72 pt for avatar+subtitle rows.
- Separator: 1 pt hairline in `border` colour, inset by `Spacing.three` from left edge.
- Selected row: `backgroundSelected` fill.
- Chevron or right-action icon: `neutral400`.

### 7.6 Tabs (Bottom Navigation)

- Active: icon + label in `primary`. Tab background `background`.
- Inactive: icon + label in `neutral400`.
- Label: `Typography.caption`.
- Active indicator: 2 pt top border in `primary` (iOS style) or filled pill.

### 7.7 Empty / Loading / Error States

- **Loading:** skeleton loaders using `backgroundElement` fill with shimmer. Never show a full-screen spinner for partial data.
- **Empty:** centred illustration + `Typography.heading` title + `Typography.body` description + a primary CTA button. Use `textSecondary` for body.
- **Error:** error icon in `error` colour + `Typography.heading` message + retry button. Keep copy reassuring, not technical.

---

## 8. Accessibility Rules

### 8.1 Touch Targets
Every interactive element must be **at least 44 × 44 points**. Use `minWidth`/`minHeight` or `hitSlop` to extend small visual elements.

### 8.2 Colour Contrast (WCAG AA)
- Normal text (< 18 pt or < 14 pt bold): minimum **4.5 : 1** against its background.
- Large text (≥ 18 pt or ≥ 14 pt bold): minimum **3 : 1**.
- `primary` `#00875A` on `#FFFFFF` → contrast 4.54 : 1 ✓ (passes AA for large text; verify for small).
- `textSecondary` on `background`: verify with contrast checker when using very small captions.

### 8.3 Roles and Labels
- All interactive elements must have `accessibilityRole` (`button`, `link`, `checkbox`, etc.).
- Images must have `accessibilityLabel` or `accessibilityHint`.
- Decorative images must have `accessible={false}`.
- Form inputs must have `accessibilityLabel` matching the visible label text.

### 8.4 Reduce Motion
Wrap all animations with a `prefersReducedMotion()` check (see §6.4). Provide instant-state alternatives — not just slower animations.

### 8.5 Focus Order
Ensure logical focus traversal (top-to-bottom, left-to-right). Use `accessibilityViewIsModal` on modals to trap focus.

---

## 9. Design Principles

These four principles govern every decision in the QuickServe design system.

### 9.1 Clarity
Every element on screen must earn its place. Remove anything that doesn't help the user complete their task. Favour whitespace over decoration.

### 9.2 Restraint
One dominant action per screen. One brand colour (`primary`) per view — don't scatter it. Typography hierarchy should be readable without colour.

### 9.3 Hierarchy
Information layers from most important → least important using size, weight, and colour. `display` → `title` → `heading` → `body` → `caption` is the natural flow.

### 9.4 Spaciousness
Breathing room is not wasted space — it signals quality. Minimum `Spacing.three` (16) between distinct content blocks. Resist the urge to fill every pixel.

### 9.5 Consistency
Use the token system. If you find yourself picking a hex value that isn't a token, the token system needs extending — not bypassing. New tokens require updating both `light` AND `dark` objects.
