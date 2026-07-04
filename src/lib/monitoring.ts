import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
let _active = false;

/** Initialise crash reporting — NO-OP unless EXPO_PUBLIC_SENTRY_DSN is set (dev/Expo Go/CI safe). */
export function initMonitoring(): void {
  if (!DSN) return;                      // monitoring OFF unless configured
  try {
    Sentry.init({ dsn: DSN, enableAutoSessionTracking: true, tracesSampleRate: 0 });
    _active = true;
  } catch (e) {
    console.error('[monitoring] Sentry init failed', e);
  }
}

/** Report a caught error. Sends to Sentry when active, else logs. Never throws. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  try {
    if (_active) {
      Sentry.captureException(error, context ? { extra: context } : undefined);
    } else {
      console.error('[reportError]', error, context ?? '');
    }
  } catch {
    /* never let reporting crash the app */
  }
}

/** Test-only reset (exported for tests to clear _active between cases). */
export function _resetMonitoringForTest(): void { _active = false; }
