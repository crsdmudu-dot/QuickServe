# QuickServe — Manual QA Testing Manual

**Audience:** You (the tester). This guide assumes you have **never** tested software before. Every step is spelled out. Follow it top to bottom.
**Goal:** Behave like a **real user** (customer, provider, admin) and confirm the whole app works after Slice 38, before building Slice 39.
**Golden rule:** *If you have to guess what to do, that itself is a bug — write it down.*

---

## How to read this manual (read this first — 2 minutes)

Every test below is written as a **Test Card**. A Test Card always has the same 8 parts, so once you learn to read one, you can read all of them:

| Part | What it means |
|---|---|
| **ID** | A short code (e.g. `CUST-BOOK-01`) so you can refer to a test later. |
| **Who** | Which account to be logged in as (Customer / Provider / Admin). |
| **Do this** | The exact taps/clicks, in order. Do them one at a time. |
| **You should see** | What the screen should show if it's working. |
| ✅ **Pass** | The plain-English "this is good" outcome. |
| ❌ **Fail** | Signs something is broken. If you see any of these → it's a bug. |
| 📸 **Screenshot** | When to capture your screen (proof for later). |
| 📝 **If wrong** | Exactly what to write down in your bug report. |

**One instruction at a time.** Do the step, look at the screen, compare to "You should see," then move on. Never rush two steps together — you won't know which step broke.

**"Tap" vs "Click":** On a phone you *tap*. On a computer (admin) you *click*. Same thing.

---

# PART 1 — Before Testing (Setup)

Think of this like getting your kitchen ready before cooking. We prepare tools first so testing goes smoothly.

## 1.1 What you need

- **A computer** (Windows is fine) to run the app and to be the **Admin** (admin is a website).
- **An Android phone** and, if possible, **an iPhone** and a **tablet**, to be the **Customer** and **Provider**.
- **The Expo Go app** installed on each phone (get it from the Play Store / App Store).
- **A notebook or a Google Doc** open, titled `QuickServe QA – <today's date>`. This is your **bug log**.
- **A stopwatch/timer** (your phone clock) for the "slow" tests.

## 1.2 Which browser to use (for Admin)

- Use **Google Chrome** as your main browser. It's the most predictable.
- Later, in Part 7, you'll repeat a few admin checks in **a second browser** (Edge or Firefox) to catch browser-specific bugs.

## 1.3 Start the apps

You need the app running in two shapes: the **mobile app** (for Customer & Provider) and the **web app** (for Admin).

**Start the mobile app (Customer/Provider):**
1. On your computer, open a terminal in the QuickServe project folder.
2. Type this and press Enter:
   ```
   npx expo start --tunnel
   ```
   > We use `--tunnel` on purpose. On normal Wi‑Fi the phone sometimes cannot reach the computer and the app won't load. `--tunnel` fixes that. (This is a known QuickServe quirk.)
3. A big **QR code** appears in the terminal.
4. Open **Expo Go** on the phone → tap **Scan QR code** → point it at the QR code.
5. Wait. The app builds and opens on the phone. First load can take 1–2 minutes.

**Start the web app (Admin):**
1. Open a **second** terminal in the same folder.
2. Type this and press Enter:
   ```
   npx expo start --web
   ```
3. It opens QuickServe in Chrome (usually at `http://localhost:8081`). This is where you'll be the **Admin**.

> ⚠️ **Honest limitation:** In **Expo Go**, real **push notifications** (the banners that pop up when the app is closed) do **not** work — QuickServe intentionally skips them there. The **in-app notification bell and Notification Center still work**. To test *real push banners* you need a proper build (a "development build" or TestFlight/Play build), which is covered as an optional note in Part 7.

## 1.4 Clear cache (only if the app misbehaves)

If a screen looks stuck, blank, or shows old data:

**On the phone (Expo Go):**
1. Shake the phone (or press the menu) to open the Expo dev menu.
2. Tap **Reload**.
3. Still broken? In Expo Go, close the project and re-scan the QR code.

**On the computer terminal:**
1. Stop the server (click the terminal, press `Ctrl + C`).
2. Restart with a clean cache:
   ```
   npx expo start --tunnel -c
   ```
   The `-c` clears the cache.

**In Chrome (Admin):**
1. Press `Ctrl + Shift + R` (hard refresh — reloads and ignores old cached files).
2. Still weird? Press `F12` → right‑click the round refresh arrow → **Empty Cache and Hard Reload**.

## 1.5 Reset data (only if you need a clean slate)

You usually do **not** need to wipe data — real users don't. Only reset if your test accounts are in a broken state.

- **Log out** and use a **fresh test account** (see 1.7) instead of wiping the database.
- If you truly need clean data, that's a developer task — write a note "Requested data reset on <date> because <reason>" and stop; do not attempt database surgery yourself.

## 1.6 Open Customer + Provider + Admin at the same time

This is the secret to good testing: watch all three roles react to one action.

- **Customer:** Android phone, logged in as your customer account.
- **Provider:** iPhone (or a second Android), logged in as your provider account.
- **Admin:** Chrome on the computer, logged in as your admin account.

Arrange them where you can see all three: two phones on the desk, computer screen in front. You will literally do something on one and watch the others light up.

## 1.7 Your test accounts (make these once, reuse forever)

Create three accounts before you start. Write the logins in your bug log.

| Role | How to create | Example login |
|---|---|---|
| **Customer** | In the mobile app: Welcome → **Register** → choose **Customer** | `qa.customer@test.com` / a password you'll remember |
| **Provider** | In the mobile app: Welcome → **Register** → choose **Provider** | `qa.provider@test.com` |
| **Admin** | Admins **cannot** self-register (this was removed for safety). Ask the developer to create an admin account for you, or use the existing admin login. | `qa.admin@test.com` |

> Use obviously-fake test data (name "QA Customer", etc.) so you never confuse test bookings with real ones.

## 1.8 How to record a bug (quick version — full template in Part 9)

When something is wrong, immediately write in your bug log:
1. **What you were doing** (which Test Card ID).
2. **What you expected.**
3. **What actually happened.**
4. **A screenshot or screen recording.**
5. **How bad it is** (Blocker / Major / Minor — defined in Part 9).

Don't fix it. Don't investigate deeply. Just record and move on. Testing is about *finding* problems, not solving them.

## 1.9 Your simple testing checklist (print or copy this)

Make a copy of this table in your bug log. Tick each Part as you finish it.

```
[ ] PART 1  Setup done (3 accounts, all apps running)
[ ] PART 2  Customer testing complete
[ ] PART 3  Provider testing complete
[ ] PART 4  Admin testing complete
[ ] PART 5  Cross-user workflows complete
[ ] PART 6  Edge cases complete
[ ] PART 7  Mobile testing complete
[ ] PART 8  Regression checklist complete
[ ] PART 9  All bugs logged with the template
[ ] PART 10 Final release checklist reviewed
```

## 1.10 How to take screenshots (so you never fumble)

- **Android:** press **Power + Volume Down** together.
- **iPhone (Face ID):** press **Side button + Volume Up** together.
- **iPhone (Home button):** press **Home + Power** together.
- **Computer (Chrome):** press **Windows + Shift + S**, drag a box, then paste (`Ctrl+V`) into your bug log.
- **Screen recording (for tricky bugs):** Android/iPhone both have "Screen Record" in the pull-down control center. Turn it on before reproducing the bug.

---

# PART 2 — Customer Testing

You are now a **normal customer** who wants a service done. Log into the **mobile app** with your **Customer** account. Do these Test Cards in order.

### CUST-LOGIN-01 — Log in as customer
- **Who:** Customer
- **Do this:** Open the app → on the Welcome screen tap **Log in** → type your customer email and password → tap **Log in**.
- **You should see:** The customer **Home** screen with services (House Cleaning, Plumbing, etc.) and sections like *Featured*, *Popular*, *Trending*.
- ✅ **Pass:** Home loads within a few seconds; your name/avatar shows somewhere; no error text.
- ❌ **Fail:** "Invalid login", a blank white screen, an infinite spinner, or it logs you in as the wrong role.
- 📸 **Screenshot:** The Home screen after login.
- 📝 **If wrong:** Note the exact error text and how long you waited.

### CUST-NOTIF-01 — Open the Notification Center
- **Who:** Customer
- **Do this:** On Home, find the **bell icon** (top of the screen) → tap it. (Or open the **Notifications** tab if shown.)
- **You should see:** A list titled Notifications, grouped by **Today / Yesterday / Earlier**, with filter chips (**All, Unread, Booking, Payments, Promotions, System**). If you're brand new, it may say "You're all caught up".
- ✅ **Pass:** The screen opens; unread items show a colored dot; the unread count on the bell matches the number of unread rows.
- ❌ **Fail:** Bell does nothing; list never loads; unread count is wrong; tapping a notification crashes.
- 📸 **Screenshot:** The notification list.
- 📝 **If wrong:** Note whether the bell number and the list disagree.

### CUST-NOTIF-02 — Filter and mark as read
- **Who:** Customer
- **Do this:** Tap the **Unread** filter chip → then tap a single notification → go back → tap **Mark all read**.
- **You should see:** Unread filter shows only unread ones; tapping one opens the related screen (e.g. a booking) and removes its unread dot; **Mark all read** clears all dots and sets the bell to 0.
- ✅ **Pass:** Filters change the list; read state sticks even after you leave and come back.
- ❌ **Fail:** Marking read doesn't stick; filter shows wrong items; history disappears (notifications should **never** be deleted, only marked read).
- 📝 **If wrong:** Note if any notification vanished entirely (that's a real bug).

### CUST-BOOK-01 — Create a booking (the main flow)
- **Who:** Customer
- **Do this:**
  1. On Home, tap a service, e.g. **House Cleaning**.
  2. Pick a provider from the list (tap a provider card → **Continue** / **Book**).
  3. On the **Address** step: choose a saved address or enter one → tap **Continue**.
  4. On the **Notes** step: type a short note (e.g. "Test booking, please ignore") → optionally add a photo → tap **Continue**.
  5. On the **Schedule** step: pick a time / flexibility / recurrence → tap **Continue**.
  6. Review the summary → confirm/pay. In dev, payment uses **M‑Pesa (sandbox)** — follow the prompt.
- **You should see:** A **Success** screen confirming the booking, then the booking appears under your **Bookings** with status **Pending**.
- ✅ **Pass:** Each step advances cleanly; the booking shows up in Bookings with the right service, address, time, and a **Pending** status.
- ❌ **Fail:** A step won't continue; the booking is created twice; the price is wrong; the summary shows a different address/time than you chose.
- 📸 **Screenshot:** The Success screen **and** the new booking in the Bookings list.
- 📝 **If wrong:** Note which step failed and the exact numbers/text shown.

### CUST-BOOK-02 — View booking details
- **Who:** Customer
- **Do this:** Open the **Bookings** tab → tap your new booking.
- **You should see:** A detail screen with service, provider (if assigned), address, schedule, status, a **map/destination**, and an **activity timeline**.
- ✅ **Pass:** All details match what you booked; status is correct.
- ❌ **Fail:** Missing details; wrong provider; map shows the wrong place.
- 📝 **If wrong:** Note the mismatch.

### CUST-BOOK-03 — Edit a booking
- **Who:** Customer
- **Do this:** On the booking detail (while still **Pending**), find **Edit** (or change notes/schedule) → change the note or time → save.
- **You should see:** The change is saved and shown; the activity timeline records the update.
- ✅ **Pass:** The edit sticks after you leave and reopen the booking.
- ❌ **Fail:** No edit option when it should exist; the change silently reverts; editing an *already-accepted* job is allowed when it shouldn't be.
- 📝 **If wrong:** Note the booking status at the time you edited.

### CUST-BOOK-04 — Cancel a booking
- **Who:** Customer
- **Do this:** On a **Pending** booking → tap **Cancel booking** → confirm.
- **You should see:** Status becomes **Cancelled**; a confirmation; the booking stays in your history (cancelled, not erased).
- ✅ **Pass:** Cancelled status shows; you cannot cancel it twice.
- ❌ **Fail:** Cancel does nothing; booking disappears entirely; you're charged after cancelling.
- 📸 **Screenshot:** The cancelled booking.
- 📝 **If wrong:** Note whether any refund/wallet change happened.

### CUST-BOOK-05 — Complete a booking (customer side)
- **Who:** Customer (this needs the Provider to finish the job first — do CUST-BOOK-01 again, then have the Provider run PROV-JOB cards, then return here)
- **Do this:** After the provider marks the job **Completed**, open the booking.
- **You should see:** Status **Completed**; a prompt/option to **leave a review**; a **receipt** available.
- ✅ **Pass:** Completed status; review and receipt are reachable.
- ❌ **Fail:** Still shows in-progress after provider completed; no way to review.
- 📝 **If wrong:** Note the time gap between provider completing and customer seeing it.

### CUST-WALLET-01 — Open the wallet
- **Who:** Customer
- **Do this:** Go to **Payments / Wallet** (from the tab bar or profile).
- **You should see:** A **balance** and a list of **wallet transactions** (credits/debits) with dates.
- ✅ **Pass:** Balance is a sensible number (never negative); transactions have clear labels and dates.
- ❌ **Fail:** Negative balance; missing transactions; balance doesn't match the transaction history.
- 📸 **Screenshot:** The wallet balance + history.
- 📝 **If wrong:** Add up the transactions yourself — does the math equal the balance?

### CUST-PROMO-01 — Apply a promotion
- **Who:** Customer
- **Do this:** Start a booking (CUST-BOOK-01) → at the payment/summary step find **Promo code** → enter a **valid** promo code (ask admin for one) → apply.
- **You should see:** A **discount** applied; the total drops by the promo amount.
- ✅ **Pass:** Discount matches the promo; total updates correctly.
- ❌ **Fail:** Valid code rejected; discount is wrong; you can apply the same one‑time code twice.
- 📝 **If wrong:** Note the code, the expected discount, and the shown total.

### CUST-PROMO-02 — Reject an invalid/expired promo
- **Who:** Customer
- **Do this:** Enter a made-up code like `NOTREAL123`, then an **expired** one (ask admin) → apply.
- **You should see:** A friendly "invalid" or "expired" message; **no** discount applied.
- ✅ **Pass:** Clear rejection message; total unchanged.
- ❌ **Fail:** Fake code gives a discount; app crashes; confusing/no message.
- 📝 **If wrong:** Note exactly what message (if any) appeared.

### CUST-REVIEW-01 — Leave a review
- **Who:** Customer (needs a **Completed** booking)
- **Do this:** Open a completed booking → **Leave a review** → tap the **stars** (try 5, then try different category ratings) → write a comment → submit.
- **You should see:** A thank-you; your review now shows on the booking; you can view it.
- ✅ **Pass:** Stars register; review saves; it appears on the provider's profile later.
- ❌ **Fail:** Can't select stars; submit fails; you can review a **non-completed** booking.
- 📸 **Screenshot:** The submitted review.
- 📝 **If wrong:** Note the rating you chose vs what was saved.

### CUST-REVIEW-02 — Edit/view your review
- **Who:** Customer
- **Do this:** Return to the reviewed booking → open your review → edit it (change stars/text) → save.
- **You should see:** The updated review; the change persists.
- ✅ **Pass:** Edit sticks; only your own review is editable.
- ❌ **Fail:** Edit fails; you can edit someone else's review.
- 📝 **If wrong:** Note old vs new values.

### CUST-ADDR-01 — Manage saved addresses
- **Who:** Customer
- **Do this:** Go to **Saved Addresses** (from profile) → **Add address** → enter details + a nickname (e.g. "Home") → save. Then **Edit** it, then **Delete** a test one.
- **You should see:** The address list updates after add/edit/delete; nicknames show.
- ✅ **Pass:** Add/edit/delete all work; the new address is selectable during booking.
- ❌ **Fail:** Address won't save; deleting removes the wrong one; a deleted address still appears in booking.
- 📸 **Screenshot:** The address list.
- 📝 **If wrong:** Note which action failed.

### CUST-PROFILE-01 — Profile & preferences
- **Who:** Customer
- **Do this:** Open **Profile** → check your name/photo → open **Preferences / Notification settings** → toggle a preference (e.g. Promotions) → open **Notification settings** and confirm **Email/SMS** are shown as **"coming soon" (disabled)**.
- **You should see:** Profile info correct; functional toggles save; Email/SMS toggles are visibly disabled; a note that "your in-app history is always kept."
- ✅ **Pass:** Toggles that should work, work; disabled ones don't do anything.
- ❌ **Fail:** A disabled toggle actually changes something; a functional toggle doesn't save.
- 📝 **If wrong:** Note which toggle misbehaved.

---

# PART 3 — Provider Testing

Now switch roles. On the **second phone**, log in with your **Provider** account. A provider is the worker who does the jobs.

### PROV-LOGIN-01 — Log in as provider
- **Who:** Provider
- **Do this:** Open the app → **Log in** with the provider account.
- **You should see:** The **provider** home with tabs: **Home / Jobs**, **Notifications**, **Profile**. (Providers see jobs, not the customer service catalog.)
- ✅ **Pass:** Provider home loads; you see a jobs area and a bell.
- ❌ **Fail:** You see the *customer* home; blank screen; wrong role.
- 📸 **Screenshot:** Provider home.
- 📝 **If wrong:** Note what role's screen you actually landed on.

### PROV-NOTIF-01 — Provider notifications
- **Who:** Provider
- **Do this:** Tap the **bell** / **Notifications** tab.
- **You should see:** A grouped notification list (same style as customer) with provider-relevant items (new job, messages, payment released, etc.).
- ✅ **Pass:** List loads; unread count matches; filters work.
- ❌ **Fail:** Bell dead; wrong count; crash on tap.
- 📝 **If wrong:** Note the count mismatch.

### PROV-JOB-01 — See a new job
- **Who:** Provider (requires a customer booking to exist — coordinate with Part 5)
- **Do this:** After a customer books you (or a job is dispatched), open the **Jobs** area → tap the new job.
- **You should see:** The job detail: service, customer, address, schedule, status **Pending/Assigned**, a **Navigate** button, photo buttons, and an action button showing the **next status** (e.g. **Accept**).
- ✅ **Pass:** Job appears; details match the customer's booking.
- ❌ **Fail:** Job never appears; details differ from what the customer entered.
- 📸 **Screenshot:** The job detail.
- 📝 **If wrong:** Compare with the customer's booking screenshot from CUST-BOOK-01.

### PROV-JOB-02 — Accept a job
- **Who:** Provider
- **Do this:** On the job detail, tap the action button labeled **Accept** (the button text comes from the next status).
- **You should see:** Status advances (e.g. to **Accepted / Provider assigned**); the customer gets a notification (watch the customer phone).
- ✅ **Pass:** Status changes; timeline records it; customer is notified.
- ❌ **Fail:** Button does nothing; status jumps to the wrong step; double-accept possible.
- 📸 **Screenshot:** The job after accepting.
- 📝 **If wrong:** Note the status before and after.

### PROV-JOB-03 — Reject / decline a job
- **Who:** Provider
- **Do this:** On a **different** pending job, use the **Reject / Decline / Cancel** option → confirm.
- **You should see:** The job leaves your active list (or shows declined); the customer/dispatch is informed.
- ✅ **Pass:** Declining works and frees the job.
- ❌ **Fail:** No decline option; declining still leaves it assigned to you; customer not informed.
- 📝 **If wrong:** Note the job status after declining.

### PROV-JOB-04 — Start the job (advance statuses)
- **Who:** Provider
- **Do this:** On an accepted job, keep tapping the **next-status** action button through the flow: **On the way → Start (In progress)**. Do one tap at a time and watch the status.
- **You should see:** The status moves one step per tap: `accepted → on_the_way → in_progress`. Each change notifies the customer.
- ✅ **Pass:** Statuses advance in the correct order, never skipping or going backwards.
- ❌ **Fail:** Status skips a step; goes backwards; the button shows the wrong label.
- 📸 **Screenshot:** Each status change (a few quick shots).
- 📝 **If wrong:** Note the exact sequence you saw.

### PROV-JOB-05 — Add job photos
- **Who:** Provider
- **Do this:** On the job, tap **Add before photo** → pick an image from the library → wait for upload. Then **Add after / completion photo**.
- **You should see:** The photo uploads and appears on the job; no error.
- ✅ **Pass:** Photos upload and display; the customer/admin can see them.
- ❌ **Fail:** Upload spins forever; "Upload failed"; photo appears then vanishes. *(Note: on iPhone, watch upload closely — this is a known area to verify.)*
- 📸 **Screenshot:** The job showing the uploaded photo.
- 📝 **If wrong:** Note the phone type (Android/iPhone) and the exact error.

### PROV-JOB-06 — Complete the job
- **Who:** Provider
- **Do this:** Tap the final action button: **Complete**.
- **You should see:** Status **Completed**; customer notified; the job moves to completed/history; earnings should update.
- ✅ **Pass:** Completed status; customer sees it (CUST-BOOK-05); earnings reflect the job.
- ❌ **Fail:** Can't complete; completing doesn't notify the customer; no earnings change.
- 📸 **Screenshot:** The completed job + earnings after.
- 📝 **If wrong:** Note earnings before vs after.

### PROV-NAV-01 — Navigate to the customer
- **Who:** Provider
- **Do this:** On a job with an address, tap **Navigate**.
- **You should see:** Your phone's **maps app opens** with directions to the customer address. On **iPhone** it should open **Apple Maps**; on **Android**, Google Maps / navigation.
- ✅ **Pass:** Maps opens to the correct destination.
- ❌ **Fail:** Nothing opens; wrong destination; opens a blank map.
- 📸 **Screenshot:** The opened maps with the destination.
- 📝 **If wrong:** Note the phone type and whether the pin location was correct.

### PROV-WALLET-01 — Provider wallet
- **Who:** Provider
- **Do this:** Open the provider **Wallet** (from profile/menu).
- **You should see:** Balance and transactions (job payouts, etc.).
- ✅ **Pass:** Balance is sensible; payouts appear after completed jobs.
- ❌ **Fail:** Missing payouts; wrong totals; negative balance.
- 📝 **If wrong:** Note which completed job's payout is missing.

### PROV-EARN-01 — Earnings
- **Who:** Provider
- **Do this:** Open **Earnings** (provider profile/menu).
- **You should see:** Earnings totals and a breakdown per job/period.
- ✅ **Pass:** Earnings match completed jobs; numbers add up.
- ❌ **Fail:** Earnings show jobs you didn't do; totals don't match the list.
- 📸 **Screenshot:** The earnings screen.
- 📝 **If wrong:** Note the specific job and amount that's off.

### PROV-PROFILE-01 — Provider profile
- **Who:** Provider
- **Do this:** Open **Profile** → check your name, services, rating, reviews → try editing a field (if allowed).
- **You should see:** Your info, your **average rating** (from customer reviews), and recent reviews.
- ✅ **Pass:** Rating matches the reviews customers left; edits save.
- ❌ **Fail:** Rating wrong or missing; reviews from other providers show here; edits don't save.
- 📝 **If wrong:** Note the rating shown vs what you'd expect from the reviews.

---

# PART 4 — Admin Testing

Now go to the **computer**, open **Chrome**, and log in as **Admin** (the web app). Admin is where the business is managed. Use the **left sidebar** to navigate: *Dashboard, Bookings, Providers, Customers, Payments, Payment Attempts, Earnings & Payouts, Reviews, Services, Operations, Notifications, Broadcast, Promotions, Analytics.*

### ADMIN-LOGIN-01 — Log in as admin
- **Who:** Admin
- **Do this:** Open the web app → admin login → enter admin email/password → log in.
- **You should see:** The admin portal with the left sidebar and a main content area.
- ✅ **Pass:** Sidebar loads; you can click items and content appears.
- ❌ **Fail:** Admin login rejected; a customer/provider screen loads instead; blank page.
- 📸 **Screenshot:** The admin portal.
- 📝 **If wrong:** Note the exact error.

### ADMIN-EXEC-01 — Executive Dashboard (Analytics)
- **Who:** Admin
- **Do this:** In the sidebar click **Analytics**. This opens the **Executive Analytics Dashboard** (new in Slice 38).
- **You should see:** Sections in this order:
  - **Platform Health** cards labeled **Current** (Current Wallet Balance, Current Active Customers, Current Active Providers, Current Platform Rating, Active Disputes, Open Support Tickets).
  - **Activity (selected period)** cards labeled **Selected period** (Total/Active/Completed/Cancelled Bookings, Total Revenue, Platform Commission, Average Booking Value, Repeat Customer Rate).
  - **Operational**, **Growth** (with up/down **delta badges** ▲/▼ next to New Customers, New Providers, Revenue, Bookings), **Service analytics**, **Provider analytics**, **Geographic analytics**.
  - Charts: revenue over time, bookings over time, customer growth, provider growth, top services, top providers.
  - A **date filter** (Today / Last 7 / Last 30 / Last 90 / This year / Custom), a **"Last updated"** time, and a **Refresh** button. **Export** buttons (CSV/Excel/PDF) should be **disabled** ("coming soon").
- ✅ **Pass:** All sections render; while data loads each card shows a **loading placeholder** (skeleton), then real numbers; "Last updated" shows a time.
- ❌ **Fail:** A section is stuck loading forever; the whole page is one giant spinner (it should load **section by section**); Export buttons are clickable (they must be disabled).
- 📸 **Screenshot:** The full dashboard (scroll and capture each section).
- 📝 **If wrong:** Note which section failed and whether others still worked.

### ADMIN-EXEC-02 — Numbers make sense (sanity math)
- **Who:** Admin
- **Do this:** Read the numbers and reason about them, like a manager who knows the business:
  1. **Completed + Cancelled + Active ≤ Total bookings** for the period.
  2. **Platform Commission ≤ Total Revenue** (commission is a slice of revenue, never more).
  3. **Current Wallet Balance** should roughly match the sum of everyone's wallets (it ignores the date filter — it's a "right now" number).
  4. **Current Platform Rating** should be between **1.0 and 5.0**.
  5. After you did test bookings in Parts 2–3, **Total Bookings** for **Today** should include them.
- **You should see:** All the above hold true.
- ✅ **Pass:** No number is impossible (no negative counts, no commission > revenue, no rating > 5).
- ❌ **Fail:** Any impossible number, or your test bookings don't appear in "Today".
- 📸 **Screenshot:** The KPI cards.
- 📝 **If wrong:** Write the exact numbers and why they don't make sense.

### ADMIN-EXEC-03 — Date filter + Refresh + deltas
- **Who:** Admin
- **Do this:** Change the filter **Today → Last 7 days → Last 30 → This year**. Watch the **Activity** numbers change but the **Current** (health) cards stay the same. Then click **Refresh** and watch **"Last updated"** change. Check the **Growth delta badges** (▲ green up / ▼ red down / – neutral).
- **You should see:** Activity/period numbers grow as the window widens; health snapshots do **not** change with the filter; Refresh updates the timestamp; delta badges show a % vs the previous equal period.
- ✅ **Pass:** Filter only affects "Selected period" numbers; deltas point the sensible direction.
- ❌ **Fail:** Health snapshots change with the filter (they shouldn't); Refresh does nothing; deltas show impossible values or crash.
- 📝 **If wrong:** Note which card changed when it shouldn't have.

### ADMIN-EXEC-04 — Drill-down to Detailed Analytics
- **Who:** Admin
- **Do this:** On the Executive Dashboard, click **View detailed analytics**.
- **You should see:** The older, detailed analytics screen (booking/financial/provider/service/geography/customer breakdowns with **Download CSV** buttons that DO work here).
- ✅ **Pass:** The detailed page opens and its charts/tables load; CSV download works.
- ❌ **Fail:** Broken link; blank page; detailed screen is missing.
- 📸 **Screenshot:** The detailed analytics page.
- 📝 **If wrong:** Note whether the drill-down button did nothing.

### ADMIN-BROADCAST-01 — Send a broadcast notification
- **Who:** Admin
- **Do this:** Sidebar → **Broadcast** → choose audience **Customers** (or Providers, or Everyone) → type a **title** and **message** → pick a **priority** → check the **preview** → click **Send** → confirm in the dialog.
- **You should see:** A success message with a **recipient count**; the message uses only the in-app pipeline (no email/SMS this slice).
- ✅ **Pass:** Send succeeds; the count looks right; your **Customer** phone's Notification Center receives it (check CUST-NOTIF-01).
- ❌ **Fail:** Send fails; no confirmation dialog; recipients don't receive it; "Everyone" only reaches one group.
- 📸 **Screenshot:** The success message + the received notification on the phone.
- 📝 **If wrong:** Note the audience chosen and whether it actually arrived.

### ADMIN-NOTIF-01 — Admin Notification Center
- **Who:** Admin
- **Do this:** Sidebar → **Notifications** → use the filter chips, open one, **Mark all read**.
- **You should see:** A grouped notification list (like the mobile one) with unread counts and filters; a **bell** in the admin top bar.
- ✅ **Pass:** List loads; mark-read works; bell count matches.
- ❌ **Fail:** Empty when it shouldn't be; mark-read doesn't stick; bell count wrong.
- 📝 **If wrong:** Note the mismatch.

### ADMIN-COMMS-01 — Communication Center consistency
- **Who:** Admin
- **Do this:** Confirm the notifications you generated in Parts 2–3 (booking created, accepted, completed) appear in the **admin Notifications** feed and that customer/provider centers show their matching copies.
- **You should see:** The same events reflected across roles (each user sees their own copy); no notification was deleted.
- ✅ **Pass:** Events line up across customer/provider/admin; history is durable.
- ❌ **Fail:** An event is missing for one role; a notification was erased; counts drift.
- 📝 **If wrong:** Note the event and which role is missing it.

### ADMIN-DATA-01 — Bookings / Providers / Customers / Payments lists
- **Who:** Admin
- **Do this:** Click each of **Bookings**, **Providers**, **Customers**, **Payments**, **Payment Attempts**, **Earnings & Payouts**, **Reviews**, **Services**, **Promotions**, **Operations** in the sidebar.
- **You should see:** Each opens a table/list. Your test booking should appear in **Bookings**; your test payment/attempt in **Payments/Payment Attempts**; your review in **Reviews**; your promo in **Promotions**.
- ✅ **Pass:** Every sidebar item opens without error and shows expected data.
- ❌ **Fail:** Any item errors, is blank, or shows another admin's/unrelated data.
- 📸 **Screenshot:** Any screen that errors.
- 📝 **If wrong:** Note which sidebar item and the error.

### ADMIN-SERVICES-01 — Services & Promotions management
- **Who:** Admin
- **Do this:** **Services** → toggle a service on/off, edit a name/icon/color (then set it back). **Promotions** → create a test promo code, then expire/disable it.
- **You should see:** Changes save and reflect in the customer app (a disabled service disappears for customers; the promo works then stops when expired).
- ✅ **Pass:** Admin edits reflect on the customer side.
- ❌ **Fail:** Edits don't save; a disabled service still shows to customers; expired promo still works.
- 📝 **If wrong:** Note what you changed and whether the customer app updated.

---

# PART 5 — Cross-User Testing (the important part)

These are **end-to-end workflows** where one action ripples to all three roles. Keep **Customer phone + Provider phone + Admin browser** all visible. Do each flow slowly, watching every screen react.

> Tip: after each step, glance at **all three** screens before continuing.

### FLOW-1 — Full happy path (book → serve → pay → review)
- **Who:** Customer + Provider + Admin
1. **Customer:** create a booking (CUST-BOOK-01) for a service, choosing the provider.
2. **Provider:** within a few seconds, a **notification** appears; open **Jobs** → the new job is there.
3. **Provider:** **Accept** the job.
4. **Customer:** a **notification** arrives ("provider assigned/accepted"); the booking status updates.
5. **Admin:** open **Bookings** → the booking is listed with the correct status; open **Analytics** → **Total Bookings (Today)** includes it.
6. **Provider:** advance **On the way → Start → Complete**, adding a before and after photo.
7. **Customer:** status becomes **Completed**; a review prompt appears.
8. **Wallet/Earnings:** **Provider Earnings/Wallet** reflects the payout; **Customer wallet** reflects any charge/credit.
9. **Customer:** leave a **5‑star review**.
10. **Provider:** profile **rating** updates to include the new review.
11. **Admin:** **Analytics** → Completed bookings +1, Revenue/Commission updated, **Current Platform Rating** reflects the new review; **Reviews** list shows it.
- ✅ **Pass:** Every arrow in the chain happens: notification → status → analytics → wallet → rating, all consistent.
- ❌ **Fail:** Any link is missing (e.g. provider never notified, analytics didn't move, rating didn't update, wallet unchanged).
- 📸 **Screenshot:** One shot per role at the end (three total) showing the consistent final state.
- 📝 **If wrong:** Note exactly **which arrow** broke (e.g. "provider completed but customer still saw In progress after 2 minutes").

### FLOW-2 — Cancellation ripple
1. **Customer:** create a booking, then **cancel** it while Pending.
2. **Provider:** if it was already assigned, the provider should see it **removed/cancelled** and be notified.
3. **Admin:** **Bookings** shows it as **Cancelled**; **Analytics** Cancelled count +1; no revenue counted.
- ✅ **Pass:** Cancellation reflects for all three; no phantom revenue; no wallet charge.
- ❌ **Fail:** Provider still sees an active job; analytics counts it as revenue; customer charged.
- 📝 **If wrong:** Note who still shows it as active.

### FLOW-3 — Broadcast reaches the right people
1. **Admin:** **Broadcast** → audience **Customers** → send.
2. **Customer:** receives it in the Notification Center.
3. **Provider:** should **not** receive a customers-only broadcast.
4. Repeat with **Everyone** → both customer and provider receive it.
- ✅ **Pass:** Audience targeting is correct; "Everyone" reaches both.
- ❌ **Fail:** Wrong audience gets it; "Everyone" reaches only one group.
- 📝 **If wrong:** Note audience selected vs who actually received it.

### FLOW-4 — Promotion end-to-end
1. **Admin:** create a promo code (Promotions).
2. **Customer:** apply it on a booking → discount shows.
3. **Admin:** **Payments/Analytics** reflect the discounted amount; the promo shows one redemption.
4. **Customer:** try to reuse a one-time code → rejected.
- ✅ **Pass:** Discount applied once; analytics/payment reflect it; reuse blocked.
- ❌ **Fail:** Discount wrong; reusable when it shouldn't be; analytics ignore the discount.
- 📝 **If wrong:** Note the code and amounts.

### FLOW-5 — Review affects provider rating & admin analytics
1. **Customer:** complete a job and leave a **1‑star** review with a comment.
2. **Provider:** profile rating drops accordingly.
3. **Admin:** **Reviews** shows it; **Current Platform Rating** reflects it; if admin **hides** an abusive review (Reviews management), it should disappear from the provider's public profile.
- ✅ **Pass:** Rating math updates; admin hide works.
- ❌ **Fail:** Rating unchanged; hidden review still public.
- 📝 **If wrong:** Note before/after ratings.

### FLOW-6 — Two customers, one provider (contention)
1. **Customer A** and **Customer B** both book the **same provider** for overlapping times.
2. **Provider:** sees **both** jobs; accepts one, declines/handles the other.
3. **Admin:** both bookings appear with correct statuses.
- ✅ **Pass:** No booking is lost; provider can manage both; statuses are correct for each customer.
- ❌ **Fail:** One booking vanishes; accepting one wrongly cancels the other; admin sees only one.
- 📝 **If wrong:** Note which customer's booking was affected.

### FLOW-7 — Notification consistency audit
1. Trigger a chain (FLOW‑1).
2. For **every** event (created, accepted, on-the-way, completed, review), confirm the **correct role** got a notification and the **wrong roles did not** get inappropriate ones.
- ✅ **Pass:** Each event notifies the right people only.
- ❌ **Fail:** Missing notifications, or a user gets one meant for someone else.
- 📝 **If wrong:** Make a small table: event → who should be notified → who actually was.

---

# PART 6 — Edge Cases (try to break it)

Now be mischievous, like a QA engineer. Do the "weird" things real users accidentally do. For each, the app should **stay calm** — no crash, no double action, a clear message.

### EDGE-01 — Double-tap the button
- **Do this:** On the booking **Confirm/Pay** button (and the provider **Accept** button), tap it **twice very fast**.
- ✅ **Pass:** Only **one** booking / **one** status change happens; the button disables after the first tap.
- ❌ **Fail:** Two bookings created; status jumps two steps; double charge.
- 📝 Note how many bookings/charges resulted.

### EDGE-02 — Refresh in the middle of booking
- **Do this:** Start a booking, reach the Schedule step, then **reload** the app (shake → Reload, or Chrome hard refresh for web flows).
- ✅ **Pass:** You return safely (to home or the step) with **no half-created booking**.
- ❌ **Fail:** A broken/partial booking exists; the app crashes; you're charged for nothing.
- 📝 Note whether a partial booking appeared in Bookings.

### EDGE-03 — Back button behavior
- **Do this:** Deep inside a flow (e.g. booking Schedule), press the phone **Back** button repeatedly / the browser **Back**.
- ✅ **Pass:** You go back one screen at a time and end at a sensible place; you don't get "stuck" or logged out.
- ❌ **Fail:** App closes unexpectedly; you land on a blank screen; you skip past a required step.
- 📝 Note where Back dumped you.

### EDGE-04 — Two tabs / two sessions (Admin)
- **Do this:** Open the admin app in **two browser tabs**. Change a service in tab 1, then refresh tab 2.
- ✅ **Pass:** Tab 2 shows the change after refresh; no data corruption.
- ❌ **Fail:** Tabs disagree permanently; one tab logs the other out; an edit is lost.
- 📝 Note the inconsistency.

### EDGE-05 — Slow internet
- **Do this:** On the phone, turn on **Airplane mode for 5 seconds** during a booking/data load, then turn it back on. On admin, in Chrome `F12` → **Network** tab → set throttling to **Slow 3G**, then load Analytics.
- ✅ **Pass:** You see **loading placeholders** (skeletons), then data; a friendly retry if it fails; **sections load independently** on Analytics (one slow section doesn't freeze the page).
- ❌ **Fail:** Infinite spinner; the whole page freezes on one slow call; an ugly raw error.
- 📸 Screenshot the loading and any error.
- 📝 Note what happened when the network returned.

### EDGE-06 — Offline entirely
- **Do this:** Turn on **Airplane mode** and try to open bookings / send a booking.
- ✅ **Pass:** A clear "you're offline" message / banner; the app doesn't crash; it recovers when you reconnect.
- ❌ **Fail:** Blank screen; crash; it silently "succeeds" while offline.
- 📝 Note the offline message wording.

### EDGE-07 — Missing location permission
- **Do this:** In phone **Settings**, deny **Location** for Expo Go. Then, as **Provider**, open a job and try **Navigate**; as **Customer**, try anything using your location.
- ✅ **Pass:** A polite prompt asking to enable location, or a graceful fallback; no crash.
- ❌ **Fail:** Crash; a silent dead button; a confusing error.
- 📝 Note which feature broke without location.

### EDGE-08 — Deny photo permission
- **Do this:** Deny **Photos** permission, then as **Provider** try **Add before photo**.
- ✅ **Pass:** A prompt to allow access, or a clear message; no crash.
- ❌ **Fail:** Crash or a dead button with no explanation.
- 📝 Note the message.

### EDGE-09 — Expired / invalid promo
- **Do this:** (Covered in CUST-PROMO-02) apply an expired and a fake promo.
- ✅ **Pass:** Clear rejection; no discount.
- ❌ **Fail:** Discount applied; crash.

### EDGE-10 — Empty and huge inputs
- **Do this:** In notes / review comment / broadcast message, try **leaving it blank** and try **pasting a very long paragraph** (500+ characters). In numbers, try **0** and weird values.
- ✅ **Pass:** Required fields are enforced with a message; long text is accepted or trimmed gracefully; no layout break.
- ❌ **Fail:** Blank required field submits; long text breaks the layout or crashes.
- 📸 Screenshot any broken layout.
- 📝 Note the field.

### EDGE-11 — Log out mid-action
- **Do this:** Start a booking, then log out from another tab/screen (or let a session expire).
- ✅ **Pass:** You're sent to login; no partial booking; re-login returns you safely.
- ❌ **Fail:** Crash; ghost booking; stuck on a protected screen while logged out.
- 📝 Note the state after re-login.

### EDGE-12 — Wrong role access
- **Do this:** As a **Customer**, try to reach an **admin** URL (in the web app, type the admin path). As a **Provider**, try to open a **customer-only** screen.
- ✅ **Pass:** Access is blocked / redirected to login or your own home. Non-admins get nothing from admin pages.
- ❌ **Fail:** A customer can see admin data; a provider sees customer-only screens.
- 📸 Screenshot any unauthorized access — this is a **serious (security)** bug.
- 📝 Mark severity **Blocker**.

### EDGE-13 — Rapid status changes (provider)
- **Do this:** As provider, tap the status-advance button **quickly several times**.
- ✅ **Pass:** Statuses advance one step at a time, in order.
- ❌ **Fail:** Status skips steps or goes out of order.
- 📝 Note the sequence.

### EDGE-14 — Refresh Analytics while it loads
- **Do this:** On admin Analytics, click **Refresh** repeatedly and change the date filter rapidly.
- ✅ **Pass:** It settles on correct numbers; "Last updated" is recent; no stuck section.
- ❌ **Fail:** Numbers from different periods mix; a section stays broken.
- 📝 Note any mixed numbers.

---

# PART 7 — Mobile Testing (devices, orientation, hardware)

Repeat key flows on different devices. You don't need to redo *everything* — do the **Core Set** on each device/condition below. The Core Set = **login → create booking → provider accept & complete → notification received → wallet/earnings update**.

### DEVICE-ANDROID — Android phone
- **Do this:** Run the Core Set on Android.
- ✅ Everything works; text isn't cut off; buttons are tappable.
- 📝 Note any Android-specific glitch.

### DEVICE-IPHONE — iPhone
- **Do this:** Run the Core Set on iPhone. Pay special attention to: **photo upload** (PROV-JOB-05), **Navigate opens Apple Maps** (PROV-NAV-01), the **status bar** and **notch/Dynamic Island** area (no content hidden behind it), and the **keyboard** (see KEYBOARD below).
- ✅ Works the same as Android; content isn't hidden under the notch/home bar.
- ❌ Photo upload fails on iOS; content clipped by the notch; keyboard covers the field.
- 📸 Screenshot the notch area and any clipped content.
- 📝 Note "iOS only" clearly on any bug.

### DEVICE-TABLET — Tablet
- **Do this:** Run the Core Set on a tablet.
- ✅ Layout uses the bigger screen sensibly; nothing is stretched or broken; tap targets aren't tiny.
- 📝 Note any layout that looks wrong on a big screen.

### ORIENT-PORTRAIT / ORIENT-LANDSCAPE
- **Do this:** The app is designed **portrait**. Rotate the phone to **landscape** on a few screens.
- ✅ Either it stays portrait (by design) or landscape still looks acceptable (no overlapping text).
- ❌ Landscape breaks the layout badly / hides buttons.
- 📸 Screenshot a broken landscape screen.

### KEYBOARD — Typing fields
- **Do this:** On forms (login, booking notes, address, review comment, broadcast, saved-address), tap a field near the **bottom** of the screen and watch the on-screen keyboard appear.
- ✅ **Pass:** The field you're typing in stays **visible above** the keyboard; you can scroll; you can dismiss the keyboard.
- ❌ **Fail:** The keyboard **covers** the field you're typing in (you can't see what you type). *(This is a known iOS-watch area.)*
- 📸 Screenshot the covered field.
- 📝 Note the exact screen and device.

### SCROLL — Scrolling
- **Do this:** On long screens (notifications, bookings list, analytics), scroll up and down fast.
- ✅ Smooth; nothing jumps; you can reach the bottom.
- ❌ Janky; content cut off; can't reach the last item.
- 📝 Note the screen.

### SAFEAREA — Safe areas
- **Do this:** On iPhone with a notch and on phones with a bottom gesture bar, check the **top** and **bottom** of each main screen.
- ✅ Buttons and text are **not** hidden behind the notch, status bar, or the bottom home indicator.
- ❌ A button is under the notch or the bottom bar and hard to tap.
- 📸 Screenshot it.

### NOTIF-PUSH — Real push notifications (optional, needs a real build)
- **Do this:** *This only works in a real build, not Expo Go.* If a **development build / TestFlight / Play internal** build is available, close the app fully, then trigger a booking event and watch for a **banner**. Also confirm iOS asks for **notification permission** the first time.
- ✅ Banner appears when the app is closed; tapping it opens the right screen; permission prompt appears once.
- ❌ No banner in a real build; tapping the banner opens the wrong screen.
- 📝 If you only have Expo Go, write "Push not testable in Expo Go — needs dev build" and skip.

### HARDWARE-CAMERA-PHOTOS — Camera & photo library
- **Do this:** Provider **Add photo** → confirm it opens the **photo library**; verify the chosen photo uploads. (QuickServe uses the **library**, not live camera, so there should be **no camera permission** prompt.)
- ✅ Library opens; upload works; no unexpected camera permission request.
- ❌ Upload fails (watch iOS); an unexpected camera permission appears.
- 📝 Note device + result.

### HARDWARE-LOCATION — Location sharing
- **Do this:** As **Provider** on an active job, confirm location is requested **only while in use** (not "always"); the customer can see the provider heading their way (tracking).
- ✅ "When in use" permission; tracking updates while the job is active; stops after.
- ❌ Asks for "always" location; tracking never updates or never stops.
- 📝 Note the permission wording iOS/Android showed.

---

# PART 8 — Regression Testing (did new work break old work?)

"Regression" means: a **new** feature accidentally broke an **old** one. Since you last tested manually at Slice 16, and we're now at Slice 38, re-check the older features still work. Tick each box. If any fails, log a bug and mark it **Regression**.

**Auth & roles (Slices 1–3)**
```
[ ] Register a new customer works
[ ] Register a new provider works
[ ] Log in / log out works for all roles
[ ] A logged-out user cannot open protected screens
[ ] Admin cannot be self-registered (blocked)
```
**Booking core (Slices 4–10)**
```
[ ] Create booking (all steps) works
[ ] Provider is assigned / dispatched
[ ] Status flow pending→...→completed works in order
[ ] Booking activity timeline records each change
[ ] Job photos upload and display
[ ] Ratings & reviews after completion work
```
**Payments & wallet (Slices 11–17)**
```
[ ] M-Pesa payment flow completes (sandbox)
[ ] Wallet balance never goes negative
[ ] Wallet transactions match the balance
[ ] Chat between customer and provider works
[ ] In-app notification list works
```
**Admin web & marketplace (Slices 18–25, 30, 35)**
```
[ ] Admin login + every sidebar page opens
[ ] Maps / tracking / addresses work
[ ] Scheduling (time, recurrence) works
[ ] Services catalog + categories show correctly
[ ] Disabled service disappears for customers
[ ] Detailed analytics (drill-down) loads + CSV downloads
```
**Newer slices (26–38)**
```
[ ] Operations portal / support cases + disputes work
[ ] Favorite providers work
[ ] Provider quality actions (admin) work
[ ] Customer experience (edit review, etc.) works
[ ] Notifications & Communication Center (all roles) work
[ ] Broadcast reaches the correct audience
[ ] Notification preferences save; Email/SMS shown disabled
[ ] iOS: splash screen, permissions strings, Apple Maps navigation
[ ] Executive Analytics Dashboard loads with sane numbers
[ ] Growth delta badges show and make sense
```

---

# PART 9 — Bug Reporting (how to write a bug the right way)

A good bug report lets a developer reproduce and fix the problem **without asking you questions**. Copy this template into your bug log for **every** bug.

## The bug template (copy for each bug)

```
BUG ID:            QS-<number>            (e.g. QS-001, QS-002 ...)
TITLE:             <one short sentence: what's broken and where>
                   e.g. "Customer: Confirm button creates two bookings when double-tapped"

RELATED TEST:      <Test Card ID, e.g. EDGE-01>

WHO / ACCOUNT:     <Customer / Provider / Admin> + which login

DEVICE / BROWSER:  <e.g. Android 14 / Expo Go>  or  <Chrome 126 / Windows 11>

STEPS TO REPRODUCE (number them, be exact):
  1. Log in as customer
  2. Start a House Cleaning booking
  3. On the Confirm screen, tap "Confirm" twice quickly
  4. Open the Bookings tab

EXPECTED RESULT:   <what should happen>
                   e.g. "Exactly one booking is created."

ACTUAL RESULT:     <what really happened>
                   e.g. "Two identical bookings appear."

SEVERITY:          <Blocker / Major / Minor / Cosmetic>  (see scale below)

SCREENSHOT:        <attach / paste image>
VIDEO:             <attach screen recording if the bug is about timing/animation>

FREQUENCY:         <Always / Sometimes (X of Y tries) / Once>

NOTES:             <anything else: error text, network condition, time, etc.>
```

## Severity scale (how bad is it?)

| Severity | Meaning | Example |
|---|---|---|
| **Blocker** | You cannot continue; data loss; security hole; money wrong | Can't log in; double charge; customer sees admin data |
| **Major** | A key feature is broken but you can work around it | Notifications never arrive; analytics number impossible |
| **Minor** | Small malfunction, low impact | A filter chip is mislabeled; a spinner is slow |
| **Cosmetic** | Looks wrong but works | Text slightly clipped; wrong color |

## Rules for great bug reports
- **One bug per report.** Don't combine two problems.
- **Title = symptom + place.** A stranger should understand it in 3 seconds.
- **Steps are numbered and exact.** If a developer follows them and doesn't see the bug, the report failed.
- **Always attach proof** (screenshot; video for timing/animation bugs).
- **State frequency** — "always" vs "1 in 5" matters a lot to developers.
- **Never write "it doesn't work."** Say *what* you did, *what* you expected, *what* happened.

---

# PART 10 — Final Release Checklist (the gate)

**Do not start Slice 39 until every box below is ticked.** A box may be ticked only if its tests **passed** or its bugs are logged and judged acceptable (no open **Blocker** or **Major**).

## A. Blocking conditions (all must be TRUE)
```
[ ] No open Blocker bugs
[ ] No open Major bugs (or each has a written, agreed workaround)
[ ] No security issue (no wrong-role access — EDGE-12)
[ ] No money errors (no double charge, no negative wallet, commission ≤ revenue)
[ ] No data loss (no notification/booking silently erased)
```

## B. Coverage (all parts attempted)
```
[ ] PART 2 Customer — every Test Card run
[ ] PART 3 Provider — every Test Card run
[ ] PART 4 Admin — every Test Card run
[ ] PART 5 Cross-user — FLOW-1 through FLOW-7 run
[ ] PART 6 Edge cases — EDGE-01 through EDGE-14 run
[ ] PART 7 Mobile — Core Set on Android, iPhone, Tablet; keyboard/safe-area checked
[ ] PART 8 Regression — full checklist ticked
```

## C. Feature health (quick confirmations)
```
[ ] Customer: book / edit / cancel / complete / review all work
[ ] Wallet math is correct for customer and provider
[ ] Promotions apply once and reject invalid/expired
[ ] Saved addresses add/edit/delete work
[ ] Provider: accept / reject / start / complete / navigate / photos work
[ ] Earnings match completed jobs
[ ] Admin: Executive Dashboard loads section-by-section with sane numbers
[ ] Growth delta badges appear and point the right way
[ ] Detailed analytics drill-down + CSV work
[ ] Broadcast reaches the correct audience; "Everyone" reaches both
[ ] Notification Centers consistent across all three roles; history durable
[ ] iOS: navigation opens Apple Maps; no content under the notch; keyboard OK
```

## D. Sign-off
```
Tester name:        ____________________
Date tested:        ____________________
App version / build:____________________
Total bugs found:   ____  (Blocker: __  Major: __  Minor: __  Cosmetic: __)
Decision:           [ ] GO (safe to build Slice 39)   [ ] NO-GO (fix blockers first)
Notes:              ____________________________________________
```

---

## Appendix — Quick reference card (keep this open while testing)

**Roles & where:** Customer = mobile app · Provider = mobile app (2nd phone) · Admin = web (Chrome).
**Start mobile:** `npx expo start --tunnel` → scan QR in Expo Go.
**Start admin:** `npx expo start --web` → Chrome.
**Clear cache:** phone → shake → Reload · terminal → `npx expo start --tunnel -c` · Chrome → `Ctrl+Shift+R`.
**Booking status order:** `pending → accepted → provider_assigned → on_the_way → in_progress → completed` (or `cancelled`).
**Every bug needs:** Title · Steps · Expected · Actual · Severity · Screenshot.
**Never do:** delete data yourself · fix code · combine two bugs in one report · skip a step.
**Golden rule:** If you had to guess what to do, that's a bug — write it down.
