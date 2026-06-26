# QuickServe — Manual E2E QA Scripts

**Purpose:** Step-by-step manual test scripts for the QuickServe pilot. Each tester executes these scenarios in order, records Pass/Fail, and notes any deviations.

**Environments:**
- **Mock M-Pesa** — `MPESA_MODE=mock` on the Edge Function; STK Push call is stubbed, attempt row appears immediately as `pending`. Use for most day-to-day runs.
- **Sandbox M-Pesa** — `MPESA_MODE=sandbox` + Daraja sandbox credentials; a real STK Push is sent to the Safaricom sandbox. Use for payment E2E sign-off.
- **Push notifications** — require a **dev build** (Expo EAS or `expo run:android`/`expo run:ios`). Expo Go does not support push tokens. Mark notification scenarios as "dev build only" where noted.

**Supabase project:** connect to the pilot Supabase project with appropriate service-role credentials for admin operations.

---

## 1. Customer Scenarios

### C-01: Sign Up — New Customer

- **Preconditions:** App is freshly launched; no existing account for the test email.
- **Steps:**
  1. On the Welcome screen tap **Get Started**.
  2. On the "Choose your role" screen tap the **Customer** card.
  3. Fill in Full name, Email, Phone number ("07XX XXX XXX"), Password, Confirm password.
  4. Tap **Create account**.
- **Expected result:** App navigates to the customer Home screen ("Good morning / afternoon / evening" greeting). The bottom tab bar shows Home, Bookings, Payments, Notifications.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-02: Login — Existing Customer

- **Preconditions:** A customer account exists in Supabase.
- **Steps:**
  1. On the Welcome screen tap **Log in**.
  2. Enter correct email and password.
  3. Tap **Continue**.
- **Expected result:** App navigates to the customer Home screen.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-03: Role Gating — Customer Cannot Access Provider or Admin Routes

- **Preconditions:** Logged in as a customer.
- **Steps:**
  1. Attempt to navigate manually to `/provider/job` or `/admin`.
  2. Observe the redirect or blocked access.
- **Expected result:** Customer is redirected back to the customer tab stack; provider and admin screens are not accessible.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-04: Booking Creation — Full Flow

- **Preconditions:** Logged in as a customer.
- **Steps:**
  1. On the Home screen, tap any service card (e.g. "House Cleaning").
  2. **Step 1 of 4 — Your Address:** Enter a full address (e.g. "123 Moi Avenue, Nairobi"). Tap **Continue**.
  3. **Step 2 of 4 — When do you need it?:** Tap **Pick date & time**. Select a future date and time. Tap **Continue**.
  4. **Step 3 of 4 — Any special notes?:** Enter optional notes. Tap **Continue** (skip photos for this scenario).
  5. **Step 4 of 4 — Review your booking:** Verify the summary card shows service, address, date, and notes. Tap **Place Booking**.
- **Expected result:** App shows the success screen: "Booking created successfully" with a confetti icon. A **Back to Home** button is present.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-05: Booking Creation — Address Validation

- **Preconditions:** Logged in as a customer; on the address step of a booking.
- **Steps:**
  1. Leave the Address field blank.
  2. Tap **Continue**.
- **Expected result:** Inline error "Address is required." appears below the input. Navigation does not advance.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-06: Booking Creation — Schedule Validation

- **Preconditions:** Address entered; on the schedule step.
- **Steps:**
  1. Do not pick a date or time.
  2. Tap **Continue**.
- **Expected result:** Inline error "Please choose a date and time." appears. Navigation does not advance.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-07: Photos — Attach Issue Photos During Booking

- **Preconditions:** On the notes step (Step 3 of 4).
- **Steps:**
  1. Tap **Pick photo from library**.
  2. Grant media library permission when prompted.
  3. Select one photo.
  4. Observe the "1 photo selected" count and the URI row.
  5. Tap **Remove** next to the photo URI.
  6. Observe the count clears.
  7. Pick a new photo. Tap **Continue** to proceed to review, then **Place Booking**.
- **Expected result:**
  - Photo count increments/decrements correctly.
  - On booking success the app shows "Booking created successfully" (with a `photoWarning` notice if the upload fails, or no notice if it succeeds).
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-08: My Bookings — List and Detail

- **Preconditions:** At least one booking created for this customer.
- **Steps:**
  1. Tap the **Bookings** tab.
  2. Verify the booking card shows service title, a status badge (e.g. "Pending"), and the scheduled date.
  3. Tap the booking card.
  4. Verify the detail screen shows "Booking Detail" title, a BookingSummaryCard, and a status badge.
- **Expected result:** Booking list loads; tapping a card navigates to `/booking/<id>`.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-09: Quotes — Receive and Accept a Sent Quote

- **Preconditions:** Admin has set a quote on this booking (quote_status = `sent`).
- **Steps:**
  1. Open the booking detail screen (`/booking/<id>`).
  2. Scroll to the **Payment** section.
  3. Observe a QuoteCard showing the quoted amount and `sent` status.
  4. Tap **Accept** on the QuoteCard.
- **Expected result:** Quote status updates to `accepted`. A payment row is created (visible in the Payment section as a new QuoteCard). The **Accept** / **Decline** buttons disappear.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-10: Quotes — Decline a Sent Quote

- **Preconditions:** Admin has set a new quote on a booking (quote_status = `sent`).
- **Steps:**
  1. Open the booking detail screen.
  2. In the **Payment** section, tap **Decline** on the QuoteCard.
- **Expected result:** Quote status updates to `declined`. The QuoteCard reflects the declined status. No payment row is created.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-11: M-Pesa Payment — Initiate STK Push (Mock)

- **Preconditions:** Booking is `completed`; payment status is `pending`; `MPESA_MODE=mock`.
- **Steps:**
  1. Open the booking detail screen.
  2. Scroll to the **Payment** section.
  3. Enter a valid Kenyan phone number in the "M-Pesa phone number" field (e.g. "0712 345 678").
  4. Tap **Pay with M-Pesa**.
- **Expected result:** An `AttemptStatusBadge` appears showing `pending` or `initiated` status. The text "Payment request sent. Awaiting confirmation." is displayed below the badge.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-12: M-Pesa Payment — Initiate STK Push (Sandbox)

- **Preconditions:** Same as C-11 but `MPESA_MODE=sandbox`; use a Safaricom sandbox test phone.
- **Steps:**
  1. Repeat steps in C-11.
  2. Wait for the STK Push to appear on the test handset (up to 60 seconds).
- **Expected result:** STK Push prompt appears on the test device. The attempt row transitions to `successful` or `failed` after the Daraja callback.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-13: M-Pesa Payment — Invalid Phone Rejected

- **Preconditions:** On the booking detail screen with a pending payment.
- **Steps:**
  1. Enter an invalid phone number (e.g. "12345") in the "M-Pesa phone number" field.
  2. Tap **Pay with M-Pesa**.
- **Expected result:** Inline error "Enter a valid M-Pesa phone number." is shown. No network call is made.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-14: Chat — Open from Booking Detail

- **Preconditions:** A provider has been assigned to the booking (`assigned_provider_id` is set).
- **Steps:**
  1. Open the booking detail screen.
  2. Tap **Chat with provider**.
  3. Type a message and tap Send.
- **Expected result:** Chat thread opens at `/booking/chat/<id>`. The message appears in the thread.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-15: Chat — Receive Provider Message

- **Preconditions:** Provider has sent a message in the same booking chat.
- **Steps:**
  1. Open the booking chat screen (`/booking/chat/<id>`).
  2. Observe the incoming message bubble.
- **Expected result:** Provider's message is visible in the thread with distinct styling (opposite alignment from the customer's messages).
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-16: Push Notifications — Booking Events (Dev Build Only)

- **Preconditions:** App running as a **dev build** with a valid Expo push token registered; notification triggers are wired up in the Supabase backend.
- **Steps:**
  1. (Admin) Trigger a relevant booking event: status change, quote sent, provider assigned.
  2. Observe the device lock screen / notification tray.
  3. Tap the notification.
- **Expected result:**
  - A push notification arrives with the correct title and body for the event.
  - Tapping deep-links to the relevant booking detail screen (`/booking/<id>`).
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-17: In-App Notifications — List and Mark Read

- **Preconditions:** At least one notification exists for this customer.
- **Steps:**
  1. Tap the **Notifications** tab.
  2. Observe unread notification items.
  3. Tap a notification row.
  4. If it has a `booking_id`, observe navigation to `/booking/<id>`.
  5. Return to the Notifications screen and tap **Mark all read**.
- **Expected result:** Tapped notification is marked read (styling changes). "Mark all read" clears all unread indicators.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-18: Reviews — Rate a Completed Job

- **Preconditions:** Booking status is `completed`; `assigned_provider_id` is set; no review exists yet.
- **Steps:**
  1. Open the booking detail screen.
  2. Scroll to the **Your review** section.
  3. Tap 4 or 5 stars on the StarInput.
  4. Enter an optional comment ("Great service!").
  5. Tap **Submit review**.
- **Expected result:** The review form disappears and is replaced by a ReviewCard showing the submitted star rating and comment.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-19: Reviews — View Existing Review

- **Preconditions:** A review has already been submitted for this booking.
- **Steps:**
  1. Open the booking detail screen.
  2. Scroll to the **Your review** section.
- **Expected result:** A ReviewCard is displayed showing the rating and comment. No submission form is shown.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### C-20: Reviews — Cannot Submit with Zero Stars

- **Preconditions:** Booking is completed with an in-app provider; no review yet.
- **Steps:**
  1. Open the booking detail screen.
  2. Scroll to **Your review** — do not tap any stars.
  3. Observe the **Submit review** button.
- **Expected result:** The **Submit review** button is disabled (greyed out) when no star rating is selected.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

## 2. Provider Scenarios

### P-01: Login — Existing Provider (Pending Approval)

- **Preconditions:** Provider account exists; `approval_status = pending` in Supabase.
- **Steps:**
  1. On the Welcome screen tap **Log in**.
  2. Enter provider credentials and tap **Continue**.
- **Expected result:** Provider is directed to the provider home screen showing the "Awaiting approval" empty state (hourglass icon) with a **Sign out** button. No jobs are shown.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### P-02: Login — Rejected Provider

- **Preconditions:** Provider account exists; `approval_status = rejected`.
- **Steps:**
  1. Log in with the rejected provider's credentials.
- **Expected result:** Provider home screen shows "Application declined" (blocked icon) with a **Sign out** button.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### P-03: Login — Approved Provider Sees Jobs

- **Preconditions:** Provider account exists; `approval_status = approved`; at least one job assigned.
- **Steps:**
  1. Log in with approved provider credentials.
  2. Observe the **My Jobs** screen.
- **Expected result:** Jobs list loads. Each card shows service title, StatusBadge, and scheduled date. A **Sign out** ghost button appears in the header.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### P-04: Job Lifecycle — provider_assigned → on_the_way

- **Preconditions:** Approved provider; job status is `provider_assigned`.
- **Steps:**
  1. Tap the job card to open `/provider/job/<id>`.
  2. Verify the StatusBadge shows "Provider assigned".
  3. Tap **On the way** button.
- **Expected result:** Status badge updates to "On the way". The "On the way" button is replaced by the next action button. Previous action buttons no longer appear.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### P-05: Job Lifecycle — on_the_way → in_progress

- **Preconditions:** Job status is `on_the_way`.
- **Steps:**
  1. Open the job detail screen.
  2. Tap **In progress**.
- **Expected result:** Status badge updates to "In progress".
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### P-06: Job Lifecycle — in_progress → completed

- **Preconditions:** Job status is `in_progress`.
- **Steps:**
  1. Open the job detail screen.
  2. Tap **Completed**.
- **Expected result:** Status badge updates to "Completed". The actions section shows "No further action".
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### P-07: Job Lifecycle — Forward-Only (Cannot Go Backward)

- **Preconditions:** Job status is `in_progress`.
- **Steps:**
  1. Open the job detail screen.
  2. Observe which action buttons are present.
- **Expected result:** Only the **Completed** button is shown. No buttons for `on_the_way`, `provider_assigned`, or `pending` are present.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### P-08: Photos — Add Before Photo

- **Preconditions:** Approved provider; on the job detail screen.
- **Steps:**
  1. Scroll to the **Photos** section.
  2. Tap **Add before photo**.
  3. Grant media library permission and select an image.
- **Expected result:** The selected photo appears in the PhotoGallery on the job detail screen.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### P-09: Photos — Add After / Completion Photo

- **Preconditions:** Approved provider; on the job detail screen.
- **Steps:**
  1. Scroll to the **Photos** section.
  2. Tap **Add after / completion photo**.
  3. Select an image.
- **Expected result:** The selected photo appears in the PhotoGallery alongside any existing photos.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### P-10: Chat — Message Customer

- **Preconditions:** `assigned_provider_id` is set for the job; provider is viewing `/provider/job/<id>`.
- **Steps:**
  1. Scroll to the bottom of the job detail screen.
  2. Tap **Chat with customer**.
  3. Type a message and tap Send.
- **Expected result:** Chat thread opens at `/provider/job/chat/<id>`. Message appears in the thread.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### P-11: Earnings — Balance and History

- **Preconditions:** Approved provider; at least one earning row exists in `provider_earnings`.
- **Steps:**
  1. Tap the **Profile** tab.
  2. Scroll to the **Earnings** section.
  3. Observe the summary card showing Pending and Paid KES amounts.
  4. Observe individual earning cards showing amount and payout status ("Pending payout" or "Paid out").
- **Expected result:**
  - Summary card shows correct totals in KES format.
  - Earning cards are colour-coded: pending = warning tint, paid = success tint.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### P-12: Profile — Edit and Save

- **Preconditions:** Approved provider; on the Profile tab.
- **Steps:**
  1. Scroll to the **Edit Profile** section.
  2. Update the Bio field.
  3. Toggle availability with the **Available** / **Unavailable** button.
  4. Tap **Save**.
- **Expected result:** No error message is shown. On reload the updated bio is visible. Availability badge reflects the toggle state.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### P-13: Provider Notifications — List and Deep-Link

- **Preconditions:** At least one notification exists for this provider.
- **Steps:**
  1. Tap the **Notifications** tab on the provider interface.
  2. Tap a notification row that has a `booking_id`.
- **Expected result:** Notification is marked read; app navigates to `/provider/job/<id>`.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### P-14: Push Notifications — Job Assignment Event (Dev Build Only)

- **Preconditions:** Dev build; provider push token registered.
- **Steps:**
  1. (Admin) Assign this provider to a booking.
  2. Observe the provider's device.
- **Expected result:** Push notification arrives with a title and body indicating a new job assignment. Tapping it deep-links to the job detail.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

## 3. Admin Scenarios

### A-01: Admin Login and Dashboard

- **Preconditions:** Admin account exists with `role = admin` in Supabase.
- **Steps:**
  1. Log in as admin on the Welcome / Login screen.
  2. Observe the Admin dashboard at `/admin`.
  3. Toggle between the **Bookings** and **Providers** tabs.
- **Expected result:** Admin screen shows "Admin" title with **Payments** and **Sign out** ghost buttons. Bookings list loads; switching to Providers shows pending provider applications.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-02: Provider Management — Approve a Provider

- **Preconditions:** At least one provider is in `pending` approval state.
- **Steps:**
  1. On the Admin dashboard, tap **Providers** tab.
  2. Find the pending provider card showing their name and phone.
  3. Tap **Approve**.
- **Expected result:** The provider row disappears from the pending list. The provider's `approval_status` is now `approved` in Supabase (verify via admin query).
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-03: Provider Management — Reject a Provider

- **Preconditions:** At least one provider is in `pending` approval state.
- **Steps:**
  1. On the Providers tab, find a pending provider.
  2. Tap **Reject**.
- **Expected result:** The provider row disappears from the pending list. The provider's `approval_status` is `rejected` in Supabase.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-04: Provider Management — Provider Detail, Edit, and Verify

- **Preconditions:** Admin is on the Providers tab; an approved provider exists.
- **Steps:**
  1. Tap a provider card to open `/admin/provider/<id>`.
  2. Observe the profile header with Avatar, name, and Completed jobs count.
  3. Edit the Bio field and tap **Save**.
  4. Tap **Verify** (or **Unverify** if already verified).
- **Expected result:** Save shows no error. Verify toggles the VerifiedBadge display and the button label flips between "Verify" and "Unverify".
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-05: Reviews Oversight — Hide and Unhide a Review

- **Preconditions:** A review exists for a provider; admin is on `/admin/provider/<id>`.
- **Steps:**
  1. Scroll to the **Reviews** section.
  2. Find a visible review and tap **Hide**.
  3. Verify the button label changes to **Unhide** and the review is marked hidden.
  4. Tap **Unhide** to restore it.
- **Expected result:** Review `is_hidden` toggles correctly. The button label reflects the current state.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-06: Booking Management — Assign Provider (Manual Mode)

- **Preconditions:** Admin is on a booking detail screen (`/admin/booking/<id>`); booking status is `pending` or `accepted`.
- **Steps:**
  1. Scroll to the **Assign Provider** section.
  2. Ensure **Manual** mode is selected.
  3. Enter a Provider name and Provider phone.
  4. Tap **Assign**.
- **Expected result:** Booking status badge updates to "Provider assigned". The `assigned_provider_name` and `assigned_provider_phone` are saved.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-07: Booking Management — Assign Provider (In-App Mode)

- **Preconditions:** At least one approved in-app provider exists; admin is on a booking detail screen.
- **Steps:**
  1. In the **Assign Provider** section, tap **In-app**.
  2. Observe the list of approved providers.
  3. Tap a provider card to assign them.
- **Expected result:** Booking status updates to "Provider assigned". `assigned_provider_id`, `assigned_provider_name`, and `assigned_provider_phone` are populated.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-08: Booking Management — Status Override

- **Preconditions:** Admin is on a booking detail screen.
- **Steps:**
  1. Scroll to the **Update Status** section.
  2. Observe all 7 status buttons: Pending, Accepted, Provider assigned, On the way, In progress, Completed, Cancelled.
  3. Tap **Accepted**.
- **Expected result:** The status badge at the top of the screen updates to "Accepted". The "Accepted" button highlights as the active status (secondary variant).
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-09: Quotes — Set Amount, Provider Share, Preview, and Send

- **Preconditions:** Admin is on a booking detail screen; `quote_status = pending` or `sent`.
- **Steps:**
  1. Scroll to the **Quote** section.
  2. Enter an Amount in KES (e.g. "3000").
  3. Enter a Provider share in KES (e.g. "2100").
  4. Observe the live "QuickServe: KES 900" preview below the inputs.
  5. Tap **Send quote**.
- **Expected result:** The QuoteCard updates to show `sent` status with the entered amount. The split preview row shows the correct QuickServe share. The input fields remain editable (quote can be replaced until the customer acts).
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-10: Quotes — Cannot Edit After Customer Accepts

- **Preconditions:** Customer has accepted the quote (`quote_status = accepted`).
- **Steps:**
  1. Open the admin booking detail screen.
  2. Scroll to the **Quote** section.
- **Expected result:** No quote input fields or "Send quote" button are shown. The QuoteCard shows the `accepted` state.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-11: Payments — View All Payments

- **Preconditions:** At least one payment exists.
- **Steps:**
  1. From the Admin dashboard tap **Payments**.
  2. Observe the payments list at `/admin/payments`.
- **Expected result:** Each card shows: KES amount, PaymentStatusBadge, provider share / QuickServe share split line, payment method, booking reference, and date.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-12: Payments — Override Payment Status

- **Preconditions:** Admin is on the Payments screen; a `pending` payment exists.
- **Steps:**
  1. Find a `pending` payment card.
  2. Tap **Paid** in the status override row.
- **Expected result:** The PaymentStatusBadge on that card updates to "paid". The "Paid" button becomes highlighted (secondary variant).
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-13: Payment Attempts — View Daraja Refs

- **Preconditions:** At least one payment attempt exists.
- **Steps:**
  1. From the Payments screen tap **Payment attempts**.
  2. Observe the list at `/admin/payment-attempts`.
  3. Expand a card and note the metadata block showing: Ref, Checkout request ID, Result code, Callback received at.
- **Expected result:** All Daraja reference fields are displayed for each attempt. AttemptStatusBadge shows the correct status (`initiated`, `pending`, `successful`, `failed`, or `cancelled`).
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-14: M-Pesa Confirmation — Confirm a Payment Attempt

- **Preconditions:** An attempt with status `pending` or `initiated` exists.
- **Steps:**
  1. On the Payment attempts screen, find a `pending` attempt.
  2. Tap **Confirm**.
- **Expected result:** The attempt status updates to `successful`. The parent payment status is flipped to `paid` (verify via Payments screen). The **Confirm** / **Cancel** action buttons disappear for that attempt.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-15: Payment Attempts — Cancel an Attempt

- **Preconditions:** An attempt with status `pending` or `initiated` exists.
- **Steps:**
  1. On the Payment attempts screen, find a `pending` attempt.
  2. Tap **Cancel**.
- **Expected result:** The attempt status updates to `cancelled`. The **Confirm** / **Cancel** buttons disappear for that attempt. The parent payment status remains `pending`.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-16: Earnings — View Provider Earnings (Admin)

- **Preconditions:** At least one provider earning exists in `provider_earnings`.
- **Steps:**
  1. Navigate to `/admin/provider/<id>` for the provider in question.
  2. (Note: admin earnings view is via the provider profile page; confirm the earnings section is visible or query Supabase directly.)
- **Expected result:** Earnings rows are visible with amount and payout status per earning.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-17: Earnings — Mark Payout Paid

- **Preconditions:** A provider earning with `payout_status = pending` exists.
- **Steps:**
  1. (Via Supabase or admin-facing RPC) call `mark_payout_paid` for the earning ID.
  2. Reload the provider profile page.
- **Expected result:** The earning row's payout status changes from "Pending payout" to "Paid out". The earnings summary reflects the updated totals.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-18: Chat Oversight — Read-Only Conversation

- **Preconditions:** Admin is on a booking detail screen; a conversation exists for this booking.
- **Steps:**
  1. Scroll to the **Conversation** section at the bottom of the admin booking detail screen.
  2. Observe the chat thread.
  3. Attempt to type or send a message.
- **Expected result:** All messages are visible in the ChatThread rendered in `readonly` mode. No message input or Send button is shown — admin can only read.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-19: Push Verification — Events Fire to the Right Recipient (Dev Build Only)

- **Preconditions:** Dev builds for customer and provider; push tokens registered; notification triggers wired in Supabase.
- **Steps:**
  1. As admin: send a quote on a booking.
  2. Verify the **customer** receives a push notification (not the provider).
  3. As admin: assign a provider to a different booking.
  4. Verify the **provider** receives a push notification (not the customer).
- **Expected result:** Each event fires only to the intended recipient. No cross-recipient push leakage.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

### A-20: Admin Notes — Save Internal Notes

- **Preconditions:** Admin is on a booking detail screen.
- **Steps:**
  1. Scroll to the **Admin Notes** section.
  2. Enter internal text (e.g. "Customer prefers afternoon slots").
  3. Tap **Save notes**.
- **Expected result:** No error is shown. On page reload the notes field contains the saved text.
- **Result:** [ ] Pass  [ ] Fail   Notes: ____

---

## Regression Sweep — Critical Happy Path

Execute this checklist after any major code change to verify the end-to-end flow is unbroken.

- [ ] **Book** — Customer registers/logs in, selects a service, completes address → schedule → notes → review, places booking. Success screen shown.
- [ ] **Quote** — Admin opens the booking, enters amount and provider share, taps **Send quote**. Customer sees QuoteCard with `sent` status on the booking detail screen.
- [ ] **Accept** — Customer taps **Accept** on the QuoteCard. Quote status becomes `accepted`; a payment row appears.
- [ ] **Pay** — Booking advances to `completed` (by admin or provider lifecycle). Customer enters phone on booking detail, taps **Pay with M-Pesa**. Attempt appears as `pending`/`initiated`.
- [ ] **Confirm** — Admin taps **Confirm** on the payment attempt. Attempt becomes `successful`; payment becomes `paid`.
- [ ] **Progress** — Provider advances job: `provider_assigned` → **On the way** → **In progress** → **Completed**. Each status badge updates in sequence. Forward-only enforcement confirmed.
- [ ] **Complete** — Booking reaches `completed` status. Provider earnings row appears with `payout_status = pending`.
- [ ] **Review** — Customer opens completed booking, selects star rating ≥ 1, taps **Submit review**. ReviewCard replaces the form.
- [ ] **Notifications** — At least one in-app notification is delivered (e.g. for quote sent or status change). Customer/provider Notifications tab shows the item. Tapping it navigates to the correct booking.
