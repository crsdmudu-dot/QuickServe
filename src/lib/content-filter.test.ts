/**
 * Tests for src/lib/content-filter.ts and for the promise that the word list never ships in the app.
 */
import * as fs from 'fs';
import * as path from 'path';

import { CONTENT_NOT_ALLOWED_MESSAGE, isContentNotAllowed } from '@/lib/content-filter';

describe('content filter helpers', () => {
  it('recognises only the exact server message', () => {
    expect(isContentNotAllowed({ message: 'content_not_allowed' })).toBe(true);
    expect(isContentNotAllowed({ message: 'content_not_allowed: extra' })).toBe(false);
    expect(isContentNotAllowed({ message: 'permission denied' })).toBe(false);
    expect(isContentNotAllowed(null)).toBe(false);
    expect(isContentNotAllowed(undefined)).toBe(false);
  });

  it('the user-facing sentence is plain and does not repeat the text', () => {
    expect(CONTENT_NOT_ALLOWED_MESSAGE).toBe('Please remove offensive language and try again.');
  });

  it('the word list is only in the database migration, never in app code', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/0067_content_filter.sql'), 'utf-8');
    const sample = ['mpumbavu', 'mshenzi', 'kumanyoko'];
    for (const w of sample) expect(sql).toContain(`('${w}')`);
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return walk(p);
        return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
      });
    const appFiles = [...walk(path.join(__dirname, '..')), ...walk(path.join(__dirname, '../../apps/admin/src'))];
    const leaks = appFiles.filter((f) => sample.some((w) => fs.readFileSync(f, 'utf-8').includes(w)));
    expect(leaks).toEqual([]);
  });
});
