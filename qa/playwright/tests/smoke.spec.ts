import { test, expect } from '../fixtures';
import { LoginPage } from '../pages/admin/login.page';

/**
 * Infrastructure smoke — proves the pipeline works end to end:
 * browser launches → web server starts → Admin login page loads →
 * reporters/artifacts engage. Asserts NO business behaviour.
 */
test.describe('infrastructure smoke @smoke', () => {
  test('Admin login page loads', async ({ page, logger }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.emailInput).toBeVisible();
    await expect(login.passwordInput).toBeVisible();
    await expect(login.submitButton).toBeVisible();
    logger.info('Admin login rendered — infrastructure healthy.');
  });
});
