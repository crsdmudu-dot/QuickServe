import { test, expect } from '@playwright/test';
import { loadEnv } from '../../shared/env';
import { createLogger } from '../../shared/logger';
import { createDataFactory } from '../../shared/data-factory';
import { isOnPath, filterSevereConsoleErrors } from '../support/assertions';

test.describe('framework self-tests', () => {
  test('data factory is deterministic for a given seed', () => {
    const a = createDataFactory(42);
    const b = createDataFactory(42);
    expect(a.email()).toBe(b.email());
    expect(a.fullName()).toBe(b.fullName());
    expect(a.uuid()).toBe(b.uuid());
  });

  test('data factory differs across seeds', () => {
    expect(createDataFactory(1).uuid()).not.toBe(createDataFactory(2).uuid());
  });

  test('data factory produces valid-shaped values', () => {
    const f = createDataFactory(7);
    expect(f.email()).toMatch(/@example\.com$/);
    expect(f.fullName().split(' ').length).toBeGreaterThanOrEqual(2);
    const b = f.bookingDraft();
    expect(typeof b.service).toBe('string');
    expect(b.amount).toBeGreaterThan(0);
  });

  test('env loader returns a base URL and a creds flag', () => {
    const env = loadEnv();
    expect(env.BASE_URL).toMatch(/^https?:\/\//);
    expect(typeof env.hasAdminCreds).toBe('boolean');
    expect(typeof env.START_SERVER).toBe('boolean');
  });

  test('logger child scopes compose and never throw', () => {
    const log = createLogger('root').child('sub');
    expect(() => log.info('hello', { a: 1 })).not.toThrow();
    expect(() => log.error('boom')).not.toThrow();
  });

  test('isOnPath matches exact and path-segment prefix (not string prefix)', () => {
    expect(isOnPath('/login', '/login')).toBe(true);
    expect(isOnPath('/(admin-web)/login', '/(admin-web)')).toBe(true);
    expect(isOnPath('/other', '/login')).toBe(false);
    // Segment-aware: a shared string prefix without a slash boundary is NOT a match.
    expect(isOnPath('/login-extra', '/login')).toBe(false);
  });

  test('filterSevereConsoleErrors drops benign warnings', () => {
    const severe = filterSevereConsoleErrors([
      'Warning: componentWillMount is deprecated',
      'Download the React DevTools',
      'Uncaught TypeError: x is not a function',
    ]);
    expect(severe).toEqual(['Uncaught TypeError: x is not a function']);
  });
});

// --- Task 5: Fixtures self-tests ---
// Import the extended test/expect from fixtures (created in Task 5).
import { test as qaTest, expect as qaExpect } from '../fixtures';

qaTest('fixtures provide logger and deterministic testData', ({ logger, testData }) => {
  qaExpect(typeof logger.info).toBe('function');
  qaExpect(testData.email()).toContain('@example.com');
});

qaTest('adminPage fixture yields a Page', async ({ adminPage }) => {
  qaExpect(typeof adminPage.goto).toBe('function');
});
