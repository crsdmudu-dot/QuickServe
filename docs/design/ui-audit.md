# QuickServe UI Audit — Slice 16

> Scope: visual/presentation inconsistencies only. No logic, schema, permission, or feature
> changes are proposed. All findings are actionable by the polish waves (T4–T11).

---

## 1. Summary — Overall First-Impression Assessment

QuickServe has a solid functional foundation and a well-structured design-token layer
(`src/constants/theme.ts`). The `Colors`, `Spacing`, `Radii`, `Typography`, and `Shadows`
constants are coherent and premium-capable. However the current screens fall short of the
"luxury on-demand" brand in several recurring ways:

- **Raw `Text` from React Native** is used in at least eight places instead of the typed
  `<Text>` component from `src/components/ui/text.tsx`, bypassing typography and theming
  entirely.
- **Loading states** universally render a bare "Loading…" text fragment with no skeleton,
  shimmer, or visual indicator — the app appears frozen on slow connections.
- **Section spacing rhythm is inconsistent**: some screens use `gap: Spacing.four` (24 px)
  between sections while others use `Spacing.two` (8 px) or `Spacing.three` (16 px) for
  the same level of visual separation.
- **Buttons used as tabs** (Admin Bookings/Providers toggle, Admin Assign-mode toggle)
  produce tall pill buttons that look out of place; there is no shared tab/toggle component.
- **Empty states** use the `EmptyState` component correctly in most places, but the
  `PhotoGallery` and `ActivityTimeline` fall back to bare muted text, creating an
  inconsistent feel.
- **The splash / welcome screen** relies on a plain emoji (⚡) on Android and an unbranded
  Expo logo inside `AnimatedIcon` — neither reads as premium.
- **Card reuse gaps**: several screens construct ad-hoc `Card` children without the
  established `gap: Spacing.two` or `Spacing.three` inner rhythm; some produce cramped,
  others produce over-spaced layouts.

---

## 2. Cross-cutting Inconsistencies

| Area | Issue | Correct Treatment |
|------|-------|-------------------|
| **Raw `Text` usage** | `Text` from `react-native` imported and used directly in `animated-icon.tsx` (splashWordmark, splashEmoji), `icon-chip.tsx`, `empty-state.tsx` (icon), `collapsible.tsx`, and `search-bar.tsx` (search icon). Bypasses theme color and typography variants. | Replace with `<Text>` from `@/components/ui/text` or, for single-glyph/emoji usages, a themed `<Text variant="…">`. |
| **Loading states** | Every data-fetching screen (`booking/[id].tsx`, `provider/job/[id].tsx`, `admin/booking/[id].tsx`, `admin/provider/[id].tsx`, both chat screens) renders `<Text variant="body" color="textSecondary">Loading…</Text>` directly — no visual affordance. | Replace with a `<ScreenSkeleton />` component (or at minimum an `<ActivityIndicator color={theme.primary} />`) centred in the safe area. |
| **Spacing rhythm — screen titles** | `paddingTop: Spacing.three` (16 px) is used for the title area on bookings/payments/notifications; the home screen uses `paddingTop: Spacing.three` inside a `gap: Spacing.four` container. Onboarding screens use `gap: Spacing.four` throughout. No unified screen-header spacing exists. | Define a `SCREEN_HEADER_PADDING = { paddingTop: Spacing.four, paddingBottom: Spacing.two }` constant and apply it uniformly across all top-level screen headers. |
| **Section spacing inside scrollable detail screens** | `booking/[id].tsx` and `admin/booking/[id].tsx` use `gap: Spacing.three` (16 px) as the scrollview content gap. Logically grouped elements (heading + widget pairs) get the same gap as unrelated sections, so the page feels flat. | Use `gap: Spacing.four` (24 px) between major named sections and `gap: Spacing.two` (8 px) between a section heading and its first child. |
| **Typography — bare headings** | Section headings inside scroll screens (`<Text variant="heading">Payment</Text>`, `<Text variant="heading">Photos</Text>`, `<Text variant="heading">Activity</Text>`, `<Text variant="heading">Assign Provider</Text>`, etc.) are rendered without any visual separation or weight distinction from body text items above. | Add `marginTop: Spacing.four` on the first section heading or use a shared `<SectionHeading>` wrapper with a top margin token. |
| **`SectionHeader` margin vs gap** | `src/components/ui/section-header.tsx` applies `marginBottom: Spacing.three` (16 px) to create separation from its children; all other section constructs use `gap` on the parent container. This dual approach means the visual gap below a `SectionHeader` adds up when inside a `gap`-based parent (home screen has `gap: Spacing.two` on the section, plus 16 px from `SectionHeader.marginBottom` = 24 px effective gap, but only 8 px above the header). | Remove `marginBottom` from `SectionHeader` and rely on the parent `gap` consistently, or replace with a `paddingBottom` that participates correctly in gap layout. |
| **Ad-hoc / hardcoded colors** | `animated-icon.tsx` hardcodes `'#FFFFFF'` for splash background and `Colors.light.ink` directly instead of using `useTheme()`. `collapsible.tsx` uses `ThemedText`/`ThemedView` components that are not part of the QuickServe design system. | Splash overlay: use `theme.background` from a themed context. `Collapsible`: migrate to `<Text>` and `<View>` with `useTheme()`. |
| **Card radius inconsistency** | `Card` uses `Radii.lg` (16 px). `IconChip` uses `Radii.md` (12 px). `PhotoThumb` verified pill and `VerifiedBadge` use `Radii.pill`. `MessageBubble` uses `Radii.lg`. `StatusBadge`/`PaymentStatusBadge`/`AttemptStatusBadge` use `Radii.pill`. These are all intentional at the component level, but no visual hierarchy rule is documented. The `Input` uses `Radii.md` (12 px) while the `Button` uses `Radii.pill` (999) — mixing pill buttons with square-ish inputs on the same screen feels inconsistent. | Inputs should use `Radii.lg` (16 px) to match card radius, aligning the "container" family. Only badges and buttons remain pill-shaped. |
| **Button as tab/toggle** | `admin/index.tsx` and `admin/booking/[id].tsx` use `<Button variant="secondary/ghost">` pairs to create tab and mode toggles. These have the same 52–56 px height as action buttons, making the admin interface visually heavy and unreadable. | Extract a `<ToggleBar>` (or `<PillTabs>`) component: a row of lower-height (36 px) pill segments with active/inactive states that does not trigger the same visual weight as a CTA button. |
| **Input gap inconsistency** | `Input` container uses `gap: Spacing.one` (4 px) between label and text field, and between text field and error text. Forms using `Input` add their own `gap: Spacing.three` (16 px) between inputs. The label-to-field gap is uncomfortably tight at 4 px on most device densities. | Change `Input` container gap to `Spacing.two` (8 px) for the label-to-field and field-to-error slots. |
| **Badges — three parallel implementations** | `StatusBadge`, `PaymentStatusBadge`, and `AttemptStatusBadge` are structurally identical (same `StyleSheet`, same padding, same pill shape, same `+ '22'` alpha trick). `VerifiedBadge` and the `ServiceCard` badge are also pill-shaped but use different padding values. The `PhotoThumb` verified pill is a fourth micro-implementation. | Unify into a single `<Pill color={ThemeColor} label={string} />` primitive; each domain badge becomes a thin wrapper that maps its status to a `ThemeColor`. |
| **Loading via bare text vs no state** | `booking/[id].tsx`, `provider/job/[id].tsx`, and `admin/provider/[id].tsx` show `Loading…` while data fetches. `admin/booking/[id].tsx` also shows `Loading…`. Chat screens (`booking/chat/[id].tsx` and `provider/job/chat/[id].tsx`) also show `Loading…`. None of the FlatList screens (bookings, payments, admin/index, admin/payments, admin/payment-attempts) show any loading state at all — the list is just empty until data arrives, indistinguishable from a real empty state. | Add a `loading` boolean to FlatList screens; render a `ListLoadingComponent` (shimmer rows) while data is in-flight, distinct from the true empty state. |
| **EmptyState — inconsistent line-height** | `EmptyState` wraps the icon in a raw `RNText` (not the UI `<Text>`) which picks up the system default line-height. On Android this can clip the emoji baseline. The `gap: Spacing.two` (8 px) between icon and title is too tight. | Use `<Text>` from UI kit for the icon, increase the icon-to-title gap to `Spacing.three` (16 px), and add `lineHeight: icon_fontSize * 1.2` to prevent clipping. |
| **Error states** | All error handling emits a `<Text variant="caption" color="error">` string inline. There is no visual container (error card, alert banner). On screens with many sections the error caption can appear visually lost. | Wrap inline errors in a light red tinted `View` with `Radii.md` padding and left border accent, similar to common toast/banner patterns. |
| **Tab bar icons** | `app-tabs.tsx` (customer) and `provider/(tabs)/_layout.tsx` (provider) both use the same `explore.png` icon for Bookings, Payments, Notifications, and Profile tabs. Only "Home" has a distinct icon (`home.png`). This makes the tab bar visually ambiguous. | Source/create distinct icon assets for each tab: a calendar for bookings, a wallet for payments, a bell for notifications, a person for profile, and a briefcase for provider jobs. |
| **Collapsible uses non-system components** | `src/components/ui/collapsible.tsx` imports `ThemedText` and `ThemedView`, which are Expo starter-kit components unrelated to the QuickServe design system. It is not used in any current screen, but it sits in `src/components/ui/` as if it is part of the kit. | Remove or rewrite using the QuickServe `<Text>` and `useTheme()` pattern. |

---

## 3. Per-area Findings

### 3.1 Auth / Onboarding

**Files:** `src/app/(onboarding)/welcome.tsx`, `login.tsx`, `register.tsx`, `role-select.tsx`

- `welcome.tsx` — The hero icon is a raw `<RNText style={styles.mark}>⚡</RNText>` at 64 px with no background, shadow, or brand treatment. The wordmark "QuickServe" is plain `display` variant text with no gradient or letter-spacing. The layout is `justifyContent: 'space-between'` so the CTA button is always at the very bottom — on short screens this looks fine; on tall screens the content floats loosely in the centre third with no brand cohesion.
  - **Correction:** Give the emoji mark a circular `primaryTint` background container (80 px circle, `Radii.pill`). Add `letterSpacing: 1` to the display text. Move the "Get Started" button to sit closer to the wordmark with a fixed `marginTop: Spacing.six` (64 px) gap rather than using `space-between`.

- `login.tsx` — The "Welcome back" title uses `variant="title"` with no icon or brand element. The form gap is `Spacing.three` (16 px), which is appropriate but the auth-error caption appears directly below the button with no visual separation from the link row below it.
  - **Correction:** Add `marginVertical: Spacing.two` wrapper around the auth-error text to separate it visually.

- `register.tsx` — `safe` style hardcodes `backgroundColor: 'transparent'` directly in `StyleSheet`, bypassing `theme.background`. On dark mode this makes the form background transparent over whatever is below.
  - **Correction:** Remove `backgroundColor: 'transparent'` from `styles.safe` and apply `{ backgroundColor: theme.background }` inline as all other screens do.

- `role-select.tsx` — Role cards use `Card` with `gap: Spacing.two` (8 px) between cards in `list`. Each card's internal `row` has `gap: Spacing.three` (16 px) horizontally. There is no selected/active visual state on the card — a user could tap and navigate without knowing which card they chose.
  - **Correction:** Not a logic change — add a `primaryTint` border or ring to the card when it is the currently selected role (visual feedback only).

---

### 3.2 Customer Home

**File:** `src/app/(customer)/index.tsx`

- The screen `header` has `gap: Spacing.one` (4 px) between title and subtitle — this is very tight. The greeting title and subtitle appear to be on the same baseline.
  - **Correction:** Change `header` gap to `Spacing.two` (8 px).

- The `section` style uses `gap: Spacing.two` (8 px), meaning `SectionHeader` (which adds `marginBottom: Spacing.three` = 16 px internally) sits only 8 px below the previous section content. The cumulative visual gap above a section heading is 8 px (from parent gap) while the gap below it to the first card is 16 px. This is inverted — the gap below a heading should be smaller than the gap above it.
  - **Correction:** Change `section` gap to `Spacing.four` (24 px) and strip `marginBottom` from `SectionHeader` (see §2 cross-cutting note).

- `popularItem` is fixed at `width: 220` — on small-screen phones (360 dp wide) this means only one card is visible at a time with no peekaboo. The horizontal scroll has no visual cue that more items exist.
  - **Correction:** Visual — reduce `popularItem` width to 180 dp and add a subtle fade gradient overlay on the right edge of the horizontal scroll container.

- The home screen has no visual greeting personalisation (no avatar, no first-name). The header is purely text.
  - **Correction (visual only):** Reserve the right side of the header row for a small `Avatar` component so the header reads as personal and premium. No data change — the component already supports `null` for no-photo initials.

---

### 3.3 Customer Bookings

**File:** `src/app/(customer)/bookings.tsx`

- No loading state. The `FlatList` is empty until `getCustomerBookings()` resolves — indistinguishable from the "No bookings yet" empty state.
  - **Correction:** Add `const [loading, setLoading] = useState(true)` and a `ListEmptyComponent` that conditionally renders a skeleton list or the `EmptyState`.

- Each booking card displays service title (`variant="heading"`), then `StatusBadge`, then date (`variant="caption"`). The heading-to-badge-to-caption vertical rhythm uses `gap: Spacing.two` (8 px) uniformly — the badge is visually competing with the service name for prominence.
  - **Correction:** Restructure card interior: service title at `variant="label"` with the date on the same row right-aligned, and `StatusBadge` on a second line. Use `gap: Spacing.one` (4 px) between elements.

---

### 3.4 Customer Payments

**File:** `src/app/(customer)/payments.tsx`

- Structurally identical to `bookings.tsx` (same pattern, same issues). No loading state.
- Payment card shows amount as `variant="heading"` (18 px, 600 weight) — for a financial figure this should be `variant="title"` (24 px, 700 weight) to give monetary amounts appropriate visual weight.
  - **Correction:** Use `variant="title"` for KES amounts in payment list cards, consistent with `QuoteCard` which already uses `variant="title"` for the amount.

---

### 3.5 Customer Notifications

**File:** `src/app/(customer)/notifications.tsx`, `src/components/ui/notification-list.tsx`, `notification-row.tsx`

- `NotificationRow` uses `variant="heading"` (18/24, 600) for the notification title. This is oversized for a list row — `heading` should be reserved for section-level labels.
  - **Correction:** Change `NotificationRow` title to `variant="label"` (14/20, 500).

- The unread dot is 10×10 px — at this size it is easy to miss on devices with low-contrast screens. It also aligns to `flex-start` of the row, meaning it is vertically centred to the card's top rather than the title text.
  - **Correction:** Increase dot to 8×8 px (keeps compact) but align it to `center` vertically relative to the title text by wrapping title+dot in a flex row.

- Read notifications use `opacity: 0.7` on the card — this produces a noticeably washed-out appearance for long lists where most notifications are read, making the whole screen feel low-contrast.
  - **Correction:** Change dimming to `opacity: 0.85` (subtle) or prefer a lighter border vs dimming the entire card.

---

### 3.6 Customer Profile

**File:** `src/app/(customer)/profile.tsx`

- This screen is a placeholder: only a title, a muted sentence, and a sign-out button. It has no avatar, no user details (name, email), no account actions beyond sign-out.
  - **Correction (visual only):** Add the user's `Avatar` component at the top with the display name and email from `session.user`, even as read-only display. This requires no schema or permission changes — the data is in `useAuth()`.

---

### 3.7 Booking Flow — Address, Schedule, Notes, Review, Success

**Files:** `src/app/booking/address.tsx`, `schedule.tsx`, `notes.tsx`, `review.tsx`, `success.tsx`

- All four flow steps share the same `SafeAreaView` + `padding: Spacing.four` + `gap: Spacing.four` pattern. This is consistent — good. However none of the flow screens show a **step indicator** (e.g. "Step 2 of 4"), which means the user has no sense of progress.
  - **Correction (visual only):** Add a `<StepDots totalSteps={4} currentStep={n} />` component below the screen title on each step screen. No logic change — purely decorative dots or a progress bar.

- `schedule.tsx` — the selected date is displayed as plain `<Text variant="body" color="textSecondary">`. After picking a date, the confirmation text appears as muted body text with no visual emphasis. It looks like filler.
  - **Correction:** Wrap the selected date/time in a light `primaryTint` background pill or card row so it reads as a confirmed selection.

- `notes.tsx` — the photo list shows raw URI strings (`<Text variant="caption" numberOfLines={1} style={styles.photoUri}>`). These URIs are long file-system paths that the user cannot parse at a glance.
  - **Correction:** Replace the URI label with a thumbnail preview using the existing `PhotoThumb` component (already available in the UI kit) at 60×60 px. No data change — `uri` is already a local image URL that `Image` can render.

- `success.tsx` — the success emoji (`🎉`) is rendered via `<Text style={styles.emoji}>` using raw `RNText` from `react-native`. The `styles.emoji` applies `fontSize: 56` but no `lineHeight` or `textAlign`, causing inconsistent vertical alignment across devices.
  - **Correction:** Use `<Text variant="display" style={{ fontSize: 56, textAlign: 'center' }}>` from the UI kit for the emoji, with explicit `lineHeight: 64`.

---

### 3.8 Booking Detail + Chat

**Files:** `src/app/booking/[id].tsx`, `src/app/booking/chat/[id].tsx`

- **Loading state:** `if (!booking)` falls back to bare `Loading…` text in a full-screen safe area with no layout.
  - **Correction:** Replace with a centred `<ActivityIndicator size="large" color={theme.primary} />`.

- **Section structure:** The detail screen has twelve distinct named sections rendered as direct children of `ScrollView contentContainerStyle` with `gap: Spacing.three`. Section headings (`<Text variant="heading">Payment</Text>`, etc.) sit adjacent to their content with the same 16 px gap as the gap between unrelated sections above and below them. The page is a flat linear dump.
  - **Correction:** Group each named section (Payment, Assigned Professional, Photos, Activity, Your Review) in a `<View style={{ gap: Spacing.two }}>` wrapper, and give the content container `gap: Spacing.four` (24 px) between groups.

- **Payment section:** The M-Pesa block (`Input` + `Button` + ghost disabled "Card — coming soon" button) is rendered without any surrounding card or visual container. The disabled "Card — coming soon" `Button` with `variant="ghost"` and `disabled` shows at 50% opacity with the same visual weight as the active M-Pesa button.
  - **Correction (visual):** Wrap the M-Pesa initiation block in a `Card` component. Style the "coming soon" button as a `caption` label instead of a disabled ghost button.

- **Chat screen (`booking/chat/[id].tsx`):** The screen wraps the `ChatThread` inside a `SafeAreaView` with `padding: Spacing.four`. `ChatThread` itself also applies `padding: Spacing.four` to its container. This creates **double padding** (48 px on each side) around the chat UI.
  - **Correction:** Remove `padding: Spacing.four` from the `safe` style in `booking/chat/[id].tsx` (and `provider/job/chat/[id].tsx`) — `ChatThread` already handles its own padding.

- **`ChatThread` input label:** The send `<Input>` is called with `label=""` (empty string label). The `Input` component always renders a `<Text variant="label">` even when empty, producing an invisible 20 px tall empty space above the text field.
  - **Correction:** Make `Input` label optional (`label?: string`) and skip the label render when it is absent or empty.

---

### 3.9 Provider — Tabs / Jobs / Earnings / Profile

**Files:** `src/app/provider/(tabs)/index.tsx`, `profile.tsx`, `notifications.tsx`, `src/app/provider/job/[id].tsx`, `provider/job/chat/[id].tsx`

- **Provider home header:** The "My Jobs" header row uses `justifyContent: 'space-between'` with the title on the left and a "Sign out" ghost button on the right. On narrow screens the button sits immediately next to the title with no breathing room, and there is no visual hierarchy separating navigation from content.
  - **Correction:** Move the "Sign out" to the profile tab and remove it from the jobs header. This is a presentation change (de-cluttering) not a functional change.

- **Provider profile — hero section:** The avatar, name, verified badge, and job count are stacked with `gap: Spacing.two` (8 px) inside a `hero` view with `paddingBottom: Spacing.three`. The avatar is 80 px with a plain `backgroundElement` fill for the initials fallback. There is no shadow, ring, or elevation to make it prominent.
  - **Correction:** Add `Shadows.card` to the avatar initials fallback `View`. Increase `paddingBottom: Spacing.four` in the hero. Add `letterSpacing: 0.5` to the provider name `Text`.

- **Provider profile — Ratings section:** `<Text variant="heading">Ratings</Text>` is followed by `<RatingStars>` and then `ReviewCard` list — all with `gap: Spacing.two`. When there are many reviews the heading blends into the list without separation.
  - **Correction:** Apply `gap: Spacing.three` (16 px) between the section heading and the first item; `gap: Spacing.two` (8 px) between review cards.

- **Provider profile — Earnings section:** The `earningsSummary` card uses `<Text variant="body">` for "Pending: KES X.XX" and "Paid: KES X.XX". These amounts deserve more visual weight. The card uses `style={styles.section}` which only defines `gap: Spacing.two` — there is no dedicated earnings card design.
  - **Correction (visual):** Use `variant="heading"` for the KES amounts inside the earnings summary card, and `variant="caption" color="textSecondary"` for the label on the same line.

- **Provider profile — availability toggle:** The toggle button text "Available" / "Unavailable" appears as a standard primary/ghost `Button`. Its state is not visually obvious — the `primary` variant is green (available) and `ghost` has no fill (unavailable). There is no `◯ / ●` icon or toggle affordance.
  - **Correction (visual):** Prefix the button label with a status dot: "● Available" / "○ Unavailable". No logic change.

- **Provider job chat (`provider/job/chat/[id].tsx`):** Same double-padding issue as customer chat (see §3.8).

---

### 3.10 Admin — Index / Booking / Provider / Payments / Payment Attempts

**Files:** `src/app/admin/index.tsx`, `admin/booking/[id].tsx`, `admin/provider/[id].tsx`, `admin/payments.tsx`, `admin/payment-attempts.tsx`

- **Admin index tab toggle:** Bookings/Providers toggle is two full-height `Button` components in a `flexDirection: 'row'` row. At 52 px height each, this bar consumes significant vertical real estate.
  - **Correction:** See §2 — replace with a `<ToggleBar>` at 36 px height.

- **Admin index header:** The header row contains three inline elements: `<Text variant="title">Admin</Text>`, `<Button label="Payments" variant="ghost">`, and `<Button label="Sign out" variant="ghost">`. With `justifyContent: 'space-between'` on a narrow screen these overlap or wrap awkwardly.
  - **Correction (visual):** Move "Payments" navigation to a dedicated admin navigation structure (e.g. a row of action chips below the title) rather than in the header bar.

- **Admin booking detail — Update Status section:** All booking statuses are rendered as ghost/secondary buttons in a `flexDirection: 'row', flexWrap: 'wrap'` layout. Up to nine status buttons are rendered at once, creating a visually overwhelming grid of pill buttons.
  - **Correction (visual):** Use a horizontal `ScrollView` (single-line) of compact status chips (height 32 px) rather than a wrapping grid.

- **Admin booking detail — Assign Provider (in-app mode):** Approved providers are listed as `Card` rows with `heading` + `caption`. There is no differentiation between the card list in assign-mode and the booking cards above — they look identical, which is confusing in context.
  - **Correction (visual):** Give assign-mode provider cards a `Radii.md` (smaller) radius and a left-side `primary`-tinted accent border to distinguish them from booking cards.

- **Admin provider detail — profile card alignment:** `profileCard` uses `alignItems: 'flex-start'`. The avatar (56 px), heading, verified badge, and job count are all left-aligned inside the card — this looks like a list item rather than a profile header.
  - **Correction:** Change `profileCard` to `alignItems: 'center'` for a centred profile header layout matching the provider self-view (`profile.tsx` hero section).

- **Admin payments — payment card layout:** Each card renders 6–8 `caption`-variant text rows (amount, badge, provider split, method, ref, date, then 4 override buttons). The density is very high with only `gap: Spacing.two` (8 px) separating lines.
  - **Correction (visual):** Group metadata rows into two columns using a mini grid (amount+badge left, ref+date right) and use a hairline separator before the action buttons row.

- **Admin payment-attempts — dense metadata:** Similar to payments — up to 8 `caption` lines per card. The `checkout_request_id` and `result_code`/`result_desc` lines appear raw with no formatting boundary.
  - **Correction (visual):** Wrap the technical metadata block (checkout ID, result code, result description, callback time) in a `backgroundElement`-tinted inner `View` with `Radii.sm` and `Spacing.two` padding to separate operational metadata from the primary amount/status display.

---

### 3.11 Photos

**Files:** `src/components/ui/photo-gallery.tsx`, `photo-thumb.tsx`, `photo-upload-button.tsx`

- `PhotoGallery` renders "No photos yet" as a bare `<Text variant="caption" color="textSecondary">`. This is inconsistent with `ActivityTimeline` (which renders "No activity yet" as body text) and with `EmptyState` elsewhere.
  - **Correction:** Render a small `EmptyState` or at minimum a captioned `View` with an icon (e.g. 📷) and "No photos yet" centred, at consistent height with other section empty states.

- `PhotoThumb` thumb is fixed at `90×90` px. The verified pill badge overlaps nothing (it is stacked below via `gap: Spacing.one`) but the wrapper uses `alignItems: 'center'` while the verify pill uses `paddingHorizontal: Spacing.two` — on small screen widths the pill text can wrap.
  - **Correction:** Add `numberOfLines={1}` to the verified pill `<Text>` to prevent wrapping.

- `PhotoUploadButton` shows the error text with `marginTop: Spacing.half` (2 px) above the text — this is too tight and the error caption can be confused for a button subtitle.
  - **Correction:** Change `errorText` `marginTop` to `Spacing.two` (8 px).

---

### 3.12 Reviews

**Files:** `src/components/ui/review-card.tsx`, `rating-stars.tsx`, `star-input.tsx`

- `ReviewCard` does not show the reviewer name or avatar — only rating, comment, and date. On the admin provider detail screen where multiple reviews are listed, they are indistinguishable from each other without name context.
  - **Correction (visual only):** Pass reviewer name as an optional prop to `ReviewCard` and render it as `variant="label"` above the stars if provided. No schema change — `review.reviewer_name` or similar can be added as a display field when the data source supports it.

- `RatingStars` uses Unicode `★` and `☆` at `variant="body"` (fontSize 16). These glyphs render with inconsistent vertical alignment across Android fonts — the star baseline shifts.
  - **Correction:** Add `lineHeight: 20` override to the individual star `<Text>` via `style` prop to anchor the baseline.

- `StarInput` star targets are `Pressable` without any `hitSlop`. On mobile, individual stars at `body` size (16 px) are very small tap targets.
  - **Correction:** Add `hitSlop={8}` to each `Pressable` in `StarInput` for a minimum 32 px tap zone.

---

### 3.13 Splash & Home First Impression

**Files:** `src/components/animated-icon.tsx`, `src/app/(onboarding)/welcome.tsx`

#### Current state problems

1. **`AnimatedSplashOverlay` (Android):** Shows a 72 px emoji `⚡` on a plain white background with `Typography.title` wordmark in `Colors.light.ink`. There is no brand container, gradient, depth, or animation beyond the white overlay fading out. On Android the emoji is rendered by the system emoji font which varies greatly across OEM skins.

2. **`AnimatedIcon`:** Uses the Expo boilerplate (`expo-logo.png` + `logo-glow.png`) with a blue gradient background (`#3C9FFE → #0274DF`). This is Expo brand colours (blue), completely unrelated to QuickServe's primary green (`#00875A`). The `AnimatedIcon` is referenced in `_layout.tsx` only via `AnimatedSplashOverlay` — `AnimatedIcon` itself is not rendered on any live screen.

3. **`welcome.tsx`:** The hero is a plain ⚡ emoji at 64 px with the wordmark below. Below that is just the tagline. The CTA button sits at the very bottom. First-time users see a mostly empty white screen with a small emoji — this does not convey premium, speed, or on-demand service.

#### What the overhaul should achieve

- Replace the splash overlay background with `primaryTint` (#E7F7F0 light / #10271F dark) so the brand green is the first colour the user perceives.
- Replace the emoji on Android with a proper SVG or image icon in brand green.
- On iOS: the existing `SymbolView("bolt.shield.fill")` tinted `primary` is good — keep it.
- `AnimatedIcon` should be removed or rebuilt with QuickServe brand assets (green gradient, QuickServe icon) rather than Expo assets.
- `welcome.tsx` hero: add a visual element (illustrated card, brand mark with background circle) between the wordmark and the tagline to fill vertical space and anchor the premium feel.
- The welcome screen "Get Started" button should be `size="lg"` (56 px height) — it is currently `size="md"` default (52 px), which is the same as a normal action button.

---

## 4. Correction Backlog (T4–T11 Checklist)

### Component Kit Polish (affects all screens)

- [ ] **CRIT** Unify `StatusBadge` / `PaymentStatusBadge` / `AttemptStatusBadge` / `VerifiedBadge` / `PhotoThumb.verifiedPill` / `ServiceCard.badge` into a single `<Pill>` primitive
- [ ] **CRIT** Fix `EmptyState`: use UI kit `<Text>` for emoji icon; increase icon-to-title gap to `Spacing.three`
- [ ] **CRIT** Fix `Input`: change container `gap` to `Spacing.two`; make `label` prop optional; change border-radius to `Radii.lg`
- [ ] **CRIT** Replace all bare `RNText` imports in `animated-icon.tsx`, `icon-chip.tsx`, `empty-state.tsx`, `search-bar.tsx` with UI kit `<Text>` or remove raw import
- [ ] Add `<ScreenSkeleton />` / `<ActivityIndicator>` loading pattern to replace all bare "Loading…" text fragments
- [ ] Add `hitSlop={8}` to `StarInput` star `Pressable` targets
- [ ] Add `lineHeight: 20` to `RatingStars` individual star `<Text>`
- [ ] Fix double-padding in chat screens: remove outer `padding: Spacing.four` from `safe` in `booking/chat/[id].tsx` and `provider/job/chat/[id].tsx`
- [ ] Extract `<ToggleBar>` / `<PillTabs>` component at 36 px height (used in admin index, admin booking detail assign-mode)
- [ ] Fix `SectionHeader`: remove `marginBottom: Spacing.three`, rely on parent `gap`
- [ ] Fix `Collapsible`: migrate from `ThemedText`/`ThemedView` to QuickServe `<Text>` + `useTheme()`, or remove from `src/components/ui/`
- [ ] Add `numberOfLines={1}` to `PhotoThumb` verified pill `<Text>`
- [ ] Change `PhotoUploadButton` error `marginTop` to `Spacing.two`
- [ ] Fix `PhotoGallery` empty state — use `EmptyState` or icon+caption view

### Splash & Welcome

- [ ] **CRIT** Rebuild `AnimatedSplashOverlay`: use brand green assets; replace blue Expo gradient in `AnimatedIcon` with QuickServe green; remove `expo-logo.png` dependency
- [ ] Replace Android splash emoji `⚡` with SVG/PNG brand mark
- [ ] Welcome screen: wrap emoji mark in a circle container with `primaryTint` background
- [ ] Welcome screen: change "Get Started" button to `size="lg"`
- [ ] Welcome screen: fix `justifyContent: 'space-between'` — use fixed spacing instead

### Auth / Onboarding

- [ ] `register.tsx`: remove hardcoded `backgroundColor: 'transparent'` from `styles.safe`
- [ ] Add step indicator (`<StepDots>`) to booking flow screens (address, schedule, notes, review)
- [ ] `login.tsx`: add `marginVertical: Spacing.two` wrapper on auth-error text

### Customer Screens

- [ ] Home screen: fix `header` gap from `Spacing.one` to `Spacing.two`
- [ ] Home screen: fix `section` gap from `Spacing.two` to `Spacing.four`; strip `SectionHeader.marginBottom`
- [ ] Home screen: add avatar placeholder to header row for personalisation
- [ ] Home screen: reduce `popularItem` width; add right-edge scroll fade
- [ ] Bookings screen: add `loading` state; differentiate skeleton from empty state
- [ ] Bookings screen: restructure card interior (label + right-aligned date, badge below)
- [ ] Payments screen: change amount `variant` from `heading` to `title` in list cards
- [ ] Payments screen: add `loading` state
- [ ] Notifications: change `NotificationRow` title to `variant="label"`
- [ ] Notifications: fix unread dot size to 8×8 and alignment; change `opacity: 0.7` to `opacity: 0.85`
- [ ] Profile: add `Avatar` + name + email from session (visual only)
- [ ] Schedule screen: wrap selected date in a `primaryTint` confirmation chip
- [ ] Notes screen: replace URI strings with `PhotoThumb` preview at 60×60 px
- [ ] Success screen: fix emoji `Text` — use UI kit, add `lineHeight: 64`

### Booking Detail

- [ ] Add `ActivityIndicator` loading screen for `booking/[id].tsx`
- [ ] Group sections into `<View>` wrappers with `gap: Spacing.two`; change content container gap to `Spacing.four`
- [ ] Wrap M-Pesa initiation block in `Card`
- [ ] Replace "Card — coming soon" ghost button with a `caption` text label

### Provider Screens

- [ ] Provider home: remove "Sign out" from jobs header; move to Profile tab
- [ ] Provider profile hero: add `Shadows.card` to initials avatar; increase hero `paddingBottom`; add `letterSpacing: 0.5` to name
- [ ] Provider profile ratings: increase gap between section heading and first review card
- [ ] Provider profile earnings: use `variant="heading"` for KES amounts
- [ ] Provider profile availability toggle: prefix label with status dot

### Admin Screens

- [ ] Admin index: replace tab toggle with `<ToggleBar>` at 36 px height
- [ ] Admin index: restructure header — move "Payments" link below title
- [ ] Admin booking detail: replace status grid with horizontal compact chip `ScrollView`
- [ ] Admin booking detail: add visual distinction to in-app assign provider cards
- [ ] Admin provider detail: change `profileCard` to `alignItems: 'center'`
- [ ] Admin payments: restructure card into two-column metadata + separator before actions
- [ ] Admin payment-attempts: wrap technical metadata in `backgroundElement` inner block

### Tab Bar

- [ ] Source distinct icons for: Bookings (calendar), Payments (wallet), Notifications (bell), Profile (person), Provider Jobs (briefcase)
- [ ] Replace duplicate `explore.png` usage in `app-tabs.tsx` and `provider/(tabs)/_layout.tsx`
