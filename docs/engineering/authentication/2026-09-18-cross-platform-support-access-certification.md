# Cross-platform support access — certification record (2026-09-18)

> **Status:** the support-access implementation on PR #21 is **certified in QA** on the deployed
> Auth bridge, on a **physical iPhone**, on a **clean Android 16 emulator** and on a **physical
> Galaxy S24**. The **iOS Simulator** gate **FAILED** for a pre-existing harness reason and did
> **not** certify simulator UI. The **website** change is committed and tested but **not deployed**.
> This is **not** a Production-readiness or launch claim, and PR #21 remains a **draft that must not
> merge** — see [§9](#9-outstanding-issues).

This record **supersedes, for support access only**, follow-up 6 of the
[2026-09-16 branded QA auth bridge certification](2026-09-16-qa-branded-auth-bridge-certification.md)
("Support access across app and website surfaces remains outstanding"). That earlier record is left
unchanged as historical evidence; its other findings stand.

Only public values appear here: commit SHAs, deployment and build ids, public hostnames, artifact
SHA-256 values and the public support address. No project reference, fixture identity, password,
key, token or account identifier is recorded.

## 1. What was implemented

| Commit | Scope |
| --- | --- |
| `8d0b029b4be481e4323ebf6e3ba9d1168cc90521` | **Website:** support address is now `support@hiredcorp.co.ke` on every audited surface; false in-app-chat claims removed from the FAQ and Support page |
| `e042003d2ae3fc8edf5190de431b5f3aaaf20bd1` | **App:** shared support constant and `SupportLink`; global error boundary, `/auth/recovery` and `/auth/confirm` invalid states, a new `+not-found` screen, customer and provider Profile, and the web Auth bridge's invalid and handoff-failure branches |
| `06e4ffe3b05eebfdbaacc5877ded706265789b2e` | **App:** the web build renders a genuine static `<a href="mailto:…">` (react-native-web does not map `accessibilityRole="link"` to an anchor); lint returned to its baseline |
| `8f11bafde3bd8b1ae49ae29ec71d0155518754b6` | **CI only:** the iOS auth-routes gate takes a caller-supplied build identity instead of a pinned UUID |

The mailto target is a single constant built with **no arguments**: no query, fragment, subject,
body, route, error, token or user data can enter it. That is enforced by construction and by tests.

**Application runtime source is `06e4ffe3`.** `8f11baf` changes only
`.github/workflows/ios-auth-routes-smoke.yml`, `.github/workflows/ios-item-m-scheme.yml` and their
two workflow-contract tests; production application source is byte-identical between the two
commits. Artifacts built from `8f11baf` therefore carry the same application code as those built
from `06e4ffe3`.

**Website tests passed** (Website Vitest in PR CI). The website change has **not been deployed**:
the live public website is **not** certified by this record and may still show the old address.

## 2. Certified artifacts

### Deployed QA Auth bridge (support-enabled)

| Item | Value |
| --- | --- |
| Source application commit | `06e4ffe3b05eebfdbaacc5877ded706265789b2e` |
| Aggregate manifest SHA-256 | `905f5003bcbda3fcf1f9f79d1ab3ea53a3c9148802d86a2fa5f3a1872759b3e2` |
| QA Workers deployment | `c34caadb-e700-43b5-a1b3-50b9a94fa436` |
| QA Workers version | `92cca1a5-c6e1-4138-bf21-4a81c16eb59b` |
| QA Pages deployment | `057675a8-561e-4680-952d-080476f63369` |
| Branded origin | `https://links.auth-qa.hiredcorp.co.ke` |

These supersede, as the **served** bytes, the 2026-09-16 Pages deployment
`cd3d30b9-9e18-429b-8ffb-d0d5df8b7fff`, which remains the historical record of the earlier
certification.

### Mobile artifacts

| Artifact | EAS build | Source | SHA-256 |
| --- | --- | --- | --- |
| iOS physical-device IPA (internal preview) | `516e7576-b464-4bec-9b8d-fa20da6070fc` | `06e4ffe3` | `38a3eb52953123c05eb014ac7acb69b2cfed80c016145701c545e8ebcbda16d7` |
| iOS Simulator artifact | `9c1cee63-d64c-496e-bbfc-af9b3d421aa2` | `8f11baf` | `75f9c7ed5513f449b34284c4533a3efac31b85fc5ade9d3791412b8c51520390` |
| Android preview APK | `0871ee61-cb0d-4748-9292-5557c6cfe2ec` | `8f11baf` | `9e51517d0b27ffa41abc40077f41b3806af6ccf63f90cc055f3307682c51caf5` |

Android APK: package `ke.co.hiredcorp.kwikserve`, version `1.0.0`, versionCode `3`.

## 3. Deployed bridge — certified

- The Workers origin, the Pages origin and the branded origin `links.auth-qa.hiredcorp.co.ke`
  serve **identical frozen support-enabled bytes**; all **seven** shared assets are byte-identical
  across the three.
- Both Auth documents (`/auth/recovery`, `/auth/confirm`) contain a **genuine static `mailto:`
  anchor** to `support@hiredcorp.co.ke`, present in the statically rendered HTML.
- The address is readable on the page as text.
- No query, fragment, subject, body, route, error, token or user data enters the `mailto:`.
- The full fail-closed runtime security / routing / query / header matrix **passed** (the matrix
  defined in [`infra/qa-auth-bridge/README.md`](../../../infra/qa-auth-bridge/README.md)).
- The bridge **invalid** state is **runtime-certified**.
- The bridge **handoff-failure** support state is covered by **Jest/component tests only**; it was
  not forced at runtime.

## 4. Physical iPhone — certified

Internal iOS preview IPA `516e7576-b464-4bec-9b8d-fa20da6070fc` (source `06e4ffe3`). No iPhone model
was recorded, so none is claimed.

1. Installed successfully **over the existing app**.
2. Launched without crashing, to **Welcome/Login**.
3. `kwikserve://auth/recovery` routed; the recovery **invalid/expired** UI rendered with the
   support address visible.
4. Tapping support opened the **mail composer** with the recipient exactly
   `support@hiredcorp.co.ke`, **no subject and no body**. **No email was sent.**
5. `kwikserve://auth/confirm` routed; the confirmation **invalid/expired** UI rendered with the
   support address visible.
6. A signed-out unknown route returned safely to **Welcome/Login**.
7. Customer sign-in, Home and Profile passed; the customer Profile support `mailto:` passed.
8. The authenticated **not-found** screen rendered with support access.
9. Provider sign-in, dashboard and Profile passed; the provider Profile support `mailto:` passed.
10. The final provider sign-out returned to **Welcome/Login**.

## 5. iOS Simulator — NOT certified (harness failure)

- Simulator artifact identity **passed**, and the reusable gate's identity checks **passed**
  (all three identity values required and format-checked; EAS metadata, SHA-256 download
  verification, bundle identity and scheme registration all succeeded).
- GitHub Actions run
  [`35214246534`](https://github.com/crsdmudu-dot/QuickServe/actions/runs/35214246534)
  (**iOS Item M — kwikserve:// scheme gate (focused)**, `workflow_dispatch`, head `8f11baf`)
  concluded **failure**: step 13, *Recovery route refuses a link with no parameters*, failed because
  `simctl openurl` did **not** foreground the app. The screenshot and UI hierarchy showed
  **Springboard**. The confirmation-route steps were skipped as a consequence.
- The same harness failure **predates** the support work and was seen across earlier commits.
- **No crash report** was found (the no-crash step succeeded).
- **Simulator native UI was not certified.** Runtime certification on iOS comes from the physical
  iPhone in §4, not from the simulator. This run must not be cited as green.

## 6. Android emulator — certified

Clean **Android 16 / API 36, x86_64** emulator, Android preview APK
`0871ee61-cb0d-4748-9292-5557c6cfe2ec`.

1. The exact APK identity was verified **before install**.
2. Baseline launch passed.
3. Recovery and confirmation **cold launches** passed; both invalid states displayed the support
   address.
4. The `mailto:` intent launched **Gmail** with no query and no fragment. The literal recipient was
   **OS-redacted in the logs**, so the emulator log is **not** evidence of the exact address; the
   exact-recipient observation comes from the physical devices (§4, §7).
5. Customer Home and Profile, the authenticated not-found screen, and the provider dashboard and
   Profile passed.
6. Every sign-out returned to **Welcome/Login**.
7. **Zero** crashes, ANRs or fatal JavaScript errors.
8. No email was sent and no data-creation journey was run.

## 7. Physical Galaxy S24 — certified

Android preview APK `0871ee61-cb0d-4748-9292-5557c6cfe2ec`.

1. Android's installer presented an **Update** operation, and the new APK updated the legacy
   installed app successfully.
2. Launched without crashing, to **Welcome/Login**.
3. Recovery route, invalid state and visible support address passed.
4. Tapping support opened the mail application with the **exact** recipient
   `support@hiredcorp.co.ke` and **no subject and no body**.
5. Confirmation route, invalid state and visible support address passed.
6. A signed-out unknown route returned to **Welcome/Login**.
7. Customer sign-in, Home, Profile and Profile support `mailto:` passed.
8. The authenticated not-found screen passed.
9. Provider sign-in, dashboard, Profile and Profile support `mailto:` passed.
10. The final sign-out returned to **Welcome/Login**.
11. **No email was sent.**

**Scope of the Android results.** §6 and §7 certify the support-access surfaces and the handling of
**invalid** Auth links on Android. They do **not** certify an emailed recovery or confirmation link
with a live token on Android; no Auth email was sent in this certification.

## 8. Coverage limits

Stated so this record is not read as stronger than the evidence:

- The **global error boundary** support link is covered by Jest but was **not** deliberately
  triggered on a physical device.
- The bridge **handoff-failure** state is covered by component tests but was **not** manually
  forced.
- **Signed-out** unknown routes intentionally resolve to **Welcome/Login** (no not-found screen is
  shown to a signed-out user). **Authenticated** unknown routes render the branded **not-found**
  screen with support access.
- The **live website** is not covered: its change is undeployed.

### Operational note — QA credential exposure and remediation

During the Android certification, a **local** automation transcript exposed a **shared QA fixture
password**. **No Production credential was exposed.** In response:

- the QA **customer**, **admin**, **provider 1** and **provider 2** passwords were all rotated;
- all four are now **distinct strong passwords**;
- the relevant local and GitHub secret stores were synchronized;
- public sign-in verification **passed** for all four.

No password (old or new), fixture email or secret value is recorded here.

## 9. Outstanding issues

Recorded, not fixed here. None of these is resolved by this record.

1. **Yahoo clean-mailbox placement remains Spam.** Deliverability remediation is separate from Auth
   functionality and remains open.
2. **Recovery links were perceived to expire quickly.** The actual configured lifetime, token
   supersession and security-scanner prefetch behaviour still require investigation.
3. **`QA_SERVICE_ROLE_KEY` in `qa/.env` is stale and returns 401.** Native and backend workflows
   that rely on it are currently impaired.
4. **Production Workers Builds** triggers automatically from `main`, but its selected build token is
   invalid, deleted or rolled. **PR #21 must not merge until the Production release mechanism is
   controlled.**
5. **`applinks:REPLACE_ME.quickserve.app`** remains in the iOS associated-domains entitlement.
   **Universal Links are not certified.**
6. **Website support changes are committed and tested but not deployed.**
7. **Google Cloud billing:** the payment method is expiring; the linked projects and paid APIs still
   need a read-only impact audit and a payment-method update.
8. **PR #21 remains a draft** and requires normal review and approval before merging.

**Production readiness and launch completion are not claimed.** Nothing in this record authorises a
Production change.

## 10. Related documentation

- Previous record (historical, unchanged): [2026-09-16 branded QA auth bridge certification](2026-09-16-qa-branded-auth-bridge-certification.md)
- Authentication architecture: [`README.md`](README.md)
- Bridge implementation, request policy, deployment and rollback: [`infra/qa-auth-bridge/README.md`](../../../infra/qa-auth-bridge/README.md)
