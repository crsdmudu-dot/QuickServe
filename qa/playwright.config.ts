import { defineConfig } from '@playwright/test';

// Minimal config — hardened in Task 2.
export default defineConfig({
  testDir: './playwright',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  reporter: [['list']],
});
