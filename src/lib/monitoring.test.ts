/**
 * monitoring.test.ts
 *
 * Tests for env-gated Sentry monitoring. Mocks @sentry/react-native so no
 * real Sentry network calls or native modules are required.
 */

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
}));

describe('monitoring — without DSN (default test env)', () => {
  beforeEach(() => {
    // Ensure EXPO_PUBLIC_SENTRY_DSN is NOT set
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });

  it('initMonitoring() is a no-op when EXPO_PUBLIC_SENTRY_DSN is unset', async () => {
    const Sentry = await import('@sentry/react-native');
    const { initMonitoring, _resetMonitoringForTest } = await import('@/lib/monitoring');
    _resetMonitoringForTest();
    (Sentry.init as jest.Mock).mockClear();

    initMonitoring();

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('reportError() calls console.error (not captureException) when inactive', async () => {
    const Sentry = await import('@sentry/react-native');
    const { reportError, _resetMonitoringForTest } = await import('@/lib/monitoring');
    _resetMonitoringForTest();
    (Sentry.captureException as jest.Mock).mockClear();

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('test error without dsn');

    expect(() => reportError(err)).not.toThrow();

    expect(consoleSpy).toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('reportError() never throws even when an error value is unusual', async () => {
    const { reportError, _resetMonitoringForTest } = await import('@/lib/monitoring');
    _resetMonitoringForTest();

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => reportError(null)).not.toThrow();
    expect(() => reportError(undefined)).not.toThrow();
    expect(() => reportError('string error')).not.toThrow();
    consoleSpy.mockRestore();
  });
});

describe('monitoring — with DSN set', () => {
  it('initMonitoring() calls Sentry.init with the dsn when DSN is set', async () => {
    const dsn = 'https://test@sentry.example.com/1';

    let initMonitoring!: () => void;
    let reportError!: (err: unknown, ctx?: Record<string, unknown>) => void;
    let _resetMonitoringForTest!: () => void;
    let SentryInit!: jest.Mock;
    let SentryCaptureException!: jest.Mock;

    await jest.isolateModulesAsync(async () => {
      process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;

      const Sentry = await import('@sentry/react-native');
      SentryInit = Sentry.init as jest.Mock;
      SentryCaptureException = Sentry.captureException as jest.Mock;
      SentryInit.mockClear();
      SentryCaptureException.mockClear();

      const mod = await import('@/lib/monitoring');
      initMonitoring = mod.initMonitoring;
      reportError = mod.reportError;
      _resetMonitoringForTest = mod._resetMonitoringForTest;
    });

    // After isolateModules, DSN is baked into the freshly-imported module
    initMonitoring();

    expect(SentryInit).toHaveBeenCalledTimes(1);
    expect(SentryInit).toHaveBeenCalledWith(
      expect.objectContaining({ dsn }),
    );

    // Now that monitoring is active, reportError should call captureException
    const err = new Error('active error');
    reportError(err, { a: 1 });

    expect(SentryCaptureException).toHaveBeenCalledWith(err, { extra: { a: 1 } });

    // Cleanup
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    _resetMonitoringForTest();
  });

  it('reportError() calls captureException without extra when no context given', async () => {
    const dsn = 'https://test@sentry.example.com/2';

    let reportError!: (err: unknown, ctx?: Record<string, unknown>) => void;
    let _resetMonitoringForTest!: () => void;
    let SentryCaptureException!: jest.Mock;

    await jest.isolateModulesAsync(async () => {
      process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;

      const Sentry = await import('@sentry/react-native');
      (Sentry.init as jest.Mock).mockClear();
      SentryCaptureException = Sentry.captureException as jest.Mock;
      SentryCaptureException.mockClear();

      const mod = await import('@/lib/monitoring');
      mod.initMonitoring();           // activate
      reportError = mod.reportError;
      _resetMonitoringForTest = mod._resetMonitoringForTest;
    });

    const err = new Error('no context error');
    reportError(err);

    expect(SentryCaptureException).toHaveBeenCalledWith(err, undefined);

    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    _resetMonitoringForTest();
  });
});
