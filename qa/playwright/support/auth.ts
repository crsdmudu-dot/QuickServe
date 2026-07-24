import { type Page } from '@playwright/test';
import * as path from 'path';
import { loadEnv } from '../../shared/env';

/** Admin login route. The admin login page is uniquely identified by the
 *  email placeholder 'admin@example.com' (onboarding login uses 'you@example.com'). */
export const ADMIN_LOGIN_PATH = '/(admin-web)/login';
export const ADMIN_EMAIL_PLACEHOLDER = 'admin@example.com';
export const ADMIN_STORAGE_STATE_PATH = path.resolve(__dirname, '../../.auth/admin.json');

/** Drives the admin login form. Requires creds (caller must check hasAdminCreds). */
export async function loginAsAdmin(page: Page): Promise<void> {
  const env = loadEnv();
  if (!env.hasAdminCreds) throw new Error('loginAsAdmin: admin credentials are not set');
  await page.goto(ADMIN_LOGIN_PATH);
  await page.getByPlaceholder(ADMIN_EMAIL_PLACEHOLDER).fill(env.adminEmail as string);
  await page.getByPlaceholder('Your password').fill(env.adminPassword as string);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !new URL(url).pathname.includes('login'), { timeout: 30_000 });
}
