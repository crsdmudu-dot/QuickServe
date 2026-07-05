/**
 * operations.ts — Types, enums, option arrays, and row types for the
 * Slice 31 Operations Portal (admin-only, enforced by DB RLS + is_admin()).
 *
 * Mirrors the shape of booking-status.ts: each option array has { id, label, color }
 * where color is a ThemeColor token key used by status badges.
 */

import { type ThemeColor } from '@/constants/theme';

// ── String union types ─────────────────────────────────────────────────────

/** The two top-level case categories. */
export type CaseType = 'support' | 'dispute';

/** Lifecycle stages for a support/dispute case. */
export type CaseStatus =
  | 'open'
  | 'in_review'
  | 'waiting_on_customer'
  | 'waiting_on_provider'
  | 'resolved'
  | 'closed';

/** Priority levels for a support case. */
export type CasePriority = 'low' | 'medium' | 'high' | 'urgent';

/** Sub-category for dispute cases. */
export type DisputeKind =
  | 'booking_dispute'
  | 'payment_dispute'
  | 'customer_complaint'
  | 'provider_complaint';

/** Recommended outcome recorded on a resolved dispute (record-only). */
export type ResolutionOutcome =
  | 'no_action'
  | 'refund_recommended'
  | 'wallet_credit_recommended'
  | 'provider_warning'
  | 'provider_suspension_recommended'
  | 'customer_warning';

/** Kind of account action (record-only, no enforcement). */
export type AccountFlagKind = 'flag' | 'suspension';

/** Subject entity type for internal notes. */
export type SubjectType = 'booking' | 'customer' | 'provider' | 'payment';

/** Role of the account being flagged. */
export type SubjectRole = 'customer' | 'provider';

/** Note type attached to a support case. */
export type CaseNoteType = 'internal' | 'resolution';

/** Pre-built filter presets for the case list. */
export type CaseFilter = 'open' | 'urgent' | 'assigned_to_me' | 'unresolved' | 'disputes';

// ── Option arrays ──────────────────────────────────────────────────────────

/** Display option shape shared by all option arrays. */
export interface OperationsOption<T extends string> {
  id: T;
  label: string;
  color: ThemeColor;
}

export const CASE_TYPES: OperationsOption<CaseType>[] = [
  { id: 'support',  label: 'Support',  color: 'info' },
  { id: 'dispute',  label: 'Dispute',  color: 'warning' },
];

export const CASE_STATUSES: OperationsOption<CaseStatus>[] = [
  { id: 'open',                label: 'Open',                  color: 'info' },
  { id: 'in_review',           label: 'In Review',             color: 'primary' },
  { id: 'waiting_on_customer', label: 'Waiting on Customer',   color: 'warning' },
  { id: 'waiting_on_provider', label: 'Waiting on Provider',   color: 'warning' },
  { id: 'resolved',            label: 'Resolved',              color: 'success' },
  { id: 'closed',              label: 'Closed',                color: 'neutral500' },
];

export const CASE_PRIORITIES: OperationsOption<CasePriority>[] = [
  { id: 'low',    label: 'Low',    color: 'neutral500' },
  { id: 'medium', label: 'Medium', color: 'info' },
  { id: 'high',   label: 'High',   color: 'warning' },
  { id: 'urgent', label: 'Urgent', color: 'error' },
];

export const DISPUTE_KINDS: OperationsOption<DisputeKind>[] = [
  { id: 'booking_dispute',    label: 'Booking Dispute',    color: 'warning' },
  { id: 'payment_dispute',    label: 'Payment Dispute',    color: 'error' },
  { id: 'customer_complaint', label: 'Customer Complaint', color: 'info' },
  { id: 'provider_complaint', label: 'Provider Complaint', color: 'info' },
];

export const RESOLUTION_OUTCOMES: OperationsOption<ResolutionOutcome>[] = [
  { id: 'no_action',                       label: 'No Action',                       color: 'neutral500' },
  { id: 'refund_recommended',              label: 'Refund Recommended',              color: 'warning' },
  { id: 'wallet_credit_recommended',       label: 'Wallet Credit Recommended',       color: 'primary' },
  { id: 'provider_warning',                label: 'Provider Warning',                color: 'warning' },
  { id: 'provider_suspension_recommended', label: 'Provider Suspension Recommended', color: 'error' },
  { id: 'customer_warning',                label: 'Customer Warning',                color: 'warning' },
];

export const ACCOUNT_FLAG_KINDS: OperationsOption<AccountFlagKind>[] = [
  { id: 'flag',       label: 'Flag',       color: 'warning' },
  { id: 'suspension', label: 'Suspension', color: 'error' },
];

// ── Derived constants ──────────────────────────────────────────────────────

/**
 * All case statuses that are NOT yet resolved or closed.
 * Used for the `unresolved` filter in getSupportCases.
 */
export const UNRESOLVED_STATUSES: CaseStatus[] = [
  'open',
  'in_review',
  'waiting_on_customer',
  'waiting_on_provider',
];

// ── Row types (mirrors DB columns for typed returns) ───────────────────────

/** A row from the support_cases table. */
export type SupportCase = {
  id: string;
  created_at: string;
  updated_at: string;
  case_type: CaseType;
  status: CaseStatus;
  priority: CasePriority;
  subject: string;
  description: string | null;
  assigned_to: string | null;
  created_by: string;
  booking_id: string | null;
  customer_id: string | null;
  provider_id: string | null;
  payment_id: string | null;
  review_id: string | null;
  dispute_kind: DisputeKind | null;
  resolution_outcome: ResolutionOutcome | null;
  resolution_notes: string | null;
  resolved_at: string | null;
};

/** A row from the support_case_notes table. */
export type SupportCaseNote = {
  id: string;
  created_at: string;
  case_id: string;
  author_id: string;
  body: string;
  note_type: CaseNoteType;
};

/** A row from the support_case_events table. */
export type SupportCaseEvent = {
  id: string;
  created_at: string;
  case_id: string;
  actor_id: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
};

/** A row from the internal_notes table. */
export type InternalNote = {
  id: string;
  created_at: string;
  subject_type: SubjectType;
  subject_id: string;
  author_id: string;
  body: string;
};

/** A row from the account_flags table. */
export type AccountFlag = {
  id: string;
  created_at: string;
  subject_id: string;
  subject_role: SubjectRole;
  kind: AccountFlagKind;
  reason: string;
  active: boolean;
  created_by: string;
  lifted_by: string | null;
  lifted_at: string | null;
};

/**
 * A lightweight descriptor for evidence linked to a support case.
 * Used by getCaseEvidence to surface booking photos, messages, payment
 * attempts, and reviews associated with the case's linked entities.
 */
export type CaseEvidenceLink = {
  kind: 'photo' | 'chat' | 'payment_attempt' | 'review';
  label: string;
  ref: string;
};

// ── Helper label lookups ───────────────────────────────────────────────────

/** Returns the human-readable label for a case status. */
export function caseStatusLabel(status: CaseStatus): string {
  return CASE_STATUSES.find((s) => s.id === status)?.label ?? status;
}

/** Returns the human-readable label for a case priority. */
export function casePriorityLabel(priority: CasePriority): string {
  return CASE_PRIORITIES.find((p) => p.id === priority)?.label ?? priority;
}
