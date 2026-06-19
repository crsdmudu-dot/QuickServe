# QuickServe — Slice 3: Supabase Real Authentication Design

**Date:** 2026-06-18
**Status:** Approved (design); implementation not started
**Slice:** 3 — Replace fake local auth with real Supabase auth, preserving the Slice 2 flow

---

## 1. Purpose & Scope

Slice 2 shipped an auth UI with **fake** local state (`{role, signedIn}` in AsyncStorage).
Slice 3 replaces it with **real Supabase authentication** — real register/login/logout,
session persistence, and a `profiles` table holding role + phone — while preserving the
current UI and flow as much as possible.

### In scope
- Supabase client + environment variables
- Real register (sign up), login (sign in), logout (sign out)
- Session persistence (Supabase + AsyncStorage adapter)
- `profiles` table: role (`customer`/`provider`/`admin`), phone, full name
- Role read from the profile after login → drives gating
- Basic error handling (friendly inline messages; no crashes)

### Out of scope (YAGNI)
- Email confirmation / verification (instant sign-in in Slice 3)
- Booking, payments, provider marketplace, admin dispatch
- Password reset, social login, profile editing UI, avatar upload

### Key decisions (approved)
- **No email confirmation** — sign-up creates a session immediately (preserves Slice 2 flow).
- **Role comes from the `profiles` table** after login (not re-selected); Role Select is part
  of the Register path only.
- **Profile row created by a DB trigger** from sign-up metadata (atomic; no orphaned users).
- **Preserve current UI** as much as possible.

---

## 2. Supabase Setup & Environment

- Dependency: `@supabase/supabase-js` (+ `@react-native-async-storage/async-storage`, already
  installed in Slice 2, used as the auth storage adapter).
- Client: `src/lib/supabase.ts`, configured from env vars:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - Options: `auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true,
    detectSessionInUrl: false }`.
- Env files: real values in `.env` (gitignored); `.env.example` documents the two keys.
- The Supabase project, URL, and anon key are provided by the project owner (cannot be created
  in code). Anon key is publishable (safe in the client); no service-role key in the app.

---

## 3. Database (one-time SQL migration)

Stored in the repo at `supabase/migrations/0001_profiles.sql` and run once in the Supabase SQL
editor (no Supabase CLI assumed).

**`profiles` table**
```
id          uuid primary key references auth.users(id) on delete cascade
full_name   text
phone       text
role        text not null check (role in ('customer','provider','admin'))
created_at  timestamptz not null default now()
```

**Row Level Security (enabled)**
- `select`: `auth.uid() = id` (a user reads only their own profile).
- `update`: `auth.uid() = id` (a user updates only their own profile).
- No client `insert` policy needed — the trigger inserts with elevated rights.

**Trigger** — `handle_new_user()` (security definer), fired `after insert on auth.users`:
inserts a `profiles` row using `new.id` and `new.raw_user_meta_data ->> 'full_name' | 'phone' |
'role'`.

---

## 4. Auth Layer

`AuthProvider` (`src/auth/auth-context.tsx`, reworked) — source of truth is the Supabase
**session + the profile role**.

```ts
type AuthState = {
  session: Session | null;
  role: Role | null;              // from profiles, loaded for the current session
  isLoading: boolean;             // true until initial session + role resolved
  pendingRole: Role | null;       // chosen at Role Select, used by signUp (in-memory only)
  authError: string | null;      // last friendly auth error (cleared on new attempt)
  selectRole: (role: Role) => void;
  signUp: (v: { fullName: string; email: string; phone: string; password: string }) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};
```

- On mount: read current session; subscribe to `supabase.auth.onAuthStateChange`. When a
  session exists, fetch `profiles.role` for `session.user.id` and set `role`. On `SIGNED_OUT`,
  clear `session`/`role`/`pendingRole`.
- `selectRole` sets `pendingRole` in memory (no persistence — it's pre-account).
- `signUp` calls `supabase.auth.signUp({ email, password, options: { data: { full_name,
  phone, role: pendingRole } } })`. Returns `true` on success (session created → trigger makes
  profile → role loads), `false` on error (sets `authError`).
- `signIn` calls `signInWithPassword`; returns `true`/`false`, sets `authError` on failure.
- `signOut` calls `supabase.auth.signOut()`.
- **Retire `auth-storage.ts`** (Supabase persists the session via its storage adapter). Its
  tests are removed with it.

`roles.ts` (`Role` single source) and `roleHref` are unchanged.

---

## 5. Screens & Gating (UI preserved)

- **Role Select** (register path): `selectRole(role)` then navigate to Register. (Login path
  no longer routes through Role Select.)
- **Register**: validates with `validateRegister` (unchanged), then `signUp(...)`. On success
  the gating effect routes to the role's app; on failure shows `authError` inline.
- **Login**: validates with `validateLogin`, then `signIn(email, password)`. On success gating
  routes by the profile role; on failure shows `authError` inline.
- **Profile / placeholders**: `signOut()` (full reset → Welcome via gating).
- **Gating** (`src/app/_layout.tsx`): unchanged shape, reads the new context — signed-out (no
  session) & not in `(onboarding)` → `/welcome`; session + role + in `(onboarding)` →
  `roleHref(role)`. While `isLoading`, the splash overlay covers; no redirect.
- **Welcome**: add a secondary "Log in" affordance so returning users reach Login without Role
  Select (the only UI addition; everything else preserved).

---

## 6. Error Handling (basic)

- A small helper maps common Supabase auth errors to friendly text, e.g.:
  - invalid login credentials → "Incorrect email or password."
  - user already registered → "An account with this email already exists."
  - network/unknown → "Something went wrong. Please try again."
- `authError` is surfaced inline on Login/Register; network failures never crash the app.

---

## 7. Files (created / changed / removed)

```
NEW     src/lib/supabase.ts                 Supabase client from env
NEW     src/lib/auth-errors.ts              map Supabase errors → friendly messages
NEW     supabase/migrations/0001_profiles.sql   profiles table + RLS + trigger
NEW     .env.example                        documents EXPO_PUBLIC_SUPABASE_* keys
CHANGE  .gitignore                          ensure .env ignored (already covers .env*.local; add .env)
CHANGE  src/auth/auth-context.tsx           rework to Supabase session + profile role
REMOVE  src/auth/auth-storage.ts (+ test)   superseded by Supabase session persistence
CHANGE  src/app/(onboarding)/register.tsx   call signUp; show authError
CHANGE  src/app/(onboarding)/login.tsx      call signIn; show authError
CHANGE  src/app/(onboarding)/role-select.tsx  selectRole (in-memory pendingRole)
CHANGE  src/app/(onboarding)/welcome.tsx    add "Log in" affordance
CHANGE  src/app/_layout.tsx                 gating reads session + role
CHANGE  package.json / lock                 + @supabase/supabase-js
```

---

## 8. Testing

- Mock the Supabase client in Jest (a manual mock for `@/lib/supabase`).
- Unit: `auth-errors` mapping; `AuthProvider` transitions (signUp/signIn/signOut, role load,
  error path) with the mocked client.
- Screen tests mock `useAuth` (as in Slice 2) and assert: Register calls `signUp`, Login calls
  `signIn`, error message renders on failure.
- Screen/route tests live in `src/__tests__/` (never under `src/app/`).
- Bundle smoke via `expo start` (not `expo export`, which regresses typed routes).
- Tests must not require real network/Supabase credentials.

---

## 9. Success Criteria

- A new user registers (role chosen) → account + profile created → lands in the correct role app.
- A returning user logs in with email+password → role read from profile → correct role app.
- Logout fully clears the session and returns to Welcome; relaunch while signed in restores
  the session and lands in the role app.
- Invalid credentials / duplicate email / network errors show friendly inline messages.
- `tsc` clean; all tests pass (no real Supabase needed); Android bundle builds.
- UI is unchanged except the Welcome "Log in" affordance; no booking/payments/marketplace/
  dispatch code.
