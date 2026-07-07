/**
 * communication-center-schema.test.ts
 *
 * Static assertions against supabase/migrations/0031_communication_center.sql.
 * Reads the migration file as TEXT (fs) — no live database required.
 *
 * Invariants checked:
 *  - notifications gains 4 new additive columns (audience_type, metadata_json, priority, read_at)
 *  - notification_preferences gains 4 new additive columns
 *    (quality_enabled, system_enabled, email_enabled, sms_enabled)
 *  - emit_notification: present + security definer + set search_path = public
 *    + inserts into public.notifications + guard admin-or-self
 *    + does NOT read notification_preferences (unconditional insert)
 *  - broadcast_announcement: present + security definer + is_admin() guard
 *    + inserts from public.profiles where role
 *  - Additive: NO drop, NO create policy, NO for delete,
 *    NO redefinition of notify_user, NO create trigger
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/0031_communication_center.sql'
);

let sql: string;

beforeAll(() => {
  sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
});

// Helper: normalise multiple spaces/newlines for whitespace-robust matching
function norm(s: string): string {
  return s.replace(/\s+/g, ' ').toLowerCase();
}

// Helper: extract the function body segment for a given function name
function getFnSegment(fnName: string): string {
  const marker = 'create or replace function';
  const lower = sql.toLowerCase();
  const parts = lower.split(marker);
  const segment = parts.find((p) => p.trimStart().startsWith(`public.${fnName}(`));
  if (!segment) throw new Error(`Segment for ${fnName} not found in migration`);
  return segment;
}

// ─── 1. notifications — 4 additive columns ───────────────────────────────────

describe('notifications additive columns', () => {
  test('adds audience_type with add column if not exists', () => {
    expect(norm(sql)).toContain('add column if not exists audience_type');
  });

  test('audience_type check constraint contains customer, provider, admin', () => {
    expect(sql).toContain("'customer'");
    expect(sql).toContain("'provider'");
    expect(sql).toContain("'admin'");
  });

  test('adds metadata_json jsonb with default empty object', () => {
    expect(norm(sql)).toContain('add column if not exists metadata_json jsonb');
    expect(norm(sql)).toContain("default '{}'");
  });

  test('adds priority with check constraint containing all 4 values', () => {
    expect(norm(sql)).toContain('add column if not exists priority');
    expect(norm(sql)).toContain("check (priority in ('low','normal','high','urgent'))");
  });

  test('priority check contains all 4 expected values', () => {
    // All 4 values must appear in the priority check
    expect(sql).toContain("'low'");
    expect(sql).toContain("'normal'");
    expect(sql).toContain("'high'");
    expect(sql).toContain("'urgent'");
  });

  test('priority default is normal', () => {
    expect(norm(sql)).toContain("default 'normal'");
  });

  test('adds read_at timestamptz with add column if not exists', () => {
    expect(norm(sql)).toContain('add column if not exists read_at timestamptz');
  });
});

// ─── 2. notification_preferences — 4 additive columns ────────────────────────

describe('notification_preferences additive columns', () => {
  test('adds quality_enabled with add column if not exists', () => {
    expect(norm(sql)).toContain('add column if not exists quality_enabled');
  });

  test('adds system_enabled with add column if not exists', () => {
    expect(norm(sql)).toContain('add column if not exists system_enabled');
  });

  test('adds email_enabled with add column if not exists and default false', () => {
    expect(norm(sql)).toContain('add column if not exists email_enabled');
    // email_enabled defaults to false
    const emailMatch = /email_enabled\s+boolean[^;]*default\s+false/i.test(sql);
    expect(emailMatch).toBe(true);
  });

  test('adds sms_enabled with add column if not exists and default false', () => {
    expect(norm(sql)).toContain('add column if not exists sms_enabled');
    // sms_enabled defaults to false
    const smsMatch = /sms_enabled\s+boolean[^;]*default\s+false/i.test(sql);
    expect(smsMatch).toBe(true);
  });

  test('quality_enabled and system_enabled default to true', () => {
    const qualityMatch = /quality_enabled\s+boolean[^;]*default\s+true/i.test(sql);
    expect(qualityMatch).toBe(true);
    const systemMatch = /system_enabled\s+boolean[^;]*default\s+true/i.test(sql);
    expect(systemMatch).toBe(true);
  });
});

// ─── 3. emit_notification RPC ────────────────────────────────────────────────

describe('emit_notification RPC', () => {
  test('function is declared', () => {
    expect(norm(sql)).toContain('create or replace function public.emit_notification(');
  });

  test('has security definer', () => {
    expect(getFnSegment('emit_notification')).toContain('security definer');
  });

  test('has set search_path = public', () => {
    expect(getFnSegment('emit_notification')).toContain('set search_path = public');
  });

  test('contains insert into public.notifications', () => {
    expect(norm(getFnSegment('emit_notification'))).toContain(
      'insert into public.notifications'
    );
  });

  test('guard: public.is_admin() or p_user_id = auth.uid()', () => {
    const seg = norm(getFnSegment('emit_notification'));
    expect(seg).toContain('public.is_admin() or p_user_id = auth.uid()');
  });

  test('UNCONDITIONAL insert: does not read notification_preferences', () => {
    const seg = getFnSegment('emit_notification').toLowerCase();
    // Must not reference the preferences table (would mean it could skip the insert)
    expect(seg).not.toContain('notification_preferences');
  });

  test('UNCONDITIONAL insert: does not contain _enabled skip logic', () => {
    const seg = getFnSegment('emit_notification').toLowerCase();
    // Should not reference any preference-enabled columns
    expect(seg).not.toContain('_enabled');
  });
});

// ─── 4. broadcast_announcement RPC ───────────────────────────────────────────

describe('broadcast_announcement RPC', () => {
  test('function is declared', () => {
    expect(norm(sql)).toContain('create or replace function public.broadcast_announcement(');
  });

  test('has security definer', () => {
    expect(getFnSegment('broadcast_announcement')).toContain('security definer');
  });

  test('has set search_path = public', () => {
    expect(getFnSegment('broadcast_announcement')).toContain('set search_path = public');
  });

  test('admin-only guard: public.is_admin()', () => {
    expect(getFnSegment('broadcast_announcement')).toContain('public.is_admin()');
  });

  test('inserts from public.profiles', () => {
    expect(norm(getFnSegment('broadcast_announcement'))).toContain(
      'from public.profiles'
    );
  });

  test('filters by role (where ... role)', () => {
    const seg = norm(getFnSegment('broadcast_announcement'));
    // Should have where p.role = p_audience_type or similar
    expect(seg).toMatch(/where\s+p\.role\s*=\s*p_audience_type/);
  });
});

// ─── 5. Additive-only guardrails ─────────────────────────────────────────────

describe('additive-only guardrails', () => {
  test('file contains no DROP statement', () => {
    // Only alter table add column — no drop column, drop table, drop function
    expect(norm(sql)).not.toMatch(/\bdrop\s+(table|column|function|index|trigger)\b/);
  });

  test('file contains no CREATE POLICY statement', () => {
    // Existing RLS must not be touched
    expect(norm(sql)).not.toContain('create policy');
  });

  test('file contains no FOR DELETE policy', () => {
    expect(norm(sql)).not.toContain('for delete');
  });

  test('file does not redefine notify_user', () => {
    // Must not recreate/override the existing notify_user RPC
    expect(norm(sql)).not.toContain('create or replace function public.notify_user');
  });

  test('file contains no CREATE TRIGGER statement', () => {
    // No new triggers — existing pipeline untouched
    expect(norm(sql)).not.toContain('create trigger');
  });
});
