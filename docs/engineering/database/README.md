# Database

**Purpose:** The QuickServe data model as implemented in Supabase/PostgreSQL —
tables, Row-Level Security (RLS) policies, triggers, functions, and the migration
history.

**Planned documents:**
- Data model / schema reference
- RLS policy reference (per role and table)
- Triggers & database functions (audit, notifications)
- Migration guide and conventions

**Source of truth:** `supabase/migrations/` (0001–0034). Document only what the
applied migrations define; do not restate schema that could drift — link to the
migration files.
