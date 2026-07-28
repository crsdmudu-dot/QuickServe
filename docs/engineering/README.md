# QuickServe Engineering Documentation

**Purpose:** The permanent technical reference for QuickServe engineering. This index
links every documentation section. Each section below is a written, repository-verified
reference; where a capability is not implemented, the section says so rather than implying it.

**Status:** All twelve sections are populated and merged. The documents distinguish current
implementation from planned work and do not claim Full Platform Certification.

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
| [releases/](releases/) | Release process, gates, artifacts, and version management. |
| [frontend/](frontend/) | The Expo React Native frontend: structure, navigation, state, styling, and data flow. |
| [mobile/](mobile/) | Native mobile concerns: Android/iOS configuration, Expo services, and device features. |

---

## Related existing documentation (already verified, elsewhere in the repo)

- **QA automation & certification:** `qa/docs/ARCHITECTURE.md`, `qa/docs/FLAKES.md`, `qa/docs/LAUNCH-CERTIFICATION.md`, `docs/qa/`
- **Specifications & plans:** `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/superpowers/verification/`
- **Pilot operations & readiness:** `docs/pilot/`
- **Design system & UI:** `docs/design/`
- **Database migrations:** `supabase/migrations/` (0001–0034)

New engineering documents should link to these sources rather than duplicate them.
