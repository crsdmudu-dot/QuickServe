import { type Page, type Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { ADMIN_LOGIN_PATH, ADMIN_EMAIL_PLACEHOLDER } from '../../support/auth';

/** POM EXAMPLE for the admin login page (the framework pattern — not a feature test). */
export class LoginPage extends BasePage {
  readonly path = ADMIN_LOGIN_PATH;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.getByPlaceholder(ADMIN_EMAIL_PLACEHOLDER);
    this.passwordInput = page.getByPlaceholder('Your password');
    this.submitButton = page.getByRole('button', { name: /sign in/i });
  }

  async waitForReady(): Promise<void> {
    await this.emailInput.waitFor({ state: 'visible' });
  }
}
