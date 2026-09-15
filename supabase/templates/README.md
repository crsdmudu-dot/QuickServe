# Supabase Auth email templates

Version-controlled source of truth for the two transactional Auth emails. Nothing here is
applied automatically — these files are **not** wired into `supabase/config.toml` and are not
bundled into the app. Applying them to a Supabase project is a separate, separately authorised
step that copies each subject and body into the project's Auth mailer settings.

| File | Supabase mailer template | Subject |
| --- | --- | --- |
| `confirmation.html` | Confirm signup (`type=signup`) | see `subjects.json` |
| `recovery.html` | Reset password (`type=recovery`) | see `subjects.json` |

`subjects.json` is the source of truth for the subject lines. Each template's `<title>` mirrors
its subject, and `src/__tests__/auth-email-templates.test.ts` fails if the two drift apart.

## Security contract

Enforced by `src/__tests__/auth-email-templates.test.ts`:

- `{{ .TokenHash }}` occurs **exactly once** per template, only inside the CTA `href`.
- The token is carried in the URL **fragment** (`#token_hash=`), never the query string, so it
  never reaches the bridge origin's request line, access logs or `Referer` headers.
- `{{ .ConfirmationURL }}` is never used; it would move the token into a query string.
- No token-bearing URL appears as readable text, so forwarding or screenshotting the message
  does not expose the token in the visible body.
- Parameter separators are written `&amp;` in HTML source. A mail client's HTML parser decodes
  character references inside attribute values, so the runtime URL contains ordinary `&`.
- No remote images, scripts, stylesheets or `url()` fetches, so there is no tracking pixel and
  no read-receipt, IP or user-agent leak to a third party.
- No unsubscribe copy: Yahoo and Google both exclude transactional mail from the one-click
  unsubscribe requirement.
- No expiry duration is claimed. The live OTP expiry has not been authoritatively confirmed for
  every environment, so the copy states only that the link is single use.
- No postal address: the FTC's CAN-SPAM guidance places transactional messages outside the
  postal-address and opt-out requirements.

## Unresolved deployment dependency

`{{ .SiteURL }}` is a runtime placeholder and is deliberately left unresolved here. **No
hostname is committed.**

At the time of writing, the QA project resolves `.SiteURL` to a `workers.dev` hostname that does
not share an organisational domain with the sending address `no-reply@auth-qa.hiredcorp.co.ke`.
A deliverability audit identified that link/sender domain mismatch as the primary evidenced
cause of Yahoo Spam placement: Resend flags links that do not match the sending domain, and
Yahoo lists URL obfuscation among its reasons for spam-foldering well-reputed mail.

**Applying these templates does not resolve that mismatch.** Migrating `.SiteURL` to an approved
Hired Corp-owned bridge hostname is separate work, separately authorised, and must not be
assumed complete because these templates have landed. Until it is done, do not treat any
improvement in placement as evidence the hostname issue is fixed.

Related follow-on work, none of it done here: publishing an explicit DMARC record with a working
`rua` for the sending subdomain, enrolling the DKIM `d=` domain in Yahoo's Complaint Feedback
Loop, and publishing an explicit MX for the organisation domain, which currently accepts mail
only through the RFC 5321 implicit-MX fallback to its A record.
