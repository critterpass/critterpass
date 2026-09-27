import { execFileSync } from 'node:child_process';

import { E2E_DB_CONTAINER } from './e2e-env';

// eslint-disable-next-line no-restricted-syntax -- Playwright loads global setup/teardown by default export.
export default function globalTeardown(): void {
  if (process.env['ADMIN_E2E_KEEP_DB'] === 'true') return;
  execFileSync('docker', ['rm', '-f', E2E_DB_CONTAINER], { stdio: 'ignore' });
}
