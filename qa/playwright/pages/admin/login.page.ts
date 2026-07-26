import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';
import { ADMIN_LOGIN_PATH, ADMIN_EMAIL_PLACEHOLDER } from '../../support/auth';
import { hydratedFill } from '../../support/rn-web';

/**
 * Page Object for the QuickServe admin login screen (`(admin-web)/login`).
 *
 * Locators target only stable, user-visible anchors (heading text, input
 * placeholders, the accessible button role, and the exact validation copy the
 * app renders) — no test-only hooks are added to the application. All
 * interactions live here so specs stay declarative; no assertions live in the
 * Page Object (specs own the assertions).
 */
export class LoginPage extends BasePage {
  readonly path = ADMIN_LOGIN_PATH;

  /** Static page heading — proves the *admin* login rendered. */
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  /** Client-side validation messages (from `validateLogin`). */
  readonly emailRequiredError: Locator;
  readonly invalidEmailError: Locator;
  readonly passwordRequiredError: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByText('Admin Panel', { exact: true });
    this.emailInput = page.getByPlaceholder(ADMIN_EMAIL_PLACEHOLDER);
    this.passwordInput = page.getByPlaceholder('Your password');
    this.submitButton = page.getByRole('button', { name: /sign in/i });
    this.emailRequiredError = page.getByText('Email is required', { exact: true });
    this.invalidEmailError = page.getByText('Enter a valid email', { exact: true });
    this.passwordRequiredError = page.getByText('Password is required', { exact: true });
  }

  /**
   * The admin login is ready once its email field not only renders but is
   * *interactive*. A React-Native-Web controlled input only echoes typed text
   * after React has hydrated and wired `onChangeText`; on a cold Expo/Metro dev
   * server the field can render seconds before that, so early keystrokes are
   * silently dropped. We therefore retry a type-and-verify probe until the input
   * echoes it (`toPass`), then clear it. This makes every subsequent interaction
   * (fill / submit) land on a fully-hydrated form — the key to a flake-free suite.
   */
  async waitForReady(): Promise<void> {
    // Probe the email field with the shared hydration gate until it echoes typed
    // text (React wired `onChangeText`), then clear it so the form starts empty.
    await hydratedFill(this.emailInput, 'probe');
    await this.emailInput.fill('');
    await expect(this.emailInput).toHaveValue('');
  }

  /**
   * Fill the credential fields without submitting.
   *
   * The app's inputs are React-Native-Web controlled `TextInput`s whose value
   * lives in React state. We clear then type character-by-character
   * (`pressSequentially`) so each keystroke drives `onChangeText` and the
   * controlled state is committed before submit — avoiding a value-vs-state
   * race that a bulk `fill()` can lose on controlled RN-Web inputs.
   */
  async fill(email: string, password: string): Promise<void> {
    await this.emailInput.click();
    await this.emailInput.fill('');
    await this.emailInput.pressSequentially(email);
    await this.passwordInput.click();
    await this.passwordInput.fill('');
    await this.passwordInput.pressSequentially(password);
  }

  /** Submit the form (click "Sign in"). */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Fill + submit in one step. */
  async login(email: string, password: string): Promise<void> {
    await this.fill(email, password);
    await this.submit();
  }
}
