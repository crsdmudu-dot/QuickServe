/**
 * Tests for src/lib/moderation.ts: the RPC names and arguments each wrapper sends, the fixed
 * user-facing error text (never the raw database message), and the 24-hour overdue rule.
 */

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import {
  REPORT_REASONS,
  adminClearProfileText,
  adminGetContentReports,
  adminResolveContentReport,
  adminSetMessageHidden,
  adminSetReviewHidden,
  isOverdue,
  reportAgeHours,
  reportContent,
} from '@/lib/moderation';

import * as fs from 'fs';
import * as path from 'path';

const DB_ERROR = { data: null, error: { message: 'permission denied for table profiles', code: '42501' } };

describe('moderation wrappers', () => {
  beforeEach(() => mockRpc.mockReset());

  it('reportContent calls report_content with the target and reason', async () => {
    mockRpc.mockResolvedValue({ data: 'r1', error: null });
    await expect(reportContent('review', 'rev-1', 'hate')).resolves.toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('report_content', {
      p_target_type: 'review',
      p_target_id: 'rev-1',
      p_reason: 'hate',
    });
  });

  it('never passes the raw database message to the user', async () => {
    mockRpc.mockResolvedValue(DB_ERROR);
    const results = await Promise.all([
      reportContent('user', 'u1', 'spam'),
      adminResolveContentReport('r1', 'dismissed', ''),
      adminSetMessageHidden('m1', true, 'r1', ''),
      adminSetReviewHidden('v1', true, null, ''),
      adminClearProfileText('u1', 'r1', ''),
    ]);
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r.error).not.toMatch(/permission|profiles|42501/);
    }
  });

  it('admin wrappers send the documented arguments', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await adminResolveContentReport('r1', 'actioned', 'hid it');
    await adminSetMessageHidden('m1', true, 'r1', 'n');
    await adminSetReviewHidden('v1', false, null, 'n');
    await adminClearProfileText('u1', 'r1', 'n');
    expect(mockRpc.mock.calls).toEqual([
      ['admin_resolve_content_report', { p_report_id: 'r1', p_outcome: 'actioned', p_note: 'hid it' }],
      ['admin_set_message_hidden', { p_message_id: 'm1', p_hidden: true, p_report_id: 'r1', p_note: 'n' }],
      ['admin_set_review_hidden', { p_review_id: 'v1', p_hidden: false, p_report_id: null, p_note: 'n' }],
      ['admin_clear_profile_text', { p_user_id: 'u1', p_report_id: 'r1', p_note: 'n' }],
    ]);
  });

  it('adminGetContentReports throws on error so the screen can offer Retry', async () => {
    mockRpc.mockResolvedValue(DB_ERROR);
    await expect(adminGetContentReports('open')).rejects.toThrow('Could not load reports.');
  });
});

describe('the 24-hour commitment', () => {
  const now = new Date('2026-09-27T12:00:00Z');

  it('computes the age in hours', () => {
    expect(reportAgeHours('2026-09-27T06:00:00Z', now)).toBe(6);
  });

  it('an open report becomes overdue at 24 hours; a closed one never does', () => {
    expect(isOverdue({ status: 'open', created_at: '2026-09-26T12:30:00Z' }, now)).toBe(false);
    expect(isOverdue({ status: 'open', created_at: '2026-09-26T12:00:00Z' }, now)).toBe(true);
    expect(isOverdue({ status: 'dismissed', created_at: '2026-09-20T12:00:00Z' }, now)).toBe(false);
  });
});

describe('reasons match the database', () => {
  it('REPORT_REASONS keys are exactly the 0065 check-constraint values', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../supabase/migrations/0065_content_reports_and_moderation.sql'),
      'utf-8',
    );
    const m = sql.match(/check \(reason in \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    const dbKeys = (m![1].match(/'([a-z]+)'/g) ?? []).map((k) => k.replace(/'/g, '')).sort();
    expect(REPORT_REASONS.map((r) => r.key).sort()).toEqual(dbKeys);
  });
});
