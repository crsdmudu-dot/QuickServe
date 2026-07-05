/**
 * operations.ts — Supabase helpers for the Slice 31 Operations Portal.
 *
 * All functions are admin-only; access is enforced by DB RLS policies and
 * SECURITY DEFINER RPCs that call is_admin(). No client-side auth logic needed.
 *
 * Read helpers return [] (or null for single-row) on error — never throw.
 * Mutation helpers return { ok: boolean; error?: string } — never leak raw DB errors.
 *
 * flagAccount / liftAccountFlag / setDisputeOutcome are record/recommendation only:
 * they write to audit tables but do NOT trigger any enforcement, refund, wallet
 * action, or dispatch change.
 */

import { supabase } from '@/lib/supabase';
import {
  UNRESOLVED_STATUSES,
  type AccountFlag,
  type AccountFlagKind,
  type CaseEvidenceLink,
  type CaseFilter,
  type CaseNoteType,
  type CasePriority,
  type CaseStatus,
  type CaseType,
  type DisputeKind,
  type InternalNote,
  type ResolutionOutcome,
  type SubjectRole,
  type SubjectType,
  type SupportCase,
  type SupportCaseEvent,
  type SupportCaseNote,
} from '@/constants/operations';

// ── Read helpers ───────────────────────────────────────────────────────────

/**
 * Admin-only: returns support cases, optionally filtered and paginated.
 * Returns [] on any error.
 *
 * Filters:
 *   open          → status = 'open'
 *   urgent        → priority = 'urgent'
 *   assigned_to_me → assigned_to = current admin uid
 *   unresolved    → status in UNRESOLVED_STATUSES
 *   disputes      → case_type = 'dispute'
 */
export async function getSupportCases(
  filter?: CaseFilter,
  page?: number,
  pageSize?: number,
): Promise<SupportCase[]> {
  let q = supabase.from('support_cases').select('*');

  if (filter === 'open') {
    q = q.eq('status', 'open');
  } else if (filter === 'urgent') {
    q = q.eq('priority', 'urgent');
  } else if (filter === 'assigned_to_me') {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id;
    if (!uid) return [];
    q = q.eq('assigned_to', uid);
  } else if (filter === 'unresolved') {
    q = q.in('status', UNRESOLVED_STATUSES);
  } else if (filter === 'disputes') {
    q = q.eq('case_type', 'dispute');
  }

  q = q.order('created_at', { ascending: false });
  if (page != null && pageSize != null) q = q.range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, error } = await q;
  if (error) return [];
  return (data as SupportCase[] | null) ?? [];
}

/**
 * Admin-only: returns a single support case by id, or null if not found / error.
 */
export async function getSupportCase(id: string): Promise<SupportCase | null> {
  const { data, error } = await supabase
    .from('support_cases')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return null;
  return (data as SupportCase | null) ?? null;
}

/**
 * Admin-only: returns notes for a case, oldest first.
 * Returns [] on error.
 */
export async function getSupportCaseNotes(caseId: string): Promise<SupportCaseNote[]> {
  const { data, error } = await supabase
    .from('support_case_notes')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data as SupportCaseNote[] | null) ?? [];
}

/**
 * Admin-only: returns audit events for a case, oldest first.
 * Returns [] on error.
 */
export async function getSupportCaseEvents(caseId: string): Promise<SupportCaseEvent[]> {
  const { data, error } = await supabase
    .from('support_case_events')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data as SupportCaseEvent[] | null) ?? [];
}

/**
 * Admin-only: returns internal notes for any subject entity, newest first.
 * Returns [] on error.
 */
export async function getInternalNotes(
  subjectType: SubjectType,
  subjectId: string,
): Promise<InternalNote[]> {
  const { data, error } = await supabase
    .from('internal_notes')
    .select('*')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as InternalNote[] | null) ?? [];
}

/**
 * Admin-only: returns all account flags for a subject (active and lifted), newest first.
 * Returns [] on error.
 */
export async function getAccountFlags(subjectId: string): Promise<AccountFlag[]> {
  const { data, error } = await supabase
    .from('account_flags')
    .select('*')
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as AccountFlag[] | null) ?? [];
}

/**
 * Admin-only: collects evidence links for a support case.
 * Loads the case to find its linked booking_id and payment_id, then
 * best-effort fetches evidence from:
 *   - booking_photos (linked via booking_id) → kind: 'photo'
 *   - booking_messages (linked via booking_id) → kind: 'chat'
 *   - payment_attempts (linked via payment_id) → kind: 'payment_attempt'
 *   - reviews (linked via booking_id) → kind: 'review'
 *
 * Returns only what is available. Returns [] on any error. Never throws.
 *
 * NOTE: Evidence sources are read-only; no writes are performed here.
 */
export async function getCaseEvidence(caseId: string): Promise<CaseEvidenceLink[]> {
  try {
    const c = await getSupportCase(caseId);
    if (!c) return [];

    const links: CaseEvidenceLink[] = [];

    // ── booking_photos ──
    if (c.booking_id) {
      const { data: photos } = await supabase
        .from('booking_photos')
        .select('id, photo_type, photo_url')
        .eq('booking_id', c.booking_id);
      if (photos) {
        for (const p of photos as Array<{ id: string; photo_type: string; photo_url: string }>) {
          links.push({ kind: 'photo', label: `Photo (${p.photo_type})`, ref: p.id });
        }
      }
    }

    // ── booking_messages (chat) ──
    if (c.booking_id) {
      const { data: msgs } = await supabase
        .from('booking_messages')
        .select('id, message_text')
        .eq('booking_id', c.booking_id);
      if (msgs) {
        for (const m of msgs as Array<{ id: string; message_text: string }>) {
          links.push({ kind: 'chat', label: `Chat message: ${m.message_text.slice(0, 60)}`, ref: m.id });
        }
      }
    }

    // ── payment_attempts ──
    if (c.payment_id) {
      const { data: attempts } = await supabase
        .from('payment_attempts')
        .select('id, provider, status, amount')
        .eq('payment_id', c.payment_id);
      if (attempts) {
        for (const a of attempts as Array<{ id: string; provider: string; status: string; amount: number }>) {
          links.push({
            kind: 'payment_attempt',
            label: `Payment attempt: ${a.provider} ${a.status} (${a.amount})`,
            ref: a.id,
          });
        }
      }
    }

    // ── reviews ──
    if (c.booking_id) {
      const { data: revs } = await supabase
        .from('reviews')
        .select('id, rating, comment')
        .eq('booking_id', c.booking_id);
      if (revs) {
        for (const r of revs as Array<{ id: string; rating: number; comment: string | null }>) {
          links.push({
            kind: 'review',
            label: `Review: ${r.rating}/5${r.comment ? ` — ${r.comment.slice(0, 60)}` : ''}`,
            ref: r.id,
          });
        }
      }
    }

    return links;
  } catch {
    return [];
  }
}

// ── RPC wrappers ───────────────────────────────────────────────────────────

/**
 * Admin-only: creates a new support or dispute case via the create_support_case RPC.
 * Returns { ok: true, id } on success; { ok: false, error } on failure.
 */
export async function createSupportCase(input: {
  caseType?: CaseType;
  priority?: CasePriority;
  subject: string;
  description?: string;
  bookingId?: string;
  customerId?: string;
  providerId?: string;
  paymentId?: string;
  reviewId?: string;
  disputeKind?: DisputeKind;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('create_support_case', {
    p_case_type:    input.caseType    ?? null,
    p_priority:     input.priority    ?? null,
    p_subject:      input.subject,
    p_description:  input.description ?? null,
    p_booking_id:   input.bookingId   ?? null,
    p_customer_id:  input.customerId  ?? null,
    p_provider_id:  input.providerId  ?? null,
    p_payment_id:   input.paymentId   ?? null,
    p_review_id:    input.reviewId    ?? null,
    p_dispute_kind: input.disputeKind ?? null,
  });
  if (error) return { ok: false, error: 'Could not create support case.' };
  return { ok: true, id: data as string };
}

/**
 * Admin-only: updates the status of a support case.
 * Returns { ok: true } on success; { ok: false, error } on failure.
 */
export async function updateSupportCaseStatus(
  caseId: string,
  status: CaseStatus,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('update_support_case_status', {
    p_case_id: caseId,
    p_status:  status,
  });
  if (error) return { ok: false, error: 'Could not update case status.' };
  return { ok: true };
}

/**
 * Admin-only: updates the priority of a support case.
 * Returns { ok: true } on success; { ok: false, error } on failure.
 */
export async function updateSupportCasePriority(
  caseId: string,
  priority: CasePriority,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('update_support_case_priority', {
    p_case_id:  caseId,
    p_priority: priority,
  });
  if (error) return { ok: false, error: 'Could not update case priority.' };
  return { ok: true };
}

/**
 * Admin-only: assigns or unassigns a support case to an admin user.
 * Pass null for assignee to unassign.
 * Returns { ok: true } on success; { ok: false, error } on failure.
 */
export async function assignSupportCase(
  caseId: string,
  assignee: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('assign_support_case', {
    p_case_id:  caseId,
    p_assignee: assignee,
  });
  if (error) return { ok: false, error: 'Could not assign support case.' };
  return { ok: true };
}

/**
 * Admin-only: records the recommended outcome for a dispute case.
 * RECORD-ONLY: does NOT trigger any refund, wallet credit, or enforcement action.
 * Returns { ok: true } on success; { ok: false, error } on failure.
 */
export async function setDisputeOutcome(
  caseId: string,
  outcome: ResolutionOutcome,
  resolutionNotes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('set_dispute_outcome', {
    p_case_id:          caseId,
    p_outcome:          outcome,
    p_resolution_notes: resolutionNotes ?? null,
  });
  if (error) return { ok: false, error: 'Could not set dispute outcome.' };
  return { ok: true };
}

/**
 * Admin-only: adds an internal or resolution note to a support case.
 * Returns { ok: true, id } on success; { ok: false, error } on failure.
 */
export async function addSupportCaseNote(
  caseId: string,
  body: string,
  noteType: CaseNoteType = 'internal',
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('add_support_case_note', {
    p_case_id:   caseId,
    p_body:      body,
    p_note_type: noteType,
  });
  if (error) return { ok: false, error: 'Could not add case note.' };
  return { ok: true, id: data as string };
}

/**
 * Admin-only: adds a free-text internal note to any subject entity
 * (booking, customer, provider, or payment). Not tied to a support case.
 * Returns { ok: true, id } on success; { ok: false, error } on failure.
 */
export async function addInternalNote(
  subjectType: SubjectType,
  subjectId: string,
  body: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('add_internal_note', {
    p_subject_type: subjectType,
    p_subject_id:   subjectId,
    p_body:         body,
  });
  if (error) return { ok: false, error: 'Could not add internal note.' };
  return { ok: true, id: data as string };
}

/**
 * Admin-only: flags or records a suspension recommendation for an account.
 * RECORD-ONLY: does NOT update profiles, approval_status, dispatch, login,
 * or any enforcement mechanism. This is an audit record only.
 * Returns { ok: true, id } on success; { ok: false, error } on failure.
 */
export async function flagAccount(
  subjectId: string,
  subjectRole: SubjectRole,
  kind: AccountFlagKind,
  reason: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('flag_account', {
    p_subject_id:   subjectId,
    p_subject_role: subjectRole,
    p_kind:         kind,
    p_reason:       reason,
  });
  if (error) return { ok: false, error: 'Could not flag account.' };
  return { ok: true, id: data as string };
}

/**
 * Admin-only: marks an account flag as lifted (active = false).
 * RECORD-ONLY: does NOT change any login, dispatch, or booking behaviour.
 * Returns { ok: true } on success; { ok: false, error } on failure.
 */
export async function liftAccountFlag(
  flagId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('lift_account_flag', {
    p_flag_id: flagId,
  });
  if (error) return { ok: false, error: 'Could not lift account flag.' };
  return { ok: true };
}
