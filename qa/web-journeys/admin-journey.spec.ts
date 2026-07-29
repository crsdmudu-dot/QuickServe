import { test, expect } from '@playwright/test';
import {
  seedBooking,
  readBooking,
  providerId,
  cleanupBookings,
  residualCount,
  uiLogin,
  uiAssignInApp,
  uiSetStatus,
  waitForServer,
  type SeededBooking,
} from './support/admin-web';

/**
 * Phase 3A — Admin Web Journey Connected Certification.
 *
 * Drives the REAL admin web UI (the web product surface) against the dedicated QA
 * Supabase project. API/service-role is used only to SEED a booking and to VERIFY
 * persisted effects + CLEAN UP — never to perform the behavior under test. Serial,
 * Chromium-only (see playwright.web.config.ts). QA accounts are never modified.
 *
 * The customer/provider journeys are MOBILE surfaces and are out of scope here
 * (their backend is certified by the 116-test connected suite; their UI needs a
 * later native/mobile phase). Full Platform Certification is not claimed.
 */
const ADMIN = () => ({ email: process.env.QA_ADMIN_EMAIL as string, password: process.env.QA_ADMIN_PASSWORD as string });
const CUSTOMER = () => ({ email: process.env.QA_CUSTOMER_EMAIL as string, password: process.env.QA_CUSTOMER_PASSWORD as string });
const PROVIDER1_NAME = 'QA Provider One';

const seeded: string[] = [];
async function seed(): Promise<SeededBooking> {
  const b = await seedBooking();
  seeded.push(b.id);
  return b;
}

test.afterAll(async () => {
  await cleanupBookings(seeded);
});

// ── Journey A — Admin authentication ────────────────────────────────────────

test.describe('Phase 3A — Admin authentication', () => {
  test('the admin login page renders and a valid admin reaches the panel; logout returns to login', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/sign in with your admin account/i)).toBeVisible();
    expect(await page.locator('input').count(), 'email + password fields').toBeGreaterThanOrEqual(2);

    await uiLogin(page, ADMIN().email, ADMIN().password);
    // Authenticated admin sees the panel navigation.
    await expect(page.getByRole('button', { name: 'Bookings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();

    // Logout returns to the admin login.
    await page.getByRole('button', { name: /sign out/i }).first().click();
    await expect(page.getByText(/sign in with your admin account/i)).toBeVisible();
  });

  test('unauthenticated access to a protected admin route is denied (redirect to login)', async ({ page }) => {
    await page.goto('/bookings', { waitUntil: 'domcontentloaded' });
    // The (admin-web) guard redirects to the login screen; no admin data is shown.
    await expect(page.getByText(/sign in with your admin account/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Providers' })).toHaveCount(0);
  });
});

// ── Journey B — Non-admin rejection ─────────────────────────────────────────

test.describe('Phase 3A — Non-admin rejection', () => {
  test('a valid non-admin account cannot use the admin panel and sees no protected data', async ({ page }) => {
    await uiLogin(page, CUSTOMER().email, CUSTOMER().password);
    await expect(page.getByText(/not authorized/i)).toBeVisible();
    await expect(page.getByText(/does not have admin access/i)).toBeVisible();
    // No admin navigation / protected data is exposed.
    await expect(page.getByRole('button', { name: 'Bookings' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Payments' })).toHaveCount(0);

    // Direct navigation to a protected route stays denied for the non-admin session.
    await page.goto('/bookings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/not authorized/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Providers' })).toHaveCount(0);
  });
});

// ── Journey C — Admin booking discovery ─────────────────────────────────────

test.describe('Phase 3A — Booking discovery', () => {
  test('an admin can open the Bookings area and view a seeded booking’s details', async ({ page }) => {
    const b = await seed();
    await uiLogin(page, ADMIN().email, ADMIN().password);

    // The Bookings area renders.
    await page.goto('/bookings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Bookings' })).toBeVisible();

    // Open the seeded booking's detail (deterministic discovery via its route).
    await page.goto(`/bookings/${b.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Booking Summary')).toBeVisible();
    await expect(page.getByText('House Cleaning')).toBeVisible();
    await expect(page.getByText('Pending').first()).toBeVisible();
    await expect(page.getByText(b.marker).first(), 'the seeded booking is identifiable by its marker').toBeVisible();
  });
});

// ── Journey D — Admin dispatch & provider assignment ────────────────────────

test.describe('Phase 3A — Dispatch and provider assignment', () => {
  test('an admin assigns an in-app provider through the UI and the assignment persists', async ({ page }) => {
    const b = await seed();
    const p1 = await providerId('provider1');
    await uiLogin(page, ADMIN().email, ADMIN().password);
    await page.goto(`/bookings/${b.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Booking Summary')).toBeVisible();

    // Assign QA Provider One via the In-app assignment control.
    await uiAssignInApp(page, PROVIDER1_NAME);

    // Persisted against the QA backend: assigned to provider1, status advanced.
    const row = await waitForServer(
      () => readBooking(b.id),
      (r) => r.assigned_provider_id === p1 && r.status === 'provider_assigned',
    );
    expect(row.assigned_provider_id).toBe(p1);
    expect(row.status).toBe('provider_assigned');
    expect(String(row.assigned_provider_name ?? '')).toContain('QA Provider One');

    // The UI reflects the assignment.
    await expect(page.getByText(/provider assigned/i).first()).toBeVisible();
  });
});

// ── Journey E — Admin booking status handling ───────────────────────────────

test.describe('Phase 3A — Booking status handling', () => {
  test('an admin can change a booking status through the UI and it persists', async ({ page }) => {
    const b = await seed();
    await uiLogin(page, ADMIN().email, ADMIN().password);
    await page.goto(`/bookings/${b.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Booking Summary')).toBeVisible();

    // Admin accepts the pending booking via Update Status.
    await uiSetStatus(page, 'Accepted');
    const row = await waitForServer(() => readBooking(b.id), (r) => r.status === 'accepted');
    expect(row.status).toBe('accepted');
  });
});

// ── Journey F — Authorization & data isolation ──────────────────────────────

test.describe('Phase 3A — Authorization and data isolation', () => {
  test('a protected booking-detail route is inaccessible without an admin session', async ({ page }) => {
    const b = await seed();
    // No login → the guard must not expose the booking.
    await page.goto(`/bookings/${b.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/sign in with your admin account/i)).toBeVisible();
    await expect(page.getByText('Booking Summary')).toHaveCount(0);
    await expect(page.getByText(b.marker)).toHaveCount(0);
  });

  test('cleanup leaves zero residual Phase-3A bookings', async () => {
    await cleanupBookings(seeded);
    expect(await residualCount(), 'no residual Phase-3A bookings').toBe(0);
  });
});
