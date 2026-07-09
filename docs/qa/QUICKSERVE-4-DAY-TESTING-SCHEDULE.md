# QuickServe — 4-Day Manual Testing Schedule

**Companion to:** `QUICKSERVE-MANUAL-QA-GUIDE.md` (the main manual). This schedule tells you **which tests to run on which day** so you never feel overwhelmed. The main manual tells you **exactly how** to run each test (every tap, what success/failure looks like). Keep both open.

**Who this is for:** A first-time tester. You do **one day at a time**. Finish a day, rest, come back tomorrow.

**How the two documents work together:**
- This schedule says *"Day 1, do `CUST-BOOK-01`."*
- You then find **`CUST-BOOK-01`** in the main manual and follow its exact steps.
- After each test, mark it Pass/Fail and (if it failed) write a bug using the **Part 9 template**.
- At the end of each day, fill in one **Daily Testing Scorecard** (separate document).

**Before you start any day, remember the Golden Rule:** *If you ever have to guess what to do, that itself is a bug — write it down.*

---

## The 4 days at a glance

| Day | Focus | Main manual parts | Rough time (beginner pace) |
|---|---|---|---|
| **Day 1** | **Customer** experience | Part 2 | 2.5 – 3.5 hours |
| **Day 2** | **Provider** experience | Part 3 | 2 – 3 hours |
| **Day 3** | **Admin** experience | Part 4 | 2 – 3 hours |
| **Day 4** | **Everything together** (cross-user, regression, edge, mobile, release gate) | Parts 5–8, 10 | 4 – 5 hours (the big day) |

> You can split **Day 4** across two sittings if you're tired — it's the longest. That's allowed. Just don't split Days 1–3.

**Universal rule for every day:** don't test when you're rushed, sleepy, or frustrated. A tired tester misses bugs and creates false alarms. Take a 5-minute break every 45 minutes.

---

# DAY 1 — Customer Testing

### 🎯 Goal of the day
Confirm a real customer can do everything they need: **log in, get notifications, book a service, edit/cancel/complete it, use their wallet, apply promotions, leave reviews, and manage saved addresses** — without confusion or errors.

### 🧰 Preparation (10 minutes)
1. Start the mobile app: in a terminal, `npx expo start --tunnel`, then scan the QR code with **Expo Go** on your phone.
2. Have your **Customer** test account login ready (from Part 1.7 of the manual).
3. Open your **bug log** (notebook or Google Doc) and today's **Daily Testing Scorecard**.
4. Ask your developer/admin for **one valid promo code** and **one expired promo code** (you'll need both today).
5. Make sure your phone can take screenshots (Part 1.10).

### 📋 Exact order to test (do them top to bottom)
Run each in the main manual, in this order:
1. `CUST-LOGIN-01` — Log in as customer
2. `CUST-NOTIF-01` — Open the Notification Center
3. `CUST-NOTIF-02` — Filter and mark as read
4. `CUST-ADDR-01` — Manage saved addresses *(do this early so you have an address ready for booking)*
5. `CUST-BOOK-01` — Create a booking *(the big one — go slowly)*
6. `CUST-BOOK-02` — View booking details
7. `CUST-BOOK-03` — Edit a booking
8. `CUST-PROMO-01` — Apply a valid promotion *(start a new booking for this)*
9. `CUST-PROMO-02` — Reject invalid/expired promo
10. `CUST-BOOK-04` — Cancel a booking
11. `CUST-WALLET-01` — Open the wallet (check the math)
12. `CUST-PROFILE-01` — Profile & preferences
13. `CUST-BOOK-05` + `CUST-REVIEW-01` + `CUST-REVIEW-02` — *These need a provider to finish a job first.* **If you have a second phone**, you can do a quick provider accept+complete now; **otherwise, skip these three today and do them on Day 4** during the cross-user flows. Write "deferred to Day 4" next to them.

### 🔍 Things to pay extra attention to
- **Booking summary accuracy:** the address, time, service, and **price** on the confirmation must match what you chose.
- **Wallet math:** add up the transactions yourself — does the total equal the shown balance? The balance must **never** be negative.
- **Promo correctness:** the discount amount must match the promo; an **expired/fake** code must be **rejected** with a clear message.
- **Nothing disappears:** a cancelled booking should still be visible as "Cancelled" (not erased). Notifications should never vanish — only get marked read.

### ⚠️ Common mistakes (avoid these)
- **Rushing the booking flow.** Do one step, look, then continue. If you tap fast you won't know which step broke.
- **Forgetting to screenshot the "before" state.** Screenshot the booking right after you create it — you'll compare it later.
- **Testing with real-looking data.** Always use obvious test data ("QA Test booking, ignore") so nobody thinks it's a real order.
- **Calling something a bug too fast.** Re-read the manual's "You should see" first. If the app did what the manual predicted, it's **not** a bug.
- **Double-tapping Confirm.** Don't do it here by accident — that's a specific Day-4 edge test (`EDGE-01`).

### 🛑 When to stop testing (for the day)
Stop when **any** of these is true:
- You finished the Day-1 list above, **or**
- You hit a **Blocker** (you literally cannot continue — e.g. can't log in or can't create any booking). Log it, then stop and tell the developer — there's no point testing further on a broken foundation, **or**
- You've been going for ~3.5 hours or you're getting tired/sloppy. Tired testing produces bad data. Stop and continue tomorrow.

### ✅ End-of-day checklist
```
[ ] Logged in as customer successfully
[ ] Notification Center opens, filters work, mark-read sticks
[ ] Saved address add / edit / delete all work
[ ] Created at least one booking end-to-end
[ ] Viewed booking details (matched what I booked)
[ ] Edited a booking (change stuck)
[ ] Applied a valid promo (correct discount)
[ ] Invalid/expired promo was rejected
[ ] Cancelled a booking (shows Cancelled, still in history)
[ ] Wallet balance is sensible and matches transactions
[ ] Profile correct; Email/SMS toggles shown disabled
[ ] Review tests done OR marked "deferred to Day 4"
[ ] Every failure has a bug report (Part 9 template)
[ ] Daily Scorecard filled in
```

### 🗒️ What to record in the bug tracker
- For **each failed test**: one bug report using the **Part 9 template** (Title, Steps, Expected, Actual, Severity, Screenshot, Frequency, Notes).
- Reference the **Test Card ID** (e.g. "RELATED TEST: CUST-PROMO-01").
- Note the **exact numbers** for money/wallet/promo bugs (expected vs shown).
- At day's end, transfer the **counts** (tests run, passed, failed, and bugs by severity) into today's **Daily Testing Scorecard**.

---

# DAY 2 — Provider Testing

### 🎯 Goal of the day
Confirm a real provider (the worker) can do their whole job: **log in, receive job notifications, accept/reject jobs, move a job through its stages, navigate to the customer, upload photos, and see correct wallet, earnings, and profile.**

### 🧰 Preparation (10 minutes)
1. Start the mobile app (`npx expo start --tunnel`) on the phone you'll use as the **Provider** (ideally a **second** phone so you can keep the customer logged in on the first).
2. Have your **Provider** test account login ready.
3. **You need a job to work on.** Easiest way: on your **Customer** phone (or account), create a booking that selects this provider (`CUST-BOOK-01`). Then switch to the provider phone. *(If you only have one phone, create the booking as customer, log out, log in as provider.)*
4. Open your bug log and today's Scorecard.

### 📋 Exact order to test
1. `PROV-LOGIN-01` — Log in as provider *(confirm you land on the PROVIDER home, not customer)*
2. `PROV-NOTIF-01` — Provider notifications
3. `PROV-JOB-01` — See a new job *(the booking your customer just made)*
4. `PROV-JOB-02` — Accept a job *(watch the customer phone get notified if you have it)*
5. `PROV-NAV-01` — Navigate to the customer *(maps opens to the right place)*
6. `PROV-JOB-05` — Add job photos *(before photo)*
7. `PROV-JOB-04` — Start the job (advance statuses one at a time)
8. `PROV-JOB-05` again — Add the **after/completion** photo
9. `PROV-JOB-06` — Complete the job
10. `PROV-JOB-03` — Reject/decline a job *(do this on a **second, separate** test booking so you don't ruin the one you're completing)*
11. `PROV-WALLET-01` — Provider wallet *(payout appeared after completing?)*
12. `PROV-EARN-01` — Earnings *(match the completed job?)*
13. `PROV-PROFILE-01` — Provider profile *(rating & reviews)*

### 🔍 Things to pay extra attention to
- **Status order is sacred:** `pending → accepted → provider_assigned → on_the_way → in_progress → completed`. It must move **one step per tap**, never skip, never go backwards.
- **Photo upload:** watch it finish. **On iPhone especially**, confirm the photo actually uploads and stays (this is a known area to verify).
- **Navigate:** on **iPhone** it should open **Apple Maps**; on **Android**, Google/navigation. The destination pin must be the customer's address.
- **Money after completion:** completing a job should produce a **payout** in the provider wallet and update **earnings**. If nothing changes, that's a real bug.
- **Right role:** you must land on the **provider** home, not the customer catalog.

### ⚠️ Common mistakes (avoid these)
- **Testing accept AND reject on the same job.** Use **two different** bookings — one to complete, one to decline. Otherwise you can't tell what caused what.
- **Skipping the "watch the customer phone" step.** Half of provider testing is confirming the **customer** gets notified. If you only look at the provider phone, you miss the ripple.
- **Tapping the status button rapidly.** Go one tap at a time and read the new status before the next tap.
- **Assuming earnings updated.** Actually open Earnings and compare to the job you just completed.

### 🛑 When to stop testing
- You finished the Day-2 list, **or**
- A **Blocker** appears (e.g. jobs never reach the provider, or you can't accept any job) — log it and stop, because the rest depends on it, **or**
- ~3 hours in / you're tired.

### ✅ End-of-day checklist
```
[ ] Logged in as provider (landed on provider home)
[ ] Provider notifications load; count correct
[ ] New job appeared and matched the customer's booking
[ ] Accepted a job; customer got notified
[ ] Navigate opened maps to the correct address (Apple Maps on iPhone)
[ ] Before & after photos uploaded and stayed
[ ] Status advanced in the correct order to Completed
[ ] Declined a separate job successfully
[ ] Provider wallet shows the payout
[ ] Earnings match the completed job
[ ] Profile shows correct rating & reviews
[ ] Every failure has a bug report
[ ] Daily Scorecard filled in
```

### 🗒️ What to record in the bug tracker
- One **Part 9** bug report per failed test, with the **Test Card ID**.
- For status-order bugs, write the **exact sequence** you saw (e.g. "accepted → in_progress, skipped on_the_way").
- For money bugs, record **earnings/wallet before vs after** the job.
- Always note the **device** (Android/iPhone) — provider bugs are often device-specific (photos, maps).
- Update today's **Daily Testing Scorecard**.

---

# DAY 3 — Admin Testing

### 🎯 Goal of the day
Confirm the business owner (admin) can run QuickServe from the web portal: **the Executive Dashboard shows sensible numbers, detailed analytics work, broadcasts reach the right people, and the notification/communication centers are consistent.**

### 🧰 Preparation (10 minutes)
1. Start the web app: in a terminal, `npx expo start --web`. It opens QuickServe in **Chrome**.
2. Have your **Admin** login ready (admins can't self-register — use the one your developer made).
3. Best results: do Day 3 **after** Days 1–2, so there's real test data (bookings, payments, reviews) for the dashboard to show.
4. Have your **Customer** phone nearby — you'll send a broadcast and check it arrives.
5. Open your bug log and today's Scorecard.

### 📋 Exact order to test
1. `ADMIN-LOGIN-01` — Log in as admin
2. `ADMIN-DATA-01` — Open every sidebar page (Bookings, Providers, Customers, Payments, Payment Attempts, Earnings & Payouts, Reviews, Services, Promotions, Operations) — confirm each loads and your test data appears
3. `ADMIN-EXEC-01` — Executive Dashboard loads (section by section)
4. `ADMIN-EXEC-02` — Numbers make sense (the sanity-math card)
5. `ADMIN-EXEC-03` — Date filter + Refresh + Growth delta badges
6. `ADMIN-EXEC-04` — Drill-down to Detailed Analytics (+ CSV download)
7. `ADMIN-NOTIF-01` — Admin Notification Center
8. `ADMIN-BROADCAST-01` — Send a broadcast *(watch it arrive on the customer phone)*
9. `ADMIN-COMMS-01` — Communication Center consistency (events line up across roles)
10. `ADMIN-SERVICES-01` — Services & Promotions management (edits reflect on the customer app)

### 🔍 Things to pay extra attention to
- **Impossible numbers = bug.** No negative counts. **Commission ≤ Revenue.** **Rating between 1.0 and 5.0.** Completed + Cancelled + Active ≤ Total.
- **Health vs Period:** the **"Current"** (health) cards must **not** change when you change the date filter. The **"Selected period"** (activity) cards **must** change. If a "Current" card moves with the filter, that's a bug.
- **Section-by-section loading:** the dashboard should fill in **one section at a time** (each with a loading placeholder). The whole page should **not** freeze behind a single spinner. If one section fails, the others should still work and show a small **Retry**.
- **Export buttons must be disabled** ("coming soon"). If CSV/Excel/PDF on the *Executive* dashboard are clickable, that's a bug. (On the **Detailed** analytics page, CSV **does** work — that's correct.)
- **Broadcast targeting:** "Customers" must reach customers only; "Everyone" must reach both customers and providers.

### ⚠️ Common mistakes (avoid these)
- **Not doing the math.** Don't just glance — actually check commission ≤ revenue and rating ≤ 5. That's the whole point of admin testing.
- **Testing the dashboard with zero data.** If you skipped Days 1–2, the numbers will all be 0 and you'll learn nothing. Generate data first.
- **Forgetting to watch the phone during a broadcast.** The broadcast test isn't done until you confirm it **arrived** in the customer's Notification Center.
- **Confusing the two analytics pages.** "Analytics" in the sidebar = the **Executive** dashboard (Slice 38). "View detailed analytics" opens the **older detailed** page. They're different on purpose.

### 🛑 When to stop testing
- You finished the Day-3 list, **or**
- A **Blocker** (can't log in as admin; the whole dashboard is broken), **or**
- ~3 hours in / tired.

### ✅ End-of-day checklist
```
[ ] Logged in as admin
[ ] Every sidebar page opens without error and shows test data
[ ] Executive Dashboard loads section by section (no full-page freeze)
[ ] All numbers make sense (commission ≤ revenue; rating 1–5; no negatives)
[ ] Date filter changes only "Selected period" cards, not "Current" ones
[ ] Refresh updates "Last updated"; Growth delta badges appear and point sensibly
[ ] Export buttons on the Executive dashboard are DISABLED
[ ] Drill-down to Detailed Analytics works; CSV downloads
[ ] Admin Notification Center works; bell count correct
[ ] Broadcast sent and RECEIVED on the customer phone; correct audience
[ ] Communication Center consistent across customer/provider/admin
[ ] Service/promo edits reflect on the customer app
[ ] Every failure has a bug report
[ ] Daily Scorecard filled in
```

### 🗒️ What to record in the bug tracker
- One **Part 9** bug report per failed test, with the **Test Card ID**.
- For number bugs, **write the exact numbers** and **why** they're impossible (e.g. "Commission KES 900 > Revenue KES 800").
- For broadcast bugs, record the **audience chosen** vs **who actually received it**.
- Note the **browser** (Chrome + version) — repeat any suspicious admin bug in a second browser on Day 4.
- Update today's **Daily Testing Scorecard**.

---

# DAY 4 — Cross-User, Regression, Edge Cases, Mobile & Release Gate (the big day)

### 🎯 Goal of the day
Confirm the whole system works **together** (all three roles in one flow), that **old features still work** (regression), that the app **survives weird behavior** (edge cases), that it works **on real devices** (mobile), and then decide **GO / NO-GO** for Slice 39.

### 🧰 Preparation (15 minutes)
1. Set up **all three at once** (Part 1.6): **Customer** phone + **Provider** phone + **Admin** in Chrome. Arrange them so you can see all three.
2. Have a **tablet** and, if possible, an **iPhone** ready (for the mobile section).
3. Fresh valid + expired promo codes from admin.
4. This is the longest day — you may split it into **two sittings**: (A) Cross-user + Regression, (B) Edge + Mobile + Release gate.
5. Open your bug log and today's Scorecard.

### 📋 Exact order to test
**Sitting A — put it all together**
1. `FLOW-1` — Full happy path (book → notify → accept → notify → admin/analytics → complete → wallet → review → rating → analytics). *Go slowly; glance at all three screens after each step.*
2. Now finish yesterday's deferred customer tests using FLOW-1's completed job: `CUST-BOOK-05`, `CUST-REVIEW-01`, `CUST-REVIEW-02`.
3. `FLOW-2` — Cancellation ripple
4. `FLOW-3` — Broadcast reaches the right people
5. `FLOW-4` — Promotion end-to-end
6. `FLOW-5` — Review affects provider rating & admin analytics
7. `FLOW-6` — Two customers, one provider (contention)
8. `FLOW-7` — Notification consistency audit
9. **Regression (Part 8):** work down the **entire Part-8 checklist**, ticking each box. Anything that fails → bug, marked **Regression**.

**Sitting B — break it & check devices, then decide**
10. `EDGE-01` through `EDGE-14` — every edge case, in order. Pay special attention to `EDGE-12` (**wrong-role access** = security).
11. **Mobile (Part 7):** run the **Core Set** (login → book → provider accept & complete → notification received → wallet/earnings) on **Android**, **iPhone**, and **Tablet**. Then check `KEYBOARD`, `SAFEAREA`, `SCROLL`, `ORIENT-*`, `HARDWARE-CAMERA-PHOTOS`, `HARDWARE-LOCATION`. (`NOTIF-PUSH` only if you have a real build — otherwise note "not testable in Expo Go".)
12. **Part 10 — Final Release Checklist:** go through the GO/NO-GO gate and sign it.

### 🔍 Things to pay extra attention to
- **The ripple, not just the click.** In cross-user flows, the bug is usually "the click worked but the **other** role didn't react." Watch all three screens.
- **Security (`EDGE-12`).** If a customer can reach admin data, that's a **Blocker** — stop and flag it loudly.
- **Money & data integrity.** No double charge (`EDGE-01`), no ghost bookings after refresh (`EDGE-02`), no negative wallet, commission ≤ revenue.
- **iOS specifics.** Keyboard covering fields, content under the notch, photo upload, Apple Maps navigation.
- **Regression = broken old feature.** Treat these as important — they mean new work damaged something that used to work.

### ⚠️ Common mistakes (avoid these)
- **Only watching one screen** during cross-user flows. You'll miss the exact broken arrow. Watch all three.
- **Skipping regression because "it used to work."** That's exactly why you check — new slices can break old ones.
- **Doing Day 4 while exhausted.** It's long. Split it. A rushed final day gives a false GO.
- **Ticking the release gate without evidence.** Only tick a box if you actually verified it today.

### 🛑 When to stop testing
- You completed cross-user + regression + edge + mobile and filled the release gate, **or**
- You hit a **Blocker** in a cross-user flow or a **security** issue (`EDGE-12`) — log it, mark **NO-GO**, and stop; the release decision is already "no," **or**
- You're tired — **split** the day rather than pushing through.

### ✅ End-of-day checklist
```
[ ] FLOW-1 through FLOW-7 all run; each "arrow" verified across roles
[ ] Deferred customer review tests (CUST-BOOK-05, CUST-REVIEW-01/02) done
[ ] Full Part-8 regression checklist ticked (failures logged as Regression)
[ ] EDGE-01 through EDGE-14 all run
[ ] EDGE-12 (wrong-role access) specifically verified — no security hole
[ ] Mobile Core Set run on Android, iPhone, Tablet
[ ] Keyboard / safe-area / scrolling / orientation / camera-photos / location checked
[ ] Part 10 release gate completed and signed (GO or NO-GO)
[ ] Every failure has a bug report
[ ] Daily Scorecard filled in + Phase Summary totalled
```

### 🗒️ What to record in the bug tracker
- One **Part 9** bug report per failure, with the **Test Card / FLOW / EDGE ID**.
- For cross-user bugs, write **which arrow broke** (e.g. "provider completed but customer still saw In progress after 2 min").
- Tag **Regression** bugs clearly (old feature that broke).
- Tag any **security** finding as **Blocker**.
- Note **device/browser** for every mobile bug.
- Fill today's **Daily Testing Scorecard**, then complete the **Phase Summary** (totals across all 4 days) and the **GO/NO-GO** decision.

---

## After Day 4 — What happens next
1. Review all bugs. Sort by severity (Blocker → Major → Minor → Cosmetic).
2. If there are **any open Blockers or Majors**, the decision is **NO-GO**: fix those first, then re-test just the affected areas.
3. If there are none (only Minor/Cosmetic, or agreed workarounds), the decision is **GO**: you may proceed to Slice 39.
4. Keep every filled Scorecard — they're your testing record for the whole QuickServe project.

---

*End of the 4-Day Testing Schedule. Use the separate **Daily Testing Scorecard** document to score each day.*
