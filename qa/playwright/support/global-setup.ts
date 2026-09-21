import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loadEnv } from '../../shared/env';
import { createLogger } from '../../shared/logger';
import {
  ADMIN_TEST_BASE_URL,
  assertCertifiedConnectedTarget,
  assertManagedServerBaseUrl,
  CERTIFIED_QA_PROJECT_REF,
} from '../../shared/qa-target';
import { loginAsAdmin, ADMIN_STORAGE_STATE_PATH } from './auth';

/**
 * Global setup — authenticates one admin session against the SEPARATED ADMIN APPLICATION and
 * saves its storage state for the authenticated specs.
 *
 * Two behaviours are deliberately fail-closed here.
 *
 * 1. THE TARGET IS VERIFIED BEFORE A BROWSER IS LAUNCHED. The connected database guard covers
 *    only the PostgREST client; it says nothing about the application the browser drives, whose
 *    backend is baked into the served bundle from EXPO_PUBLIC_SUPABASE_URL. Without this check a
 *    run could sign a real administrator in against a non-QA backend and drive its screens. The
 *    origin must be loopback (the locally launched admin app), the application's project must be
 *    the certified QA project, and the database target must identify that same project. A remote
 *    BASE_URL is refused outright: nothing here can prove which backend a remote deployment was
 *    built against.
 *
 * 2. LOGIN FAILURE IS FATAL. This used to catch the error, log it and continue without an
 *    authenticated state, so every authenticated spec then failed for a misleading reason and a
 *    broken run could look like an ordinary set of test failures. It now throws.
 *
 * Unauthenticated public-smoke runs (no admin credentials configured) are unaffected: they touch
 * no backend, so they neither require nor receive these checks.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const env = loadEnv();
  const log = createLogger('global-setup');

  // Validate what Playwright is ACTUALLY configured with, not what the environment asked for.
  // Reading process.env here would re-trust the very value the config is responsible for
  // rejecting, and would not notice a config that had drifted from the pinned constants.
  const configuredBaseUrl = config.projects[0]?.use?.baseURL ?? env.BASE_URL;
  log.info(`Configured base URL: ${configuredBaseUrl} (managed server: ${env.START_SERVER})`);

  if (!env.hasAdminCreds) {
    log.warn('No E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD — skipping authenticated storageState. Public smoke only.');
    return;
  }

  // Fail closed BEFORE launching a browser or sending any credential.
  //
  // The managed-server check comes first: a loopback origin alone does not prove the server is
  // the one Playwright started for this run, and the credentials below must never reach a
  // process this suite does not own.
  assertManagedServerBaseUrl(configuredBaseUrl);
  assertCertifiedConnectedTarget(configuredBaseUrl);
  log.info(
    `Target verified: Playwright-managed admin instance at ${ADMIN_TEST_BASE_URL}; ` +
      `application and database both resolve to QA project ${CERTIFIED_QA_PROJECT_REF}.`,
  );

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL: configuredBaseUrl });
    await loginAsAdmin(page);
    fs.mkdirSync(path.dirname(ADMIN_STORAGE_STATE_PATH), { recursive: true });
    await page.context().storageState({ path: ADMIN_STORAGE_STATE_PATH });
    log.info(`Saved admin storageState → ${ADMIN_STORAGE_STATE_PATH}`);
  } catch (err) {
    // Fatal: an unauthenticated run must not masquerade as an ordinary set of failing tests.
    log.error('Admin login failed during global-setup — aborting the run.');
    throw err;
  } finally {
    await browser.close();
  }
}
