/**
 * push-notification-cert.test.ts
 *
 * Phase 4E regression guard — static + unit assertions that lock in the push
 * notification security/config invariants certified live in QA on 2026-08-08
 * (see docs/qa/PHASE-4E-PUSH-NOTIFICATION-CERTIFICATION.md).
 *
 * These are the properties whose silent regression would break the certified
 * posture. The behavioural proof was run against QA (register-device authz +
 * RLS, send-push webhook-secret gate, real Expo send + DeviceNotRegistered
 * prune, role isolation, preference gate, dedup); this offline test guards the
 * source/config so CI catches a regression before it ships.
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildExpoMessages, type NotificationSpec } from '../../supabase/functions/_shared/notifications';

const readRepo = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf-8');
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();

// ─── register-device: user_id is JWT-derived, never client-supplied ──────────
describe('register-device authorization (Phase 4E)', () => {
  let src: string;
  beforeAll(() => { src = readRepo('supabase/functions/register-device/index.ts'); });

  it('derives the row user_id from the authenticated user, not the request body', () => {
    // The upsert must set user_id from the verified user object.
    expect(norm(src)).toContain('user_id: user.id'.toLowerCase());
    // The request body must NOT provide user_id (would allow cross-user writes).
    expect(src).not.toMatch(/body\.user_id/);
  });

  it('rejects the request when there is no authenticated user (401)', () => {
    expect(src).toMatch(/if\s*\(\s*!user\s*\)/);
    expect(src).toContain('401');
  });

  it('uses the caller-scoped anon client with the caller Authorization header (RLS-enforced)', () => {
    expect(src).toContain('SUPABASE_ANON_KEY');
    expect(norm(src)).toContain('authorization: authheader');
    // Must NOT use the service-role key here (that would bypass RLS).
    expect(src).not.toContain('SERVICE_ROLE');
  });

  it('validates platform against an allow-list', () => {
    expect(norm(src)).toContain("['ios', 'android', 'web']");
  });
});

// ─── send-push: constant-time secret gate, fail-closed, always-200 ───────────
describe('send-push authorization (Phase 4E)', () => {
  let src: string;
  beforeAll(() => { src = readRepo('supabase/functions/send-push/index.ts'); });

  it('gates on the x-webhook-secret header', () => {
    expect(norm(src)).toContain('x-webhook-secret');
    expect(src).toContain('PUSH_WEBHOOK_SECRET');
  });

  it('fails closed when the secret is unset (empty expected → reject)', () => {
    expect(norm(src)).toContain('expected.length === 0'.toLowerCase());
    expect(src).toMatch(/status:\s*401|401\s*\)/);
  });

  it('compares the secret in length-checked constant time (no early-return on length)', () => {
    expect(src).toContain('safeEqual');
    // The comparison accumulates XOR diff rather than returning on first mismatch.
    expect(src).toMatch(/diff\s*\|=/);
  });

  it('uses the service-role client only AFTER the secret gate', () => {
    const gateIdx = src.indexOf('safeEqual');
    const adminIdx = src.indexOf('SERVICE_ROLE_KEY');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(adminIdx).toBeGreaterThan(gateIdx);
  });
});

// ─── config.toml verify_jwt posture ─────────────────────────────────────────
describe('push Edge Function verify_jwt config (Phase 4E)', () => {
  let cfg: string;
  beforeAll(() => { cfg = readRepo('supabase/config.toml'); });

  it('register-device requires a JWT (verify_jwt = true)', () => {
    expect(cfg).toMatch(/\[functions\.register-device\]\s*verify_jwt\s*=\s*true/);
  });

  it('send-push does not require a JWT (verify_jwt = false) — gated by webhook secret instead', () => {
    expect(cfg).toMatch(/\[functions\.send-push\]\s*verify_jwt\s*=\s*false/);
  });
});

// ─── device_tokens RLS: owner-only writes, no admin write path ───────────────
describe('device_tokens RLS (Phase 4E)', () => {
  let m: string;
  beforeAll(() => { m = norm(readRepo('supabase/migrations/0014_device_tokens.sql')); });

  it('insert/update/delete are constrained to the owner (user_id = auth.uid())', () => {
    expect(m).toContain('for insert with check (user_id = auth.uid())');
    expect(m).toContain('for update using (user_id = auth.uid()) with check (user_id = auth.uid())');
    expect(m).toContain('for delete using (user_id = auth.uid())');
  });

  it('admin has read-only oversight but no write policy', () => {
    // select policy allows admin; no insert/update/delete policy references is_admin.
    expect(m).toMatch(/for select using \(user_id = auth\.uid\(\) or public\.is_admin\(\)\)/);
    expect(m).not.toMatch(/for (insert|update|delete)[^;]*is_admin/);
  });
});

// ─── notifications dedup: partial unique index bounds duplicates ─────────────
describe('notifications dedup index (Phase 4E)', () => {
  it('dedup_key is uniquely indexed only when NOT NULL', () => {
    const m = norm(readRepo('supabase/migrations/0020_notification_system.sql'));
    expect(m).toContain('create unique index if not exists notifications_dedup_key');
    expect(m).toContain('on public.notifications (dedup_key) where dedup_key is not null');
    expect(m).toContain('on conflict (dedup_key) where dedup_key is not null do nothing');
  });
});

// ─── Expo push payload privacy: only non-PII fields leave the backend ────────
describe('Expo push payload privacy (Phase 4E)', () => {
  const spec: NotificationSpec = {
    recipientUserId: 'u1',
    title: 'Payment confirmed',
    body: 'Your payment has been confirmed.',
    data: { type: 'payment_confirmed', route: '/booking/bk1' },
  };

  it('each Expo message carries exactly {to,title,body,data,sound} — no extra fields', () => {
    const [msg] = buildExpoMessages(['ExponentPushToken[x]'], spec);
    expect(Object.keys(msg).sort()).toEqual(['body', 'data', 'sound', 'title', 'to']);
  });

  it('the data payload carries only {type,route} — no ids, phone, amount, or PII', () => {
    const [msg] = buildExpoMessages(['ExponentPushToken[x]'], spec);
    expect(Object.keys(msg.data).sort()).toEqual(['route', 'type']);
    const serialized = JSON.stringify(msg).toLowerCase();
    for (const forbidden of ['phone', 'amount', 'price', 'ksh', 'mpesa', 'recipientuserid', 'user_id']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
