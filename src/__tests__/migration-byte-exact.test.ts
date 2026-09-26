/**
 * migration-byte-exact.test.ts — every migration from 0040 on must be checked out byte-exact.
 *
 * A migration must reach the database with exactly the bytes that were reviewed. On Windows,
 * core.autocrlf=true converts text files to CRLF on checkout, which changes function bodies if a
 * migration is ever pushed from such a working tree (and makes deletion-work-migration-guard fail
 * locally). `.gitattributes` therefore marks migration files `-text` (no conversion).
 *
 * This test fails when a migration file from 0040 on is not covered by a `-text` rule, so a new range
 * (for example 0080+) cannot be added without extending the rule.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

/** Turns the simple globs used in .gitattributes ("*" and "[0-9]") into a regular expression. */
function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      source += '[^/]*';
    } else if (c === '[') {
      const end = glob.indexOf(']', i);
      source += glob.slice(i, end + 1);
      i = end;
    } else {
      source += c.replace(/[.+?^${}()|\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

const noConversionRules = fs
  .readFileSync(path.join(ROOT, '.gitattributes'), 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/))
  .filter((parts) => parts.length >= 2 && parts.slice(1).includes('-text'))
  .map((parts) => globToRegExp(parts[0]));

const migrationsFrom0040 = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((name) => /^\d{4}_.*\.sql$/.test(name) && Number(name.slice(0, 4)) >= 40);

describe('migrations are checked out byte-exact', () => {
  test('there are migrations to check (guards against an empty or moved folder)', () => {
    expect(migrationsFrom0040.length).toBeGreaterThan(0);
  });

  test.each(migrationsFrom0040)('%s is covered by a -text rule in .gitattributes', (name) => {
    const relativePath = `supabase/migrations/${name}`;
    expect(noConversionRules.some((rule) => rule.test(relativePath))).toBe(true);
  });
});
