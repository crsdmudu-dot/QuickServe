# Authentication

**Purpose:** How QuickServe authenticates users and resolves access — Supabase Auth
(email/password), the `profiles` role model (customer / provider / admin), provider
approval status, session handling, and role-based routing.

**Planned documents:**
- Auth flow (sign-up, sign-in, session restore)
- Role & approval model (`profiles.role`, `approval_status`)
- Role-based routing and route guards
- Admin web auth (the `(admin-web)` guard)

Cross-link to `security/` (RLS) and the Admin Authentication QA suite. Verified only.
