import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export type QaEnv = {
  BASE_URL: string;
  START_SERVER: boolean;
  CI: boolean;
  adminEmail?: string;
  adminPassword?: string;
  hasAdminCreds: boolean;
};

const DEFAULT_BASE_URL = 'http://localhost:8081';

export function loadEnv(): QaEnv {
  const provided = process.env.BASE_URL?.trim();
  const hasProvided = !!(provided && provided.length > 0);
  const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || undefined;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim() || undefined;
  return {
    BASE_URL: hasProvided ? (provided as string) : DEFAULT_BASE_URL,
    START_SERVER: !hasProvided,
    CI: !!process.env.CI,
    adminEmail,
    adminPassword,
    hasAdminCreds: !!(adminEmail && adminPassword),
  };
}
