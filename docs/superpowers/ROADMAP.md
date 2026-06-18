# QuickServe — Roadmap Notes

This file captures future requirements and operating models that are **not** part of the
current slice. It informs sequencing and later specs. Nothing here is built until it has its
own spec → plan → implementation cycle.

---

## Admin Dispatch Mode (launch-phase operational model)

**Status:** Planned — a later slice, **after** booking functionality exists.
**Do not implement in Slice 1.** This does not change the current Slice 1 spec or plan.

### Purpose

Allow QuickServe to launch and operate with **manually managed, off-platform service
providers** while the provider marketplace/network is still being built. The admin acts as a
human dispatcher: receiving requests, accepting them, and assigning providers who are not yet
onboarded into the platform.

### Dependencies (sequencing)

- Requires the **booking flow** to exist first (a request/booking entity with a status).
- Builds on the **Admin** user type (out of scope for Slice 1).
- Likely also depends on basic auth/role routing.

### Requirements

**Admin can:**
1. View incoming service requests.
2. Accept or reject requests.
3. Assign an off-platform / manual service provider.
4. Record provider details:
   - Provider name
   - Phone number
   - Service type
   - Notes
5. Update job status through this lifecycle:
   - Request received
   - Accepted
   - Provider assigned
   - On the way
   - In progress
   - Completed
   - Cancelled
6. Contact the assigned provider directly by **phone or WhatsApp**.

**Customer can:**
- View booking status updates (the lifecycle above).
- See the assigned provider's **name and phone number** once a provider is assigned.

### Design notes (for the future spec — not decisions yet)

- The **job status lifecycle** above should become the canonical booking state machine; the
  customer-facing tracking UI and the admin dispatch UI are two views over the same states.
- "Manual provider" is a distinct concept from a future marketplace provider account — the
  data model should allow a booking to reference either an off-platform provider record
  (name/phone/notes) or, later, an on-platform provider.
- Direct contact: phone (`tel:`) and WhatsApp (`https://wa.me/<number>`) deep links.

---

## Other future slices (high level)

Tracked for sequencing; each gets its own spec later.

- Authentication + role selection (Customer / Provider / Admin)
- Backend integration (Supabase, per project brief)
- Booking flow (service detail → provider/schedule → confirm → status)
- Provider app
- Admin dashboard (Admin Dispatch Mode lives here)
- Payments
- Maps / live tracking
