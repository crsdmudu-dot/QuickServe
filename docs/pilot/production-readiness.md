# Slice 29 — Production Readiness Gate

**Purpose:** Umbrella release-readiness checklist for the Slice-29 hardening branch
(`feat/slice-29-hardening`). Work top-to-bottom. All items must pass before merging to `main`.

---

## Related docs (link, not duplicated here)

| Document | Covers |
|---|---|
| [pilot-launch-checklist.md](./pilot-launch-checklist.md) | Master launch checklist (Sections 1–9) |
| [backend-readiness.md](./backend-readiness.md) | Supabase migrations, auth, storage, Edge Functions, Daraja, push |
| [crash-logging.md](./crash-logging.md) | Sentry setup, PII scrubbing, incident response |
| [performance-checklist.md](./performance-checklist.md) | TTI, bundle size, FlatList, upload, chat targets |
| [edge-function-health.md](./edge-function-health.md) | Per-function deploy + smoke checks (Slice 29 addendum) |
| [environment-secrets.md](./environment-secrets.md) | All env/secrets, where they live, NEVER-COMMIT list |
| [security-hardening.md](./security-hardening.md) | RLS spot-audit — new tables (Slices 26–28) |
| [pilot-monitoring.md](./pilot-monitoring.md) | Pilot-day monitoring dashboard + Slice-29 additions |

---

## 1. Isolation Check (Slice 29 diff vs base `f8d5f46`)

Run: `git diff f8d5f46..HEAD --stat`

**Result (run 2026-07-04):** 43 files changed, 1933 insertions, 260 deletions.

### Files changed — by category

| Category | Files |
|---|---|
| **New deps** | `package.json` (+`@sentry/react-native`, `@react-native-community/netinfo`), `package-lock.json` |
| **Env template** | `.env.example` (+`EXPO_PUBLIC_SENTRY_DSN` placeholder, MPESA/push/Places annotations) |
| **App config** | `app.json` (+Sentry Expo plugin, inert without EAS secrets) |
| **Monitoring** | `src/lib/monitoring.ts`, `src/lib/monitoring.test.ts`, `src/components/error-boundary.tsx` (+reportError), `src/components/error-boundary.test.tsx` |
| **Network / retry** | `src/lib/net.ts`, `src/lib/net.test.ts`, `src/components/ui/offline-banner.tsx`, `src/components/ui/offline-banner.test.tsx` |
| **Pagination hook + button** | `src/hooks/use-paginated-list.ts`, `src/hooks/use-paginated-list.test.ts`, `src/components/ui/load-more-button.tsx`, `src/components/ui/load-more-button.test.tsx` |
| **Lib helpers** (additive pagination only) | `src/lib/bookings.ts`, `src/lib/payments.ts`, `src/lib/notifications.ts`, `src/lib/reviews.ts`, `src/lib/wallet.ts`, `src/lib/promotions.ts` + matching `.test.ts` files |
| **Screens** (pagination + double-submit guards) | `src/app/_layout.tsx`, `src/app/booking/[id].tsx`, `src/app/(customer)/bookings.tsx`, `src/app/(customer)/notifications.tsx`, `src/app/admin/index.tsx`, `src/app/provider/(tabs)/index.tsx`, `src/app/(admin-web)/bookings/index.tsx`, `src/app/(admin-web)/notifications/index.tsx`, `src/app/(admin-web)/payments/index.tsx`, `src/app/(admin-web)/promos/index.tsx`, `src/components/admin-web/admin-wallet-panel.tsx` |
| **New tests** | `src/__tests__/admin-web-payments.test.tsx`, `src/__tests__/booking-detail.test.tsx` |

### Schema / migration check

```
git diff f8d5f46..HEAD --name-only | grep supabase/migrations
```

**Result: empty** — NO schema or migration change. PASS.

### RLS check

No migration touching `CREATE POLICY`, `ALTER POLICY`, or `DROP POLICY`. PASS.

### Payment / auth / business-logic check

Lib changes confirmed additive only:
- `getAllBookings`, `getCustomerBookings`, `getProviderJobs`, `adminGetAllPayments`,
  `adminGetAllReviews`, `getMyNotifications`, `adminGetWalletTransactions`,
  `adminGetPromoRedemptions` — each gained optional `(page?, pageSize?)` + a single
  `.range()` branch. Business queries, filters, and mutations are **unchanged**.
- `createBooking`, `updateBookingStatus`, `assignProvider`, `updateAdminNotes`,
  `adminOverridePaymentStatus`, `redeemPromo`, `adminCreatePromoCode`, `adminUpdatePromoCode`,
  `applyWalletToPayment`, `adminAdjustWallet` — **not modified**. PASS.

### Dispatch / ranking / payout check

No changes to dispatch, ranking, or payout logic. PASS.

### No-mutation-retry audit

```
grep -rn "withRetry" src/
```

`withRetry` appears in:
- `src/lib/net.ts` — definition (docstring: "READS ONLY — never wrap a mutation")
- `src/hooks/use-paginated-list.ts` — wraps `fetchPage` (read)
- `src/lib/photos.ts` — wraps `doUpload` (idempotent storage upload; DB INSERT is outside the retry block — single-shot)
- Test files — mocks only

**No mutation** (payment/wallet/promo/booking write) is wrapped in `withRetry`. PASS.

### Monitoring-off audit

`src/lib/monitoring.ts` `initMonitoring()`:
```ts
if (!DSN) return;   // monitoring OFF unless configured
```
`.env.example`: `EXPO_PUBLIC_SENTRY_DSN=` (empty placeholder — no real DSN committed). PASS.

**Isolation result: CLEAN — no out-of-scope change found.**

---

## 2. Final Gate (run 2026-07-04)

| Check | Command | Result |
|---|---|---|
| Tests | `npm test` | **PASS** — 1192/1192 green, 128 suites |
| TypeScript | `npx tsc --noEmit` | **PASS** — 0 errors |
| Web export | `npx expo export --platform web` | **PASS** — `Exported: dist` |
| Android export | `npx expo export --platform android` | **PASS** — `Exported: dist` |
| Git status | `git status` | **CLEAN** — only untracked `supabase/.temp/` (ignored) |

---

## 3. Release-Readiness Go/No-Go Checklist

### A. Code quality
- [x] `npm test` — 1192 green
- [x] `npx tsc --noEmit` — clean
- [x] `npx expo export --platform web` — succeeds
- [x] `npx expo export --platform android` — succeeds
- [x] Isolation check — no schema/RLS/payment/dispatch change
- [x] No-mutation-retry audit — pass

### B. Environment & secrets
> Full details: [environment-secrets.md](./environment-secrets.md)

- [ ] `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` set in EAS (production)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in Edge Function runtime (auto-injected by Supabase)
- [ ] `PUSH_WEBHOOK_SECRET` set via `supabase secrets set`
- [ ] `GOOGLE_PLACES_API_KEY` set via `supabase secrets set`
- [ ] `DARAJA_*` + `MPESA_CALLBACK_SECRET` set via `supabase secrets set`
- [ ] `MPESA_MODE` set to `live` (or `sandbox` for pre-launch verification)
- [ ] `EXPO_PUBLIC_SENTRY_DSN` set via `eas secret:create` (monitoring ON for production build)

### C. Monitoring
> Full details: [crash-logging.md](./crash-logging.md) and [pilot-monitoring.md](./pilot-monitoring.md)

- [ ] Sentry DSN configured and test crash confirmed in Sentry dashboard
- [ ] Alert rule: > 5 errors/minute → on-call notification
- [ ] Supabase Edge Function + Database logs reviewed at launch

### D. Security
> Full details: [security-hardening.md](./security-hardening.md)

- [x] RLS spot-audit for new tables (Slices 26–28) — no gaps found
- [x] No secrets in app bundle (Sentry DSN env-only; server keys Supabase-secrets-only)
- [x] Analytics RPC admin-guard confirmed

### E. Backend & Edge Functions
> Full details: [backend-readiness.md](./backend-readiness.md) and [edge-function-health.md](./edge-function-health.md)

- [ ] All migrations applied (`supabase db push` zero pending)
- [ ] All Edge Functions deployed + secrets set
- [ ] `private.push_config` row populated
- [ ] `pg_net` extension enabled
- [ ] Kill switches tested in staging

### F. Pagination / performance
> Full details: [performance-checklist.md](./performance-checklist.md)

- [x] All heavy lists paginated (bookings, payments, notifications, jobs, promos, wallet history)
- [x] `LoadMoreButton` wired on every paginated screen
- [x] `usePaginatedList` wraps every page fetch in `withRetry`

### G. Offline / reliability
- [x] `OfflineBanner` wired in `_layout.tsx` (all user types)
- [x] `withRetry` on all paginated reads + storage upload
- [x] `friendlyError` surfaces user-facing messages on all transient failures
- [x] Double-submit guards on Pay / Apply wallet / Apply promo / Submit review

---

## 4. Go / No-Go Sign-off

| Role | Name | Sign-off date |
|---|---|---|
| Tech Lead | | |
| Backend Operator | | |
| QA Lead | | |
