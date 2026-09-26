// moderation.ts — reporting objectionable content (any signed-in user) and the admin moderation queue.
//
// Everything goes through the 0065 database functions. The server decides who was reported and
// whether the caller may report it; the app only sends what the user tapped and a reason.
import { supabase } from '@/lib/supabase';

// ── Reporting (customers and providers) ──────────────────────────────────────────────────────

/** What can be reported: a chat message, a review, or a person (a provider or a booking counterpart). */
export type ReportTargetType = 'message' | 'review' | 'user';

/** Reasons offered to the reporter. Keys must match the check constraint in 0065. */
export const REPORT_REASONS = [
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'hate', label: 'Hate speech' },
  { key: 'sexual', label: 'Sexual content' },
  { key: 'violence', label: 'Threats or violence' },
  { key: 'scam', label: 'Scam or fraud' },
  { key: 'spam', label: 'Spam' },
  { key: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['key'];

/**
 * Shown after a report is sent. The same sentence is used on the website and in the store review
 * notes, so the 24-hour commitment reads identically everywhere.
 */
export const REPORT_CONFIRMATION =
  'Thanks for letting us know. Our team reviews every report within 24 hours.';

/**
 * Reports a message, review or person. Reporting the same thing again while the first report is
 * still open is harmless: the server returns the existing report.
 */
export async function reportContent(
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('report_content', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
  });
  if (!error) return { ok: true };
  if (error.message === 'rate_limited') {
    return { ok: false, error: 'You have sent a lot of reports today. Please try again tomorrow.' };
  }
  return { ok: false, error: 'Could not send the report. Please try again.' };
}

// ── Admin: the moderation queue ──────────────────────────────────────────────────────────────

export type ReportStatus = 'open' | 'actioned' | 'dismissed';

/** One row of the admin queue (admin_get_content_reports). */
export type ContentReport = {
  report_id: string;
  created_at: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  status: ReportStatus;
  reporter_id: string | null;
  reporter_name: string | null;
  reported_user_id: string | null;
  reported_name: string | null;
  reported_role: string | null;
  booking_id: string | null;
  /** The reported message, review comment or provider bio as it is now (it may since have changed). */
  content_text: string | null;
  content_hidden: boolean;
  resolved_at: string | null;
  resolution_note: string | null;
};

/** The published response commitment, in hours. */
export const REPORT_RESPONSE_HOURS = 24;

/** Hours since a report was made (one decimal place). */
export function reportAgeHours(createdAt: string, now: Date = new Date()): number {
  return Math.round(((now.getTime() - new Date(createdAt).getTime()) / 3_600_000) * 10) / 10;
}

/** True when an open report has passed the 24-hour commitment. */
export function isOverdue(report: Pick<ContentReport, 'status' | 'created_at'>, now: Date = new Date()): boolean {
  return report.status === 'open' && reportAgeHours(report.created_at, now) >= REPORT_RESPONSE_HOURS;
}

/** Oldest first. Throws on error so the admin screen can show its retry state. */
export async function adminGetContentReports(status: ReportStatus): Promise<ContentReport[]> {
  const { data, error } = await supabase.rpc('admin_get_content_reports', { p_status: status });
  if (error) throw new Error('Could not load reports.');
  return (data as ContentReport[] | null) ?? [];
}

export async function adminResolveContentReport(
  reportId: string,
  outcome: 'actioned' | 'dismissed',
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_resolve_content_report', {
    p_report_id: reportId,
    p_outcome: outcome,
    p_note: note,
  });
  if (error) return { ok: false, error: 'Could not update the report. It may already be closed.' };
  return { ok: true };
}

export async function adminSetMessageHidden(
  messageId: string,
  hidden: boolean,
  reportId: string | null,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_set_message_hidden', {
    p_message_id: messageId,
    p_hidden: hidden,
    p_report_id: reportId,
    p_note: note,
  });
  if (error) return { ok: false, error: 'Could not update the message. Please try again.' };
  return { ok: true };
}

export async function adminSetReviewHidden(
  reviewId: string,
  hidden: boolean,
  reportId: string | null,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_set_review_hidden', {
    p_review_id: reviewId,
    p_hidden: hidden,
    p_report_id: reportId,
    p_note: note,
  });
  if (error) return { ok: false, error: 'Could not update the review. Please try again.' };
  return { ok: true };
}

/** Clears a provider's bio and skills (both are free text shown to customers). */
export async function adminClearProfileText(
  userId: string,
  reportId: string | null,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_clear_profile_text', {
    p_user_id: userId,
    p_report_id: reportId,
    p_note: note,
  });
  if (error) return { ok: false, error: 'Could not clear the profile text. Please try again.' };
  return { ok: true };
}
