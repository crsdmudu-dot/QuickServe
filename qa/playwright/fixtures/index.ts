import { test as base, type Page } from '@playwright/test';
import * as fs from 'fs';
import { createLogger, type Logger } from '../../shared/logger';
import { createDataFactory, type DataFactory } from '../../shared/data-factory';
import { ADMIN_STORAGE_STATE_PATH } from '../support/auth';
import { expect } from '../support/assertions';

type QaFixtures = {
  logger: Logger;
  testData: DataFactory;
  adminPage: Page;
};

/** Reusable authed storageState path — defined only when global-setup produced it.
 *  Future authed tests: `test.use({ storageState: adminStorageState })`. */
export const adminStorageState: string | undefined = fs.existsSync(ADMIN_STORAGE_STATE_PATH)
  ? ADMIN_STORAGE_STATE_PATH
  : undefined;

/** Extended `test` every future test imports (adds logger, deterministic testData, adminPage). */
export const test = base.extend<QaFixtures>({
  logger: async ({}, use, testInfo) => {
    await use(createLogger(testInfo.title));
  },

  testData: async ({}, use) => {
    await use(createDataFactory(1));
  },

  // adminPage: an authed Page when global-setup produced storageState, else unauthenticated.
  // Generic — does NOT navigate anywhere or assert any feature behaviour.
  adminPage: async ({ browser }, use) => {
    const contextOptions = adminStorageState
      ? { storageState: adminStorageState }
      : undefined;

    if (!adminStorageState) {
      createLogger('fixtures').warn('no admin storageState — adminPage is unauthenticated');
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect };
