# Branded QA authentication bridge — certification record (2026-09-16)

> **Status:** the QA authentication bridge is live on a branded hostname and **both** the
> **recovery** and **signup-confirmation** journeys are certified end to end against it, **on
> iPhone**. Clean Yahoo Inbox placement is a separate measurement and it **FAILED** — see
> [Qualifications](#qualifications). Android physical-device Auth certification remains outstanding.
> Production is unaffected and unauthorised.

Everything below describes the **QA** project only. No project reference, API key, SMTP password or
other credential is recorded here; the values that do appear (public hostnames, the public commit
SHA, the Pages deployment id and content hashes) are not secrets.

## 1. What changed

Emailed QA authentication links previously pointed at the Workers bridge on a `workers.dev`
hostname. They now point at a branded hostname on the company domain:

```
https://links.auth-qa.hiredcorp.co.ke
```

Cloudflare Workers cannot attach a custom hostname unless the DNS zone is on Cloudflare, and
`hiredcorp.co.ke` is served by external nameservers. Cloudflare **Pages** can attach a custom domain
to an externally managed zone by CNAME, which is the only reason a Pages target exists. The request
policy is unchanged: the Pages origin runs the **same** `worker.ts` and serves the **same** certified
bytes as the Workers target.

## 2. Architecture as certified

| Item | Value |
| --- | --- |
| Branded QA bridge origin | `https://links.auth-qa.hiredcorp.co.ke` |
| DNS record | `links.auth-qa.hiredcorp.co.ke` **CNAME** `kwikserve-auth-qa-bridge.pages.dev`, TTL **300** |
| Pages project | `kwikserve-auth-qa-bridge` |
| Deployment id | `cd3d30b9-9e18-429b-8ffb-d0d5df8b7fff` |
| Deployment source commit | `a7d747d1b3e0fcd3dbca07b14e15e97aafdd42c3` |
| Production branch classification | `main` |
| Git integration | **none** — direct upload |
| Deployments at certification time | **one** |
| Custom domain | **active**, normal TLS (no certificate bypass used anywhere) |
| Certificate | Google Trust Services, valid for the branded hostname |
| Rollback origin | `https://quickserve-auth-qa.zaka-crsd.workers.dev` — the Workers bridge **remains deployed** |

Production was **not contacted and not modified** at any point.

### DNS note on CNAME exclusivity

A CNAME's exclusivity applies at its **exact owner name**, not to descendant names (RFC 1034 §3.6.2,
RFC 2181 §10.1). `links.auth-qa.hiredcorp.co.ke` is a childless leaf, so the CNAME there is
unambiguously safe and cannot disturb the sending-domain records that live at sibling and parent
names. That separation — web routing on one name, mail on another — is the reason this leaf was
chosen.

## 3. Frozen candidate

The deployment was built once, frozen, certified locally, and then uploaded without rebuilding.

| Item | Value |
| --- | --- |
| Uploaded files | **9** |
| Total bytes | **3,416,734** |
| Aggregate manifest SHA-256 | `319746af2d0f85c7edf4a187aafb93b5a97e572908e3ec14c7c4c20d12bb967f` |
| Workspace `wrangler.jsonc` SHA-256 | `85a6dbe23979aab0a1cdb7e5c19680f1654c15d81a50fdadc52b92f492eb40bc` |
| Pages manifest SHA-256 | `d9e1c59b637ecefe9a98a2ad62bcb48c105ed79fae63a528342b7a915df8bead` |

Remotely served assets were verified **byte-identical** across all three origins: the immutable
deployment URL, the `pages.dev` project hostname, and the branded custom hostname. The candidate was
re-hashed after the runtime tests and after deployment and was unchanged.

The candidate and its evidence are held outside the repository. That location is a local artefact for
diagnosis only — **it is not an operational dependency** and nothing in the deployment or rollback
path requires it.

## 4. Security behaviour certified on the branded hostname

Verified live against `https://links.auth-qa.hiredcorp.co.ke`, with synthetic values only:

- `GET` and `HEAD` only; every other method returns **405** with `Allow: GET, HEAD`.
- Credential-shaped query keys return **400**, are never forwarded and are never echoed.
- Exact path allow-list: only the two bridge documents, the favicon and the generated asset paths.
- The query string is removed before the `ASSETS` lookup.
- Only an asset response with status **200** is forwarded; anything else becomes a neutral 404.
- Root, `index.html`, unrelated routes, deployment internals and nonexistent generated assets all
  return **404**.
- `BRIDGE_MODE=deny` remains the kill switch: every route returns 404 and no document or asset is
  exposed.
- **Unset `BRIDGE_MODE` currently means serve** (see follow-up 1).

Every allowed *and* refused response carries:

```
Cache-Control: no-store
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-Robots-Tag: noindex, nofollow
Content-Security-Policy: … connect-src 'none' …   (enforced)
```

No `Content-Security-Policy-Report-Only` header survives. The served bridge asset set contains **no
real QA, Production or Development Supabase project reference** — the only Supabase host present is
the intentional placeholder — and **no credential or token value**.

## 5. Supabase QA configuration

- `site_url` is now `https://links.auth-qa.hiredcorp.co.ke`.
- A sanitized before/after comparison of **243 configuration fields** showed **exactly one**
  difference: `site_url`. Nothing else changed.
- The redirect allow-list is unchanged and still contains exactly:
  - `kwikserve://auth/confirm`
  - `kwikserve://auth/recovery`
- Custom SMTP and the email-template configuration were **not** modified.
- Email templates construct their links from `.SiteURL`, so the branded hostname follows from the
  `site_url` change alone; no template edit was required.
- `token_hash`, `type` and `redirect_to` remain in the URL **fragment**, never in the query string,
  so the one-time token is never sent to the origin.

### Rollback

The Workers origin is the complete rollback value. **A rollback requires changing only `site_url`
back to `https://quickserve-auth-qa.zaka-crsd.workers.dev`** — nothing else needs to be touched, and
the Workers bridge remains deployed and healthy for exactly this purpose.

## 6. Certification results

### Recovery journey — FULLY CERTIFIED end to end on the branded hostname

Confirmed from the API gateway and GoTrue logs for a single narrow window:

1. One recovery request accepted — **HTTP 200**.
2. The delivered email used the **branded** recovery hostname and path.
3. The fresh link opened and reached the installed iOS app.
4. Exactly one `POST /auth/v1/verify` — **200**.
5. An OTP login/session was established, associated with the QA fixture user.
6. The subsequent `GET /auth/v1/user` returned **200**.
7. The app displayed the **Reset your password** form.
8. No duplicate verification.
9. No non-2xx Auth response and no error-level Auth event.
10. **No `PUT /auth/v1/user`** — the tester deliberately did not submit a new password, so the
    password remained unchanged.
11. The tester cancelled and signed out; the device returned to Welcome/Login.

### Signup-confirmation journey — FULLY CERTIFIED end to end, on iPhone

Run with a **fresh** QA fixture against a Yahoo mailbox with no prior KwikServe engagement:

1. One QA signup returned **HTTP 200**.
2. A **genuinely new identity** was created (`identities` non-empty — not the anti-enumeration
   response for an existing address).
3. **No session** was returned before confirmation, and no access or refresh token was issued.
4. The delivered confirmation email used the **branded** hostname and `/auth/confirm` path.
5. The confirmation link was tapped **on iPhone**.
6. The branded bridge handed off to the **installed iPhone app**.
7. Exactly one `POST /auth/v1/verify` — **200**.
8. An **OTP** login/session was established, associated with the fixture user.
9. `GET /auth/v1/user` returned **200**.
10. The customer-home reads all succeeded.
11. The **iPhone displayed Home with all services**.
12. No duplicate verification.
13. No non-2xx Auth response, no error-level Auth event, no retry and no crash.
14. The tester then **signed out on iPhone** and the device returned to Welcome/Login.

Backend sequence, as logged (UTC):

| Time | Request | Status |
| --- | --- | --- |
| 17:31:14 | `POST /auth/v1/signup` | 200 |
| 17:38:36 | `POST /auth/v1/verify` | 200 |
| 17:38:38 | `GET /auth/v1/user` | 200 |

Login method **OTP**; the fixture UUID association was confirmed in the GoTrue logs; every expected
customer-home read (`profiles`, `services`, `service_categories`, `bookings`, `customer_addresses`,
`notifications`, `payments`, device-token registration) succeeded; no duplicate, non-2xx or
error-level Auth event.

### Platform attribution — read this before citing the result

**Android was used only to inspect the fresh Yahoo mailbox** and observe which folder the message
landed in. **The confirmation link was not used to certify the Android app.** The link was opened,
and the app journey completed, **on iPhone**.

This distinction matters because the analytics logs **cannot** identify which physical device
displayed the app — they record only the request sequence. Platform attribution therefore comes from
the tester's direct observation, which is authoritative. An earlier draft of this record attributed
the app journey to Android; that attribution was wrong and is superseded here. **The backend
timestamps, paths, statuses, UUID association and request counts are unchanged** — only the platform
label was corrected.

**Android physical-device Auth confirmation remains outstanding** unless and until it is separately
certified.

## Qualifications

These are recorded deliberately so the record is not read as stronger than the evidence.

**Email placement — clean Yahoo Inbox test: FAIL.** The signup-confirmation email was sent to a
Yahoo mailbox with **no previous KwikServe engagement**, and it landed in **Spam**. Folder placement
was observed from the message list **before** the message was opened, moved or marked Not Spam, so
this *is* the uncontaminated measurement. The message was opened afterwards only to complete the
independently scoped iPhone Auth test above.

**Do not claim that branded links or the revised templates solved Yahoo placement — they did not.**
An earlier recovery email did reach the Inbox, but that was a mailbox which had previously moved
KwikServe mail out of Spam, so that observation reflects recipient-specific training rather than a
fix.

Placement and authentication are **independent results**: delivery and link functionality **passed**
despite Spam placement. A message in Spam is still delivered and its link still works, which is
exactly what the logs show. Yahoo deliverability remediation remains an open work item.

**Support route.** The live email templates include a `mailto:` link to `support@hiredcorp.co.ke`.
The broader standing requirement remains: **app and website help and error surfaces must offer a
route to this support address**. That requirement is *not* claimed to be satisfied across every
surface — it is an open product requirement, and only the email templates are confirmed here.

## 7. Known follow-ups

Recorded, not fixed in this commit.

1. **`infra/qa-auth-bridge/worker.ts` has a misleading comment.** Its header implies that an unset
   `BRIDGE_MODE` denies traffic. The certified code and both test suites show that **unset means
   serve** (`(env.BRIDGE_MODE ?? 'serve') !== 'serve'`). The comment is corrected in a later commit,
   deliberately not here, so the deployed and certified source remains clearly attributable to
   `a7d747d1b3e0fcd3dbca07b14e15e97aafdd42c3`.
2. **`applinks:REPLACE_ME.quickserve.app`** — the associated-domain placeholder remains a
   store-release blocker.
3. ~~Branded confirmation E2E~~ — **DONE: certified on iPhone** (see above). No longer outstanding.
4. **Android physical-device Auth certification** remains outstanding. Android was used only to
   observe the Yahoo mailbox folder; the confirmation link was not used to certify the Android app.
5. **Yahoo deliverability remediation** remains outstanding. The clean-mailbox measurement has now
   been taken and it **FAILED** (Spam); the remaining work is the remediation itself, not the
   measurement.
6. **Support access across app and website surfaces** remains outstanding. Only the email templates
   are confirmed to offer a route to `support@hiredcorp.co.ke`.
7. **Store-release configuration** items remain outstanding alongside the associated-domain
   placeholder in item 2.
8. **PR #20** still requires one approving review.
9. **Production migration is completely separate and unauthorised.** Nothing in this record
   authorises a Production change.

## 8. Related documentation

- Bridge implementation, build, deployment and rollback: [`infra/qa-auth-bridge/README.md`](../../../infra/qa-auth-bridge/README.md)
- Authentication architecture and deferred configuration: [`README.md`](README.md)
