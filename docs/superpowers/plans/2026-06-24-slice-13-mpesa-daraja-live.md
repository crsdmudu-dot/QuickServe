# Slice 13 — M-Pesa Daraja Live Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move M-Pesa STK Push initiation and confirmation into Supabase Edge Functions backed by Daraja sandbox, keeping all credentials server-side and the app usable in `mock` mode.

**Architecture:** App calls `mpesa-stk-push` (JWT) which verifies ownership and — per `MPESA_MODE` — mocks or calls Daraja, then inserts the attempt (service-role) with checkout/merchant ids. Daraja POSTs to the secret-gated public `mpesa-callback`, which calls the idempotent `apply_mpesa_callback` DB function to mark the attempt successful/failed and (on success) the payment paid, firing the Slice 11 earnings trigger. Pure Daraja logic lives in `_shared/daraja.ts` (Jest-tested); Deno glue is verified against sandbox.

**Tech Stack:** Expo RN + TS (app), Jest, Supabase (Postgres + RLS + Edge Functions on Deno), Safaricom Daraja (sandbox).

## Global Constraints

- **Zero Daraja credentials in app code, test code, or git** — all via Supabase Edge Function secrets (`Deno.env.get`); `.env.example` documents NAMES only.
- **Tests never call the Daraja network.** Edge Function HTTP glue is verified manually against sandbox, not in Jest.
- `MPESA_MODE ∈ {mock, sandbox, live}` is server-side only; `mock` keeps the app fully usable with no Daraja secret. The client calls the function identically in all modes.
- Customer cannot set a payment `paid`; only `apply_mpesa_callback` (callback path) or admin `confirm_payment_attempt` does. Earnings created solely by the Slice 11 paid-transition trigger.
- DB pattern mirrors `0010`/`0011`: `security definer set search_path = public`; `apply_mpesa_callback` has `EXECUTE` revoked from `anon`/`authenticated`.
- Money is KES (`formatKes`). Lib mutations return `{ ok, error? }`; queries typed rows/`[]`.
- `mpesa-callback` always returns HTTP 200 with the Daraja ack body; it is secret-token-gated and idempotent.
- Merge gate: `npm test` green, `npx tsc --noEmit` clean, Android bundle exports (run after `expo export` so route types regenerate).

---

## File Structure

**Create**
- `supabase/migrations/0012_mpesa_callback.sql` — Daraja columns + index + `apply_mpesa_callback` + exec grants.
- `supabase/functions/_shared/daraja.ts` (+ Jest test) — pure helpers.
- `supabase/functions/_shared/daraja-client.ts` — Deno-only OAuth + STK fetch.
- `supabase/functions/mpesa-stk-push/index.ts` — Deno entry (auth + ownership + mode + insert).
- `supabase/functions/mpesa-callback/index.ts` — Deno entry (token + parse + apply RPC + 200 ack).
- `supabase/config.toml` — per-function `verify_jwt`.
- `.env.example` — Edge Function secret NAMES (documentation only).
- `docs/superpowers/verification/slice-13-daraja.md` — secret-setup + sandbox manual verification.

**Modify**
- `src/lib/attempts.ts` — `initiateMpesaPayment` → `functions.invoke('mpesa-stk-push', …)`; `PaymentAttempt` gains Daraja fields.
- `src/lib/mpesa.ts` — remove `initiateStkPushMock`; keep phone helpers.
- `src/lib/mpesa.test.ts` — drop mock-STK cases.
- `src/lib/attempts.test.ts` — assert `functions.invoke` wiring (mocked).
- `src/app/admin/payment-attempts.tsx` — display Daraja refs.
- `jest.config`/`package.json` jest section — ensure `supabase/functions/_shared` resolvable by Jest (roots) if needed.

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0012` (columns, index, `apply_mpesa_callback`, grants).
2. **T2** — `_shared/daraja.ts` pure helpers + Jest tests (+ jest roots tweak if needed). Independent of T1.
3. **T3** — `PaymentAttempt` fields + admin attempts screen shows Daraja refs.
4. **T4** — Rewire `src/lib/attempts.ts` to `functions.invoke`; trim `mpesa.ts`; update both tests.
5. **T5** — Edge Functions: `_shared/daraja-client.ts` + `mpesa-stk-push/index.ts` + `mpesa-callback/index.ts` + `config.toml` + `.env.example`.
6. **T6** — Verification: sandbox + Expo Go + final gate + `slice-13-daraja.md`.

T2 parallelizable with T1. T5 depends on T1 (RPC/columns) + T2 (helpers). T3/T4 depend on T1 fields.

---

### Task 1: DB migration `0012_mpesa_callback.sql`

**Files:** Create `supabase/migrations/0012_mpesa_callback.sql`

**Build (mirror `0011` style):**
- ALTER `payment_attempts` add nullable `merchant_request_id text`, `checkout_request_id text`, `result_code int`, `result_desc text`, `callback_received_at timestamptz`.
- `create index if not exists payment_attempts_checkout_request_id_idx on public.payment_attempts (checkout_request_id);`
- `apply_mpesa_callback(p_checkout_request_id text, p_merchant_request_id text, p_result_code int, p_result_desc text, p_raw jsonb) returns void` — `security definer set search_path = public`:
  - find attempt by `checkout_request_id`; if none → return.
  - if attempt status in (`successful`,`failed`,`cancelled`) → return (idempotent).
  - set `merchant_request_id = coalesce(merchant_request_id, p_merchant_request_id)`, `result_code`, `result_desc`, `callback_received_at = now()`, `raw_response = p_raw`.
  - if `p_result_code = 0`: attempt `status='successful'`; atomic `update payments set status='paid', paid_at=now(), payment_method='mpesa' where id = <attempt.payment_id> and status='pending'`; cancel sibling `pending`/`initiated` attempts. else: attempt `status='failed'`.
- `revoke execute on function public.apply_mpesa_callback(text,text,int,text,jsonb) from anon, authenticated;`

**Checks:**
- [ ] Migration applies cleanly; `\d payment_attempts` shows new columns + index; `apply_mpesa_callback` exists with grants revoked from anon/authenticated.
- [ ] `npm test` green, `npx tsc --noEmit` clean (no app code changed yet).
- [ ] Commit `feat: slice13 mpesa callback schema (0012)`.

> Behavioral verification in T6.

---

### Task 2: `_shared/daraja.ts` pure helpers

**Files:** Create `supabase/functions/_shared/daraja.ts`, `supabase/functions/_shared/daraja.test.ts` (or `src/__tests__/daraja.test.ts` if jest roots are restricted to `src`).

**Produces (pure, no Deno APIs):**
- `darajaTimestamp(date: Date): string` → `YYYYMMDDHHmmss`.
- `buildStkPassword(shortcode: string, passkey: string, timestamp: string): string` → `base64(shortcode+passkey+timestamp)`.
- `buildStkPushPayload(p: { shortcode; passkey; timestamp; amount; phone; callbackUrl; accountReference; transactionDesc }): Record<string, unknown>` → Daraja STK body (Amount integer, `PartyA`/`PhoneNumber` = phone, `PartyB`/`BusinessShortCode` = shortcode, `Password`, `Timestamp`, `TransactionType: 'CustomerPayBillOnline'`, `CallBackURL`, `AccountReference`, `TransactionDesc`).
- `parseStkCallback(body: unknown): { merchantRequestId: string|null; checkoutRequestId: string|null; resultCode: number|null; resultDesc: string|null }` — read `Body.stkCallback.{MerchantRequestID,CheckoutRequestID,ResultCode,ResultDesc}`; nulls on malformed.
- `mockStkResult(p: { phone: string; amount: number }): { merchantRequestId: string; checkoutRequestId: string; responseCode: '0'; raw: Record<string, unknown> }` — synchronous mock (checkout id like `ws_CO_MOCK-<rand>`).
- `isMsisdn(phone: string): boolean` → `^2547\d{8}$|^2541\d{8}$`.

**Tests:** timestamp format (fixed Date → exact string); password base64 round-trips to `shortcode+passkey+ts`; payload integer amount + required keys; parse success (ResultCode 0 + ids), failure (non-zero), malformed (`{}`/null → nulls); mock returns `responseCode '0'` + `ws_CO_`/`MOCK-` checkout id; `isMsisdn` true/false.

**Steps:** ensure Jest resolves the file (if `roots` excludes `supabase/`, add it or place the test under `src/__tests__` importing the relative path) → TDD cycle → `tsc` → commit `feat: slice13 daraja pure helpers`.

---

### Task 3: `PaymentAttempt` Daraja fields + admin display

**Files:** Modify `src/lib/attempts.ts` (type only), `src/app/admin/payment-attempts.tsx`

**Build:**
- Add to `PaymentAttempt`: `merchant_request_id: string|null; checkout_request_id: string|null; result_code: number|null; result_desc: string|null; callback_received_at: string|null;`.
- Admin attempts row: when present, show `checkout_request_id`, `result_code != null ? \`Result: ${result_code} · ${result_desc ?? ''}\`` , and callback time `new Date(callback_received_at).toLocaleString()`. Keep existing Confirm/Cancel.

**Checks:** `npm test` (update `admin-payment-attempts.test.tsx` fixture with the new fields if it asserts shape), `tsc`; commit `feat: slice13 attempt daraja fields + admin display`.

---

### Task 4: Rewire client to Edge Function

**Files:** Modify `src/lib/attempts.ts`, `src/lib/attempts.test.ts`, `src/lib/mpesa.ts`, `src/lib/mpesa.test.ts`

**Build:**
- `initiateMpesaPayment`: keep `isValidKenyanPhone` guard (reject before any network); compute `normalized`; call
  `supabase.functions.invoke('mpesa-stk-push', { body: { payment_id: input.paymentId, phone: normalized } })`.
  Treat `error` or `data?.ok === false` as failure → `{ ok:false, error:'Could not start payment. Please try again.' }`; else `{ ok:true }`. Remove the `initiate_payment_attempt` RPC call and `initiateStkPushMock` import.
- `src/lib/mpesa.ts`: delete `initiateStkPushMock` (+ its types if unused); keep `normalizeKenyanPhone`/`isValidKenyanPhone`.
- Tests: `attempts.test.ts` — mock `supabase.functions.invoke`; assert bad phone → no invoke; good phone → invoke called with `'mpesa-stk-push'` + `{ payment_id, phone:'254712345678' }`; invoke error → friendly string. `mpesa.test.ts` — remove `initiateStkPushMock` cases.

**Checks:** `npm test`, `tsc`; commit `refactor: slice13 client invokes mpesa-stk-push edge function`.

---

### Task 5: Edge Functions + config + secret docs

**Files:** Create `supabase/functions/_shared/daraja-client.ts`, `supabase/functions/mpesa-stk-push/index.ts`, `supabase/functions/mpesa-callback/index.ts`, `supabase/config.toml`, `.env.example`

**Build:**
- `daraja-client.ts` (Deno): `getOAuthToken()` — Basic auth `base64(key:secret)` GET `${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`; cache token + expiry in module scope. `stkPush(token, payload)` — POST `${DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`; return parsed JSON.
- `mpesa-stk-push/index.ts` (`Deno.serve`): read JWT from `Authorization`; build a user-scoped client (anon key + JWT) and SELECT the payment to confirm ownership + `status='pending'` + booking `completed` (reject 403/400 otherwise); read `MPESA_MODE`; `mock` → `mockStkResult`; `sandbox`/`live` → `getOAuthToken` + `buildStkPushPayload` (callback = `${DARAJA_CALLBACK_URL}` already containing the secret token) + `stkPush`; insert the attempt via a service-role client (`provider:'mpesa'`, phone, `merchant_request_id`, `checkout_request_id`, `status:'pending'`, `raw_response`); return `{ ok:true, checkoutRequestId, status:'pending' }` or `{ ok:false, error }`.
- `mpesa-callback/index.ts` (`Deno.serve`, public): verify `?token=` equals `MPESA_CALLBACK_SECRET` (else 401); `parseStkCallback(await req.json())`; call `apply_mpesa_callback` via service-role client with the parsed fields + raw; ALWAYS respond `200` `{ ResultCode: 0, ResultDesc: 'Accepted' }`.
- `config.toml`: `[functions.mpesa-stk-push] verify_jwt = true`; `[functions.mpesa-callback] verify_jwt = false`.
- `.env.example`: list secret NAMES (§7 of spec) with placeholder/empty values + a comment that real values go via `supabase secrets set`, never committed.

**Checks:** these are Deno files (not Jest-run); `npm test` + `tsc` must still pass for the app (the `.ts` under `supabase/functions` must be excluded from the app's tsconfig if it errors — confirm app `tsc` stays clean). Commit `feat: slice13 mpesa edge functions + config`.

---

### Task 6: Verification & final gate

**Files:** Create `docs/superpowers/verification/slice-13-daraja.md`

**Required Supabase secrets** (documented; set via CLI, never committed):
`MPESA_MODE`, `DARAJA_BASE_URL`, `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_SHORTCODE`, `DARAJA_PASSKEY`, `DARAJA_CALLBACK_URL` (includes `?token=<MPESA_CALLBACK_SECRET>`), `MPESA_CALLBACK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
Document: `supabase secrets set KEY=VALUE …` and `supabase functions deploy mpesa-stk-push mpesa-callback`.

**Daraja sandbox verification** (manual, documented):
- [ ] `mock` mode: invoke `mpesa-stk-push` (no Daraja secrets) → attempt created `pending`, app shows pending.
- [ ] sandbox mode: set sandbox secrets + deploy; from app initiate → STK prompt on the Safaricom test MSISDN; Daraja POSTs the callback.
- [ ] Callback with correct token + ResultCode 0 → attempt `successful`, payment `paid`, `payment_method='mpesa'`, exactly one `provider_earnings` row; sibling attempts cancelled.
- [ ] Callback with non-zero ResultCode → attempt `failed`, payment stays `pending`.
- [ ] Callback with wrong/missing token → 401, no state change.
- [ ] Replayed callback (same checkout id) → no-op (idempotent).
- [ ] Unknown checkout id → 200 ack, no change.

**DB/RLS checks:**
- [ ] `apply_mpesa_callback` EXECUTE denied to `anon`/`authenticated`; works via service role.
- [ ] Customer/provider still cannot read others' attempts; customer cannot set paid.

**Expo Go verification** (manual):
- [ ] `npx expo start --tunnel`; Pay with M-Pesa (mock mode) → pending; admin Confirm → paid + earning (fallback path still works).
- [ ] Bad phone → validation error, no function call.

**Final gate:**
- [ ] `npx expo export` (regenerate route types) → `npx tsc --noEmit` clean → `npm test` green → Android bundle exports.
- [ ] Commit `test: slice13 verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-13-mpesa` (created at execution). Abandon = `git checkout main` + delete branch; `main` untouched.
- **Single task regression:** `git revert <task-commit>` — tasks are independently committed.
- **Disable live integration without code revert:** set `MPESA_MODE=mock` (Supabase secret) — the app reverts to mock behavior instantly; no deploy of app needed.
- **Remove Edge Functions:** `supabase functions delete mpesa-stk-push mpesa-callback`; the client `functions.invoke` then fails gracefully (friendly error) — to fully revert the client, `git revert` the T4 commit (restores the `initiate_payment_attempt` RPC + client mock path).
- **Schema rollback:** forward-only; if needed add `0013_rollback_mpesa_callback.sql`: `drop function if exists public.apply_mpesa_callback(text,text,int,text,jsonb);` and `alter table public.payment_attempts drop column if exists merchant_request_id, … , callback_received_at;` (`drop index if exists payment_attempts_checkout_request_id_idx;`). Do not edit `0012` after it is applied to a shared environment.
- **Secrets:** rotate/clear Daraja secrets via `supabase secrets unset …` if compromised; none are in git so no history scrub needed.

---

## Self-Review

- **Spec coverage:** Daraja columns + apply_mpesa_callback + grants (T1), pure helpers + Jest (T2), PaymentAttempt fields + admin display (T3), client rewire + mpesa trim (T4), edge functions + config + secret docs (T5), sandbox + Expo Go + final gate + verification doc (T6). MPESA_MODE, callback security, no-creds-in-app/git, mock fallback — all covered.
- **Placeholder scan:** none; verification items concrete.
- **Type consistency:** `PaymentAttempt` Daraja fields (T3) consumed by admin display (T3) and produced by callback (T1); helper names (`darajaTimestamp`, `buildStkPassword`, `buildStkPushPayload`, `parseStkCallback`, `mockStkResult`, `isMsisdn`) consistent T2↔T5; RPC `apply_mpesa_callback` signature consistent T1↔T5↔T6; `functions.invoke('mpesa-stk-push', { body:{ payment_id, phone } })` consistent T4↔T5.
