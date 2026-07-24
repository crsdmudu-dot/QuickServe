import { type Page } from '@playwright/test';

/** Foundation for every Page Object. Subclasses set `path` and may override waitForReady. */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}
  abstract readonly path: string;

  async goto(): Promise<void> {
    await this.page.goto(this.path);
    await this.waitForReady();
  }

  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }

  url(): string {
    return this.page.url();
  }
}
