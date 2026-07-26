import { type Locator, expect } from '@playwright/test';

/**
 * rn-web.ts — helpers for React-Native-Web controlled inputs.
 *
 * A React-Native-Web controlled `TextInput` only echoes typed text after React
 * has hydrated and wired `onChangeText`; on a cold Expo/Metro dev server the field
 * can render seconds before that, so early keystrokes are silently dropped. This
 * primitive types character-by-character and retries the whole fill until the input
 * echoes the value (`toPass`) — the key to flake-free typing.
 *
 * Consumers: `login.page.ts` (readiness probe) and `detailed-analytics.page.ts`
 * (custom date inputs).
 */
export async function hydratedFill(input: Locator, value: string): Promise<void> {
  await input.waitFor({ state: 'visible' });
  await expect(async () => {
    await input.fill('');
    await input.pressSequentially(value);
    await expect(input).toHaveValue(value, { timeout: 1500 });
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] });
}
