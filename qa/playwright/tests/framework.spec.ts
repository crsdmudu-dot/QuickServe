import { test, expect } from '@playwright/test';
import { loadEnv } from '../../shared/env';
import { createLogger } from '../../shared/logger';
import { createDataFactory } from '../../shared/data-factory';
import { isOnPath, filterSevereConsoleErrors } from '../support/assertions';
import { validateRpcShape } from '../support/validate-rpc-shape';
import { createRpcTrackerState } from '../support/rpc-interceptor';
import { isConnected } from '../support/connected-mode';

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

// --- Slice 43: QA infrastructure health-tests (L0 — pure, no browser) ---
test.describe('QA infrastructure health (unit) @infra @meta', () => {
  // H1 — the request-shape validator catches every malformed-request class.
  test('validateRpcShape flags missing params, non-POST, bad enums, and non-numbers', () => {
    const post = (body: unknown) => ({ method: () => 'POST', postDataJSON: () => body });

    expect(validateRpcShape(post({ p_from: 'a', p_to: 'b' }), { requireParams: ['p_from', 'p_to'] })).toEqual([]);
    expect(validateRpcShape(post({ p_from: 'a' }), { requireParams: ['p_from', 'p_to'] })).toContain('missing p_to');
    expect(
      validateRpcShape({ method: () => 'GET', postDataJSON: () => ({ p_from: 'a', p_to: 'b' }) }, { requireParams: ['p_from', 'p_to'] }),
    ).toContain('method=GET');
    expect(
      validateRpcShape(post({ p_from: 'a', p_to: 'b', p_bucket: 'hour' }), {
        requireParams: ['p_from', 'p_to'],
        enums: { p_bucket: ['day', 'week', 'month'] },
      }),
    ).toContain('bad p_bucket=hour');
    expect(
      validateRpcShape(post({ p_from: 'a', p_to: 'b' }), { requireParams: ['p_from', 'p_to'], enums: { p_bucket: ['day'] } }),
    ).toContain('missing p_bucket');
    expect(
      validateRpcShape(post({ p_from: 'a', p_to: 'b', p_limit: 'x' }), { requireParams: ['p_from', 'p_to'], numbers: ['p_limit'] }),
    ).toContain('bad p_limit=x');
  });

  // H2 — the tracker assertions actually fail on missing/unexpected/bad-shape.
  test('tracker assertCalled/assertNoAnomalies fail on missing, unexpected, and bad-shape', () => {
    const clean = createRpcTrackerState();
    clean.recordCalled('analytics_kpis', { p_from: 'a', p_to: 'b' });
    expect(() => clean.assertNoAnomalies()).not.toThrow();
    expect(() => clean.assertCalled(['analytics_kpis'])).not.toThrow();
    expect(() => clean.assertCalled(['analytics_kpis', 'analytics_customers'])).toThrow(/analytics_customers/);

    const unexpected = createRpcTrackerState();
    unexpected.recordUnexpected('analytics_rogue');
    expect(() => unexpected.assertNoAnomalies()).toThrow(/analytics_rogue/);

    const bad = createRpcTrackerState();
    bad.recordBadShape('analytics_kpis (missing p_to)');
    expect(() => bad.assertNoAnomalies()).toThrow(/shape/i);
  });

  // H3 — installs are isolated; lastParamsFor returns the latest capture.
  test('two tracker states are independent and lastParamsFor returns the latest', () => {
    const a = createRpcTrackerState();
    const b = createRpcTrackerState();
    a.recordCalled('analytics_kpis', { p_from: 'x1', p_to: 'y1' });
    a.recordCalled('analytics_kpis', { p_from: 'x2', p_to: 'y2' });
    expect(a.lastParamsFor('analytics_kpis')?.p_from).toBe('x2');
    // b is untouched — no cross-install leakage.
    expect(b.called).toHaveLength(0);
    expect(b.lastParamsFor('analytics_kpis')).toBeUndefined();
  });

  // H4 — connected mode never activates implicitly.
  test('connected mode does not activate without QA_DASHBOARD_CONNECTED=1', () => {
    const original = process.env.QA_DASHBOARD_CONNECTED;
    try {
      delete process.env.QA_DASHBOARD_CONNECTED;
      expect(isConnected()).toBe(false);
      process.env.QA_DASHBOARD_CONNECTED = '0';
      expect(isConnected()).toBe(false);
      process.env.QA_DASHBOARD_CONNECTED = '1';
      expect(isConnected()).toBe(true);
    } finally {
      if (original === undefined) delete process.env.QA_DASHBOARD_CONNECTED;
      else process.env.QA_DASHBOARD_CONNECTED = original;
    }
  });
});
