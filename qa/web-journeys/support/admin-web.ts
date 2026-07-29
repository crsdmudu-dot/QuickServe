import { type Page, type APIRequestContext, request, expect } from '@playwright/test';

/**
 * admin-web.ts — Phase 3A connected admin-web helpers.
 *
 * API/service-role is used for SEED + CLEANUP only (never to perform the behavior
 * under test). All journey actions go through the real admin UI. Bookings are
 * created with a Phase-3A marker for a deterministic service-role sweep; QA
 * accounts are never modified.
 */

const QA_URL = () => {
  const u = process.env.QA_SUPABASE_URL?.trim();
  if (!u) throw new Error('QA_SUPABASE_URL is required.');
  // Guard: never target the app's own project.
  const app = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (app && new URL(u).host === new URL(app).host) {
    throw new Error('REFUSING TO RUN: QA_SUPABASE_URL equals the app project host.');
  }
  return u;
};
const ANON = () => process.env.QA_SUPABASE_ANON_KEY as string;
const SR = () => {
  const k = process.env.QA_SERVICE_ROLE_KEY?.trim();
  if (!k) throw new Error('QA_SERVICE_ROLE_KEY is required for seed/cleanup.');
  return k;
};

export const P3A_MARKER = 'QA-CERT-M3-P3A';
export const makeMarker = () => `${P3A_MARKER}-${crypto.randomUUID()}`;

async function api(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: QA_URL(), extraHTTPHeaders: { apikey: ANON(), 'Content-Type': 'application/json' } });
}
async function service(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: QA_URL(), extraHTTPHeaders: { apikey: SR(), Authorization: `Bearer ${SR()}`, 'Content-Type': 'application/json' } });
}
async function j(ctx: APIRequestContext, method: 'post' | 'get' | 'patch' | 'delete', url: string, data?: unknown, headers?: Record<string, string>) {
  const res = await ctx[method](url, { headers, ...(data !== undefined ? { data } : {}) });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status(), body };
}

// ── Seed / read / cleanup (API — setup only) ────────────────────────────────

export type SeededBooking = { id: string; marker: string; customerId: string };

/** Sign in the QA customer and create a booking via the API (seed only). */
export async function seedBooking(): Promise<SeededBooking> {
  const ctx = await api();
  try {
    const si = await j(ctx, 'post', '/auth/v1/token?grant_type=password', {
      email: process.env.QA_CUSTOMER_EMAIL, password: process.env.QA_CUSTOMER_PASSWORD,
    });
    const token = (si.body as { access_token: string; user: { id: string } }).access_token;
    const customerId = (si.body as { user: { id: string } }).user.id;
    const marker = makeMarker();
    const res = await j(ctx, 'post', '/rest/v1/bookings',
      { customer_id: customerId, service_id: 'house-cleaning', address: `P3A ${marker}`, scheduled_for: new Date(Date.now() + 3600e3).toISOString(), notes: marker, scheduling_type: 'datetime', recurrence: 'one_time' },
      { apikey: ANON(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' });
    if (res.status !== 201) throw new Error(`seedBooking HTTP ${res.status}`);
    const id = (res.body as { id: string }[])[0].id;
    return { id, marker, customerId };
  } finally { await ctx.dispose(); }
}

/** Read a booking's server state via the service role (assertion of persisted effect). */
export async function readBooking(id: string): Promise<Record<string, unknown>> {
  const ctx = await service();
  try {
    const r = await j(ctx, 'get', `/rest/v1/bookings?id=eq.${id}&select=id,status,assigned_provider_id,assigned_provider_name,customer_id`);
    return ((r.body as Record<string, unknown>[]) ?? [])[0] ?? {};
  } finally { await ctx.dispose(); }
}

/** The QA provider ids by role (for assertion of the assigned provider). */
export async function providerId(role: 'provider1' | 'provider2'): Promise<string> {
  const ctx = await api();
  try {
    const email = role === 'provider1' ? process.env.QA_PROVIDER1_EMAIL : process.env.QA_PROVIDER2_EMAIL;
    const pw = role === 'provider1' ? process.env.QA_PROVIDER1_PASSWORD : process.env.QA_PROVIDER2_PASSWORD;
    const si = await j(ctx, 'post', '/auth/v1/token?grant_type=password', { email, password: pw });
    return (si.body as { user: { id: string } }).user.id;
  } finally { await ctx.dispose(); }
}

/** Delete specific bookings + sweep any Phase-3A marker leftovers (service role). */
export async function cleanupBookings(ids: string[]): Promise<void> {
  const ctx = await service();
  try {
    if (ids.length) await ctx.delete(`/rest/v1/bookings?id=in.(${ids.map((i) => `"${i}"`).join(',')})`);
    await ctx.delete(`/rest/v1/bookings?notes=like.${encodeURIComponent(P3A_MARKER + '*')}`);
  } finally { await ctx.dispose(); }
}

/** Count residual Phase-3A bookings (post-run verification). */
export async function residualCount(): Promise<number> {
  const ctx = await service();
  try {
    const r = await j(ctx, 'get', `/rest/v1/bookings?notes=like.${encodeURIComponent(P3A_MARKER + '*')}&select=id`);
    return ((r.body as unknown[]) ?? []).length;
  } finally { await ctx.dispose(); }
}

// ── UI actions (the behavior under test) ────────────────────────────────────

/** Log in through the real admin-web login form. Waits until the auth attempt has
 *  RESOLVED (the login screen navigates away — to the panel for an admin, or to the
 *  "Not authorized" state for a non-admin) so callers can safely navigate next. */
export async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const emailIn = page.locator('input[type="email"]').first();
  const pwIn = page.locator('input[type="password"]').first();
  await emailIn.waitFor({ state: 'visible' });
  // React-Native-Web controlled inputs update state via onChangeText — a raw
  // `.fill()` does not reliably trigger it, so type real key events instead.
  await emailIn.click();
  await emailIn.pressSequentially(email, { delay: 12 });
  await pwIn.click();
  await pwIn.pressSequentially(password, { delay: 12 });
  await page.getByRole('button', { name: /sign in/i }).first().click();
  // The admin login heading is only shown on the login screen; once the guard
  // resolves the session it unmounts (panel or "Not authorized" renders instead).
  await expect(page.getByText(/sign in with your admin account/i)).toBeHidden({ timeout: 45_000 });
}

/** Assign the given approved provider to the open booking detail via In-app mode.
 *  In In-app mode each approved provider is a button (name + phone); clicking it
 *  performs the assignment directly (there is no separate "Assign" button — that
 *  belongs to Manual mode). */
export async function uiAssignInApp(page: Page, providerName: string): Promise<void> {
  await page.getByRole('button', { name: /^In-app$/ }).first().click();
  await page.getByRole('button', { name: new RegExp(providerName) }).first().click();
}

/** Set booking status via the Update Status control. */
export async function uiSetStatus(page: Page, statusLabel: string): Promise<void> {
  await page.getByText('Update Status', { exact: false }).first().waitFor({ state: 'visible' });
  await page.getByRole('button', { name: new RegExp(`^${statusLabel}$`) }).first().click();
}

/** Poll the server until a predicate holds (no fixed sleeps). */
export async function waitForServer<T>(read: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 20_000): Promise<T> {
  await expect.poll(async () => ok(await read()), { timeout: timeoutMs, intervals: [500, 1000, 1500] }).toBe(true);
  return read();
}
