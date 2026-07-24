import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loadEnv } from '../../shared/env';
import { createLogger } from '../../shared/logger';
import { loginAsAdmin, ADMIN_STORAGE_STATE_PATH } from './auth';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const env = loadEnv();
  const log = createLogger('global-setup');
  log.info(`Base URL: ${env.BASE_URL} (auto-start server: ${env.START_SERVER})`);

  if (!env.hasAdminCreds) {
    log.warn('No E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD — skipping authenticated storageState. Public smoke only.');
    return;
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL: env.BASE_URL });
    await loginAsAdmin(page);
    fs.mkdirSync(path.dirname(ADMIN_STORAGE_STATE_PATH), { recursive: true });
    await page.context().storageState({ path: ADMIN_STORAGE_STATE_PATH });
    log.info(`Saved admin storageState → ${ADMIN_STORAGE_STATE_PATH}`);
  } catch (err) {
    log.error('Admin login failed during global-setup — continuing WITHOUT authed state.', err);
  } finally {
    await browser.close();
  }
}
