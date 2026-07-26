import { type Page } from '@playwright/test';
import { loadEnv } from '../../shared/env';
import { LoginPage } from '../pages/admin/login.page';

/**
 * connected-mode.ts — single source of truth for the optional connected
 * (real-backend) test mode shared by the admin feature suites.
 *
 * Default is offline mock mode. "Connected" mode uses the REAL admin login and a
 * reachable Supabase backend, gated on `QA_DASHBOARD_CONNECTED=1` + `E2E_ADMIN_*`.
 * Consumers: `executive-dashboard.spec.ts`, `detailed-analytics.spec.ts`.
 */

/** True only when explicitly opted in via `QA_DASHBOARD_CONNECTED=1`. */
export function isConnected(): boolean {
  return loadEnv().connected;
}

/** True when admin credentials are configured (a proxy for a reachable backend). */
export function hasAdminCreds(): boolean {
  return loadEnv().hasAdminCreds;
}

/**
 * Perform a REAL admin login (connected mode). Reuses `LoginPage` so the
 * hydration gate and selectors stay in one place. Requires creds (callers gate on
 * `hasAdminCreds()`).
 */
export async function connectedAdminLogin(page: Page): Promise<void> {
  const env = loadEnv();
  const login = new LoginPage(page);
  await login.goto();
  await login.login(env.adminEmail as string, env.adminPassword as string);
  await page.waitForURL((u) => !new URL(u).pathname.includes('login'), { timeout: 30_000 });
}
