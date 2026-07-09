# QuickServe — Daily Testing Scorecard

**Companion to:** `QUICKSERVE-4-DAY-TESTING-SCHEDULE.md` and `QUICKSERVE-MANUAL-QA-GUIDE.md`.
**Purpose:** At the end of **each testing day**, fill in one scorecard. It turns your day into simple numbers so you (and the developer) can see the app's health at a glance. Print this page, or copy each card into your bug log.

---

## How to fill it in (read once — 3 minutes)

Fill these fields at the **end of each day**:

| Field | What to write | How to get it |
|---|---|---|
| **Date** | Today's date | — |
| **Start Time / End Time** | When you began and stopped | Look at the clock; note breaks in Comments |
| **Number of Tests Run** | How many Test Cards you actually ran today | Count the Test Card IDs you did (e.g. Day 1 has ~13) |
| **Passed** | Tests where the app did what "You should see" predicted | Count your ✅ marks |
| **Failed** | Tests where you saw an ❌ | Count your ❌ marks |
| **Blockers** | Bugs that stop you completely / money / security | Count Part-9 bugs marked **Blocker** |
| **Major Bugs** | A key feature broken but with a workaround | Count **Major** bugs |
| **Minor Bugs** | Small malfunction, low impact | Count **Minor** bugs |
| **Cosmetic Bugs** | Looks wrong but works | Count **Cosmetic** bugs |
| **Overall Rating** | Your gut feeling of the day's health | Use the rating scale below |
| **Comments** | Anything worth remembering | Free text |

**Rules:**
- **Passed + Failed should equal Number of Tests Run.** If a test was skipped/deferred, don't count it in either — note it in Comments (e.g. "3 review tests deferred to Day 4").
- **One test can produce more than one bug** — that's fine; Failed counts the *test*, the bug columns count the *bugs*.
- Fill it in **honestly**. A scorecard full of green that hides a Blocker is worse than useless.

### Overall Rating scale (pick one)
| Rating | Meaning |
|---|---|
| ⭐⭐⭐⭐⭐ **Excellent** | Everything worked. 0 Blockers, 0 Major. |
| ⭐⭐⭐⭐ **Good** | Worked overall. 0 Blockers; at most a couple of Minors. |
| ⭐⭐⭐ **Fair** | Usable but rough. 0 Blockers; some Major/Minor to fix. |
| ⭐⭐ **Poor** | Serious problems. 1+ Major, or many Minors. |
| ⭐ **Broken** | Cannot ship. 1+ Blocker (money/security/data-loss/can't proceed). |

> **Quick decision rule:** any day with a **Blocker** → the phase is **NO-GO** until it's fixed, no matter how green the rest looks.

---

## SCORECARD — DAY 1 (Customer)

```
┌───────────────────────────────────────────────────────────────────────┐
│ QUICKSERVE DAILY TESTING SCORECARD                    DAY 1 — CUSTOMER │
├───────────────────────────────────────────────────────────────────────┤
│ Date:              ______ / ______ / __________                        │
│ Tester name:       ______________________________                      │
│ App version/build: ______________________________                      │
│ Devices used:      ______________________________                      │
│                                                                         │
│ Start Time:  ______ : ______   AM / PM                                 │
│ End Time:    ______ : ______   AM / PM                                  │
│ Breaks taken (mins): ______                                            │
├───────────────────────────────────────────────────────────────────────┤
│ Number of Tests Run:   ________                                        │
│ Passed:                ________                                        │
│ Failed:                ________     (Passed + Failed = Tests Run)      │
├───────────────────────────────────────────────────────────────────────┤
│ Bugs found by severity:                                                │
│   Blockers:        ________   (bug IDs: __________________________)     │
│   Major Bugs:      ________   (bug IDs: __________________________)     │
│   Minor Bugs:      ________   (bug IDs: __________________________)     │
│   Cosmetic Bugs:   ________   (bug IDs: __________________________)     │
├───────────────────────────────────────────────────────────────────────┤
│ Overall Rating:  ⭐ / ⭐⭐ / ⭐⭐⭐ / ⭐⭐⭐⭐ / ⭐⭐⭐⭐⭐                        │
│ Tests deferred to a later day (list IDs): ____________________________  │
├───────────────────────────────────────────────────────────────────────┤
│ Comments:                                                              │
│  ___________________________________________________________________  │
│  ___________________________________________________________________  │
│  ___________________________________________________________________  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## SCORECARD — DAY 2 (Provider)

```
┌───────────────────────────────────────────────────────────────────────┐
│ QUICKSERVE DAILY TESTING SCORECARD                    DAY 2 — PROVIDER │
├───────────────────────────────────────────────────────────────────────┤
│ Date:              ______ / ______ / __________                        │
│ Tester name:       ______________________________                      │
│ App version/build: ______________________________                      │
│ Devices used:      ______________________________                      │
│                                                                         │
│ Start Time:  ______ : ______   AM / PM                                 │
│ End Time:    ______ : ______   AM / PM                                  │
│ Breaks taken (mins): ______                                            │
├───────────────────────────────────────────────────────────────────────┤
│ Number of Tests Run:   ________                                        │
│ Passed:                ________                                        │
│ Failed:                ________     (Passed + Failed = Tests Run)      │
├───────────────────────────────────────────────────────────────────────┤
│ Bugs found by severity:                                                │
│   Blockers:        ________   (bug IDs: __________________________)     │
│   Major Bugs:      ________   (bug IDs: __________________________)     │
│   Minor Bugs:      ________   (bug IDs: __________________________)     │
│   Cosmetic Bugs:   ________   (bug IDs: __________________________)     │
├───────────────────────────────────────────────────────────────────────┤
│ Overall Rating:  ⭐ / ⭐⭐ / ⭐⭐⭐ / ⭐⭐⭐⭐ / ⭐⭐⭐⭐⭐                        │
│ Device notes (which bug on Android vs iPhone): ______________________  │
├───────────────────────────────────────────────────────────────────────┤
│ Comments:                                                              │
│  ___________________________________________________________________  │
│  ___________________________________________________________________  │
│  ___________________________________________________________________  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## SCORECARD — DAY 3 (Admin)

```
┌───────────────────────────────────────────────────────────────────────┐
│ QUICKSERVE DAILY TESTING SCORECARD                       DAY 3 — ADMIN │
├───────────────────────────────────────────────────────────────────────┤
│ Date:              ______ / ______ / __________                        │
│ Tester name:       ______________________________                      │
│ App version/build: ______________________________                      │
│ Browser + version: ______________________________                      │
│                                                                         │
│ Start Time:  ______ : ______   AM / PM                                 │
│ End Time:    ______ : ______   AM / PM                                  │
│ Breaks taken (mins): ______                                            │
├───────────────────────────────────────────────────────────────────────┤
│ Number of Tests Run:   ________                                        │
│ Passed:                ________                                        │
│ Failed:                ________     (Passed + Failed = Tests Run)      │
├───────────────────────────────────────────────────────────────────────┤
│ Bugs found by severity:                                                │
│   Blockers:        ________   (bug IDs: __________________________)     │
│   Major Bugs:      ________   (bug IDs: __________________________)     │
│   Minor Bugs:      ________   (bug IDs: __________________________)     │
│   Cosmetic Bugs:   ________   (bug IDs: __________________________)     │
├───────────────────────────────────────────────────────────────────────┤
│ "Numbers make sense?" check (ADMIN-EXEC-02):  PASS / FAIL              │
│   If FAIL, which number was impossible: _____________________________  │
├───────────────────────────────────────────────────────────────────────┤
│ Overall Rating:  ⭐ / ⭐⭐ / ⭐⭐⭐ / ⭐⭐⭐⭐ / ⭐⭐⭐⭐⭐                        │
├───────────────────────────────────────────────────────────────────────┤
│ Comments:                                                              │
│  ___________________________________________________________________  │
│  ___________________________________________________________________  │
│  ___________________________________________________________________  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## SCORECARD — DAY 4 (Cross-user / Regression / Edge / Mobile / Release)

```
┌───────────────────────────────────────────────────────────────────────┐
│ QUICKSERVE DAILY TESTING SCORECARD          DAY 4 — INTEGRATION & GATE │
├───────────────────────────────────────────────────────────────────────┤
│ Date:              ______ / ______ / __________                        │
│ Tester name:       ______________________________                      │
│ App version/build: ______________________________                      │
│ Devices used:      Android __  iPhone __  Tablet __  (tick)            │
│                                                                         │
│ Start Time:  ______ : ______   AM / PM   (Sitting A)                   │
│ End Time:    ______ : ______   AM / PM   (Sitting A)                   │
│ Start Time:  ______ : ______   AM / PM   (Sitting B, if split)         │
│ End Time:    ______ : ______   AM / PM   (Sitting B, if split)         │
├───────────────────────────────────────────────────────────────────────┤
│ Number of Tests Run:   ________                                        │
│ Passed:                ________                                        │
│ Failed:                ________     (Passed + Failed = Tests Run)      │
├───────────────────────────────────────────────────────────────────────┤
│ Bugs found by severity:                                                │
│   Blockers:        ________   (bug IDs: __________________________)     │
│   Major Bugs:      ________   (bug IDs: __________________________)     │
│   Minor Bugs:      ________   (bug IDs: __________________________)     │
│   Cosmetic Bugs:   ________   (bug IDs: __________________________)     │
│   Regression bugs (subset):  ________                                  │
├───────────────────────────────────────────────────────────────────────┤
│ Security check EDGE-12 (wrong-role access):   PASS / FAIL             │
│ Cross-user flows FLOW-1..7 all passed?        YES / NO                 │
│ Full regression checklist (Part 8) ticked?    YES / NO                 │
├───────────────────────────────────────────────────────────────────────┤
│ Overall Rating:  ⭐ / ⭐⭐ / ⭐⭐⭐ / ⭐⭐⭐⭐ / ⭐⭐⭐⭐⭐                        │
├───────────────────────────────────────────────────────────────────────┤
│ Comments:                                                              │
│  ___________________________________________________________________  │
│  ___________________________________________________________________  │
│  ___________________________________________________________________  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## PHASE SUMMARY (fill after Day 4 — the whole testing phase at a glance)

Add up all four days.

```
┌───────────────────────────────────────────────────────────────────────┐
│ QUICKSERVE TESTING PHASE SUMMARY  (Days 1–4)                           │
├───────────────────────────────────────────────────────────────────────┤
│ Testing period:   from ____/____/______  to ____/____/______          │
│ Tester name:      ______________________________                       │
│ App version/build tested: ______________________________               │
├───────────────────────────────────────────────────────────────────────┤
│                    Day1   Day2   Day3   Day4   TOTAL                    │
│ Tests Run          ____   ____   ____   ____   ______                  │
│ Passed             ____   ____   ____   ____   ______                  │
│ Failed             ____   ____   ____   ____   ______                  │
│ Blockers           ____   ____   ____   ____   ______                  │
│ Major              ____   ____   ____   ____   ______                  │
│ Minor              ____   ____   ____   ____   ______                  │
│ Cosmetic           ____   ____   ____   ____   ______                  │
├───────────────────────────────────────────────────────────────────────┤
│ Pass rate = Passed ÷ Tests Run × 100 =  ________ %                     │
├───────────────────────────────────────────────────────────────────────┤
│ RELEASE DECISION (from Manual Part 10):                                │
│   [ ] GO     — 0 open Blockers, 0 open Major (or agreed workarounds)   │
│   [ ] NO-GO  — 1+ open Blocker or Major; fix and re-test first         │
│                                                                         │
│ Reason / notes: ____________________________________________________   │
│  ___________________________________________________________________  │
├───────────────────────────────────────────────────────────────────────┤
│ Signed (tester): ____________________   Date: ____/____/______        │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Worked example (so you know what "good" looks like)

Here's a filled Day-1 card as an example — yours will differ:

```
Date: 12 / 07 / 2026        Tester: Mahamud        App build: 1.0.0 (dev)
Start: 09:15 AM   End: 12:05 PM   Breaks: 20 mins
Number of Tests Run: 13
Passed: 11      Failed: 2       (11 + 2 = 13 ✓)
Blockers: 0
Major:    1   (bug IDs: QS-004 — expired promo still applied discount)
Minor:    1   (bug IDs: QS-005 — wallet history date format hard to read)
Cosmetic: 0
Overall Rating: ⭐⭐⭐ Fair
Deferred: CUST-BOOK-05, CUST-REVIEW-01, CUST-REVIEW-02 (need provider — Day 4)
Comments: Booking flow smooth. Promo validation is the concern — see QS-004.
          Re-test QS-004 before GO.
```

**Reading it:** 0 Blockers = you could keep testing, but the 1 **Major** (QS-004) means this area is **NO-GO** until fixed. The rating "Fair" and the comment capture that clearly. That's a perfect scorecard — honest, specific, and pointing at the exact risk.

---

*End of the Daily Testing Scorecard. Use one card per day, then complete the Phase Summary after Day 4.*
