# Security

**Purpose:** The QuickServe security model — Row-Level Security and tenant isolation,
role guards, secrets handling, and known risks/hardening items.

**Planned documents:**
- RLS & tenant-isolation model (who can read/write what)
- Role guard reference (`is_admin()`, provider/customer scoping)
- Secrets & environment handling
- Known risks / hardening backlog

**Verified references:** RLS/tenant isolation and integrity findings are certified in
`qa/docs/LAUNCH-CERTIFICATION.md`; secrets policy in `docs/pilot/environment-secrets.md`.
Document only verified controls.
