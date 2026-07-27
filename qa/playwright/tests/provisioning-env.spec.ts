import * as path from 'path';
import { pathToFileURL } from 'url';
import { test, expect } from '@playwright/test';

/**
 * L0 unit tests for the QA scripts' `.env` loader (`qa/scripts/lib/load-env.mjs`).
 * Locks the behavior the provisioning script relies on: parse correctly and,
 * critically, NEVER overwrite variables already provided by the shell/CI.
 * Pure functions — no browser, no fs, no network. Tag: @infra @meta.
 */
test.describe('QA env loader (unit) @infra @meta', () => {
  // Dynamic import of the .mjs, resolved relative to this test file (CJS __dirname).
  async function loadModule() {
    const p = path.resolve(__dirname, '../../scripts/lib/load-env.mjs');
    return (await import(pathToFileURL(p).href)) as {
      parseEnvContent: (c: string) => Record<string, string>;
      applyEnvMissing: (p: Record<string, string>, env?: Record<string, string | undefined>) => string[];
    };
  }

  test('parseEnvContent handles comments, blanks, quotes, and first-equals split', async () => {
    const { parseEnvContent } = await loadModule();
    const parsed = parseEnvContent(
      [
        '# a comment',
        '',
        'QA_SUPABASE_URL=https://example.supabase.co',
        '  QA_ADMIN_EMAIL = admin@example.com  ',
        'QUOTED="quoted value"',
        "SINGLE='single value'",
        'WITH_EQUALS=a=b=c',
        '# trailing comment',
        'NOEQUALS',
      ].join('\n'),
    );
    expect(parsed.QA_SUPABASE_URL).toBe('https://example.supabase.co');
    expect(parsed.QA_ADMIN_EMAIL).toBe('admin@example.com');
    expect(parsed.QUOTED).toBe('quoted value');
    expect(parsed.SINGLE).toBe('single value');
    expect(parsed.WITH_EQUALS).toBe('a=b=c');
    expect(parsed.NOEQUALS).toBeUndefined();
  });

  test('applyEnvMissing fills missing values but NEVER overwrites existing ones', async () => {
    const { applyEnvMissing } = await loadModule();
    const env: Record<string, string | undefined> = { EXISTING: 'from-shell' };
    const applied = applyEnvMissing({ EXISTING: 'from-file', NEW_KEY: 'from-file' }, env);
    expect(env.EXISTING).toBe('from-shell'); // shell/CI wins
    expect(env.NEW_KEY).toBe('from-file'); // missing value filled
    expect(applied).toEqual(['NEW_KEY']); // only the applied key is reported
  });
});
