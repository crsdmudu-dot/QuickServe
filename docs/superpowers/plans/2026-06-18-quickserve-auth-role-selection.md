# QuickServe Slice 2 — Auth & Role Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users choose a role (Customer / Service Provider / Admin) and are routed into the correct app area, with a welcome → role-select → login/register flow and locally-persisted session — no real auth or backend.

**Architecture:** Expo Router route groups `(onboarding)`/`(customer)`/`(provider)`/`(admin)` under a root `Stack`. An `AuthProvider` (React context + AsyncStorage) holds `{ role, signedIn }`. Gating lives in the root `_layout.tsx` as a `useSegments` + redirect effect (the canonical Expo Router auth pattern). The Slice 1 Home moves into `(customer)/index.tsx` (still served at `/`) unchanged.

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19, TypeScript, Expo Router (typed routes), `@react-native-async-storage/async-storage`, jest-expo + @testing-library/react-native.

## Global Constraints

- **Single `Role` type:** defined ONCE in `src/constants/roles.ts` (`'customer' | 'provider' | 'admin'`); imported everywhere. Never redefined.
- **Route paths (collision-free):** `(customer)/index.tsx`→`/`, `(customer)/profile.tsx`→`/profile`, `(onboarding)/welcome.tsx`→`/welcome`, `/role-select`, `/login`, `/register`, `(provider)/provider.tsx`→`/provider`, `(admin)/admin.tsx`→`/admin`. Only ONE route may own `/` (customer index).
- **Gating in root `_layout.tsx`** (not a root `index.tsx`) — there is NO `src/app/index.tsx` after the refactor.
- **`roleHref`:** customer→`/`, provider→`/provider`, admin→`/admin`.
- **Validation rules:** all listed fields required; email contains `@`; password non-empty; confirm equals password; phone required only (no format check).
- **Design tokens only** — no hardcoded colors; reuse Slice 1 primitives (`Text`, `Button`, `Card`, `IconChip`, `EmptyState`) and tokens (`Spacing`, `Radii`, `useTheme`).
- **Customer Home unchanged** except for the added Profile tab. The Home screen file content does not change.
- **Test placement rule (Slice 1 lesson):** every screen/route test goes in `src/__tests__/`, NEVER under `src/app/` (Expo Router bundles the whole `app/` dir → breaks Metro). Non-route tests (roles, validation, auth, input) colocate normally.
- **No new dependencies** beyond `@react-native-async-storage/async-storage`.
- **Strictly Slice 2.** OUT OF SCOPE: real auth/credentials, Supabase/backend, payments, booking, provider marketplace, admin dispatch, password strength, social login, forgot-password, phone format validation, email validation beyond `@`.
- **TDD + one commit per task.** After every task: `npm test`, `npx tsc --noEmit`, commit.

---

## Rollback Plan (applies to every task)

- All work on branch **`feat/slice-2-auth`** (created in Task 1). `main` stays clean.
- Each task is its own commit. Roll back a task with `git revert <sha>` (safe) or `git reset --hard HEAD~1` (latest, unpushed only).
- The Slice 1 Home is **moved with `git mv`** (content preserved); reverting the move restores it.
- AsyncStorage is the only new dependency; if it misbehaves, revert Task 4 — the rest of the UI is unaffected.
- **Abort criteria:** if `expo start` / `expo export` fails to bundle after a task, revert that task's commit before continuing. Never stack on a non-bundling app.

---

## How to Verify on Expo Go (reference)

`npm start` (or `$env:REACT_NATIVE_PACKAGER_HOSTNAME="<PC LAN IP>"; npx expo start -c`, or `npx expo start --tunnel -c`), scan in Expo Go. The native tab bar (customer area) may need a dev build, but all screen content renders in Expo Go. `npm run web` opens the browser build.

**Full journey (verified in Task 14):**
1. First launch (signed out) → **Welcome**.
2. Get Started → **Role Select** → pick a role → **Login**.
3. Login (or switch to Register) → submit valid → land in the selected role's app (Customer → Home tabs; Provider → placeholder; Admin → placeholder).
4. Sign out / Switch role → back to **Welcome**.
5. Relaunch while signed in → straight to the correct role app.

---

## File Structure

```
NEW   src/constants/roles.ts              Role (single source) + ROLES + roleHref
NEW   src/lib/validation.ts               isRequired/isEmail/matches + validateLogin/validateRegister
NEW   src/auth/auth-storage.ts            loadAuth/saveAuth/clearAuth (AsyncStorage)
NEW   src/auth/auth-context.tsx           AuthProvider + useAuth
NEW   src/components/ui/input.tsx         Input primitive
CHANGE src/components/app-tabs.tsx        + Profile tab trigger (Home untouched)
CHANGE test/setup.ts                      + AsyncStorage jest mock

REPLACE src/app/_layout.tsx               root: ThemeProvider→Splash→[AuthProvider]→Stack[+gating]
DELETE  src/app/index.tsx                 (moved into (customer); gating now in _layout)
NEW   src/app/(customer)/_layout.tsx      AppTabs
MOVE  src/app/index.tsx → src/app/(customer)/index.tsx   (Slice 1 Home, unchanged)
NEW   src/app/(customer)/profile.tsx
NEW   src/app/(onboarding)/_layout.tsx    Stack
NEW   src/app/(onboarding)/welcome.tsx
NEW   src/app/(onboarding)/role-select.tsx
NEW   src/app/(onboarding)/login.tsx
NEW   src/app/(onboarding)/register.tsx
NEW   src/app/(provider)/provider.tsx
NEW   src/app/(admin)/admin.tsx

NEW   src/__tests__/welcome.test.tsx, role-select.test.tsx, login.test.tsx,
      register.test.tsx, provider.test.tsx, admin.test.tsx, profile.test.tsx
NEW   src/constants/roles.test.ts, src/lib/validation.test.ts,
      src/auth/auth-storage.test.ts, src/auth/auth-context.test.tsx,
      src/components/ui/input.test.tsx

CHANGE package.json / package-lock.json   + @react-native-async-storage/async-storage
```

---

## Task 1: Routing structure & route groups (app boots to Home, unchanged)

**Files:**
- Create branch `feat/slice-2-auth`
- Create dir + move: `src/app/index.tsx` → `src/app/(customer)/index.tsx`
- Create: `src/app/(customer)/_layout.tsx`, `src/app/(onboarding)/_layout.tsx`, `src/app/(onboarding)/welcome.tsx`, `role-select.tsx`, `login.tsx`, `register.tsx` (stubs)
- Replace: `src/app/_layout.tsx`

**Interfaces:**
- Produces: route-group structure; `/` served by `(customer)/index.tsx`; onboarding route stubs exist for typed-routes. Root layout = `Stack`.

- [ ] **Step 1: Branch**
```bash
git checkout -b feat/slice-2-auth
```

- [ ] **Step 2: Move the Home screen into the (customer) group (content unchanged)**
```bash
mkdir -p "src/app/(customer)"
git mv "src/app/index.tsx" "src/app/(customer)/index.tsx"
```

- [ ] **Step 3: Create `src/app/(customer)/_layout.tsx`** (renders the tabs that the root used to render)
```tsx
import AppTabs from '@/components/app-tabs';

export default function CustomerLayout() {
  return <AppTabs />;
}
```

- [ ] **Step 4: Replace `src/app/_layout.tsx`** (root becomes a Stack; keep ThemeProvider + splash)
```tsx
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
```

- [ ] **Step 5: Create `src/app/(onboarding)/_layout.tsx`**
```tsx
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 6: Create the four onboarding stubs** (filled in later tasks; they exist now so typed routes resolve cross-references)

`src/app/(onboarding)/welcome.tsx`:
```tsx
import { Text } from '@/components/ui/text';

export default function WelcomeScreen() {
  return <Text>Welcome</Text>;
}
```
`src/app/(onboarding)/role-select.tsx`:
```tsx
import { Text } from '@/components/ui/text';

export default function RoleSelectScreen() {
  return <Text>Role Select</Text>;
}
```
`src/app/(onboarding)/login.tsx`:
```tsx
import { Text } from '@/components/ui/text';

export default function LoginScreen() {
  return <Text>Login</Text>;
}
```
`src/app/(onboarding)/register.tsx`:
```tsx
import { Text } from '@/components/ui/text';

export default function RegisterScreen() {
  return <Text>Register</Text>;
}
```

- [ ] **Step 7: Verify** — bundle still builds and the app boots to Home unchanged
```bash
npx tsc --noEmit          # expect clean
npm test                  # expect existing 44 tests still pass
npx expo export --platform web   # expect: bundles with no errors
```
Expected: tsc clean; 44 tests pass; web export completes. `/` resolves to the Slice 1 Home.

- [ ] **Step 8: Commit**
```bash
git add -A -- src
git status   # confirm only src/app changes (move + new group files); no stray paths
git commit -m "refactor: move Home into (customer) group; add route groups"
```

---

## Task 2: Roles data (single-source Role type)

**Files:** Create `src/constants/roles.ts`; Test `src/constants/roles.test.ts`

**Interfaces:**
- Produces: `type Role = 'customer'|'provider'|'admin'`; `type RoleOption`; `ROLES: RoleOption[]`; `roleHref(role): '/' | '/provider' | '/admin'`.

- [ ] **Step 1: Write the failing test — `src/constants/roles.test.ts`**
```ts
import { ROLES, roleHref, type Role } from '@/constants/roles';

describe('roles', () => {
  it('defines exactly three roles with unique ids', () => {
    expect(ROLES).toHaveLength(3);
    const ids = ROLES.map((r) => r.id);
    expect(new Set(ids)).toEqual(new Set<Role>(['customer', 'provider', 'admin']));
  });
  it('every role has a label, description, and icon', () => {
    for (const r of ROLES) {
      expect(r.label).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(r.icon).toBeTruthy();
    }
  });
  it('maps each role to its app path', () => {
    expect(roleHref('customer')).toBe('/');
    expect(roleHref('provider')).toBe('/provider');
    expect(roleHref('admin')).toBe('/admin');
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test -- roles.test` (module not found)

- [ ] **Step 3: Implement `src/constants/roles.ts`**
```ts
export type Role = 'customer' | 'provider' | 'admin';

export type RoleOption = {
  id: Role;
  label: string;
  description: string;
  icon: string; // emoji
};

export const ROLES: RoleOption[] = [
  { id: 'customer', label: 'Customer', description: 'Book trusted services near you', icon: '🧍' },
  { id: 'provider', label: 'Service Provider', description: 'Offer your services and earn', icon: '🧰' },
  { id: 'admin', label: 'Admin', description: 'Manage the QuickServe platform', icon: '🛡️' },
];

export function roleHref(role: Role): '/' | '/provider' | '/admin' {
  switch (role) {
    case 'customer':
      return '/';
    case 'provider':
      return '/provider';
    case 'admin':
      return '/admin';
  }
}
```

- [ ] **Step 4: Run → PASS** `npm test -- roles.test`
- [ ] **Step 5: tsc + commit**
```bash
npx tsc --noEmit
git add src/constants/roles.ts src/constants/roles.test.ts
git commit -m "feat: add roles data and roleHref"
```

---

## Task 3: Validation helpers

**Files:** Create `src/lib/validation.ts`; Test `src/lib/validation.test.ts`

**Interfaces:**
- Produces: `isRequired`, `isEmail`, `matches`, `validateLogin(values)`, `validateRegister(values)` → `Record<string,string>` (empty = valid).

- [ ] **Step 1: Write the failing test — `src/lib/validation.test.ts`**
```ts
import { isEmail, isRequired, matches, validateLogin, validateRegister } from '@/lib/validation';

describe('validation primitives', () => {
  it('isRequired trims', () => {
    expect(isRequired('  ')).toBe(false);
    expect(isRequired(' a ')).toBe(true);
  });
  it('isEmail checks for @', () => {
    expect(isEmail('foo')).toBe(false);
    expect(isEmail('a@b')).toBe(true);
  });
  it('matches compares equality', () => {
    expect(matches('x', 'x')).toBe(true);
    expect(matches('x', 'y')).toBe(false);
  });
});

describe('validateLogin', () => {
  it('flags required + email format', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Email is required',
      password: 'Password is required',
    });
    expect(validateLogin({ email: 'nope', password: 'x' })).toEqual({ email: 'Enter a valid email' });
  });
  it('passes for valid input', () => {
    expect(validateLogin({ email: 'a@b', password: 'pw' })).toEqual({});
  });
});

describe('validateRegister', () => {
  it('requires all fields, valid email, matching confirm', () => {
    expect(validateRegister({ name: '', email: '', phone: '', password: '', confirm: '' })).toEqual({
      name: 'Full name is required',
      email: 'Email is required',
      phone: 'Phone number is required',
      password: 'Password is required',
      confirm: 'Please confirm your password',
    });
  });
  it('flags mismatch + bad email', () => {
    expect(
      validateRegister({ name: 'A', email: 'bad', phone: '0700', password: 'a', confirm: 'b' }),
    ).toEqual({ email: 'Enter a valid email', confirm: 'Passwords do not match' });
  });
  it('passes for valid input', () => {
    expect(
      validateRegister({ name: 'A', email: 'a@b', phone: '0700', password: 'pw', confirm: 'pw' }),
    ).toEqual({});
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test -- validation.test`

- [ ] **Step 3: Implement `src/lib/validation.ts`**
```ts
export function isRequired(v: string): boolean {
  return v.trim().length > 0;
}
export function isEmail(v: string): boolean {
  return v.includes('@');
}
export function matches(a: string, b: string): boolean {
  return a === b;
}

export type LoginValues = { email: string; password: string };
export function validateLogin(v: LoginValues): Record<string, string> {
  const e: Record<string, string> = {};
  if (!isRequired(v.email)) e.email = 'Email is required';
  else if (!isEmail(v.email)) e.email = 'Enter a valid email';
  if (!isRequired(v.password)) e.password = 'Password is required';
  return e;
}

export type RegisterValues = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
};
export function validateRegister(v: RegisterValues): Record<string, string> {
  const e: Record<string, string> = {};
  if (!isRequired(v.name)) e.name = 'Full name is required';
  if (!isRequired(v.email)) e.email = 'Email is required';
  else if (!isEmail(v.email)) e.email = 'Enter a valid email';
  if (!isRequired(v.phone)) e.phone = 'Phone number is required';
  if (!isRequired(v.password)) e.password = 'Password is required';
  if (!isRequired(v.confirm)) e.confirm = 'Please confirm your password';
  else if (!matches(v.password, v.confirm)) e.confirm = 'Passwords do not match';
  return e;
}
```

- [ ] **Step 4: Run → PASS** `npm test -- validation.test`
- [ ] **Step 5: tsc + commit**
```bash
npx tsc --noEmit
git add src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat: add auth form validation helpers"
```

---

## Task 4: Auth storage (AsyncStorage)

**Files:** Create `src/auth/auth-storage.ts`; Modify `test/setup.ts`; Test `src/auth/auth-storage.test.ts`; install dependency.

**Interfaces:**
- Consumes: `Role` from `@/constants/roles`.
- Produces: `type StoredAuth = { role: Role|null; signedIn: boolean }`; `loadAuth()`, `saveAuth(state)`, `clearAuth()`.

- [ ] **Step 1: Install AsyncStorage**
```bash
npx expo install @react-native-async-storage/async-storage
```

- [ ] **Step 2: Add the AsyncStorage Jest mock to `test/setup.ts`** (append):
```ts
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
```

- [ ] **Step 3: Write the failing test — `src/auth/auth-storage.test.ts`**
```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAuth, loadAuth, saveAuth } from '@/auth/auth-storage';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('auth-storage', () => {
  it('returns defaults when nothing stored', async () => {
    expect(await loadAuth()).toEqual({ role: null, signedIn: false });
  });
  it('round-trips saved state', async () => {
    await saveAuth({ role: 'provider', signedIn: true });
    expect(await loadAuth()).toEqual({ role: 'provider', signedIn: true });
  });
  it('clears state', async () => {
    await saveAuth({ role: 'admin', signedIn: true });
    await clearAuth();
    expect(await loadAuth()).toEqual({ role: null, signedIn: false });
  });
  it('returns defaults on corrupt data', async () => {
    await AsyncStorage.setItem('quickserve.auth', 'not json');
    expect(await loadAuth()).toEqual({ role: null, signedIn: false });
  });
});
```

- [ ] **Step 4: Run → FAIL** `npm test -- auth-storage.test`

- [ ] **Step 5: Implement `src/auth/auth-storage.ts`**
```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Role } from '@/constants/roles';

const KEY = 'quickserve.auth';

export type StoredAuth = { role: Role | null; signedIn: boolean };
const DEFAULT: StoredAuth = { role: null, signedIn: false };

const VALID_ROLES: Role[] = ['customer', 'provider', 'admin'];

export async function loadAuth(): Promise<StoredAuth> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    const roleOk = parsed.role === null || (typeof parsed.role === 'string' && VALID_ROLES.includes(parsed.role as Role));
    if (roleOk && typeof parsed.signedIn === 'boolean') {
      return { role: (parsed.role ?? null) as Role | null, signedIn: parsed.signedIn };
    }
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export async function saveAuth(state: StoredAuth): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export async function clearAuth(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
```

- [ ] **Step 6: Run → PASS** `npm test -- auth-storage.test`
- [ ] **Step 7: Bundle smoke (new native dep)**
```bash
npx tsc --noEmit
npx expo export --platform web   # expect no errors (AsyncStorage bundles)
```
- [ ] **Step 8: Commit**
```bash
git add src/auth/auth-storage.ts src/auth/auth-storage.test.ts test/setup.ts package.json package-lock.json
git commit -m "feat: add AsyncStorage-backed auth storage"
```

---

## Task 5: AuthProvider + useAuth (mounted in root)

**Files:** Create `src/auth/auth-context.tsx`; Modify `src/app/_layout.tsx`; Test `src/auth/auth-context.test.tsx`

**Interfaces:**
- Consumes: `Role` (roles), `loadAuth/saveAuth/clearAuth` (auth-storage).
- Produces: `AuthProvider`, `useAuth(): { role, signedIn, isLoading, selectRole, signIn, signOut }`.

- [ ] **Step 1: Write the failing test — `src/auth/auth-context.test.tsx`**
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '@/auth/auth-context';

function Probe() {
  const { isLoading, role, signedIn, selectRole, signIn, signOut } = useAuth();
  return (
    <>
      <Text>{isLoading ? 'loading' : `ready:${role ?? 'none'}:${signedIn}`}</Text>
      <Pressable onPress={() => selectRole('provider')}>
        <Text>select</Text>
      </Pressable>
      <Pressable onPress={() => signIn()}>
        <Text>signin</Text>
      </Pressable>
      <Pressable onPress={() => signOut()}>
        <Text>signout</Text>
      </Pressable>
    </>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('loads defaults then supports select/sign-in/sign-out with persistence', async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByText('ready:none:false')).toBeOnTheScreen());

  fireEvent.press(screen.getByText('select'));
  await waitFor(() => expect(screen.getByText('ready:provider:false')).toBeOnTheScreen());
  expect(JSON.parse((await AsyncStorage.getItem('quickserve.auth')) ?? '{}')).toEqual({
    role: 'provider',
    signedIn: false,
  });

  fireEvent.press(screen.getByText('signin'));
  await waitFor(() => expect(screen.getByText('ready:provider:true')).toBeOnTheScreen());
  expect(JSON.parse((await AsyncStorage.getItem('quickserve.auth')) ?? '{}')).toEqual({
    role: 'provider',
    signedIn: true,
  });

  fireEvent.press(screen.getByText('signout'));
  await waitFor(() => expect(screen.getByText('ready:none:false')).toBeOnTheScreen());
  expect(await AsyncStorage.getItem('quickserve.auth')).toBeNull();
});
```

- [ ] **Step 2: Run → FAIL** `npm test -- auth-context.test`

- [ ] **Step 3: Implement `src/auth/auth-context.tsx`**
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Role } from '@/constants/roles';
import { clearAuth, loadAuth, saveAuth } from '@/auth/auth-storage';

type AuthState = {
  role: Role | null;
  signedIn: boolean;
  isLoading: boolean;
  selectRole: (role: Role) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadAuth().then((s) => {
      if (!active) return;
      setRole(s.role);
      setSignedIn(s.signedIn);
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function selectRole(r: Role) {
    setRole(r);
    setSignedIn(false);
    await saveAuth({ role: r, signedIn: false });
  }
  async function signIn() {
    setSignedIn(true);
    await saveAuth({ role, signedIn: true });
  }
  async function signOut() {
    setRole(null);
    setSignedIn(false);
    await clearAuth();
  }

  return (
    <AuthContext.Provider value={{ role, signedIn, isLoading, selectRole, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Mount the provider in `src/app/_layout.tsx`** (wrap the Stack; gating still NOT added yet)
```tsx
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/auth/auth-context';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 5: Run → PASS** `npm test -- auth-context.test`
- [ ] **Step 6: tsc + commit**
```bash
npx tsc --noEmit
git add src/auth/auth-context.tsx src/app/_layout.tsx src/auth/auth-context.test.tsx
git commit -m "feat: add AuthProvider/useAuth and mount it at root"
```

---

## Task 6: Input primitive

**Files:** Create `src/components/ui/input.tsx`; Test `src/components/ui/input.test.tsx`

**Interfaces:**
- Consumes: `Radii`, `Spacing` (theme), `useTheme`, `Text`.
- Produces: `Input` with props `{ label, value, onChangeText, placeholder?, error?, secureTextEntry?, keyboardType?, autoCapitalize? }`.

- [ ] **Step 1: Write the failing test — `src/components/ui/input.test.tsx`**
```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('renders the label and forwards typing', () => {
    const onChangeText = jest.fn();
    render(<Input label="Email" value="" onChangeText={onChangeText} placeholder="you@example.com" />);
    expect(screen.getByText('Email')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b');
    expect(onChangeText).toHaveBeenCalledWith('a@b');
  });
  it('shows an error message when provided', () => {
    render(<Input label="Email" value="" onChangeText={() => {}} error="Email is required" />);
    expect(screen.getByText('Email is required')).toBeOnTheScreen();
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test -- input.test`

- [ ] **Step 3: Implement `src/components/ui/input.tsx`**
```tsx
import { useState } from 'react';
import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type InputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
};

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
}: InputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? theme.error : focused ? theme.primary : theme.border;

  return (
    <View style={styles.container}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <TextInput
        style={[styles.input, { borderColor, color: theme.text, backgroundColor: theme.background }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType as KeyboardTypeOptions}
        autoCapitalize={autoCapitalize}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one, alignSelf: 'stretch' },
  input: {
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.three,
    height: 52,
    fontSize: 16,
  },
});
```

- [ ] **Step 4: Run → PASS** `npm test -- input.test`
- [ ] **Step 5: tsc + commit**
```bash
npx tsc --noEmit
git add src/components/ui/input.tsx src/components/ui/input.test.tsx
git commit -m "feat: add Input UI primitive"
```

---

## Task 7: Welcome screen (fill stub)

**Files:** Modify `src/app/(onboarding)/welcome.tsx`; Test `src/__tests__/welcome.test.tsx`

**Interfaces:**
- Consumes: `Button`, `Text`, `useTheme`, `Spacing`; `router` from `expo-router`.
- Produces: Welcome screen; Get Started → `router.push('/role-select')`.

- [ ] **Step 1: Write the failing test — `src/__tests__/welcome.test.tsx`**
```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

const push = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => push(...a), replace: jest.fn() } }));

import WelcomeScreen from '@/app/(onboarding)/welcome';

describe('WelcomeScreen', () => {
  beforeEach(() => push.mockClear());
  it('renders brand + tagline and navigates on Get Started', () => {
    render(<WelcomeScreen />);
    expect(screen.getByText('QuickServe')).toBeOnTheScreen();
    expect(screen.getByText('Premium services, on demand.')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Get Started'));
    expect(push).toHaveBeenCalledWith('/role-select');
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test -- welcome.test` ("Welcome" stub text, no "QuickServe")

- [ ] **Step 3: Implement `src/app/(onboarding)/welcome.tsx`**
```tsx
import { router } from 'expo-router';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function WelcomeScreen() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.hero}>
        <RNText style={styles.mark}>⚡</RNText>
        <Text variant="display">QuickServe</Text>
        <Text variant="body" color="textSecondary" style={styles.tagline}>
          Premium services, on demand.
        </Text>
      </View>
      <Button label="Get Started" fullWidth onPress={() => router.push('/role-select')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: Spacing.four, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  mark: { fontSize: 64 },
  tagline: { textAlign: 'center' },
});
```

- [ ] **Step 4: Run → PASS** `npm test -- welcome.test`
- [ ] **Step 5: tsc + commit**
```bash
npx tsc --noEmit
git add "src/app/(onboarding)/welcome.tsx" src/__tests__/welcome.test.tsx
git commit -m "feat: build Welcome screen"
```

---

## Task 8: Role Select screen (fill stub)

**Files:** Modify `src/app/(onboarding)/role-select.tsx`; Test `src/__tests__/role-select.test.tsx`

**Interfaces:**
- Consumes: `ROLES`, `Role` (roles); `useAuth().selectRole`; `Card`, `IconChip`, `Text`, `useTheme`, `Spacing`; `router`.
- Produces: 3 role cards; tap → `selectRole(role)` then `router.push('/login')`.

- [ ] **Step 1: Write the failing test — `src/__tests__/role-select.test.tsx`**
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const push = jest.fn();
const selectRole = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => push(...a), replace: jest.fn() } }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ selectRole }) }));

import RoleSelectScreen from '@/app/(onboarding)/role-select';

describe('RoleSelectScreen', () => {
  beforeEach(() => { push.mockClear(); selectRole.mockClear(); });
  it('renders the three roles', () => {
    render(<RoleSelectScreen />);
    expect(screen.getByText('Customer')).toBeOnTheScreen();
    expect(screen.getByText('Service Provider')).toBeOnTheScreen();
    expect(screen.getByText('Admin')).toBeOnTheScreen();
  });
  it('selects a role and navigates to login', async () => {
    render(<RoleSelectScreen />);
    fireEvent.press(screen.getByText('Customer'));
    await waitFor(() => expect(selectRole).toHaveBeenCalledWith('customer'));
    expect(push).toHaveBeenCalledWith('/login');
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test -- role-select.test`

- [ ] **Step 3: Implement `src/app/(onboarding)/role-select.tsx`**
```tsx
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ROLES, type Role } from '@/constants/roles';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { Card } from '@/components/ui/card';
import { IconChip } from '@/components/ui/icon-chip';
import { Text } from '@/components/ui/text';

export default function RoleSelectScreen() {
  const theme = useTheme();
  const { selectRole } = useAuth();

  async function choose(role: Role) {
    await selectRole(role);
    router.push('/login');
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Text variant="title">Choose your role</Text>
      <Text variant="body" color="textSecondary">
        How will you use QuickServe?
      </Text>
      <View style={styles.list}>
        {ROLES.map((r) => (
          <Card key={r.id} onPress={() => choose(r.id)}>
            <View style={styles.row}>
              <IconChip icon={r.icon} />
              <View style={styles.text}>
                <Text variant="label">{r.label}</Text>
                <Text variant="caption" color="textSecondary">
                  {r.description}
                </Text>
              </View>
            </View>
          </Card>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: Spacing.four, gap: Spacing.two },
  list: { gap: Spacing.three, marginTop: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  text: { flex: 1, gap: Spacing.half },
});
```

- [ ] **Step 4: Run → PASS** `npm test -- role-select.test`
- [ ] **Step 5: tsc + commit**
```bash
npx tsc --noEmit
git add "src/app/(onboarding)/role-select.tsx" src/__tests__/role-select.test.tsx
git commit -m "feat: build Role Select screen"
```

---

## Task 9: Login screen (fill stub)

**Files:** Modify `src/app/(onboarding)/login.tsx`; Test `src/__tests__/login.test.tsx`

**Interfaces:**
- Consumes: `useAuth().signIn`; `validateLogin`; `Input`, `Button`, `Text`, `useTheme`, `Spacing`; `router`.
- Produces: login form; invalid → inline errors, `signIn` NOT called; valid → `signIn()` (root gating redirects). "Register" link → `router.push('/register')`.

- [ ] **Step 1: Write the failing test — `src/__tests__/login.test.tsx`**
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const push = jest.fn();
const signIn = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => push(...a), replace: jest.fn() } }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signIn }) }));

import LoginScreen from '@/app/(onboarding)/login';

describe('LoginScreen', () => {
  beforeEach(() => { push.mockClear(); signIn.mockClear(); });
  it('shows validation errors and does not sign in when empty', () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText('Email is required')).toBeOnTheScreen();
    expect(screen.getByText('Password is required')).toBeOnTheScreen();
    expect(signIn).not.toHaveBeenCalled();
  });
  it('signs in when valid', async () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b');
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'pw');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(signIn).toHaveBeenCalled());
  });
  it('links to register', () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText('Register'));
    expect(push).toHaveBeenCalledWith('/register');
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test -- login.test`

- [ ] **Step 3: Implement `src/app/(onboarding)/login.tsx`**
```tsx
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { validateLogin } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

export default function LoginScreen() {
  const theme = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const e = validateLogin({ email, password });
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    await signIn(); // root gating effect redirects into the role's app
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Text variant="title">Welcome back</Text>
      <View style={styles.form}>
        <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" error={errors.email} />
        <Input label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry autoCapitalize="none" error={errors.password} />
        <Button label="Continue" fullWidth onPress={submit} />
        <View style={styles.linkRow}>
          <Text variant="body" color="textSecondary">New here? </Text>
          <Text variant="label" color="primary" onPress={() => router.push('/register')}>
            Register
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  form: { gap: Spacing.three },
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
});
```

- [ ] **Step 4: Run → PASS** `npm test -- login.test`
- [ ] **Step 5: tsc + commit**
```bash
npx tsc --noEmit
git add "src/app/(onboarding)/login.tsx" src/__tests__/login.test.tsx
git commit -m "feat: build Login screen"
```

---

## Task 10: Register screen (fill stub)

**Files:** Modify `src/app/(onboarding)/register.tsx`; Test `src/__tests__/register.test.tsx`

**Interfaces:**
- Consumes: `useAuth().signIn`; `validateRegister`; `Input`, `Button`, `Text`, `useTheme`, `Spacing`; `router`.
- Produces: register form (name, email, phone, password, confirm); invalid → inline errors; valid → `signIn()`. "Login" link → `router.push('/login')`.

- [ ] **Step 1: Write the failing test — `src/__tests__/register.test.tsx`**
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const push = jest.fn();
const signIn = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => push(...a), replace: jest.fn() } }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signIn }) }));

import RegisterScreen from '@/app/(onboarding)/register';

describe('RegisterScreen', () => {
  beforeEach(() => { push.mockClear(); signIn.mockClear(); });
  it('shows required errors (incl. phone) and does not sign in when empty', () => {
    render(<RegisterScreen />);
    fireEvent.press(screen.getByText('Create account'));
    expect(screen.getByText('Full name is required')).toBeOnTheScreen();
    expect(screen.getByText('Phone number is required')).toBeOnTheScreen();
    expect(signIn).not.toHaveBeenCalled();
  });
  it('flags password mismatch', () => {
    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Full name'), 'A');
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b');
    fireEvent.changeText(screen.getByPlaceholderText('07xx xxx xxx'), '0700');
    fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'pw');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm password'), 'nope');
    fireEvent.press(screen.getByText('Create account'));
    expect(screen.getByText('Passwords do not match')).toBeOnTheScreen();
    expect(signIn).not.toHaveBeenCalled();
  });
  it('signs in when valid', async () => {
    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Full name'), 'A');
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b');
    fireEvent.changeText(screen.getByPlaceholderText('07xx xxx xxx'), '0700');
    fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'pw');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm password'), 'pw');
    fireEvent.press(screen.getByText('Create account'));
    await waitFor(() => expect(signIn).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test -- register.test`

- [ ] **Step 3: Implement `src/app/(onboarding)/register.tsx`**
```tsx
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { validateRegister } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

export default function RegisterScreen() {
  const theme = useTheme();
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const e = validateRegister({ name, email, phone, password, confirm });
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    await signIn(); // root gating effect redirects into the role's app
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="title">Create your account</Text>
        <View style={styles.form}>
          <Input label="Full name" value={name} onChangeText={setName} placeholder="Full name" autoCapitalize="words" error={errors.name} />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" error={errors.email} />
          <Input label="Phone number" value={phone} onChangeText={setPhone} placeholder="07xx xxx xxx" keyboardType="phone-pad" error={errors.phone} />
          <Input label="Password" value={password} onChangeText={setPassword} placeholder="Create a password" secureTextEntry autoCapitalize="none" error={errors.password} />
          <Input label="Confirm password" value={confirm} onChangeText={setConfirm} placeholder="Confirm password" secureTextEntry autoCapitalize="none" error={errors.confirm} />
          <Button label="Create account" fullWidth onPress={submit} />
          <View style={styles.linkRow}>
            <Text variant="body" color="textSecondary">Have an account? </Text>
            <Text variant="label" color="primary" onPress={() => router.push('/login')}>
              Login
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: Spacing.four, gap: Spacing.four },
  form: { gap: Spacing.three },
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
});
```

- [ ] **Step 4: Run → PASS** `npm test -- register.test`
- [ ] **Step 5: tsc + commit**
```bash
npx tsc --noEmit
git add "src/app/(onboarding)/register.tsx" src/__tests__/register.test.tsx
git commit -m "feat: build Register screen"
```

---

## Task 11: Provider placeholder

**Files:** Create `src/app/(provider)/provider.tsx`; Test `src/__tests__/provider.test.tsx`

**Interfaces:**
- Consumes: `useAuth().signOut`; `EmptyState`, `useTheme`.
- Produces: route `/provider`; placeholder + Sign out / Switch role → `signOut()`.

- [ ] **Step 1: Write the failing test — `src/__tests__/provider.test.tsx`**
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const signOut = jest.fn().mockResolvedValue(undefined);
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signOut }) }));

import ProviderScreen from '@/app/(provider)/provider';

describe('ProviderScreen', () => {
  beforeEach(() => signOut.mockClear());
  it('renders placeholder and signs out', async () => {
    render(<ProviderScreen />);
    expect(screen.getByText('Provider app coming soon')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Sign out / Switch role'));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test -- provider.test`

- [ ] **Step 3: Implement `src/app/(provider)/provider.tsx`**
```tsx
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { EmptyState } from '@/components/ui/empty-state';

export default function ProviderScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <EmptyState
        icon="🧰"
        title="Provider app coming soon"
        message="The QuickServe provider experience is on its way."
        actionLabel="Sign out / Switch role"
        onAction={signOut}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, justifyContent: 'center' } });
```

- [ ] **Step 4: Run → PASS** `npm test -- provider.test`
- [ ] **Step 5: tsc + commit**
```bash
npx tsc --noEmit
git add "src/app/(provider)/provider.tsx" src/__tests__/provider.test.tsx
git commit -m "feat: add Provider placeholder screen"
```

---

## Task 12: Admin placeholder

**Files:** Create `src/app/(admin)/admin.tsx`; Test `src/__tests__/admin.test.tsx`

**Interfaces:**
- Consumes: `useAuth().signOut`; `EmptyState`, `useTheme`.
- Produces: route `/admin`; placeholder + Sign out / Switch role → `signOut()`.

- [ ] **Step 1: Write the failing test — `src/__tests__/admin.test.tsx`**
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const signOut = jest.fn().mockResolvedValue(undefined);
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signOut }) }));

import AdminScreen from '@/app/(admin)/admin';

describe('AdminScreen', () => {
  beforeEach(() => signOut.mockClear());
  it('renders placeholder and signs out', async () => {
    render(<AdminScreen />);
    expect(screen.getByText('Admin app coming soon')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Sign out / Switch role'));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test -- admin.test`

- [ ] **Step 3: Implement `src/app/(admin)/admin.tsx`**
```tsx
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { EmptyState } from '@/components/ui/empty-state';

export default function AdminScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <EmptyState
        icon="🛡️"
        title="Admin app coming soon"
        message="The QuickServe admin tools are on their way."
        actionLabel="Sign out / Switch role"
        onAction={signOut}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, justifyContent: 'center' } });
```

- [ ] **Step 4: Run → PASS** `npm test -- admin.test`
- [ ] **Step 5: tsc + commit**
```bash
npx tsc --noEmit
git add "src/app/(admin)/admin.tsx" src/__tests__/admin.test.tsx
git commit -m "feat: add Admin placeholder screen"
```

---

## Task 13: Customer Profile screen + Profile tab

**Files:** Create `src/app/(customer)/profile.tsx`; Modify `src/components/app-tabs.tsx`; Test `src/__tests__/profile.test.tsx`

**Interfaces:**
- Consumes: `useAuth().signOut`; `Button`, `Text`, `useTheme`, `Spacing`.
- Produces: route `/profile`; a second `Profile` tab in `AppTabs` (Home screen file unchanged).

- [ ] **Step 1: Write the failing test — `src/__tests__/profile.test.tsx`**
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const signOut = jest.fn().mockResolvedValue(undefined);
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signOut }) }));

import ProfileScreen from '@/app/(customer)/profile';

describe('ProfileScreen', () => {
  beforeEach(() => signOut.mockClear());
  it('renders and signs out', async () => {
    render(<ProfileScreen />);
    expect(screen.getByText('Profile')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Sign out / Switch role'));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test -- profile.test`

- [ ] **Step 3: Implement `src/app/(customer)/profile.tsx`**
```tsx
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function ProfileScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Text variant="title">Profile</Text>
      <Text variant="body" color="textSecondary">You&apos;re signed in as a Customer.</Text>
      <Button label="Sign out / Switch role" onPress={signOut} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: Spacing.four, gap: Spacing.three },
});
```

- [ ] **Step 4: Add the Profile tab to `src/components/app-tabs.tsx`** — add a second trigger AFTER the existing Home trigger (do not change the Home trigger). The file currently renders one `NativeTabs.Trigger name="index"`. Add:
```tsx
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
```
> The `explore.png` asset is reused as a placeholder Profile icon (a dedicated icon can replace it later). The Home trigger (`name="index"`) and the Home screen file remain unchanged.

- [ ] **Step 5: Run → PASS** `npm test -- profile.test`
- [ ] **Step 6: tsc + bundle smoke + commit**
```bash
npx tsc --noEmit
npx expo export --platform web   # expect no errors (tabs + profile route)
git add "src/app/(customer)/profile.tsx" src/components/app-tabs.tsx src/__tests__/profile.test.tsx
git commit -m "feat: add Customer Profile tab with sign out"
```

---

## Task 14: Enable gating in root layout + full journey verification

**Files:** Modify `src/app/_layout.tsx`

**Interfaces:**
- Consumes: `useAuth()`, `roleHref`, `useSegments`, `useRouter` from expo-router.
- Produces: signed-out users are redirected to `/welcome`; signed-in users in the onboarding group are redirected to their role app. This is the SINGLE place that performs auth-driven redirects.

- [ ] **Step 1: Replace `src/app/_layout.tsx`** with the gating version
```tsx
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/auth/auth-context';
import { roleHref } from '@/constants/roles';

function RootNavigator() {
  const { isLoading, signedIn, role } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inOnboarding = segments[0] === '(onboarding)';
    if (!signedIn && !inOnboarding) {
      router.replace('/welcome');
    } else if (signedIn && role && inOnboarding) {
      router.replace(roleHref(role));
    }
  }, [isLoading, signedIn, role, segments, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
```
> The `AnimatedSplashOverlay` covers the initial `isLoading` read so there is no flash before the first redirect.

- [ ] **Step 2: Verify build**
```bash
npx tsc --noEmit                 # expect clean (all roleHref targets exist now)
npm test                         # expect ALL tests pass
npx expo export --platform web   # expect no errors
```

- [ ] **Step 3: Manual Expo Go — full journey** (see "How to Verify on Expo Go")
Verify in order:
1. Fresh install / signed out → app opens to **Welcome**.
2. Get Started → **Role Select** → tap **Customer** → **Login**.
3. Submit empty → inline errors; enter `a@b` + any password → lands on **Customer Home** (Slice 1 Home, unchanged) with **Home + Profile** tabs.
4. Profile tab → **Sign out / Switch role** → back to **Welcome**.
5. Get Started → Role Select → **Service Provider** → Login → submit → **Provider placeholder**; sign out → Welcome.
6. Repeat with **Admin** → **Admin placeholder**.
7. Sign in as any role, then fully close and reopen the app → it returns **straight to that role's app** (persisted).
8. Confirm Customer Home looks identical to Slice 1 aside from the new Profile tab.

- [ ] **Step 4: Commit**
```bash
git add src/app/_layout.tsx
git commit -m "feat: enable role-based gating in root layout"
```

---

## Final Verification (after all tasks)

- [ ] `npm test` → all pass (Slice 1 44 + Slice 2 additions).
- [ ] `npx tsc --noEmit` → clean.
- [ ] `npm run lint` → clean.
- [ ] Android bundle + `npx expo export --platform web` build.
- [ ] Full Expo Go journey (Task 14 Step 3) passes on a device.
- [ ] Customer Home unchanged except the Profile tab; `Role` defined only in `roles.ts`.
- [ ] OUT-OF-SCOPE absent: no real auth/credential check, no Supabase/backend, no payments/booking/marketplace/dispatch.

---

## Self-Review (against the spec)

**Spec coverage:**
- §3 Navigation (route groups + gating root, Home → (customer)) → Tasks 1, 14 ✓ (gating relocated to `_layout.tsx`; documented deviation — see below).
- §4 Auth state (AuthProvider + AsyncStorage, single `Role`, signOut full reset) → Tasks 2, 4, 5 ✓.
- §5 Screens & flow (welcome, role-select, login, register, provider, admin, profile) → Tasks 7–13 ✓.
- §6 Components/helpers (Input, roles, validation, single `Role`) → Tasks 2, 3, 6 ✓.
- §7 Files created/changed → all mapped ✓.
- §8 Testing (every listed test + screen tests; tests in `src/__tests__/`) → Tasks 2–13 ✓; bundle smokes at Tasks 1, 4, 13, 14.
- §9 Success criteria → Task 14 verification ✓.

**Documented deviations from spec (same intent):**
1. **Gating lives in `src/app/_layout.tsx`, not `src/app/index.tsx`.** Two `index.tsx` files cannot both own `/`; `(customer)/index.tsx` owns `/` so Home stays at the root URL (better satisfies "users shouldn't notice the move"). Gating uses the canonical `useSegments` + redirect effect.
2. **Provider/Admin routes are `(provider)/provider.tsx` and `(admin)/admin.tsx`** (paths `/provider`, `/admin`), not `index.tsx`, to avoid the `/` collision.
3. **Onboarding screens are scaffolded as stubs in Task 1** then filled, so `typedRoutes` resolves cross-references regardless of fill order.
4. **Provider/Admin group `_layout.tsx` files omitted** (single-screen areas render in the root Stack) — YAGNI; can be added when those areas grow.

**Placeholder scan:** none — every code step contains complete code. (Task 5 Step 1 shows the final test code in the follow-up block.)

**Type consistency:** `Role` single-source from `roles.ts`; `roleHref` returns `'/' | '/provider' | '/admin'` matching the route files; `StoredAuth`, `useAuth` shape, and `validate*` signatures consistent across tasks; screen tests mock `useAuth` and `expo-router` consistently.
```
