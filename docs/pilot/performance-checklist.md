# Performance Checklist — QuickServe Pilot

Run these checks on a **physical device** before each pilot build. Record device model, OS version,
and your observation in the "Result / Notes" column. Escalate only **verified blockers** to
`qa-findings.md` (Task 9); cosmetic perf items are logged there for a future slice.

---

## How to use this checklist

| Symbol | Meaning |
|--------|---------|
| `- [ ]` | Not yet checked |
| `- [x]` | Passed / within target |
| `- [!]` | Blocked — log in `qa-findings.md` |

**Measurement tools**

- **Expo DevTools / Metro logs** — visible in terminal during `npx expo start`.
- **Android Profiler** (Android Studio) — CPU, memory, frame rendering.
- **Xcode Instruments** — Time Profiler, Allocations, Leaks (iOS).
- **Flipper** (optional) — React DevTools, network inspector.
- **`expo export --platform android`** / `expo export --platform ios`** — produces bundle size.
- Stopwatch / screen recorder for manual timing.

---

## 1. Startup / Cold-Start Time

**Target:** Splash screen → first usable screen (home tab loaded, no spinner) in **≤ 4 s** on a
mid-range device (e.g. Android 10, 3 GB RAM). iOS target same or better.

| # | Check | How to measure | Target | Result / Notes |
|---|-------|---------------|--------|----------------|
| 1.1 | Cold start on Android (fresh launch, no cached JS) | Kill app → reopen; stopwatch from OS launcher tap to home tab | ≤ 4 s | |
| 1.2 | Cold start on iOS | Same procedure | ≤ 4 s | |
| 1.3 | Bundle size (Android) | `npx expo export --platform android` → check `dist/` folder total | ≤ 10 MB JS bundle | |
| 1.4 | Bundle size (iOS) | `npx expo export --platform ios` → check `dist/` folder total | ≤ 10 MB JS bundle | |
| 1.5 | Splash screen duration | Observe; splash must not linger after app is ready | Disappears within 1 s of ready | |

---

## 2. Navigation Responsiveness

**Target:** Tab switches and push transitions complete within **300 ms**, no visible dropped frames
(60 fps target; Hermes engine enabled).

| # | Check | How to measure | Target | Result / Notes |
|---|-------|---------------|--------|----------------|
| 2.1 | Bottom tab switch (Customer: Home → Bookings → Profile) | Tap each tab; visually inspect for lag or white flash | < 300 ms, no flash | |
| 2.2 | Bottom tab switch (Provider tabs) | Same | < 300 ms | |
| 2.3 | Stack push (e.g. service list → service detail) | Tap a service card; observe slide animation | Smooth 60 fps | |
| 2.4 | Stack pop (back button / swipe) | Swipe back or press back; observe | Smooth 60 fps | |
| 2.5 | Admin tab navigation | Same pattern for admin tabs | < 300 ms | |
| 2.6 | Deep link navigation (if used in pilot) | Open a deep link; observe route resolution | Correct screen, no blank frame | |

---

## 3. Booking Flow Performance

**Target:** No jank or dropped frames throughout the full booking journey
(Address → Schedule → Notes → Review → Success).

| # | Check | How to measure | Target | Result / Notes |
|---|-------|---------------|--------|----------------|
| 3.1 | Address step renders immediately | Tap "Book" on service detail | < 200 ms to first paint | |
| 3.2 | Typing in address / notes fields | Type rapidly; check input lag | No perceptible lag | |
| 3.3 | Date/time picker opens smoothly | Tap schedule field | < 300 ms, smooth sheet | |
| 3.4 | Review step renders booking summary | Navigate to review | < 300 ms | |
| 3.5 | Submit booking (API round-trip) | Tap "Confirm"; measure until success screen | ≤ 3 s (network dependent) | |
| 3.6 | Success screen animation | Observe lottie/tick animation | Plays without skip | |
| 3.7 | Back-to-home after success | Tap done/home | < 300 ms | |

---

## 4. Image Upload

**Target:** Pick → upload → gallery render completes without crash or >8 s delay for images ≤ 5 MB.

| # | Check | How to measure | Target | Result / Notes |
|---|-------|---------------|--------|----------------|
| 4.1 | Pick image from gallery | Tap image picker; observe sheet open | < 500 ms to open | |
| 4.2 | Pick from camera (if enabled) | Launch camera flow | < 1 s to camera ready | |
| 4.3 | Upload a small image (< 1 MB) | Select; watch upload indicator | ≤ 3 s upload | |
| 4.4 | Upload a large image (~5 MB) | Select a large photo | ≤ 8 s, no crash | |
| 4.5 | Upload a very large image (> 10 MB) | Select an oversized photo | Graceful error message shown | |
| 4.6 | Gallery renders uploaded image | After upload; image displayed in profile/job | Displays correctly, no broken img | |
| 4.7 | Multiple images in a list | Scroll a screen with many images | No jank, images lazy-load | |

---

## 5. Chat Responsiveness

**Target:** Messages send and appear in < 1 s on good connectivity; scroll is smooth on long threads.

| # | Check | How to measure | Target | Result / Notes |
|---|-------|---------------|--------|----------------|
| 5.1 | Open chat thread | Tap into a booking chat | < 300 ms to render thread | |
| 5.2 | Send a message | Type and send; time until message appears | < 1 s | |
| 5.3 | Receive a message (real-time) | Have another tester send from another device | Appears < 2 s (Supabase realtime) | |
| 5.4 | Scroll long thread (50+ messages) | Scroll quickly up and down | No blank cells, 60 fps | |
| 5.5 | Keyboard open/dismiss | Tap input → keyboard up; press back/swipe down | Smooth animation, no layout jump | |
| 5.6 | Chat on poor network (throttle in DevTools) | Set to "Slow 3G" equivalent | Loading indicator shown, no crash | |

---

## 6. Admin Dashboard Responsiveness

**Target:** Lists, toggles, and status actions all complete within 500 ms UI response.

| # | Check | How to measure | Target | Result / Notes |
|---|-------|---------------|--------|----------------|
| 6.1 | Bookings list loads | Open admin bookings tab | < 1 s to first item | |
| 6.2 | Scroll bookings list | Scroll quickly | 60 fps, no blank cells | |
| 6.3 | Filter / search bookings | Type in search box | < 300 ms filter response | |
| 6.4 | Change booking status (e.g. confirm/cancel) | Tap status action; watch update | UI updates < 500 ms | |
| 6.5 | User list loads | Open admin users tab | < 1 s | |
| 6.6 | Toggle provider active/inactive | Tap toggle | Immediate visual feedback | |
| 6.7 | Reviews list loads | Open admin reviews tab | < 1 s | |
| 6.8 | Hide/unhide a review | Tap hide; observe | UI updates < 500 ms | |

---

## 7. Memory / Battery Observations

**Target:** No OOM crash or excessive battery drain after a 15-minute session on a mid-range device.

| # | Check | How to measure | Target | Result / Notes |
|---|-------|---------------|--------|----------------|
| 7.1 | Memory after 15-min session (Android) | Android Profiler → Memory tab; observe heap | No continuous growth (< 200 MB heap) | |
| 7.2 | Memory after 15-min session (iOS) | Xcode Instruments → Allocations | No continuous growth | |
| 7.3 | Memory on image-heavy screens | Browse provider profiles / service list with images | No spike > +100 MB from baseline | |
| 7.4 | No OOM crash after heavy use | Browse all major screens, upload images, chat | No crash | |
| 7.5 | Battery drain observation | Note battery % before/after 15-min active use | < 5% drain on normal usage | |
| 7.6 | App backgrounded and resumed | Press home; use another app; return | App resumes correctly, no crash | |

---

## 8. Physical Device Record

Complete one row per test device used during pilot QA.

| Device | OS Version | Build # | Tester | Date | Overall Verdict |
|--------|-----------|---------|--------|------|-----------------|
| | | | | | |
| | | | | | |
| | | | | | |

---

## Notes on Escalation

- A **verified blocker** = reproducible on a physical device, impacts core flow, or causes a crash.
  Log in `docs/pilot/qa-findings.md` with steps to reproduce and severity.
- **Cosmetic / minor** = logged in `qa-findings.md` with severity "low"; deferred to next slice.
- Do **not** optimise speculatively. Fix only what is confirmed broken in this checklist.
