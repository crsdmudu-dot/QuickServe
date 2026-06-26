# Legal & Support — QuickServe Pilot

This document is an operator checklist. Items marked `- [ ]` must be completed before app store
submission or public pilot launch. Items are not code — they require human action (drafting,
hosting, or policy decisions).

---

## 1. Privacy Policy Checklist

A hosted Privacy Policy is **required** by both the Google Play Store and Apple App Store.
It must be publicly accessible via a URL (not gated behind a login).

### Data collected

| Data type | Why collected | Retention |
|-----------|--------------|-----------|
| Email address | Account creation, login, notifications | Until account deletion |
| Phone number | Contact, M-Pesa payment reference | Until account deletion |
| Booking details (service, address, date, notes) | Service fulfillment | 2 years post-completion |
| Payment references (M-Pesa transaction code, amount) | Dispute resolution, receipts | 5 years (financial records) |
| In-app messages (booking chat) | Service coordination between customer and provider | 1 year post-booking |
| Device push token (Expo / FCM / APNs) | Push notifications | Refreshed automatically; deleted on logout |
| Profile data (name, profile photo, provider bio/skills) | App functionality | Until account deletion |
| Ratings and reviews | Quality of service | Indefinitely (public) |
| App usage / crash logs (console only, no external service in pilot) | Bug fixing | Not persisted beyond session |

### Third parties

| Party | Role | Data shared |
|-------|------|------------|
| Supabase (supabase.com) | Database, authentication, storage, realtime | All user and booking data; hosted in agreed region |
| Safaricom Daraja (M-Pesa API) | Payment processing | Phone number, amount, booking reference |
| Expo (expo.dev) | Push notification delivery via Expo Push Service | Push token, notification payload |
| Apple APNs | iOS push delivery (via Expo) | Push token, notification payload |
| Google FCM | Android push delivery (via Expo) | Push token, notification payload |

### Required Privacy Policy sections

- [ ] Identity and contact details of the data controller (QuickServe operator name, email, country).
- [ ] List of data types collected and purpose for each (use the table above as a base).
- [ ] Legal basis for processing (consent, contract performance, legitimate interest — specify per type).
- [ ] Third-party processors listed with links to their privacy policies.
- [ ] Data retention periods for each category.
- [ ] User rights: access, correction, deletion, portability (Kenya DPA 2019 / GDPR if applicable).
- [ ] How to submit a deletion request (email address or in-app form).
- [ ] Cookie / local storage disclosure (if web dashboard is added).
- [ ] Effective date and version number.
- [ ] **Hosted at a public URL** (e.g. `https://quickserve.app/privacy` or a GitHub Pages / Notion page).
- [ ] URL entered in Google Play Console → App content → Privacy Policy.
- [ ] URL entered in App Store Connect → App Information → Privacy Policy URL.

---

## 2. Terms of Service Checklist

### Required ToS sections

- [ ] **Service description:** QuickServe is a platform that connects customers seeking home and
      on-demand services with independent service providers. QuickServe does not itself perform the
      services.
- [ ] **Intermediary model:** QuickServe acts as a marketplace/intermediary only. The contract for
      services is between the customer and the provider. QuickServe is not a party to that contract
      and is not liable for the quality, safety, or outcome of services rendered.
- [ ] **User eligibility:** Users must be at least 18 years old and legally capable of entering
      contracts in their jurisdiction.
- [ ] **User obligations (customers):** Provide accurate booking information; be present at the
      agreed time and place; treat providers respectfully; pay agreed amounts.
- [ ] **User obligations (providers):** Maintain valid licenses/certificates for regulated services
      (electrical, plumbing, etc.); provide services as described; treat customers respectfully;
      complete booked jobs or cancel in advance with notice.
- [ ] **Prohibited conduct:** Fraud, harassment, discrimination, spam, misrepresentation of
      skills or qualifications.
- [ ] **Liability limitation:** QuickServe's liability is limited to the amount paid through the
      platform for the relevant booking. QuickServe is not liable for property damage, personal
      injury, or consequential losses arising from a service.
- [ ] **Dispute resolution:** Disputes between customer and provider are handled first through
      in-app messaging; unresolved disputes can be escalated to QuickServe support (see Section 4).
      QuickServe's decision is final for pilot-period disputes.
- [ ] **Governing law:** Laws of the Republic of Kenya. Courts of Nairobi have exclusive jurisdiction.
- [ ] **Modification:** QuickServe may update these Terms at any time. Continued use after notice
      constitutes acceptance.
- [ ] **Effective date and version number.**
- [ ] **Hosted at a public URL** (e.g. `https://quickserve.app/terms`).
- [ ] URL referenced in the app (Profile → Legal → Terms of Service link).

---

## 3. Support Contact & In-App Placement

### Support channels

| Channel | Details |
|---------|---------|
| Support email | Set up a dedicated address, e.g. `support@quickserve.app` |
| Support phone | Optional for pilot; a WhatsApp number is acceptable |
| Response SLA | Pilot: best effort within 4 h during business hours (EAT) |

### In-app placement recommendation

Add a **Support / Legal** section to the Profile screen (all user types) with the following rows:

- "Contact Support" → open email client with `support@quickserve.app` pre-filled (using
  `Linking.openURL('mailto:support@quickserve.app')`).
- "Privacy Policy" → open the hosted Privacy Policy URL in the in-app browser
  (`expo-web-browser` or `Linking.openURL`).
- "Terms of Service" → open the hosted ToS URL.

**Scope note:** Building these rows is OPTIONAL for this slice. If it can be done trivially (adding
three `Pressable` rows to the existing Profile screen), do it. Otherwise defer to the next slice —
do not create complexity.

- [ ] Support email created and monitored.
- [ ] Support / Legal rows added to Profile screen (or deferred with a ticket).

---

## 4. Refund / Payment Disclaimer

### Pilot payment terms

During the pilot, payments are processed via M-Pesa (Safaricom Daraja). The following terms apply:

- Customers pay the agreed service fee via M-Pesa before or on completion of the service, as
  specified in the booking confirmation.
- QuickServe does not hold or escrow funds; payment goes directly to the provider's M-Pesa number
  (or via a paybill, depending on implementation).

### Refund handling (pilot period)

- Refunds during the pilot are **manual and admin-handled**. There is no automated refund flow.
- If a customer is entitled to a refund (e.g. provider did not show, service was cancelled),
  they contact support at `support@quickserve.app` with the booking ID and M-Pesa confirmation code.
- An admin reviews the case and initiates a manual M-Pesa reversal or transfer within 3–5 business
  days.
- Refund policy must be stated in the ToS and visible at the point of payment.

### Required disclosures

- [ ] Refund policy written and included in the ToS.
- [ ] Refund policy summary shown on the booking Review/Confirm screen (a single line: "Refund
      policy: contact support within 24 h of service date.").
- [ ] Admin has access to M-Pesa Business portal or paybill to process manual reversals.

---

## 5. M-Pesa / Payment Wording (App Store Review)

Apple App Store review can reject apps that appear to process **digital goods or in-app purchases**
outside Apple's IAP system. QuickServe uses M-Pesa for **real-world service payments**, which is
explicitly permitted.

### Required wording guidance

Use the following framing consistently in the app, store listings, and App Store review notes:

> "QuickServe facilitates payment for real-world, in-person services (cleaning, plumbing,
> electrical repair, etc.) via M-Pesa, Safaricom's mobile money service. This is a payment
> for a physical service delivered at the customer's location and does not involve digital
> goods, virtual currency, or in-app purchases."

### Checklist

- [ ] App Store Connect → App Information → Notes for Review: include the M-Pesa real-world service
      statement above.
- [ ] In-app payment screen copy clearly describes the charge as payment for a named physical
      service, not a subscription or digital product.
- [ ] No language like "credits," "tokens," "coins," or "premium unlock" in payment UX.
- [ ] M-Pesa is identified by its full name ("M-Pesa by Safaricom") at least once in the app and
      in the store listing.

---

## 6. Data Safety & App Privacy Questionnaire

### Google Play — Data Safety Form

Complete the Play Console → App content → Data safety section. Guidance for QuickServe:

| Question | Answer |
|----------|--------|
| Does the app collect or share any of the required user data types? | Yes |
| Data collected: Email address | Yes — required, not shared with third parties (except Supabase as processor) |
| Data collected: Phone number | Yes — required for M-Pesa; shared with Safaricom for payment |
| Data collected: Precise location | No (address is entered as text, not GPS) |
| Data collected: Photos / videos | Yes — optional (profile photo, provider portfolio) |
| Data collected: Messages | Yes — in-app chat between customer and provider |
| Data collected: Device or other identifiers | Yes — push tokens |
| Is all data encrypted in transit? | Yes — Supabase uses TLS; Expo Push uses HTTPS |
| Does the user have a way to request data deletion? | Yes — via support email (include this in Privacy Policy) |
| Does the app share data with third parties for advertising? | No |

- [ ] Data Safety form completed and saved in Play Console.
- [ ] Deletion request path documented in Privacy Policy and tested (email to support → admin deletes account in Supabase).

### Apple — App Privacy Questionnaire (App Store Connect)

Navigate to App Store Connect → your app → App Privacy.

| Data type | Collected? | Used for tracking? | Linked to user? |
|-----------|-----------|-------------------|-----------------|
| Contact Info (email, phone) | Yes | No | Yes |
| Financial Info (payment reference) | Yes | No | Yes |
| Photos or Videos | Yes (optional) | No | Yes |
| Messages | Yes (in-app chat) | No | Yes |
| Identifiers (User ID, Device ID) | Yes | No | Yes |
| Usage Data (crash logs) | No (pilot: console only) | No | No |

- [ ] App Privacy questionnaire completed in App Store Connect.
- [ ] Privacy manifest (`PrivacyInfo.xcprivacy`) added if required by Apple (required for iOS 17+ apps using certain APIs — check Expo SDK release notes for your SDK version).
- [ ] NSPhotoLibraryUsageDescription and NSCameraUsageDescription set in `app.config.ts` with clear user-facing text.

---

## 7. Customer / Provider Conduct — Pilot Community Guidelines

These apply for the duration of the pilot and should be communicated to all testers.

### Customers

- Book services in good faith; do not create fake or test bookings without notifying the QuickServe admin.
- Be present and on time for scheduled services.
- Provide honest ratings and reviews; do not submit fraudulent reviews.
- Do not share personal contact information of providers outside the app.

### Providers

- Only accept bookings for services you are qualified and equipped to deliver.
- Communicate clearly through the in-app chat; do not take discussions off-platform during the pilot.
- Upload genuine portfolio/profile photos; no stock photos or misleading images.
- Do not solicit direct payment outside the app; all pilot transactions go through M-Pesa via the app.
- Report any safety concerns immediately to `support@quickserve.app`.

### Both

- No harassment, discrimination, or abusive language in chat or reviews.
- No sharing of other users' personal information.
- Report bugs and unexpected behavior through the designated pilot channel rather than
  creating workarounds.
- Understand that this is a **pilot** — features may change, data may be reset before production launch.

### Pilot data reset notice

> All data entered during the pilot (bookings, reviews, messages, profiles) may be **wiped** before
> the production launch. Do not use real payment information beyond the agreed test amounts.
> QuickServe will notify testers at least 48 hours before any data reset.

- [ ] Community guidelines communicated to all pilot testers (WhatsApp group pinned message or email).
- [ ] Testers have acknowledged the pilot data reset notice.
