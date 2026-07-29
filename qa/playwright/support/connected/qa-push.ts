import { request, type APIRequestContext } from '@playwright/test';
import { qaSupabaseUrl, qaSupabaseAnonKey, assertNotProduction } from './qa-accounts';

/**
 * qa-push.ts — connected device-token primitives (Phase 2F).
 *
 * Drives the REAL device_tokens RLS of the dedicated QA project through PostgREST
 * (the authorization boundary the register-device edge sits behind). Owner-scoped:
 * insert/update/delete require user_id = auth.uid(); select is own or admin
 * (read-only). `unique(user_id, push_token)`. NO external push is sent and NO real
 * device token is used — every token is synthetic QA data prefixed for a deterministic
 * service-role sweep. The QA accounts themselves are never deleted.
 */

export const PUSH_MARKER = 'QA-P2F';

/** A synthetic, clearly-marked, sweepable QA test push token. */
export function makeToken(tag = 'tok'): string {
  return `${PUSH_MARKER}-${tag}-${crypto.randomUUID()}`;
}

type Row = Record<string, unknown>;

async function service(): Promise<APIRequestContext> {
  assertNotProduction();
  const key = process.env.QA_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('QA_SERVICE_ROLE_KEY is required for device-token cleanup.');
  return request.newContext({
    baseURL: qaSupabaseUrl(),
    extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
}

export type TokenInsert = {
  user_id: string;
  push_token: unknown;
  platform?: string;
  provider?: string;
  device_name?: string;
};

/** Raw insert into device_tokens — returns HTTP status (for positive AND negative assertions). */
export async function insertTokenRaw(
  ctx: APIRequestContext,
  t: TokenInsert,
): Promise<{ status: number; id: string | null; text: string }> {
  const res = await ctx.post('/rest/v1/device_tokens', {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data: {
      user_id: t.user_id,
      push_token: t.push_token,
      platform: t.platform ?? 'android',
      ...(t.provider !== undefined ? { provider: t.provider } : {}),
      ...(t.device_name !== undefined ? { device_name: t.device_name } : {}),
    },
  });
  const status = res.status();
  if (status === 201) {
    const arr = (await res.json()) as Row[];
    return { status, id: (arr[0]?.id as string) ?? null, text: '' };
  }
  return { status, id: null, text: await res.text() };
}

/** Idempotent upsert on the (user_id, push_token) unique key (mirrors the edge's re-registration). */
export async function upsertToken(ctx: APIRequestContext, t: TokenInsert): Promise<number> {
  const res = await ctx.post('/rest/v1/device_tokens?on_conflict=user_id,push_token', {
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    data: { user_id: t.user_id, push_token: t.push_token, platform: t.platform ?? 'android', ...(t.device_name ? { device_name: t.device_name } : {}) },
  });
  return res.status();
}

/** Read device_tokens visible to ctx, filtered to a push_token (RLS applies). */
export async function getTokens(ctx: APIRequestContext, pushToken: string): Promise<Row[]> {
  const res = await ctx.get(
    `/rest/v1/device_tokens?push_token=eq.${encodeURIComponent(pushToken)}&select=id,user_id,platform,provider,push_token,device_name,last_seen_at`,
  );
  if (res.status() !== 200) throw new Error(`getTokens HTTP ${res.status()} — ${await res.text()}`);
  return (await res.json()) as Row[];
}

/** Raw PATCH on a device_token by id — returns rows changed. */
export async function updateTokenRaw(ctx: APIRequestContext, id: string, patch: Row): Promise<{ status: number; changed: number }> {
  const res = await ctx.patch(`/rest/v1/device_tokens?id=eq.${id}`, {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data: patch,
  });
  const status = res.status();
  const changed = status === 200 ? ((await res.json()) as unknown[]).length : 0;
  return { status, changed };
}

/** Raw DELETE on a device_token by id — returns rows deleted. */
export async function deleteTokenRaw(ctx: APIRequestContext, id: string): Promise<{ status: number; deleted: number }> {
  const res = await ctx.delete(`/rest/v1/device_tokens?id=eq.${id}`, { headers: { Prefer: 'return=representation' } });
  const status = res.status();
  const deleted = status === 200 ? ((await res.json()) as unknown[]).length : 0;
  return { status, deleted };
}

/** Safety-net sweep: delete every device_token whose push_token starts with the QA marker. */
export async function sweepTokens(prefix = PUSH_MARKER): Promise<void> {
  const svc = await service();
  try {
    await svc.delete(`/rest/v1/device_tokens?push_token=like.${encodeURIComponent(prefix + '*')}`);
  } finally {
    await svc.dispose();
  }
}
