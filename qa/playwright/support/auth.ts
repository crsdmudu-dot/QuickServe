import { type Page } from '@playwright/test';
import * as path from 'path';
import { loadEnv } from '../../shared/env';

/** Admin login route. The admin login page is uniquely identified by the
 *  email placeholder 'admin@example.com' (onboarding login uses 'you@example.com'). */
export const ADMIN_LOGIN_PATH = '/login';
export const ADMIN_EMAIL_PLACEHOLDER = 'admin@example.com';
export const ADMIN_STORAGE_STATE_PATH = path.resolve(__dirname, '../../.auth/admin.json');

/**
 * Waits until React has attached to the login form.
 *
 * The admin application is built with `web.output: "static"`, so /login is SERVER-RENDERED: both
 * inputs and the Sign in button are present in the raw HTML before the client bundle runs. Playwright
 * will happily fill that static DOM and click that inert button within a couple of seconds. React then
 * hydrates, discards the typed values because the inputs are controlled, and the click is lost — so the
 * run waits for a navigation that can never happen and dies on a 30 s waitForURL that looks like a
 * credential or selector problem but is neither.
 *
 * React tags every DOM node it owns with an internal `__reactFiber$…` / `__reactProps$…` key when it
 * mounts or hydrates, so the presence of that key on the email field is an exact hydration signal. This
 * is a precondition, not a timing cushion: there is no fixed wait, no retry and no fallback selector.
 */
export async function waitForAdminLoginHydration(page: Page): Promise<void> {
  await page.getByPlaceholder(ADMIN_EMAIL_PLACEHOLDER).waitFor({ state: 'visible' });
  await page.waitForFunction(
    (placeholder) => {
      const field = document.querySelector(`input[placeholder="${placeholder}"]`);
      return !!field && Object.keys(field).some((key) => key.startsWith('__react'));
    },
    ADMIN_EMAIL_PLACEHOLDER,
  );
}

/** Drives the admin login form. Requires creds (caller must check hasAdminCreds). */
export async function loginAsAdmin(page: Page): Promise<void> {
  const env = loadEnv();
  if (!env.hasAdminCreds) throw new Error('loginAsAdmin: admin credentials are not set');
  await page.goto(ADMIN_LOGIN_PATH);
  await waitForAdminLoginHydration(page);
  await page.getByPlaceholder(ADMIN_EMAIL_PLACEHOLDER).fill(env.adminEmail as string);
  await page.getByPlaceholder('Your password').fill(env.adminPassword as string);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !new URL(url).pathname.includes('login'), { timeout: 30_000 });
}
