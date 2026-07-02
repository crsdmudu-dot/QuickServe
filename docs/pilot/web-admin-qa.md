# QuickServe Web Admin — Manual QA Checklist

**Slice:** 19 (Web Admin Polish + Deployment)
**Related docs:** [web-admin-deploy.md](web-admin-deploy.md) · [web-admin-release.md](web-admin-release.md)

---

## How to use this checklist

Work through each section in a real browser against the deployed Vercel URL (or `npx expo start --web` locally).
Mark `[x]` when the item passes. If it fails, add a short note and open an issue.

---

## 1. Layout — Desktop (≥ 1024 px)

- [ ] Sidebar is visible on the left at full width; all 9 nav links render without clipping.
- [ ] Content area fills the remaining width; no horizontal scroll bar appears.
- [ ] Tables display all columns without truncation at 1280 px and 1440 px.
- [ ] Empty-state illustrations and messages are centred within the content area.
- [ ] Loading spinners are centred; no layout shift when data arrives.
- [ ] Error/retry banners span the full content width and the "Retry" button is clickable.

## 2. Layout — Tablet (700 px – 1023 px)

- [ ] Sidebar collapses; top navigation bar appears at the 700 px breakpoint.
- [ ] Top nav shows the QuickServe logo/wordmark and all 9 section links (scroll if needed).
- [ ] Tables scroll horizontally inside their container; outer page does not scroll sideways.
- [ ] Stat cards on the Dashboard reflow to a 2-column grid (not a single column).
- [ ] Empty, loading, and error states still render correctly at 768 px.

## 3. Layout — Mobile-width (< 700 px)

- [ ] Top navigation remains visible; no sidebar shown.
- [ ] Tables are horizontally scrollable; text is not clipped.
- [ ] Buttons and interactive elements are at least 44 × 44 pt tap targets.

## 4. Browser Matrix

Run through the auth-guard paths and at least one data section in each browser:

- [ ] **Chrome** (latest stable) — layout, auth guard, one data action.
- [ ] **Edge** (latest stable) — layout, auth guard, one data action.
- [ ] **Safari** (latest stable, macOS/iOS) — layout, auth guard, one data action.
- [ ] **Firefox** (latest stable) — layout, auth guard, one data action.

## 5. Auth Guard Paths

- [ ] **Unauthenticated → login**: Open any protected admin-web URL while signed out; browser redirects to `/(admin-web)/login` with no redirect loop.
- [ ] **Login screen renders without auth**: The `/login` page loads and shows the sign-in form regardless of auth state.
- [ ] **Non-admin authenticated → Not authorized**: Sign in as a `customer` or `provider` account, navigate to a protected admin route; the "Not authorized" card appears with a "Sign out" button and zero admin data is fetched or visible.
- [ ] **Sign-out from Not-authorized screen**: Tap "Sign out"; session ends and user is sent to the login screen.
- [ ] **Admin → dashboard**: Sign in as a `role = admin` account; Dashboard loads with stats and the sidebar/top-nav renders.
- [ ] **Loading state**: On slow connections the activity spinner is shown before the role resolves; no flash of unauthorized content.

## 6. Sections — Load & Single Action

Verify each section loads its data and one write/navigation action works:

- [ ] **Dashboard** (`/`) — Stats cards display; no console errors.
- [ ] **Bookings list** (`/bookings`) — Table paginates or scrolls; click a row navigates to the detail view.
- [ ] **Booking detail** (`/bookings/[id]`) — Booking info renders; status badge correct.
- [ ] **Customers list** (`/customers`) — Table loads; customer names and emails visible.
- [ ] **Providers list** (`/providers`) — Table loads; provider names visible.
- [ ] **Provider detail** (`/providers/[id]`) — Profile info and review summary render.
- [ ] **Reviews** (`/reviews`) — Review rows render; hide/unhide action toggles visibility.
- [ ] **Earnings** (`/earnings`) — Earnings summary and row data render.
- [ ] **Payments** (`/payments`) — Payment rows render; status badges correct.
- [ ] **Payment Attempts** (`/payment-attempts`) — Attempt rows render; failure reason visible where applicable.
- [ ] **Login** (`/login`) — Sign-in form submits; successful login redirects to Dashboard; wrong credentials shows an error message.

## 7. Page Titles

Verify `<title>` in the browser tab for each section ends with ` · QuickServe Admin`:

- [ ] Dashboard → `Dashboard · QuickServe Admin`
- [ ] Bookings → `Bookings · QuickServe Admin`
- [ ] Customers → `Customers · QuickServe Admin`
- [ ] Providers → `Providers · QuickServe Admin`
- [ ] Reviews → `Reviews · QuickServe Admin`
- [ ] Earnings → `Earnings · QuickServe Admin`
- [ ] Payments → `Payments · QuickServe Admin`
- [ ] Payment Attempts → `Payment Attempts · QuickServe Admin`
- [ ] Login → `Login · QuickServe Admin`

## 8. Deep-Link & SPA Fallback

- [ ] Hard-refresh on `/bookings` returns the bookings page (not a 404); confirms Vercel SPA rewrite rule in `vercel.json` is active.
- [ ] Hard-refresh on `/bookings/[id]` returns the detail page.
- [ ] Hard-refresh on `/login` returns the login page.
- [ ] Navigating via browser Back/Forward works between sections without a full page reload.
- [ ] Opening a direct URL to a protected route while unauthenticated redirects to `/login` (not a 404).

## 9. Error & Edge States

- [ ] Simulate network failure (DevTools → offline): each section shows an error banner with a "Retry" button.
- [ ] Retry button re-fetches successfully when connectivity is restored.
- [ ] Empty list state: for a section with no data, an empty-state message renders (not a blank page).
- [ ] Very long strings in table cells (names, addresses) wrap or truncate gracefully; no overflow outside card bounds.

## 10. Performance Spot-Check

- [ ] Lighthouse performance score ≥ 70 on the Dashboard page (Chrome DevTools).
- [ ] First Contentful Paint < 3 s on a simulated "Fast 4G" throttle.
- [ ] No layout shift (CLS < 0.1) during data load.

## 11. Deployment Verification (post-deploy)

- [ ] `https://<your-vercel-domain>/` returns the Dashboard (after sign-in).
- [ ] `https://<your-vercel-domain>/login` is publicly accessible (no auth required).
- [ ] HTTPS certificate is valid; no mixed-content warnings.
- [ ] `vercel.json` SPA rewrite is confirmed in Vercel → Project → Settings → Rewrites.
- [ ] Environment variables (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) are set in the Vercel project and the admin panel connects to Supabase successfully.

---

*See [web-admin-deploy.md](web-admin-deploy.md) for step-by-step deployment instructions and [web-admin-release.md](web-admin-release.md) for the release operator guide.*
