# QuickServe — Slice 2: Auth & Role Selection Design

**Date:** 2026-06-18
**Status:** Approved (design); implementation not started
**Slice:** 2 — Auth UI foundation + role-based navigation structure

---

## 1. Purpose & Context

QuickServe (Expo SDK 56 / React Native 0.85 / React 19 / TypeScript, Expo Router) has a
Slice 1 foundation: design tokens, a UI kit, and a data-driven Customer Home that the app
currently boots into directly.

Slice 2 introduces the **entry experience and role-based navigation structure**: a user
chooses their role and is routed into the correct app area. This is **auth UI foundation
only** — no real authentication and no backend.

**Goal:** Users can choose their role and enter the correct app path (Customer / Service
Provider / Admin).

**Roles:** Customer, Service Provider, Admin.

---

## 2. Scope

### In scope
- Welcome / onboarding screen
- Role selection screen (Customer / Service Provider / Admin)
- Login screen (real-looking form, no real auth)
- Register screen (real-looking form, no real auth)
- Role-based navigation via Expo Router route groups
- Local persistence of role + signed-in state (AsyncStorage)
- A `Sign out / Switch role` path for every role

### Explicitly OUT of scope (YAGNI)
- Real authentication / credential checks
- Supabase / any backend
- Payments (see roadmap), booking, provider marketplace, admin dispatch
- Password strength/rules, phone-number format validation, email validation beyond `@`
- Social login, forgot-password, email verification
- A separate "onboarding seen" flag (gating is purely `signedIn` + `role`)

---

## 3. Navigation Architecture (Approach A: route groups + gating root)

The current `src/app/` (root `_layout.tsx` rendering `AppTabs`, plus `index.tsx` Home) is
restructured into route groups. Role becomes the top-level routing axis. The Slice 1 Home +
tabs **move into `(customer)/` unchanged**.

```
src/app/
├── _layout.tsx              root: ThemeProvider → AnimatedSplashOverlay
│                              → AuthProvider → <Stack screenOptions={{headerShown:false}}>
├── index.tsx                boot redirect (gating)
├── (onboarding)/
│   ├── _layout.tsx          Stack
│   ├── welcome.tsx
│   ├── role-select.tsx
│   ├── login.tsx
│   └── register.tsx
├── (customer)/
│   ├── _layout.tsx          AppTabs (moved from old root _layout)
│   ├── index.tsx            Slice 1 Home (moved, unchanged)
│   └── profile.tsx          sign out / switch role
├── (provider)/
│   ├── _layout.tsx          Stack
│   └── index.tsx            placeholder
└── (admin)/
    ├── _layout.tsx          Stack
    └── index.tsx            placeholder
```

### Boot gating (`src/app/index.tsx`)
```tsx
const { isLoading, signedIn, role } = useAuth();
if (isLoading) return null;                          // AnimatedSplashOverlay covers the read
if (signedIn && role) return <Redirect href={roleHref(role)} />;
return <Redirect href="/(onboarding)/welcome" />;
```
- `roleHref`: customer → `/(customer)`, provider → `/(provider)`, admin → `/(admin)`.
- Explicit navigation on actions: after sign-in → `router.replace(roleHref(role))`; after
  sign-out → `router.replace('/(onboarding)/welcome')`.
- Gating decision is based on `signedIn` + `role` only. A signed-out user always starts at
  Welcome.

---

## 4. Auth State (AuthProvider + AsyncStorage)

A single React context is the source of truth for role + session, persisted to the device.
No backend, no real credentials.

### `Role` type — single source
`Role` is defined ONCE in `src/constants/roles.ts` and imported everywhere (auth-context,
auth-storage, validation, screens). Do not redefine it elsewhere.

```ts
// src/constants/roles.ts
export type Role = 'customer' | 'provider' | 'admin';
```

### Context (`src/auth/auth-context.tsx`)
```ts
type AuthState = {
  role: Role | null;
  signedIn: boolean;
  isLoading: boolean;                          // true while reading storage on boot
  selectRole: (role: Role) => Promise<void>;   // persist chosen role (signedIn stays false)
  signIn: () => Promise<void>;                 // persist signedIn = true
  signOut: () => Promise<void>;                // FULL reset: clear role + signedIn
};

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element;
export function useAuth(): AuthState;
```

### Persistence (`src/auth/auth-storage.ts`)
```ts
import type { Role } from '@/constants/roles';
const KEY = 'quickserve.auth';
type StoredAuth = { role: Role | null; signedIn: boolean };

loadAuth(): Promise<StoredAuth>   // returns { role: null, signedIn: false } if absent/corrupt
saveAuth(state: StoredAuth): Promise<void>
clearAuth(): Promise<void>
```
- Dependency: `@react-native-async-storage/async-storage` (install via `npx expo install`).
  Supported in Expo Go; ships a Jest mock used in tests.
- Stored as a single JSON blob under one key.

### Action semantics
- `selectRole(role)` → persist `{ role, signedIn:false }`, update state. (role-select screen
  then navigates to login.)
- `signIn()` → persist `{ role, signedIn:true }`. (login/register screen then
  `router.replace(roleHref(role))`.)
- `signOut()` → `clearAuth()` + reset state to `{ role:null, signedIn:false }`. Used for both
  "Sign out" and "Switch role" in Slice 2 (full reset → Welcome).

### Boot sequence
`AuthProvider` mounts → `isLoading=true` → `loadAuth()` → set state → `isLoading=false`.
The existing `AnimatedSplashOverlay` covers the brief read; the boot redirect runs after.

---

## 5. Screens & Flow

```
Welcome ──Get Started──▶ Role Select ──pick role──▶ Login ──submit──▶ role's app
                                                      ▲  │
                                              "Register" ⇅ "Login"
                                                         │
                                          Register ──submit──▶ role's app
role's app ──Sign out / Switch role──▶ Welcome
```

| Screen | Route | Content |
|---|---|---|
| Welcome | `(onboarding)/welcome.tsx` | Branded hero: QuickServe mark, tagline, short value line, **Get Started** primary Button → role-select. Safe-area, tokens. |
| Role Select | `(onboarding)/role-select.tsx` | Title + 3 tappable role cards (Customer / Service Provider / Admin), each `Card` + `IconChip` + label + one-line description, data-driven from `roles.ts`. Tap → `selectRole(role)` → `router.push('/(onboarding)/login')`. |
| Login | `(onboarding)/login.tsx` | Form: email + password (`Input`), **Continue** Button, "New here? **Register**" link → register. Inline validation. Valid submit → `signIn()` → `router.replace(roleHref(role))`. |
| Register | `(onboarding)/register.tsx` | Form: full name, email, **phone number**, password, confirm password (`Input` fields), **Create account** Button, "Have an account? **Login**" link → login. Inline validation. Valid → `signIn()` → `router.replace(roleHref(role))`. |
| Provider placeholder | `(provider)/index.tsx` | `EmptyState`: icon + "Provider app coming soon" + message; **Sign out / Switch role** Button → `signOut()` → Welcome. |
| Admin placeholder | `(admin)/index.tsx` | Same pattern, admin copy. |
| Customer Profile | `(customer)/profile.tsx` | Minimal: role/account line + **Sign out / Switch role** Button → `signOut()` → Welcome. New second tab; Home screen file untouched. |

**Flow notes:**
- Role is chosen BEFORE login, persisted, so login/register know which app to enter. The
  login/register forms themselves are role-agnostic.
- Submit never checks credentials — validation is purely client-side UX, then it proceeds.
- All screens use the Slice 1 design system, are safe-area aware, and one-handed friendly.

---

## 6. New Components & Helpers

### `Input` primitive (`src/components/ui/input.tsx`)
```ts
type InputProps = {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  error?: string;                 // shown below the field in theme.error when set
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
};
```
Token-based: label (`Text`), bordered rounded field (`Radii.md`, `theme.border`; focused →
`theme.primary` border), error text in `theme.error`, min height 52. Presentational only.

### Roles data (`src/constants/roles.ts`)
```ts
export type Role = 'customer' | 'provider' | 'admin';
type RoleOption = { id: Role; label: string; description: string; icon: string }; // emoji icon
export const ROLES: RoleOption[];          // Customer, Service Provider, Admin (emoji icons)
export function roleHref(role: Role): '/(customer)' | '/(provider)' | '/(admin)';
```

### Validation helpers (`src/lib/validation.ts`) — pure, testable
```ts
isRequired(v: string): boolean              // non-empty after trim
isEmail(v: string): boolean                 // contains '@'
matches(a: string, b: string): boolean      // confirm-password equality
validateLogin(values: { email: string; password: string }): Record<string, string>;
validateRegister(values: {
  name: string; email: string; phone: string; password: string; confirm: string;
}): Record<string, string>;
```
Validation rules (per approved scope):
- All listed fields required.
- Email: contains `@`.
- Password: not empty.
- Confirm: equals password.
- Phone: required only (no format checks).

Each `validate*` returns a `{ field: message }` map; empty map = valid → proceed.

### Reused from Slice 1 (unchanged)
`Text`, `Button`, `Card`, `IconChip`, `EmptyState`, theme tokens, `AnimatedSplashOverlay`,
the Home screen, `ServiceCard`, etc.

### Layering
tokens → primitives (`Input`) → data (`roles`) + pure helpers (`validation`) → auth context
→ screens. No screen holds persistence or validation logic directly; it calls helpers/context.

---

## 7. Files Created / Changed

```
NEW    src/constants/roles.ts                 Role type (single source) + ROLES + roleHref
NEW    src/lib/validation.ts                  validation helpers
NEW    src/auth/auth-storage.ts               loadAuth/saveAuth/clearAuth (AsyncStorage)
NEW    src/auth/auth-context.tsx              AuthProvider + useAuth
NEW    src/components/ui/input.tsx            Input primitive
CHANGE src/components/app-tabs.tsx            add Profile tab trigger (Home untouched)

REPLACE src/app/_layout.tsx                   root: ThemeProvider→Splash→AuthProvider→Stack
REPLACE src/app/index.tsx                     boot redirect (gating)
NEW    src/app/(onboarding)/_layout.tsx
NEW    src/app/(onboarding)/welcome.tsx
NEW    src/app/(onboarding)/role-select.tsx
NEW    src/app/(onboarding)/login.tsx
NEW    src/app/(onboarding)/register.tsx
MOVE   (Slice 1 Home) → src/app/(customer)/index.tsx       unchanged content
NEW    src/app/(customer)/_layout.tsx         AppTabs (old root _layout logic)
NEW    src/app/(customer)/profile.tsx
NEW    src/app/(provider)/_layout.tsx
NEW    src/app/(provider)/index.tsx
NEW    src/app/(admin)/_layout.tsx
NEW    src/app/(admin)/index.tsx

CHANGE package.json / package-lock.json       + @react-native-async-storage/async-storage
```

---

## 8. Testing

jest-expo + @testing-library/react-native; AsyncStorage Jest mock.

- `validation.test.ts` — required, `@`-email, confirm-match, validateLogin/validateRegister
  error maps (including phone-required, confirm-mismatch cases).
- `roles.test.ts` — 3 roles, unique ids, `roleHref` mapping for all three.
- `auth-storage.test.ts` — save→load round-trip; clear; absent/corrupt → defaults.
- `auth-context.test.tsx` — `selectRole`/`signIn`/`signOut` update state + persist; boot loads
  stored state (test consumer component).
- `input.test.tsx` — renders label, fires `onChangeText`, shows `error`.
- Screen tests — welcome renders + Get Started navigates; role-select renders 3 roles + tap
  selects + navigates; login/register show validation errors on empty submit and proceed when
  valid (mock `useAuth` + `expo-router`); provider/admin placeholders render + sign-out;
  customer profile renders + sign-out.

**Critical test-placement rule (Slice 1 lesson):** every screen/route test lives in
`src/__tests__/`, NEVER inside `src/app/`. Expo Router's `require.context('./src/app')` bundles
every file under `src/app/`, so a test file there pulls `@testing-library/react-native`
(`require('console')`) into the native bundle and breaks Metro. Non-route tests (validation,
roles, auth, input) colocate normally.

**Bundle smoke:** after wiring, the Android bundle and `npx expo export --platform web` must
build cleanly (AsyncStorage is Expo Go–supported).

---

## 9. Success Criteria

- A signed-out user launches into Welcome → can select a role → reaches Login/Register.
- Login and Register show inline validation errors on invalid input and proceed on valid input.
- After submit, the user lands in the correct app area: Customer → Slice 1 Home (tabs);
  Provider → provider placeholder; Admin → admin placeholder.
- Every role has a Sign out / Switch role action that performs a full reset and returns to
  Welcome.
- A signed-in user who relaunches the app goes straight to their role's app (persisted).
- `Role` is defined in exactly one place (`src/constants/roles.ts`).
- All tests pass; `tsc` clean; Android + web bundles build. No real auth/backend/payment/
  booking code is present.
```
