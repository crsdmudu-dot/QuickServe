import * as fs from 'fs';
import { type Download } from '@playwright/test';

/**
 * download.ts — read a captured Playwright download as text.
 *
 * Used to verify real export file content (CSV headers, ordering, escaping,
 * formula-injection guard). Consumers: `detailed-analytics.spec.ts` and the
 * `infra-health.spec.ts` health-test.
 */
export async function readDownloadText(download: Download): Promise<string> {
  const filePath = await download.path();
  return fs.readFileSync(filePath, 'utf-8');
}
