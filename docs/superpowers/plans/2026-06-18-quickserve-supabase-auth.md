# QuickServe Slice 3 — Supabase Real Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Replace fake local auth with real Supabase auth (register/login/logout, session persistence, profiles table with role+phone) while preserving the Slice 2 UI/flow.

**Architecture:** `@supabase/supabase-js` client (AsyncStorage session adapter) from `EXPO_PUBLIC_*` env. A `profiles` table (role/phone/name) is populated by a DB trigger from signup metadata. `AuthProvider` is reworked so the source of truth is the Supabase session + the profile role; screens call `signUp`/`signIn`/`signOut`; gating keeps its shape.

**Tech Stack:** Expo SDK 56, Expo Router (typed routes), TypeScript, `@supabase/supabase-js`, AsyncStorage, jest-expo + RTL.

## Global Constraints
- No email confirmation (instant sign-in). Role comes from `profiles` after login. Profile row created by DB trigger from signup metadata.
- `Role` stays single-source in `src/constants/roles.ts`. Design tokens only. Preserve UI/navigation; only addition allowed: a "Log in" affordance on Welcome.
- Supabase anon key only (publishable); NO service-role key in app. Real `.env` required to run on device; tests must NOT need network/credentials (mock `@/lib/supabase`).
- Typed-routes rule: PLAIN `router.push/replace` (no casts). Bundle smoke via `expo start` (NOT `expo export`, which regresses typed routes). Screen/route tests live in `src/__tests__/`, never under `src/app/`.
- OUT OF SCOPE: email verification, booking, payments, provider marketplace, admin dispatch, password reset, social login, profile-edit UI.
- TDD; one commit per task; after each task run `npm test` + `npx tsc --noEmit`.

---

## Environment Setup (performed by the project owner; documented here)
1. Create a Supabase project.
2. Run `supabase/migrations/0001_profiles.sql` (Task 1) in the Supabase **SQL editor**.
3. Supabase Dashboard → **Authentication → Sign In/Providers** → disable **"Confirm email"**.
4. `cp .env.example .env`; set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
5. Restart: `npx expo start -c`.

---

## Rollback Plan
- Branch `feat/slice-3-supabase-auth`; one commit per task; revert a task with `git revert <sha>`.
- `auth-storage.ts` is removed in Task 2 — reversible via git. Reverting the whole slice restores Slice 2 fake auth.
- Abort if `expo start` bundle smoke fails or typed routes regress.

---

## Expo Go Verification (after Task 3; needs real `.env`)
1. Register a new user (pick role) → lands in the correct role app; confirm a `profiles` row appears in Supabase with role+phone+name.
2. Logout (Profile/placeholder) → Welcome.
3. Login with those credentials → role app (role from profile).
4. Relaunch app while signed in → restored straight to role app.
5. Wrong password / duplicate email → friendly inline error; no crash on airplane mode.
6. Customer Home unchanged except the Welcome "Log in" affordance.

---

## File Structure
```
NEW     src/lib/supabase.ts                       client from env
NEW     src/lib/auth-errors.ts (+ test)           map errors → friendly text
NEW     supabase/migrations/0001_profiles.sql     table + RLS + trigger
NEW     .env.example                              documents the two keys
CHANGE  .gitignore                                add `.env`
CHANGE  package.json / lock                       + @supabase/supabase-js
CHANGE  src/auth/auth-context.tsx (+ test)        Supabase session + profile role
DELETE  src/auth/auth-storage.ts (+ test)         superseded
CHANGE  src/app/(onboarding)/login.tsx (+ test)   signIn(email,pwd) + authError
CHANGE  src/app/(onboarding)/register.tsx (+ test) signUp(...) + authError
CHANGE  src/app/(onboarding)/role-select.tsx (+ test) push('/register')
CHANGE  src/app/(onboarding)/welcome.tsx (+ test) add "Log in" link
```
Gating (`src/app/_layout.tsx`) is **unchanged**: `AuthProvider` keeps exposing `signedIn` (derived `= session != null`), so the existing gating logic works as-is.

---

## Task 1: Supabase client, env, SQL migration, error mapping

**Files:** Create `src/lib/supabase.ts`, `src/lib/auth-errors.ts`, `src/lib/auth-errors.test.ts`, `supabase/migrations/0001_profiles.sql`, `.env.example`; Modify `.gitignore`, `package.json`.

**Interfaces — Produces:** `supabase` client; `mapAuthError(error): string`.

- [ ] **Step 1: Branch + install**
```bash
git checkout -b feat/slice-3-supabase-auth
npx expo install @supabase/supabase-js
```

- [ ] **Step 2: Failing test `src/lib/auth-errors.test.ts`**
```ts
import { mapAuthError } from '@/lib/auth-errors';

describe('mapAuthError', () => {
  it('maps invalid credentials', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' })).toBe('Incorrect email or password.');
  });
  it('maps already-registered', () => {
    expect(mapAuthError({ message: 'User already registered' })).toBe('An account with this email already exists.');
  });
  it('falls back for unknown/network', () => {
    expect(mapAuthError({ message: 'network request failed' })).toBe('Something went wrong. Please try again.');
    expect(mapAuthError(null)).toBe('Something went wrong. Please try again.');
  });
});
```

- [ ] **Step 3: Run → FAIL** `npm test -- auth-errors.test`

- [ ] **Step 4: Implement `src/lib/auth-errors.ts`**
```ts
export function mapAuthError(error: { message?: string } | null | undefined): string {
  const m = error?.message?.toLowerCase() ?? '';
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'An account with this email already exists.';
  }
  return 'Something went wrong. Please try again.';
}
```

- [ ] **Step 5: Implement `src/lib/supabase.ts`**
```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase env. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (see .env.example).',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```
> Note: this module is mocked in tests (`jest.mock('@/lib/supabase')`) and is never executed by `tsc`/jest. It throws at runtime only if `.env` is missing — a clear failure for on-device runs.

- [ ] **Step 6: `supabase/migrations/0001_profiles.sql`**
```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null check (role in ('customer','provider','admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    coalesce(new.raw_user_meta_data ->> 'role', 'customer')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 7: `.env.example`**
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 8: `.gitignore`** — add a line `.env` (keep `.env.example` tracked).

- [ ] **Step 9: Run → PASS + tsc + commit**
```bash
npm test -- auth-errors.test
npx tsc --noEmit
git add src/lib/supabase.ts src/lib/auth-errors.ts src/lib/auth-errors.test.ts supabase/ .env.example .gitignore package.json package-lock.json
git commit -m "feat: add Supabase client, env, profiles migration, error mapping"
```

---

## Task 2: Rework AuthProvider to Supabase (+ login/register + remove auth-storage)

**Files:** Modify `src/auth/auth-context.tsx`, `src/auth/auth-context.test.tsx`, `src/app/(onboarding)/login.tsx`, `src/app/(onboarding)/register.tsx`, `src/__tests__/login.test.tsx`, `src/__tests__/register.test.tsx`; Delete `src/auth/auth-storage.ts`, `src/auth/auth-storage.test.ts`.

**Interfaces — Produces:** `useAuth(): { session, role, approvalStatus, isLoading, pendingRole, signedIn, authError, selectRole(role), signUp({fullName,email,phone,password}): Promise<boolean>, signIn(email,password): Promise<boolean>, signOut(): Promise<void> }`. `approvalStatus: 'pending'|'approved'|'rejected'|null` is loaded from `profiles` and exposed for future provider-approval routing (NOT acted on in Slice 3 — provider still routes to its placeholder regardless).

- [ ] **Step 1: Delete fake storage**
```bash
git rm src/auth/auth-storage.ts src/auth/auth-storage.test.ts
```

- [ ] **Step 2: Rework `src/auth/auth-context.tsx`**
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import type { Role } from '@/constants/roles';
import { supabase } from '@/lib/supabase';
import { mapAuthError } from '@/lib/auth-errors';

type SignUpValues = { fullName: string; email: string; phone: string; password: string };

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

type AuthState = {
  session: Session | null;
  role: Role | null;
  approvalStatus: ApprovalStatus | null;   // from profiles; exposed for future provider-approval routing
  isLoading: boolean;
  pendingRole: Role | null;
  signedIn: boolean;
  authError: string | null;
  selectRole: (role: Role) => void;
  signUp: (v: SignUpValues) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

type ProfileInfo = { role: Role | null; approvalStatus: ApprovalStatus | null };

async function fetchProfile(userId: string): Promise<ProfileInfo> {
  const { data } = await supabase
    .from('profiles')
    .select('role, approval_status')
    .eq('id', userId)
    .single();
  return {
    role: (data?.role as Role | undefined) ?? null,
    approvalStatus: (data?.approval_status as ApprovalStatus | undefined) ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function applySession(s: Session | null) {
      if (!active) return;
      setSession(s);
      if (s) {
        const p = await fetchProfile(s.user.id);
        if (!active) return;
        setRole(p.role);
        setApprovalStatus(p.approvalStatus);
      } else {
        setRole(null);
        setApprovalStatus(null);
      }
      if (active) setIsLoading(false);
    }
    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      applySession(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  function selectRole(r: Role) {
    setPendingRole(r);
  }

  async function signUp(v: SignUpValues): Promise<boolean> {
    setAuthError(null);
    const { error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: { data: { full_name: v.fullName, phone: v.phone, role: pendingRole } },
    });
    if (error) {
      setAuthError(mapAuthError(error));
      return false;
    }
    return true;
  }

  async function signIn(email: string, password: string): Promise<boolean> {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError(mapAuthError(error));
      return false;
    }
    return true;
  }

  async function signOut() {
    await supabase.auth.signOut();
    setPendingRole(null);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        role,
        approvalStatus,
        isLoading,
        pendingRole,
        signedIn: session != null,
        authError,
        selectRole,
        signUp,
        signIn,
        signOut,
      }}>
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

- [ ] **Step 3: Rewrite `src/auth/auth-context.test.tsx`** (mock the Supabase client)
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { AuthProvider, useAuth } from '@/auth/auth-context';

const signUp = jest.fn();
const signInWithPassword = jest.fn();
const signOut = jest.fn().mockResolvedValue({ error: null });
const getSession = jest.fn();
const onAuthStateChange = jest.fn();
const single = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: (...a: unknown[]) => signUp(...a),
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      signOut: (...a: unknown[]) => signOut(...a),
      getSession: (...a: unknown[]) => getSession(...a),
      onAuthStateChange: (...a: unknown[]) => onAuthStateChange(...a),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: (...a: unknown[]) => single(...a) }) }) }),
  },
}));

function Probe() {
  const { isLoading, role, signedIn, authError, selectRole, signUp: su, signIn, signOut: so } = useAuth();
  return (
    <>
      <Text>{isLoading ? 'loading' : `ready:${role ?? 'none'}:${signedIn}:${authError ?? '-'}`}</Text>
      <Pressable onPress={() => selectRole('provider')}><Text>select</Text></Pressable>
      <Pressable onPress={() => su({ fullName: 'A', email: 'a@b', phone: '07', password: 'pw' })}><Text>signup</Text></Pressable>
      <Pressable onPress={() => signIn('a@b', 'pw')}><Text>signin</Text></Pressable>
      <Pressable onPress={() => so()}><Text>signout</Text></Pressable>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
});

it('loads with no session', async () => {
  getSession.mockResolvedValue({ data: { session: null } });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('ready:none:false:-')).toBeOnTheScreen());
});

it('loads role from profile when a session exists', async () => {
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  single.mockResolvedValue({ data: { role: 'customer', approval_status: 'approved' }, error: null });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('ready:customer:true:-')).toBeOnTheScreen());
});

it('signIn sets authError on failure', async () => {
  getSession.mockResolvedValue({ data: { session: null } });
  signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('ready:none:false:-')).toBeOnTheScreen());
  fireEvent.press(screen.getByText('signin'));
  await waitFor(() =>
    expect(screen.getByText('ready:none:false:Incorrect email or password.')).toBeOnTheScreen(),
  );
});

it('signUp passes role metadata and signOut calls supabase', async () => {
  getSession.mockResolvedValue({ data: { session: null } });
  signUp.mockResolvedValue({ error: null });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('ready:none:false:-')).toBeOnTheScreen());
  fireEvent.press(screen.getByText('select'));
  fireEvent.press(screen.getByText('signup'));
  await waitFor(() => expect(signUp).toHaveBeenCalledWith(
    expect.objectContaining({ options: { data: { full_name: 'A', phone: '07', role: 'provider' } } }),
  ));
  fireEvent.press(screen.getByText('signout'));
  await waitFor(() => expect(signOut).toHaveBeenCalled());
});
```

- [ ] **Step 4: Update `src/app/(onboarding)/login.tsx`** submit + error display
```tsx
// inside component:
const { signIn, authError } = useAuth();
// ...
async function submit() {
  const e = validateLogin({ email, password });
  setErrors(e);
  if (Object.keys(e).length > 0) return;
  await signIn(email, password); // gating routes on success
}
// in JSX, after the Continue button:
{authError ? <Text variant="caption" color="error">{authError}</Text> : null}
```
(Keep the rest of login.tsx — fields, Register link — unchanged.)

- [ ] **Step 5: Update `src/app/(onboarding)/register.tsx`** submit + error display
```tsx
const { signUp, authError } = useAuth();
// ...
async function submit() {
  const e = validateRegister({ name, email, phone, password, confirm });
  setErrors(e);
  if (Object.keys(e).length > 0) return;
  await signUp({ fullName: name, email, phone, password }); // gating routes on success
}
// in JSX, after the Create account button:
{authError ? <Text variant="caption" color="error">{authError}</Text> : null}
```

- [ ] **Step 6: Update `src/__tests__/login.test.tsx`** — mock useAuth new shape
```tsx
const signIn = jest.fn().mockResolvedValue(true);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signIn, authError: null }) }));
// ...existing imports + LoginScreen...
// tests: empty submit → validation errors + signIn NOT called;
// valid submit → signIn called with ('a@b','pw').
```
Add a separate test file block (or `describe`) rendering with `useAuth: () => ({ signIn, authError: 'Incorrect email or password.' })` and assert the message renders. (Use a per-test `jest.doMock` or a second describe with its own mock module — keep both: one default-null, one error.)

> Implementer note: simplest is two `it`s in one file where the error-message test re-mocks via `jest.mocked`. If that proves awkward, split the authError assertion into its own test file `src/__tests__/login-error.test.tsx`. Keep all tests in `src/__tests__/`.

- [ ] **Step 7: Update `src/__tests__/register.test.tsx`** — mock useAuth `{ signUp, authError }`; valid submit → `signUp` called with `{ fullName:'A', email:'a@b', phone:'0700', password:'pw' }`; empty → errors + not called; an error-render test for `authError`.

- [ ] **Step 8: Run + tsc + commit**
```bash
npm test
npx tsc --noEmit
git add -A -- src
git commit -m "feat: real Supabase auth in AuthProvider; signIn/signUp in screens"
```
Expected: all tests pass; tsc clean. (Gating untouched — `signedIn` still exposed.)

---

## Task 3: Flow tweaks — Role Select → Register, Welcome → Log in link

**Files:** Modify `src/app/(onboarding)/role-select.tsx`, `src/__tests__/role-select.test.tsx`, `src/app/(onboarding)/welcome.tsx`, `src/__tests__/welcome.test.tsx`.

- [ ] **Step 1: Role Select navigates to Register** — in `role-select.tsx`, change the navigation target from `/login` to `/register`:
```tsx
async function choose(role: Role) {
  selectRole(role);
  router.push('/register');
}
```
(`selectRole` is now synchronous; dropping `await` is fine. Keep everything else.)

- [ ] **Step 2: Update `src/__tests__/role-select.test.tsx`** — assert tap calls `selectRole('customer')` and `router.push('/register')` (was `/login`).

- [ ] **Step 3: Welcome "Log in" affordance** — in `welcome.tsx`, add below the Get Started button:
```tsx
<View style={styles.loginRow}>
  <Text variant="body" color="textSecondary">Already have an account? </Text>
  <Text variant="label" color="primary" onPress={() => router.push('/login')}>Log in</Text>
</View>
```
Add `loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.three }` to styles. Keep brand/tagline/Get Started unchanged.

- [ ] **Step 4: Update `src/__tests__/welcome.test.tsx`** — keep existing assertions; add: pressing "Log in" calls `router.push('/login')`.

- [ ] **Step 5: Run + tsc + commit**
```bash
npm test
npx tsc --noEmit
git add -A -- src
git commit -m "feat: role-select routes to register; welcome adds log-in link"
```

- [ ] **Step 6: Controller bundle smoke** (after this task): `expo start` + request the android bundle → HTTP 200 (do NOT use `expo export`).

---

## Final Verification
- [ ] `npm test` all pass; `npx tsc --noEmit` clean; `npm run lint` clean.
- [ ] `expo start` android bundle smoke → 200.
- [ ] Manual Expo Go journey (above) with real `.env`.
- [ ] OUT-OF-SCOPE absent (no booking/payments/marketplace/dispatch); UI preserved except Welcome log-in link.

---

## Self-Review (against spec)
- §2 client+env → Task 1 ✓. §3 SQL (table+RLS+trigger) → Task 1 ✓. §4 AuthProvider rework + retire auth-storage → Task 2 ✓. §5 screens+gating (gating unchanged via derived `signedIn`; role-select→register; welcome log-in) → Tasks 2–3 ✓. §6 error handling → Task 1 (`mapAuthError`) + Tasks 2 (authError) ✓. §8 testing (mock supabase; tests in `src/__tests__/`) → all tasks ✓.
- **Deviation (sound):** gating keeps reading `signedIn` (now derived `= session != null`) instead of `session` directly — functionally identical, avoids touching `_layout.tsx`. Documented.
- Placeholder scan: complete code in every step (the login/register test steps describe the authError-render test rather than full duplicate files — the implementer writes it following the shown mock pattern; flagged as implementer note, not a silent gap).
- Type consistency: `useAuth` shape (`signIn(email,password)`, `signUp({fullName,email,phone,password})`, `authError`, `signedIn`) consistent across context + login + register + tests; `Role` single-source; `mapAuthError` signature consistent Task 1↔2.
