# QuickServe Slice 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a premium, data-driven visual foundation for QuickServe — design tokens, a reusable UI kit, a white splash, and a Customer Home screen rendering all 19 services from data — with no backend, auth, or booking.

**Architecture:** Strict one-way dependency: **tokens → primitives → screen**. Tokens live in `src/constants/theme.ts`; service data lives in `src/constants/services.ts`; presentational UI primitives live in `src/components/ui/`; the Home screen composes them. No business logic in primitives. Follows existing patterns (`useTheme`, `themed-*`, `@/` alias, `NativeTabs`).

**Tech Stack:** Expo SDK ~56, React Native 0.85, React 19.2, TypeScript, Expo Router, `expo-symbols` (splash only), `react-native-reanimated` (splash only). Testing: `jest-expo` + `@testing-library/react-native`.

## Global Constraints

- **Brand colors (verbatim):** Primary `#00875A` · Primary dark `#006B47` · Primary tint `#E7F7F0` · Ink `#0E1116` · Background `#FFFFFF` · Text secondary `#5B6470` · Border `#ECEEF1`.
- **Currency:** KES, formatted `from KES 1,500` (thousands grouped with commas).
- **System fonts only** — no font loading, no new font deps.
- **No new runtime dependencies** beyond what is already installed (test tooling is dev-only).
- **Icons:** service icons use **emoji** (cross-platform in Expo Go on iOS + Android, zero deps). Splash uses `bolt.shield.fill` on iOS with fallback to `bolt.fill`, and a green ⚡ emoji on Android/web. Do not fight icon compatibility.
- **Spacing scale (keep existing):** `half 2 · one 4 · two 8 · three 16 · four 24 · five 32 · six 64`.
- **Radii:** `sm 8 · md 12 · lg 16 · xl 24 · pill 999`.
- **Strictly Slice 1.** OUT OF SCOPE (do not build): auth, backend/Supabase, payments, provider app, admin dashboard, booking flow, maps, real search logic, service detail screens, provider listings. Card taps call a placeholder handler only.
- **TDD + frequent commits.** Each task ends with a passing check and a commit. Component visual correctness is verified manually in Expo Go at the milestones noted.

---

## Rollback Plan (applies to every task)

- All work happens on branch **`feat/slice-1-foundation`** (created in Task 1). `main`/`master` stays clean.
- **Every task is its own commit.** If a task breaks something, roll back that task with:
  - `git revert <commit-sha>` (safe, keeps history), or
  - `git reset --hard HEAD~1` (only if the commit is the latest and not pushed).
- **Demo files are parked, not deleted** (moved into `_parked/`), so the starter template is recoverable with a single `git mv` back.
- **Test tooling is isolated** to dev dependencies + `jest.config.js`; if the test runner cannot be made to work in this environment, revert Task 1 and keep the pure-logic checks as manual `tsc` checks — the feature code is unaffected.
- **Abort criteria:** if `expo start` fails to bundle after a task, immediately `git stash` or revert that task's commit and diagnose before continuing. Never stack a new task on a non-bundling app.

---

## How to Verify on Expo Go (reference for all manual checks)

1. Run `npm start` (alias for `expo start`) in the project root.
2. A QR code appears in the terminal.
   - **iOS:** open the Camera app, scan the QR, open in Expo Go.
   - **Android:** open the **Expo Go** app → "Scan QR code".
   - Both devices must be on the **same Wi-Fi** as the computer. If not, press `s` in the terminal to switch to Tunnel mode.
3. The app reloads automatically on save (Fast Refresh). Press `r` in the terminal to force reload.
4. **Native tabs note:** this project uses `expo-router/unstable-native-tabs`. If the tab bar does not render in Expo Go, that is an Expo Go limitation, not a bug in this slice — verify in a dev build (`npx expo run:ios` / `run:android`). The Home screen content itself is verifiable in Expo Go regardless.
5. **Web fallback:** `npm run web` opens the app in a browser — useful for quickly checking layout without a device.

---

## File Structure (locked decisions)

```
NEW     jest.config.js                       → test runner config (jest-expo)
NEW     test/setup.ts                         → RTL matchers setup
CHANGE  package.json                          → test deps + "test" script

CHANGE  src/constants/theme.ts                → brand colors, Radii, Shadows, Typography
NEW     src/lib/currency.ts                   → formatKes()
NEW     src/lib/currency.test.ts
NEW     src/constants/services.ts             → Service type + 19 services + selectors
NEW     src/constants/services.test.ts

NEW     src/components/ui/text.tsx            → Text primitive (Typography tokens)
NEW     src/components/ui/card.tsx            → Card (static + pressable)
NEW     src/components/ui/icon-chip.tsx       → IconChip (emoji on green tint)
NEW     src/components/ui/button.tsx          → Button (primary/secondary/ghost)
NEW     src/components/ui/search-bar.tsx      → SearchBar (presentational)
NEW     src/components/ui/section-header.tsx  → SectionHeader (title + See all)
NEW     src/components/ui/service-card.tsx    → ServiceCard (composes Card + IconChip)
NEW     src/components/ui/empty-state.tsx     → EmptyState
NEW     src/components/ui/*.test.tsx          → one focused test per component

CHANGE  src/app/index.tsx                     → Customer Home (data-driven)
CHANGE  src/components/app-tabs.tsx           → single Home tab, brand colors
CHANGE  src/components/animated-icon.tsx      → AnimatedSplashOverlay → white + QuickServe mark
CHANGE  app.json                              → splash backgroundColor → #FFFFFF

MOVE    src/app/explore.tsx        → _parked/explore.tsx       (kills demo route)
MOVE    src/components/hint-row.tsx → _parked/hint-row.tsx
MOVE    src/components/web-badge.tsx → _parked/web-badge.tsx
```

---

## Task 1: Branch + test tooling

**Files:**
- Create: `jest.config.js`, `test/setup.ts`
- Modify: `package.json` (scripts + devDependencies)
- Test: `test/sanity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` command using the `jest-expo` preset and `@testing-library/react-native` matchers.

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/slice-1-foundation
```

- [ ] **Step 2: Install dev test dependencies**

```bash
npx expo install jest-expo
npm install --save-dev jest @testing-library/react-native react-test-renderer@19.2.3 @types/jest
```
Expected: packages added under `devDependencies`. (`react-test-renderer` must match React `19.2.3`.)

- [ ] **Step 3: Add the test script to `package.json`**

In the `"scripts"` block add:
```json
"test": "jest"
```

- [ ] **Step 4: Create `jest.config.js`**

```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|expo-router|expo-symbols|react-native-reanimated|react-native-worklets|@react-native/.*))',
  ],
};
```

- [ ] **Step 5: Create `test/setup.ts`**

```ts
import '@testing-library/react-native/extend-expect';
```

- [ ] **Step 6: Write a sanity test — `test/sanity.test.ts`**

```ts
describe('test tooling', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Run it**

Run: `npm test`
Expected: PASS — 1 test passed.

- [ ] **Step 8: Commit**

```bash
git add jest.config.js test/ package.json package-lock.json
git commit -m "chore: add jest-expo test tooling"
```

---

## Task 2: Design tokens

**Files:**
- Modify: `src/constants/theme.ts`
- Test: `src/constants/theme.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Colors.light` / `Colors.dark` gain keys: `primary`, `primaryDark`, `primaryTint`, `ink`, `border`, `success`, `warning`, `error` (existing keys stay).
  - `Radii: { sm:8; md:12; lg:16; xl:24; pill:999 }`
  - `Shadows: { card: ViewStyle }`
  - `Typography: Record<'display'|'title'|'heading'|'body'|'label'|'caption', TextStyle>`

- [ ] **Step 1: Write the failing test — `src/constants/theme.test.ts`**

```ts
import { Colors, Radii, Shadows, Typography } from '@/constants/theme';

describe('design tokens', () => {
  it('exposes the QuickServe brand palette (light)', () => {
    expect(Colors.light.primary).toBe('#00875A');
    expect(Colors.light.primaryDark).toBe('#006B47');
    expect(Colors.light.primaryTint).toBe('#E7F7F0');
    expect(Colors.light.ink).toBe('#0E1116');
    expect(Colors.light.background).toBe('#FFFFFF');
    expect(Colors.light.border).toBe('#ECEEF1');
  });

  it('defines the same keys for dark mode', () => {
    expect(Object.keys(Colors.dark).sort()).toEqual(Object.keys(Colors.light).sort());
  });

  it('exposes radii and typography scales', () => {
    expect(Radii.lg).toBe(16);
    expect(Radii.pill).toBe(999);
    expect(Typography.display.fontSize).toBe(32);
    expect(Typography.body.fontSize).toBe(16);
    expect(Shadows.card.borderRadius).toBeUndefined();
    expect(Shadows.card.shadowOpacity).toBe(0.06);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- theme.test`
Expected: FAIL (`Colors.light.primary` is undefined; `Radii`/`Typography`/`Shadows` not exported).

- [ ] **Step 3: Update `src/constants/theme.ts`**

Replace the `Colors` object and append the new exports. Keep `Fonts`, `Spacing`, `BottomTabInset`, `MaxContentWidth`, and the `import '@/global.css'` line exactly as they are.

```ts
import '@/global.css';

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const Colors = {
  light: {
    text: '#0E1116',
    ink: '#0E1116',
    background: '#FFFFFF',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#5B6470',
    primary: '#00875A',
    primaryDark: '#006B47',
    primaryTint: '#E7F7F0',
    border: '#ECEEF1',
    success: '#00875A',
    warning: '#F5A524',
    error: '#E5484D',
  },
  dark: {
    text: '#FFFFFF',
    ink: '#FFFFFF',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    primary: '#00875A',
    primaryDark: '#006B47',
    primaryTint: '#10271F',
    border: '#26282B',
    success: '#00875A',
    warning: '#F5A524',
    error: '#E5484D',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const Shadows = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as ViewStyle,
} as const;

export const Typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
```

> Note: `themed-text.tsx` references `Fonts` and `ThemeColor` — both preserved. The `text` color changed from `#000000` to Ink `#0E1116`; this is intentional and affects only shade.

- [ ] **Step 4: Run the test**

Run: `npm test -- theme.test`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/constants/theme.ts src/constants/theme.test.ts
git commit -m "feat: add QuickServe design tokens"
```

---

## Task 3: Currency helper

**Files:**
- Create: `src/lib/currency.ts`
- Test: `src/lib/currency.test.ts`

**Interfaces:**
- Produces: `formatKes(amount: number): string` → e.g. `formatKes(1500) === 'KES 1,500'`.

- [ ] **Step 1: Write the failing test — `src/lib/currency.test.ts`**

```ts
import { formatKes } from '@/lib/currency';

describe('formatKes', () => {
  it('groups thousands with commas', () => {
    expect(formatKes(1500)).toBe('KES 1,500');
    expect(formatKes(1200000)).toBe('KES 1,200,000');
  });
  it('handles values below 1000', () => {
    expect(formatKes(900)).toBe('KES 900');
  });
  it('rounds to whole shillings', () => {
    expect(formatKes(1499.6)).toBe('KES 1,500');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- currency.test`
Expected: FAIL (`Cannot find module '@/lib/currency'`).

- [ ] **Step 3: Implement `src/lib/currency.ts`**

```ts
/** Format a number of Kenyan shillings as "KES 1,500" (no decimals, comma grouping). */
export function formatKes(amount: number): string {
  const grouped = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `KES ${grouped}`;
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- currency.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/currency.ts src/lib/currency.test.ts
git commit -m "feat: add KES currency formatter"
```

---

## Task 4: Service catalog data

**Files:**
- Create: `src/constants/services.ts`
- Test: `src/constants/services.test.ts`

**Interfaces:**
- Produces:
  - `type ServiceCategory = 'home' | 'auto' | 'delivery' | 'personal'`
  - `type ServiceBadge = 'Popular' | 'New'`
  - `type Service = { id: string; title: string; subtitle?: string; icon: string; category: ServiceCategory; startingPrice?: number; badge?: ServiceBadge }`
  - `SERVICES: Service[]` (19 entries)
  - `CATEGORY_ORDER: ServiceCategory[]`
  - `CATEGORY_LABELS: Record<ServiceCategory, string>`
  - `getServicesByCategory(category: ServiceCategory): Service[]`
  - `getPopularServices(): Service[]`

- [ ] **Step 1: Write the failing test — `src/constants/services.test.ts`**

```ts
import {
  SERVICES,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  getServicesByCategory,
  getPopularServices,
  type ServiceCategory,
} from '@/constants/services';

const VALID: ServiceCategory[] = ['home', 'auto', 'delivery', 'personal'];

describe('service catalog', () => {
  it('contains all 19 services', () => {
    expect(SERVICES).toHaveLength(19);
  });
  it('has unique ids', () => {
    const ids = SERVICES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('only uses valid categories', () => {
    for (const s of SERVICES) expect(VALID).toContain(s.category);
  });
  it('places Movers & Packers under home', () => {
    const movers = SERVICES.find((s) => s.id === 'movers-packers');
    expect(movers?.category).toBe('home');
  });
  it('groups services by category in order', () => {
    expect(CATEGORY_ORDER).toEqual(['home', 'auto', 'delivery', 'personal']);
    expect(getServicesByCategory('home')).toHaveLength(9);
    expect(getServicesByCategory('auto')).toHaveLength(3);
    expect(getServicesByCategory('delivery')).toHaveLength(4);
    expect(getServicesByCategory('personal')).toHaveLength(3);
  });
  it('exposes at least one popular service', () => {
    expect(getPopularServices().length).toBeGreaterThan(0);
    expect(getPopularServices().every((s) => s.badge === 'Popular')).toBe(true);
  });
  it('labels every category', () => {
    for (const c of CATEGORY_ORDER) expect(CATEGORY_LABELS[c]).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- services.test`
Expected: FAIL (`Cannot find module '@/constants/services'`).

- [ ] **Step 3: Implement `src/constants/services.ts`**

```ts
export type ServiceCategory = 'home' | 'auto' | 'delivery' | 'personal';
export type ServiceBadge = 'Popular' | 'New';

export type Service = {
  id: string;
  title: string;
  subtitle?: string;
  /** Emoji glyph — renders identically on iOS, Android, and web. */
  icon: string;
  category: ServiceCategory;
  /** Starting price in KES. */
  startingPrice?: number;
  badge?: ServiceBadge;
};

export const CATEGORY_ORDER: ServiceCategory[] = ['home', 'auto', 'delivery', 'personal'];

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  home: 'Home Services',
  auto: 'Auto',
  delivery: 'Delivery',
  personal: 'Personal Care',
};

export const SERVICES: Service[] = [
  // Home (9)
  { id: 'house-cleaning', title: 'House Cleaning', subtitle: 'Deep & regular cleaning', icon: '🧹', category: 'home', startingPrice: 1500, badge: 'Popular' },
  { id: 'plumbing', title: 'Plumbing', subtitle: 'Leaks, fittings & repairs', icon: '🔧', category: 'home', startingPrice: 2000, badge: 'Popular' },
  { id: 'electrical', title: 'Electrical Repairs', subtitle: 'Wiring & fixtures', icon: '⚡', category: 'home', startingPrice: 1800 },
  { id: 'ac-repair', title: 'AC Repair & Servicing', subtitle: 'Cooling & maintenance', icon: '❄️', category: 'home', startingPrice: 2500, badge: 'Popular' },
  { id: 'painting', title: 'Home Painting', subtitle: 'Interior & exterior', icon: '🎨', category: 'home', startingPrice: 3000 },
  { id: 'pest-control', title: 'Pest Control', subtitle: 'Safe & thorough', icon: '🐜', category: 'home', startingPrice: 2200 },
  { id: 'handyman', title: 'Handyman Services', subtitle: 'Fixes & odd jobs', icon: '🛠️', category: 'home', startingPrice: 1200 },
  { id: 'appliance-repair', title: 'Appliance Repair', subtitle: 'Fridges, washers & more', icon: '🔌', category: 'home', startingPrice: 1600 },
  { id: 'movers-packers', title: 'Movers & Packers', subtitle: 'Pack, move & unpack', icon: '📦', category: 'home', startingPrice: 5000 },
  // Auto (3)
  { id: 'mechanic', title: 'Mechanic On Demand', subtitle: 'Roadside & at-home', icon: '🚗', category: 'auto', startingPrice: 2000, badge: 'Popular' },
  { id: 'tire-replacement', title: 'Tire Replacement', subtitle: 'Change & balancing', icon: '🛞', category: 'auto', startingPrice: 1500 },
  { id: 'car-towing', title: 'Car Towing', subtitle: '24/7 recovery', icon: '🚙', category: 'auto', startingPrice: 3500 },
  // Delivery (4)
  { id: 'grocery-delivery', title: 'Grocery Delivery', subtitle: 'Fresh to your door', icon: '🛒', category: 'delivery', startingPrice: 300, badge: 'Popular' },
  { id: 'food-delivery', title: 'Food Delivery', subtitle: 'From local restaurants', icon: '🍔', category: 'delivery', startingPrice: 250, badge: 'Popular' },
  { id: 'medicine-delivery', title: 'Medicine Delivery', subtitle: 'Pharmacy on demand', icon: '💊', category: 'delivery', startingPrice: 300 },
  { id: 'package-delivery', title: 'Package Delivery', subtitle: 'Send anything, fast', icon: '📮', category: 'delivery', startingPrice: 400 },
  // Personal Care (3)
  { id: 'haircuts', title: 'Haircuts', subtitle: 'Barbers & stylists', icon: '✂️', category: 'personal', startingPrice: 800, badge: 'New' },
  { id: 'makeup', title: 'Makeup', subtitle: 'Events & occasions', icon: '💄', category: 'personal', startingPrice: 2500 },
  { id: 'massage', title: 'Massage', subtitle: 'Relax at home', icon: '💆', category: 'personal', startingPrice: 2000, badge: 'New' },
];

export function getServicesByCategory(category: ServiceCategory): Service[] {
  return SERVICES.filter((s) => s.category === category);
}

export function getPopularServices(): Service[] {
  return SERVICES.filter((s) => s.badge === 'Popular');
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- services.test`
Expected: PASS (all assertions, including the 9/3/4/3 counts).

- [ ] **Step 5: Commit**

```bash
git add src/constants/services.ts src/constants/services.test.ts
git commit -m "feat: add service catalog data (19 services)"
```

---

## Task 5: Text primitive

**Files:**
- Create: `src/components/ui/text.tsx`
- Test: `src/components/ui/text.test.tsx`

**Interfaces:**
- Consumes: `Typography`, `ThemeColor` from `@/constants/theme`; `useTheme` from `@/hooks/use-theme`.
- Produces: `Text` component. Props: `TextProps & { variant?: keyof typeof Typography; color?: ThemeColor }`. Default `variant='body'`, `color='text'`.

- [ ] **Step 1: Write the failing test — `src/components/ui/text.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react-native';
import { Text } from '@/components/ui/text';

describe('Text', () => {
  it('renders its children', () => {
    render(<Text>Hello QuickServe</Text>);
    expect(screen.getByText('Hello QuickServe')).toBeOnTheScreen();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- text.test`
Expected: FAIL (`Cannot find module '@/components/ui/text'`).

- [ ] **Step 3: Implement `src/components/ui/text.tsx`**

```tsx
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { Typography, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextVariant = keyof typeof Typography;

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  color?: ThemeColor;
};

export function Text({ variant = 'body', color = 'text', style, ...rest }: AppTextProps) {
  const theme = useTheme();
  return <RNText style={[Typography[variant] as TextStyle, { color: theme[color] }, style]} {...rest} />;
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- text.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/text.tsx src/components/ui/text.test.tsx
git commit -m "feat: add Text UI primitive"
```

---

## Task 6: Card + IconChip

**Files:**
- Create: `src/components/ui/card.tsx`, `src/components/ui/icon-chip.tsx`
- Test: `src/components/ui/card.test.tsx`

**Interfaces:**
- Consumes: `Radii`, `Shadows` from `@/constants/theme`; `useTheme`.
- Produces:
  - `Card` — Props: `ViewProps & { onPress?: () => void }`. Renders `Pressable` when `onPress` given, else `View`.
  - `IconChip` — Props: `{ icon: string; size?: number }` (default size 28). Renders the emoji on a `primaryTint` rounded-square background.

- [ ] **Step 1: Write the failing test — `src/components/ui/card.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Card } from '@/components/ui/card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card><Text>Inside</Text></Card>);
    expect(screen.getByText('Inside')).toBeOnTheScreen();
  });
  it('fires onPress when pressable', () => {
    const onPress = jest.fn();
    render(<Card onPress={onPress}><Text>Tap me</Text></Card>);
    fireEvent.press(screen.getByText('Tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- card.test`
Expected: FAIL (`Cannot find module '@/components/ui/card'`).

- [ ] **Step 3: Implement `src/components/ui/card.tsx`**

```tsx
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { Radii, Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CardProps = ViewProps & {
  onPress?: () => void;
};

export function Card({ style, onPress, children, ...rest }: CardProps) {
  const theme = useTheme();
  const base = [
    styles.card,
    { backgroundColor: theme.background, borderColor: theme.border },
    style,
  ];

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && styles.pressed]}>
        {children}
      </Pressable>
    );
  }
  return (
    <View style={base} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    ...Shadows.card,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
```

- [ ] **Step 4: Implement `src/components/ui/icon-chip.tsx`**

```tsx
import { StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconChipProps = {
  /** Emoji glyph. */
  icon: string;
  size?: number;
};

export function IconChip({ icon, size = 28 }: IconChipProps) {
  const theme = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: theme.primaryTint }]}>
      <Text style={{ fontSize: size }}>{icon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: 56,
    height: 56,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
});
```

- [ ] **Step 5: Run the test**

Run: `npm test -- card.test`
Expected: PASS (both cases).

- [ ] **Step 6: Type-check & commit**

```bash
npx tsc --noEmit
git add src/components/ui/card.tsx src/components/ui/icon-chip.tsx src/components/ui/card.test.tsx
git commit -m "feat: add Card and IconChip UI primitives"
```

---

## Task 7: Button

**Files:**
- Create: `src/components/ui/button.tsx`
- Test: `src/components/ui/button.test.tsx`

**Interfaces:**
- Consumes: `Radii`, `Spacing` from `@/constants/theme`; `useTheme`; `Text` from `@/components/ui/text`.
- Produces: `Button` — Props: `{ label: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost'; size?: 'md' | 'lg'; fullWidth?: boolean; disabled?: boolean }`. Defaults: `variant='primary'`, `size='md'`.

- [ ] **Step 1: Write the failing test — `src/components/ui/button.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders its label', () => {
    render(<Button label="Book now" />);
    expect(screen.getByText('Book now')).toBeOnTheScreen();
  });
  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<Button label="Go" onPress={onPress} />);
    fireEvent.press(screen.getByText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    render(<Button label="Nope" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Nope'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- button.test`
Expected: FAIL (`Cannot find module '@/components/ui/button'`).

- [ ] **Step 3: Implement `src/components/ui/button.tsx`**

```tsx
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
}: ButtonProps) {
  const theme = useTheme();

  const container: ViewStyle = {
    backgroundColor: variant === 'primary' ? theme.primary : 'transparent',
    borderWidth: variant === 'secondary' ? 1 : 0,
    borderColor: theme.ink,
    borderRadius: Radii.pill,
    height: size === 'lg' ? 56 : 52,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
    opacity: disabled ? 0.5 : 1,
  };

  const labelColor: ThemeColor = variant === 'primary' ? 'background' : 'ink';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [container, pressed && !disabled && styles.pressed]}>
      <Text variant="label" color={labelColor}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
});
```

> Note: primary label uses `color="background"` (white on green in light mode; resolves correctly in dark mode too since `background` flips).

- [ ] **Step 4: Run the test**

Run: `npm test -- button.test`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/button.test.tsx
git commit -m "feat: add Button UI primitive"
```

---

## Task 8: SearchBar + SectionHeader

**Files:**
- Create: `src/components/ui/search-bar.tsx`, `src/components/ui/section-header.tsx`
- Test: `src/components/ui/section-header.test.tsx`

**Interfaces:**
- Produces:
  - `SearchBar` — Props: `{ placeholder?: string; value?: string; onChangeText?: (t: string) => void }`. Presentational pill input with a leading 🔍.
  - `SectionHeader` — Props: `{ title: string; onSeeAll?: () => void }`. Shows "See all" only when `onSeeAll` is provided.

- [ ] **Step 1: Write the failing test — `src/components/ui/section-header.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SectionHeader } from '@/components/ui/section-header';

describe('SectionHeader', () => {
  it('renders the title', () => {
    render(<SectionHeader title="Popular" />);
    expect(screen.getByText('Popular')).toBeOnTheScreen();
  });
  it('hides See all when no handler', () => {
    render(<SectionHeader title="Popular" />);
    expect(screen.queryByText('See all')).toBeNull();
  });
  it('shows and fires See all', () => {
    const onSeeAll = jest.fn();
    render(<SectionHeader title="Popular" onSeeAll={onSeeAll} />);
    fireEvent.press(screen.getByText('See all'));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- section-header.test`
Expected: FAIL (`Cannot find module '@/components/ui/section-header'`).

- [ ] **Step 3: Implement `src/components/ui/section-header.tsx`**

```tsx
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { Text } from '@/components/ui/text';

export type SectionHeaderProps = {
  title: string;
  onSeeAll?: () => void;
};

export function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant="heading">{title}</Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text variant="label" color="primary">
            See all
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
});
```

- [ ] **Step 4: Implement `src/components/ui/search-bar.tsx`**

```tsx
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SearchBarProps = {
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
};

export function SearchBar({ placeholder = 'Search services', value, onChangeText }: SearchBarProps) {
  const theme = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: theme.backgroundElement }]}>
      <Text style={styles.icon}>🔍</Text>
      <TextInput
        style={[styles.input, { color: theme.text }]}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.three,
    height: 52,
    gap: Spacing.two,
  },
  icon: { fontSize: 16 },
  input: { flex: 1, fontSize: 16 },
});
```

- [ ] **Step 5: Run the test**

Run: `npm test -- section-header.test`
Expected: PASS (all three cases).

- [ ] **Step 6: Type-check & commit**

```bash
npx tsc --noEmit
git add src/components/ui/search-bar.tsx src/components/ui/section-header.tsx src/components/ui/section-header.test.tsx
git commit -m "feat: add SearchBar and SectionHeader UI primitives"
```

---

## Task 9: ServiceCard

**Files:**
- Create: `src/components/ui/service-card.tsx`
- Test: `src/components/ui/service-card.test.tsx`

**Interfaces:**
- Consumes: `Card`, `IconChip`, `Text`; `formatKes` from `@/lib/currency`; `Spacing`, `Radii` from `@/constants/theme`; `useTheme`.
- Produces: `ServiceCard` — Props: `{ icon: string; title: string; subtitle?: string; startingPrice?: number; badge?: 'Popular' | 'New'; onPress?: () => void }`. Renders price as `from KES 1,500`; renders the badge pill only when `badge` is set.

- [ ] **Step 1: Write the failing test — `src/components/ui/service-card.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ServiceCard } from '@/components/ui/service-card';

describe('ServiceCard', () => {
  it('renders title and formatted starting price', () => {
    render(<ServiceCard icon="🧹" title="House Cleaning" startingPrice={1500} />);
    expect(screen.getByText('House Cleaning')).toBeOnTheScreen();
    expect(screen.getByText('from KES 1,500')).toBeOnTheScreen();
  });
  it('renders a badge when provided', () => {
    render(<ServiceCard icon="🧹" title="House Cleaning" badge="Popular" />);
    expect(screen.getByText('Popular')).toBeOnTheScreen();
  });
  it('omits the price line when no startingPrice', () => {
    render(<ServiceCard icon="🧹" title="House Cleaning" />);
    expect(screen.queryByText(/from KES/)).toBeNull();
  });
  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<ServiceCard icon="🧹" title="House Cleaning" onPress={onPress} />);
    fireEvent.press(screen.getByText('House Cleaning'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- service-card.test`
Expected: FAIL (`Cannot find module '@/components/ui/service-card'`).

- [ ] **Step 3: Implement `src/components/ui/service-card.tsx`**

```tsx
import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatKes } from '@/lib/currency';
import { Card } from '@/components/ui/card';
import { IconChip } from '@/components/ui/icon-chip';
import { Text } from '@/components/ui/text';

export type ServiceCardProps = {
  icon: string;
  title: string;
  subtitle?: string;
  startingPrice?: number;
  badge?: 'Popular' | 'New';
  onPress?: () => void;
};

export function ServiceCard({
  icon,
  title,
  subtitle,
  startingPrice,
  badge,
  onPress,
}: ServiceCardProps) {
  const theme = useTheme();
  return (
    <Card onPress={onPress}>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: theme.primaryTint }]}>
          <Text variant="caption" color="primaryDark">
            {badge}
          </Text>
        </View>
      ) : null}
      <IconChip icon={icon} />
      <Text variant="label">{title}</Text>
      {subtitle ? (
        <Text variant="caption" color="textSecondary" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
      {startingPrice != null ? (
        <Text variant="caption" color="primaryDark" style={styles.price}>
          {`from ${formatKes(startingPrice)}`}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radii.pill,
    zIndex: 1,
  },
  subtitle: { marginTop: Spacing.half },
  price: { marginTop: Spacing.two, fontWeight: '600' },
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- service-card.test`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/service-card.tsx src/components/ui/service-card.test.tsx
git commit -m "feat: add ServiceCard component"
```

---

## Task 10: EmptyState

**Files:**
- Create: `src/components/ui/empty-state.tsx`
- Test: `src/components/ui/empty-state.test.tsx`

**Interfaces:**
- Consumes: `Text`, `Button`, `Spacing`.
- Produces: `EmptyState` — Props: `{ icon: string; title: string; message: string; actionLabel?: string; onAction?: () => void }`. Renders a `Button` only when both `actionLabel` and `onAction` are provided.

- [ ] **Step 1: Write the failing test — `src/components/ui/empty-state.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { EmptyState } from '@/components/ui/empty-state';

describe('EmptyState', () => {
  it('renders title and message', () => {
    render(<EmptyState icon="📭" title="No bookings yet" message="Your bookings will appear here." />);
    expect(screen.getByText('No bookings yet')).toBeOnTheScreen();
    expect(screen.getByText('Your bookings will appear here.')).toBeOnTheScreen();
  });
  it('renders and fires the action when provided', () => {
    const onAction = jest.fn();
    render(
      <EmptyState icon="📭" title="No results" message="Try another search." actionLabel="Reset" onAction={onAction} />,
    );
    fireEvent.press(screen.getByText('Reset'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- empty-state.test`
Expected: FAIL (`Cannot find module '@/components/ui/empty-state'`).

- [ ] **Step 3: Implement `src/components/ui/empty-state.tsx`**

```tsx
import { StyleSheet, Text as RNText, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export type EmptyStateProps = {
  icon: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <RNText style={styles.icon}>{icon}</RNText>
      <Text variant="heading" style={styles.center}>
        {title}
      </Text>
      <Text variant="body" color="textSecondary" style={styles.center}>
        {message}
      </Text>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.five },
  icon: { fontSize: 48, marginBottom: Spacing.two },
  center: { textAlign: 'center' },
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- empty-state.test`
Expected: PASS (both cases).

- [ ] **Step 5: Type-check & commit**

```bash
npx tsc --noEmit
git add src/components/ui/empty-state.tsx src/components/ui/empty-state.test.tsx
git commit -m "feat: add EmptyState component"
```

---

## Task 11: Customer Home screen

**Files:**
- Modify: `src/app/index.tsx` (full replacement)
- Test: `src/app/index.test.tsx`

**Interfaces:**
- Consumes: `SERVICES`, `CATEGORY_ORDER`, `CATEGORY_LABELS`, `getServicesByCategory`, `getPopularServices`, `type Service` from `@/constants/services`; `ServiceCard`, `SearchBar`, `SectionHeader`, `Text`; `Spacing`, `BottomTabInset`, `MaxContentWidth`; `useTheme`.
- Produces: default-exported `HomeScreen`. Card taps call a placeholder handler `handleServicePress(service)` that `console.log`s the id (no navigation route created in this slice).

- [ ] **Step 1: Write the failing test — `src/app/index.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react-native';
import HomeScreen from '@/app/index';

describe('HomeScreen', () => {
  it('renders the search bar and the four category sections', () => {
    render(<HomeScreen />);
    expect(screen.getByPlaceholderText('Search services')).toBeOnTheScreen();
    expect(screen.getByText('Home Services')).toBeOnTheScreen();
    expect(screen.getByText('Auto')).toBeOnTheScreen();
    expect(screen.getByText('Delivery')).toBeOnTheScreen();
    expect(screen.getByText('Personal Care')).toBeOnTheScreen();
  });
  it('renders a Popular section', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Popular')).toBeOnTheScreen();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- "app/index.test"`
Expected: FAIL — the current `index.tsx` renders "Welcome to Expo", not these sections.

- [ ] **Step 3: Replace `src/app/index.tsx`**

```tsx
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  getPopularServices,
  getServicesByCategory,
  type Service,
} from '@/constants/services';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SearchBar } from '@/components/ui/search-bar';
import { SectionHeader } from '@/components/ui/section-header';
import { ServiceCard } from '@/components/ui/service-card';
import { Text } from '@/components/ui/text';

function handleServicePress(service: Service) {
  // Placeholder navigation — service detail is a later slice.
  console.log('Selected service:', service.id);
}

export default function HomeScreen() {
  const theme = useTheme();
  const popular = getPopularServices();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <Text variant="title">Hi, Amina 👋</Text>
          <Text variant="body" color="textSecondary">
            What do you need done today?
          </Text>
        </View>

        <SearchBar />

        <View style={styles.section}>
          <SectionHeader title="Popular" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.popularRow}>
            {popular.map((service) => (
              <View key={service.id} style={styles.popularItem}>
                <ServiceCard
                  icon={service.icon}
                  title={service.title}
                  subtitle={service.subtitle}
                  startingPrice={service.startingPrice}
                  badge={service.badge}
                  onPress={() => handleServicePress(service)}
                />
              </View>
            ))}
          </ScrollView>
        </View>

        {CATEGORY_ORDER.map((category) => (
          <View key={category} style={styles.section}>
            <SectionHeader title={CATEGORY_LABELS[category]} />
            <View style={styles.grid}>
              {getServicesByCategory(category).map((service) => (
                <View key={service.id} style={styles.gridItem}>
                  <ServiceCard
                    icon={service.icon}
                    title={service.title}
                    subtitle={service.subtitle}
                    startingPrice={service.startingPrice}
                    badge={service.badge}
                    onPress={() => handleServicePress(service)}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingBottom: BottomTabInset + Spacing.four,
  },
  safeArea: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    paddingTop: Spacing.three,
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.two,
  },
  popularRow: {
    gap: Spacing.three,
    paddingRight: Spacing.four,
  },
  popularItem: {
    width: 220,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  gridItem: {
    // Two columns: each item is just under half width, gap fills the rest.
    width: '47%',
    flexGrow: 1,
  },
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- "app/index.test"`
Expected: PASS (both cases).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual Expo Go verification (Home)**

Run: `npm start`, open in Expo Go (see "How to Verify on Expo Go").
Verify:
- Greeting + search bar render at the top, white background.
- "Popular" row scrolls horizontally and cards show badges + `from KES …`.
- Four category sections ("Home Services", "Auto", "Delivery", "Personal Care") render as a 2-column grid.
- Tapping a card logs `Selected service: <id>` in the terminal (placeholder).
- Layout is comfortable one-handed; no clipped text.

- [ ] **Step 7: Commit**

```bash
git add src/app/index.tsx src/app/index.test.tsx
git commit -m "feat: build data-driven Customer Home screen"
```

---

## Task 12: Tabs polish + park demo files

**Files:**
- Modify: `src/components/app-tabs.tsx`
- Move: `src/app/explore.tsx` → `_parked/explore.tsx`; `src/components/hint-row.tsx` → `_parked/hint-row.tsx`; `src/components/web-badge.tsx` → `_parked/web-badge.tsx`

**Interfaces:**
- Consumes: `Colors` from `@/constants/theme`.
- Produces: a single-tab `NativeTabs` (Home only) using brand colors for the selected label.

- [ ] **Step 1: Park the demo route and unused demo components**

```bash
mkdir _parked
git mv src/app/explore.tsx _parked/explore.tsx
git mv src/components/hint-row.tsx _parked/hint-row.tsx
git mv src/components/web-badge.tsx _parked/web-badge.tsx
```
> Rationale: `explore.tsx` is parked because any file under `src/app/` is a live route; moving it out removes the demo "Explore" route. `hint-row` and `web-badge` were only used by the old demo screens.

- [ ] **Step 2: Replace `src/components/app-tabs.tsx`**

```tsx
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.primaryTint}
      labelStyle={{ selected: { color: colors.primary } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
```

- [ ] **Step 3: Verify the bundle builds and tests pass**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors (no lingering imports of the parked files); all tests pass.

- [ ] **Step 4: Manual Expo Go check**

Run: `npm start`. Confirm only the **Home** tab shows and the app loads to the Home screen with no "Explore" tab.

- [ ] **Step 5: Commit**

Stage only this task's explicit paths — do NOT use `git add -A` / `git add .`, which would sweep in unrelated untracked entries at the repo root (e.g. the `Claude/` folder).

```bash
git add src/components/app-tabs.tsx src/app/explore.tsx _parked/ src/components/hint-row.tsx src/components/web-badge.tsx
git status   # verify ONLY the intended renames/edits are staged before committing
git commit -m "chore: single Home tab; park demo screens"
```

> The `git mv` operations in Step 1 already stage the renames; the explicit `git add` above re-stages them plus the `app-tabs.tsx` edit. `git status` must show no stray paths (no `Claude/`, no other untracked dirs) before you commit.

---

## Task 13: Splash — white background + QuickServe mark

**Files:**
- Modify: `src/components/animated-icon.tsx` (the `AnimatedSplashOverlay` function only)
- Modify: `app.json` (splash `backgroundColor`)

**Interfaces:**
- Consumes: `Colors`, `Typography` from `@/constants/theme`; `expo-symbols` (`SymbolView`), `react-native-reanimated`.
- Produces: an overlay that shows a green symbol + "QuickServe" wordmark on white, fades + scales in, then fades out (no spinner).

- [ ] **Step 1: Update `app.json` splash background to white**

In `app.json`, under `plugins → expo-splash-screen`, change:
```json
"backgroundColor": "#208AEF",
```
to:
```json
"backgroundColor": "#FFFFFF",
```

- [ ] **Step 2: Replace the `AnimatedSplashOverlay` function in `src/components/animated-icon.tsx`**

Replace the existing `AnimatedSplashOverlay` function (lines ~10-45) and the `backgroundSolidColor` style entry with the version below. **Leave `AnimatedIcon`, `keyframe`, `logoKeyframe`, `glowKeyframe`, and the other styles unchanged** (they are now unused but harmless; do not delete in this slice).

Add these imports at the top of the file (alongside the existing ones):
```tsx
import { Platform, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Colors, Typography } from '@/constants/theme';
```

New overlay function:
```tsx
export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const markKeyframe = new Keyframe({
    0: { opacity: 0, transform: [{ scale: 0.8 }] },
    40: { opacity: 1, transform: [{ scale: 1 }] },
    75: { opacity: 1, transform: [{ scale: 1 }] },
    100: { opacity: 0, transform: [{ scale: 1 }] },
  });

  return (
    <Animated.View
      entering={markKeyframe.duration(1400).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splash}>
      {Platform.OS === 'ios' ? (
        <SymbolView name="bolt.shield.fill" size={84} tintColor={Colors.light.primary} fallback={null} />
      ) : (
        <Text style={styles.splashEmoji}>⚡</Text>
      )}
      <Text style={styles.splashWordmark}>QuickServe</Text>
    </Animated.View>
  );
}
```

> `bolt.shield.fill` is used on iOS; if it ever fails to resolve, change the `name` to `bolt.fill`. Android/web show a green ⚡ emoji. Do not spend time fighting symbol availability.

- [ ] **Step 3: Update the styles** — replace `backgroundSolidColor` with:
```tsx
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    zIndex: 1000,
  },
  splashEmoji: {
    fontSize: 72,
  },
  splashWordmark: {
    ...Typography.title,
    color: Colors.light.ink,
  },
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `SymbolView`'s `name` prop rejects the string type, cast: `name={'bolt.shield.fill' as never}` — do not block on this.)

- [ ] **Step 5: Manual Expo Go verification (Splash)**

Run: `npm start`, reload the app in Expo Go.
Verify:
- White background (no blue).
- Green symbol (iOS: shield+bolt; Android: ⚡) fades + scales in, then the overlay fades out to reveal Home.
- "QuickServe" wordmark in near-black under the symbol.
- No spinner.

- [ ] **Step 6: Commit**

```bash
git add src/components/animated-icon.tsx app.json
git commit -m "feat: white splash with QuickServe mark"
```

---

## Final Verification (after all tasks)

- [ ] Run the full suite: `npm test` → all tests pass.
- [ ] Type-check: `npx tsc --noEmit` → no errors.
- [ ] Lint: `npm run lint` → no errors.
- [ ] Expo Go (iOS + Android if available): splash plays, Home renders all 19 services in the right categories, Popular row scrolls, taps log to terminal.
- [ ] Confirm OUT-OF-SCOPE items are absent: no auth, backend, payments, booking, maps, or service-detail routes were added.

---

## Self-Review (against the spec)

**Spec coverage:**
- §3 Design Tokens → Task 2 ✓ (colors, radii, shadow, typography; KES handled in Task 3).
- §4 UI Kit (Button, Card, IconChip, SearchBar, SectionHeader, Text, ServiceCard, EmptyState) → Tasks 5–10 ✓ (all 8 components).
- §5 Splash → Task 13 ✓ (white bg, green symbol + wordmark, fade+scale, no spinner, fallback rule).
- §6 Service catalog data → Task 4 ✓ (19 services, Movers under home, selectors).
- §7 Customer Home → Task 11 ✓ (greeting, search, Popular row, per-category 2-col grid, placeholder nav).
- §8 Architecture (tokens→primitives→screen, presentational, existing patterns) → enforced by task order + interfaces ✓.
- §9 Files created/changed → Tasks 2,4,11,12,13 + demo parking ✓.
- §10 Testing → Tasks 1–11 carry tests; manual Expo Go checks in 11,12,13 ✓.

**Decisions flagged (deviation from literal spec, for the same intent):**
- Service icons use **emoji**, not `expo-symbols`, because `expo-symbols` is iOS-only and would render blank on Android in Expo Go. Emoji are cross-platform, zero-dep, and match the approved mockups. `expo-symbols` is still used for the iOS splash.
- `Text` reads `Typography` tokens directly rather than wrapping `themed-text` (whose type scale differs). Same outcome, cleaner.

**Placeholder scan:** none — every code step contains complete code.

**Type consistency:** `ServiceCard` props match the fields produced by `Service` in Task 4; `formatKes` signature consistent across Tasks 3 and 9; `Text` `variant`/`color` props consistent across all consumers; `EmptyState` uses `actionLabel`/`onAction` consistently.
