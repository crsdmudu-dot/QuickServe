# QuickServe Engineering Documentation

**Purpose:** The permanent technical reference for QuickServe engineering. This index
links every documentation section. Each section currently holds a **placeholder**
describing its scope only — documents are written and added over time, and nothing
here asserts system behavior beyond what links to already-verified documents.

**Status:** Structure established (Engineering Documentation phase). Folders are
scaffolding; they are not yet populated.

---

## Sections

| Section | Description |
|---|---|
| [architecture/](architecture/) | System-wide architecture: components, boundaries, and data flow. |
| [backend/](backend/) | Backend business logic and server-side behavior (libs, Edge Functions). |
| [database/](database/) | Schema, migrations, RLS policies, triggers, and the data model. |
| [api/](api/) | API surface: PostgREST/REST endpoints, RPCs, and request/response contracts. |
| [authentication/](authentication/) | Authentication, sessions, roles, and the access model. |
| [security/](security/) | Security model, RLS / tenant isolation, and secrets handling. |
| [deployment/](deployment/) | Build, environments, and release/deploy procedures. |
| [operations/](operations/) | Runbooks, monitoring, incident response, and pilot operations. |
| [qa/](qa/) | QA automation, launch certification, and test strategy. |
| [releases/](releases/) | Release candidates, changelogs, and version history. |
| [frontend/](frontend/) | Web admin UI and the design system. |
| [mobile/](mobile/) | Customer and provider React Native applications. |

---

## Related existing documentation (already verified, elsewhere in the repo)

- **QA automation & certification:** `qa/docs/ARCHITECTURE.md`, `qa/docs/FLAKES.md`, `qa/docs/LAUNCH-CERTIFICATION.md`, `docs/qa/`
- **Specifications & plans:** `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/superpowers/verification/`
- **Pilot operations & readiness:** `docs/pilot/`
- **Design system & UI:** `docs/design/`
- **Database migrations:** `supabase/migrations/` (0001–0034)

New engineering documents should link to these sources rather than duplicate them.
