import { expect as baseExpect, type Page } from '@playwright/test';

/** Pure: true when `current` equals `expected` or is a path-segment child of it.
 *  Segment-aware: `/login-extra` is NOT considered under `/login` (only `/login/…` is). */
export function isOnPath(current: string, expected: string): boolean {
  if (current === expected) return true;
  const prefix = expected.endsWith('/') ? expected : `${expected}/`;
  return current.startsWith(prefix);
}

/** Pure: drop benign console noise, keep severe errors. */
export function filterSevereConsoleErrors(messages: string[]): string[] {
  const BENIGN = [/^Warning:/i, /React DevTools/i, /\[expo\]/i, /Download the React/i];
  return messages.filter((m) => !BENIGN.some((re) => re.test(m)));
}

export const expect = baseExpect.extend({
  toBeOnPath(page: Page, expected: string) {
    const pathname = new URL(page.url()).pathname;
    const pass = isOnPath(pathname, expected);
    return {
      pass,
      message: () => `expected page path to be "${expected}", but was "${pathname}"`,
    };
  },
});
