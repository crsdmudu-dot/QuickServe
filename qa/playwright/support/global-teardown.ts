import { createLogger } from '../../shared/logger';

export default async function globalTeardown(): Promise<void> {
  createLogger('global-teardown').info('QA run complete.');
}
