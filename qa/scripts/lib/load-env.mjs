/**
 * load-env.mjs — a tiny, dependency-free `.env` loader for QA scripts.
 *
 * Node's `--env-file` works but requires callers to remember the flag. These
 * helpers let a script self-load its `qa/.env` so the normal command is simply:
 *   node qa/scripts/provision-accounts.mjs
 *
 * Design (matches the requirements):
 *  - Path is resolved by the CALLER relative to the script (via import.meta), so
 *    it never depends on the current working directory.
 *  - Values already present in the environment (shell / CI) are NEVER overwritten;
 *    the file only supplies MISSING values.
 *  - No secrets are printed.
 */
import { readFileSync, existsSync } from 'node:fs';

/**
 * Pure: parse `.env` file contents into a plain object.
 * - Ignores blank lines and `#` comments.
 * - Splits on the first `=`; trims key and value.
 * - Strips a single layer of matching surrounding quotes from the value.
 */
export function parseEnvContent(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Pure-ish: set each parsed key into `env` ONLY when it is not already defined.
 * Returns the list of keys actually applied (names only — never values).
 */
export function applyEnvMissing(parsed, env = process.env) {
  const applied = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) {
      env[key] = value;
      applied.push(key);
    }
  }
  return applied;
}

/**
 * Load an env file at `envPath` into `process.env`, filling only missing values.
 * No-op if the file does not exist. Returns applied key names (never values).
 */
export function loadEnvFileIfPresent(envPath, env = process.env) {
  if (!existsSync(envPath)) return [];
  return applyEnvMissing(parseEnvContent(readFileSync(envPath, 'utf-8')), env);
}
