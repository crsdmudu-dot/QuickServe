# QuickServe — Pilot Onboarding Checklists

**Purpose:** Operator-actionable checklists for bringing each user type live during the pilot.
Work top-to-bottom within each section. Complete Section 1 (Admin) before onboarding any
providers or customers — the admin must exist and the backend must be ready first.

**Companion docs (read before starting):**
- Backend setup, migrations, secrets, Edge Functions → [`backend-readiness.md`](./backend-readiness.md)
- Step-by-step manual test scripts for every scenario → [`qa-e2e.md`](./qa-e2e.md)

---

## 1. Admin Onboarding

There is **no in-app admin sign-up flow by design**, on two levels:
- **UI:** the mobile role-select screen offers **only Customer and Provider** — the Admin
  option has been removed (`src/constants/roles.ts`), so public users **cannot** choose admin.
- **Backend safety net:** the `handle_new_user()` trigger (migration `0001_profiles.sql`)
  downgrades any attempted admin signup metadata to `role = 'customer'`, so admin
  self-registration is permanently blocked at the database level even via a crafted API call.

**Pilot admin accounts are created/promoted manually in Supabase** (set
`role = 'admin'`, `approval_status = 'approved'` on the profile row) — see
[`backend-readiness.md § 3`](./backend-readiness.md) for the SQL.
**Future:** admin access should move to a dedicated **web admin portal**, not the mobile app.
A **web admin panel is the next dedicated slice** (not started yet); until then admin access
stays internal/private and admin accounts are promoted manually in Supabase.

### 1a. Backend prerequisites

Complete the entire [`backend-readiness.md`](./backend-readiness.md) checklist first.
The items below reference it rather than repeating the SQL/CLI commands.

- [ ] All 15 migrations applied in order (`supabase db push`). Post-apply table counts pass.
  See [`backend-readiness.md § 1`](./backend-readiness.md).
- [ ] Auth settings configured (email auth enabled, Site URL set, JWT expiry sane).
  See [`backend-readiness.md § 2`](./backend-readiness.md).
- [ ] All four Edge Functions deployed: `mpesa-stk-push`, `mpesa-callback`, `register-device`,
  `send-push`. JWT verification flags match the config table.
  See [`backend-readiness.md § 5`](./backend-readiness.md).
- [ ] M-Pesa secrets set (`MPESA_MODE`, `DARAJA_*`, `MPESA_CALLBACK_SECRET`,
  `DARAJA_CALLBACK_URL`). Start with `MPESA_MODE=mock` for initial testing.
  See [`backend-readiness.md § 6`](./backend-readiness.md).
- [ ] Push secrets set (`PUSH_WEBHOOK_SECRET`) and `private.push_config` row populated
  (`send_push_url`, `webhook_secret`). See [`backend-readiness.md § 7`](./backend-readiness.md).
- [ ] Storage bucket `booking-photos` exists, is private, and object policies are present.
  See [`backend-readiness.md § 4`](./backend-readiness.md).

### 1b. Provision the admin account

- [ ] Create the auth user: Supabase dashboard → **Authentication → Users → Invite / Add user**.
  Expected outcome: user appears in `auth.users` with an auto-created `profiles` row
  (`role = 'customer'`, `approval_status = 'pending'`).
- [ ] Promote to admin — run as service role in the SQL editor:
  ```sql
  update public.profiles
  set role = 'admin', approval_status = 'approved'
  where id = '<user-uuid-from-auth.users>';
  ```
  Expected outcome: query returns `1` row updated.
- [ ] Verify promotion: `select role, approval_status from public.profiles where id = '<admin-uuid>';`
  returns `admin / approved`.
- [ ] Verify `is_admin()`: run `select public.is_admin();` with the admin's JWT in the auth header
  — must return `true`.
- [ ] Confirm role gating: log in as the admin on-device. App must route to `/admin` (Admin
  dashboard), not the customer tab stack. See `src/constants/roles.ts` `roleHref()` for the
  routing logic.

### 1c. Verify admin dashboard capabilities

Run these manually against the pilot project. Detailed step scripts in
[`qa-e2e.md § 3`](./qa-e2e.md) (scenarios A-01 through A-20).

- [ ] **Dashboard loads** — Admin screen shows "Admin" title with **Payments** and **Sign out**
  ghost buttons. Toggle between **Bookings** and **Providers** tabs without error. (qa-e2e A-01)
- [ ] **Provider approval** — Approve and reject pending provider applications from the
  Providers tab. `approval_status` updates in Supabase. (qa-e2e A-02, A-03)
- [ ] **Provider detail / verify** — Open a provider profile (`/admin/provider/<id>`), edit bio,
  toggle **Verify** / **Unverify**. (qa-e2e A-04)
- [ ] **Reviews oversight** — Hide and unhide a review from the provider profile Reviews section.
  `is_hidden` toggles correctly. (qa-e2e A-05)
- [ ] **Assign provider** — Use both **Manual** (name + phone) and **In-app** (picker from
  approved providers) modes on a booking detail screen. Booking status advances to
  `provider_assigned`. (qa-e2e A-06, A-07)
- [ ] **Status override** — All 7 status buttons (`pending` → `accepted` → `provider_assigned`
  → `on_the_way` → `in_progress` → `completed` → `cancelled`) visible and functional.
  (qa-e2e A-08)
- [ ] **Quote** — Set amount + provider share, observe live QuickServe-share preview, tap
  **Send quote**. `quote_status` becomes `sent`. Cannot edit after customer accepts. (qa-e2e A-09, A-10)
- [ ] **Payments list** — Navigate to `/admin/payments`; each card shows KES amount, status badge,
  split line, payment method, booking ref, and date. (qa-e2e A-11)
- [ ] **Override payment status** — Flip a pending payment to `paid` from the Payments screen.
  (qa-e2e A-12)
- [ ] **Payment attempts** — View Daraja refs at `/admin/payment-attempts`; confirm and cancel
  attempts. (qa-e2e A-13, A-14, A-15)
- [ ] **Payout** — `mark_payout_paid` RPC changes provider earning from `pending` to `paid`.
  (qa-e2e A-17)
- [ ] **Chat read-only** — Conversation section on booking detail shows all messages in readonly
  mode; no input field or Send button is present. (qa-e2e A-18)
- [ ] **Admin notes** — Save internal notes on a booking; text persists on reload. (qa-e2e A-20)

### 1d. Pilot operations readiness

- [ ] Designate the operator responsible for dispatching bookings and approving providers
  during the pilot. Document their contact information internally.
- [ ] Agree on the issue-reporting channel (e.g. Slack thread, shared spreadsheet) and link it
  to the QA findings log. See [`qa-e2e.md`](./qa-e2e.md) for the Pass/Fail record format.
- [ ] Review rollback procedures with at least one team member before accepting live traffic.
  Kill switches documented in [`backend-readiness.md § 11`](./backend-readiness.md):
  push kill switch (`send_push_url = null`) and M-Pesa mock toggle (`MPESA_MODE=mock`).
- [ ] Run the full Regression Sweep (critical happy path) from
  [`qa-e2e.md`](./qa-e2e.md) before going live.

---

## 2. Provider Onboarding

Providers self-register through the app but must be **manually approved by an admin** before
they can see or act on any jobs. Complete Section 1 first.

### 2a. Registration

- [ ] Provider opens the app and taps **Get Started** on the Welcome screen.
- [ ] Selects the **Service Provider** card on the "Choose your role" screen
  (`src/app/(onboarding)/role-select.tsx`). Expected: `pendingRole = 'provider'` stored in
  `AuthContext`.
- [ ] Fills in Full name, Email, Phone ("07XX XXX XXX"), Password, and Confirm password, then
  taps **Create account** (`src/app/(onboarding)/register.tsx`).
  Expected: Supabase creates an `auth.users` row and the `handle_new_user()` trigger writes a
  `profiles` row with `role = 'provider'`, `approval_status = 'pending'`.
- [ ] After registration the provider is routed to the provider home screen and sees the
  **"Awaiting approval"** empty state (hourglass icon) with a **Sign out** button.
  No jobs are visible. (qa-e2e P-01)

### 2b. Admin approval

- [ ] Admin logs in, opens the **Providers** tab on the Admin dashboard, finds the new pending
  provider card, and taps **Approve**.
  Expected: `approval_status` changes from `pending` to `approved` in `public.profiles`.
  The provider card disappears from the pending list. (qa-e2e A-02)
- [ ] (If rejected) Provider sees "Application declined" state with a **Sign out** button.
  (qa-e2e P-02)

### 2c. Profile completion

After approval the provider can edit their profile on the **Profile** tab
(`src/app/provider/(tabs)/profile.tsx`).

- [ ] Enter a **Bio** describing their expertise.
- [ ] Set **Years of experience** (numeric input).
- [ ] Set **Skills** (free-text or list of their service categories).
- [ ] Set **Profile photo URL** (if a hosted image URL is available).
  Expected: Saved to `profiles.profile_photo_url`; photo appears in the profile header avatar.
- [ ] Tap **Save** — no error toast; reload confirms the values persisted. (qa-e2e P-12)

### 2d. Availability

- [ ] Toggle **Available** / **Unavailable** button on the Profile tab.
  Expected: `profiles.availability_status` updates; availability badge reflects the new state.
  (qa-e2e P-12)

### 2e. Job assignment and lifecycle

Once assigned a job by an admin the provider advances it through the forward-only status chain
defined in `src/constants/booking-status.ts` (`PROVIDER_NEXT_STATUSES`):
`provider_assigned` → `on_the_way` → `in_progress` → `completed`.

- [ ] Provider receives an assigned job — admin uses **In-app** mode on the booking to set
  `assigned_provider_id`. (qa-e2e A-07)
  Expected: The job appears in the provider's **My Jobs** list with a `provider_assigned` badge.
- [ ] Provider opens the job detail screen (`/provider/job/<id>`) and taps **On the way**.
  Expected: Status badge updates to `on_the_way`; only the next action button is shown.
  (qa-e2e P-04)
- [ ] Provider taps **In progress**. Expected: status badge updates. (qa-e2e P-05)
- [ ] Provider taps **Completed**. Expected: status badge shows "Completed"; "No further action"
  is displayed. (qa-e2e P-06)
- [ ] **Forward-only enforcement** — at any intermediate status, only the single next-step button
  is visible; no backward transitions are possible. (qa-e2e P-07)

### 2f. Before/after photos

- [ ] On the job detail screen, scroll to **Photos** and tap **Add before photo**.
  Grant media library permission; select an image. Expected: photo appears in the PhotoGallery.
  (qa-e2e P-08)
- [ ] Tap **Add after / completion photo**, select an image.
  Expected: photo appears alongside any existing photos. (qa-e2e P-09)

### 2g. Chat with customer

- [ ] On the job detail screen, scroll to the bottom and tap **Chat with customer**.
  Type a message and tap **Send**. Expected: chat thread opens at `/provider/job/chat/<id>`;
  message appears. Customer sees the message on their side. (qa-e2e P-10)

### 2h. Earnings

- [ ] After a payment is confirmed paid, navigate to the **Profile** tab.
  Scroll to **Earnings**. Expected: summary card shows Pending and Paid KES totals; individual
  earning cards show amount and payout status ("Pending payout" or "Paid out"). (qa-e2e P-11)

---

## 3. Customer Onboarding

Customers self-register and can book immediately after sign-up — no approval step required.
Complete Section 1 (backend + admin) before onboarding customers.

### 3a. Registration

- [ ] Customer opens the app and taps **Get Started** on the Welcome screen.
- [ ] Selects the **Customer** card on the "Choose your role" screen.
  Expected: `pendingRole = 'customer'` stored in `AuthContext`.
- [ ] Fills in Full name, Email, Phone ("07XX XXX XXX"), Password, and Confirm password, then
  taps **Create account**.
  Expected: Supabase creates a `profiles` row with `role = 'customer'`, `approval_status = 'approved'`.
  App routes to the customer Home screen (greeting + service grid). (qa-e2e C-01)
- [ ] **Role gating** — attempts to navigate to `/provider` or `/admin` are blocked; customer is
  redirected to the customer tab stack. `src/constants/roles.ts` `roleHref()` enforces this.
  (qa-e2e C-03)

### 3b. Create a booking

The booking wizard runs across four screens in `src/app/booking/`:
`address.tsx` → `schedule.tsx` → `notes.tsx` → `review.tsx` → `success.tsx`.

- [ ] Tap any service card on the Home screen (e.g. "House Cleaning").
- [ ] **Step 1 — Address** (`/booking/address`): enter a full address and tap **Continue**.
  Expected: advance to schedule step; blank address shows "Address is required." inline error.
  (qa-e2e C-04, C-05)
- [ ] **Step 2 — Schedule** (`/booking/schedule`): tap **Pick date & time**, select a future date
  and time, tap **Continue**. Expected: advance to notes step; no date selected shows
  "Please choose a date and time." inline error. (qa-e2e C-04, C-06)
- [ ] **Step 3 — Notes & photos** (`/booking/notes`): enter optional notes; optionally tap
  **Pick photo from library** to attach issue photos (media permission required).
  Tap **Continue**. (qa-e2e C-07)
- [ ] **Step 4 — Review** (`/booking/review`): verify summary card shows service, address,
  date, and notes. Tap **Place Booking**.
  Expected: success screen shows "Booking created successfully". A **Back to Home** button
  is present. (qa-e2e C-04)

### 3c. Issue photos

- [ ] Attach at least one photo during Step 3. Expected: "1 photo selected" counter increments;
  photo URI row appears. **Remove** clears the entry. Booking creation succeeds; if the upload
  fails a `photoWarning` notice appears on the success screen (non-blocking). (qa-e2e C-07)

### 3d. Quote → accept → payment

- [ ] **Receive quote** — admin sets a quote on the booking (`set_quote` RPC). Customer opens
  the booking detail screen (`/booking/<id>`) and sees a QuoteCard with `sent` status and the
  quoted KES amount. (qa-e2e C-09)
- [ ] **Accept quote** — customer taps **Accept** on the QuoteCard.
  Expected: `quote_status` → `accepted`; a `payments` row is created with `status = pending`;
  Accept/Decline buttons disappear. (qa-e2e C-09)
- [ ] **M-Pesa payment** — enter a valid Kenyan phone number ("07XX XXX XXX") in the
  "M-Pesa phone number" field on the booking detail screen. Tap **Pay with M-Pesa**.
  Expected: an `AttemptStatusBadge` shows `pending` / `initiated`; "Payment request sent.
  Awaiting confirmation." message is displayed. A `payment_attempts` row is created.
  With `MPESA_MODE=mock` this is immediate; with `MPESA_MODE=sandbox` a real STK Push is sent
  to the test handset. (qa-e2e C-11, C-12)
- [ ] **Invalid phone rejected** — entering "12345" shows "Enter a valid M-Pesa phone number."
  inline error; no network call is made. (qa-e2e C-13)

### 3e. Chat with provider

- [ ] Once a provider is assigned (`assigned_provider_id` set), the booking detail screen shows
  a **Chat with provider** button. Tap it.
  Expected: chat thread opens at `/booking/chat/<id>`; messages sent appear in the thread.
  Provider's incoming messages are visually distinct (opposite alignment). (qa-e2e C-14, C-15)

### 3f. Notifications

- [ ] **In-app** — tap the **Notifications** tab. At least one notification appears (e.g. quote
  sent, status change). Tap it; if it carries a `booking_id` the app navigates to
  `/booking/<id>`. Tap **Mark all read** to clear unread indicators. (qa-e2e C-17)
- [ ] **Push (dev build only)** — push delivery requires a dev build (EAS or `expo run:android`
  / `expo run:ios`). Expo Go on Android does not support push tokens. Admin triggers a
  booking event; push notification arrives on the device and deep-links to the correct booking
  on tap. See [`backend-readiness.md § 7`](./backend-readiness.md) for FCM/EAS credential
  requirements. (qa-e2e C-16)

### 3g. Review a completed job

Reviews are only available when `booking.status = 'completed'` and `assigned_provider_id` is
set. Schema: `public.reviews` (migration `0008_reviews.sql`); `average_rating` is trigger-
computed and cannot be tampered with client-side (migration `0009_pin_review_count.sql`).

- [ ] Open the completed booking detail screen. Scroll to **Your review**.
  Expected: StarInput (5 stars) and optional comment field are shown; **Submit review** button
  is disabled until at least 1 star is selected. (qa-e2e C-20)
- [ ] Select a star rating (≥ 1) and optionally enter a comment. Tap **Submit review**.
  Expected: the form disappears and is replaced by a ReviewCard showing the submitted rating
  and comment. (qa-e2e C-18)
- [ ] Reopen the booking detail screen.
  Expected: ReviewCard is shown; no submission form is present. (qa-e2e C-19)

---

## Quick-Reference: Onboarding Order

1. Complete [`backend-readiness.md`](./backend-readiness.md) end-to-end.
2. Provision admin account (Section 1b above) and verify dashboard (Section 1c).
3. Onboard pilot providers (Section 2) — admin approves each one.
4. Onboard pilot customers (Section 3) — no approval needed.
5. Run the Regression Sweep from [`qa-e2e.md`](./qa-e2e.md) with at least one customer,
   one provider, and the admin before accepting real bookings.
