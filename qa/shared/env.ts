import * as dotenv from 'dotenv';
import * as path from 'path';
import { ADMIN_TEST_BASE_URL, assertManagedServerBaseUrl, connectedModeConfigured } from './qa-target';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export type QaEnv = {
  BASE_URL: string;
  START_SERVER: boolean;
  CI: boolean;
  adminEmail?: string;
  adminPassword?: string;
  hasAdminCreds: boolean;
  /** Opt-in connected (real-backend) mode: QA_DASHBOARD_CONNECTED=1. */
  connected: boolean;
  /**
   * True when this run is connected (UI admin credentials and/or a QA database target are
   * configured). Connected runs always drive the Playwright-managed admin instance.
   */
  connectedMode: boolean;
};

/**
 * Base-URL resolution, fail-closed for connected runs.
 *
 * CONNECTED (admin credentials and/or a QA database target configured)
 *   The base URL is DERIVED from the pinned host/port in qa-target.ts and the managed server is
 *   always started. An externally supplied BASE_URL is refused rather than silently ignored,
 *   because it could point at an already-running server this suite does not own — including a
 *   loopback one, which the loopback guard alone would accept. Ownership of the server is part
 *   of the safety property, not a convenience.
 *
 * NON-CONNECTED (public smoke)
 *   External BASE_URL support is retained deliberately: these specs render public pages, mock
 *   their own sessions and touch no backend, so pointing them at an already-served origin is
 *   useful and harmless. With no BASE_URL they use the same managed admin instance.
 */
export function loadEnv(): QaEnv {
  const provided = process.env.BASE_URL?.trim();
  const hasProvided = !!(provided && provided.length > 0);
  const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || undefined;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim() || undefined;
  const connectedMode = connectedModeConfigured();

  // Connected: derived URL, managed server, external override refused.
  if (connectedMode) {
    if (hasProvided) assertManagedServerBaseUrl(provided as string);
    return {
      BASE_URL: ADMIN_TEST_BASE_URL,
      START_SERVER: true,
      CI: !!process.env.CI,
      adminEmail,
      adminPassword,
      hasAdminCreds: !!(adminEmail && adminPassword),
      connected: process.env.QA_DASHBOARD_CONNECTED === '1',
      connectedMode,
    };
  }

  return {
    BASE_URL: hasProvided ? (provided as string) : ADMIN_TEST_BASE_URL,
    START_SERVER: !hasProvided,
    CI: !!process.env.CI,
    adminEmail,
    adminPassword,
    hasAdminCreds: !!(adminEmail && adminPassword),
    connected: process.env.QA_DASHBOARD_CONNECTED === '1',
    connectedMode,
  };
}
