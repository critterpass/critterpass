/**
 * The `watch` eval suite (`pnpm --filter @cp/ai eval watch`): forecast watch lists (cases.yaml)
 * through the real grounded-copy writer on route `watch.copy`; grading in ../disruption/copy-suite.
 */
import { fileURLToPath } from 'node:url';

import { writeGroundedCopy } from '../../src/routes/disruption';
import { WATCH_LIMITS, WATCH_ROUTE, WATCH_TASK } from '../../src/routes/watch';
import { runCopySuite, type CopySuiteOptions } from '../disruption/copy-suite';
import type { SuiteReport } from '../lib/runner';

export const WATCH_SUITE = 'watch';

export function runWatchSuite(options: CopySuiteOptions, threshold: number): Promise<SuiteReport> {
  return runCopySuite(
    {
      name: WATCH_SUITE,
      dir: fileURLToPath(new URL('.', import.meta.url)),
      limits: WATCH_LIMITS,
      write: (gateway, guide, input) =>
        writeGroundedCopy(gateway, {
          route: WATCH_ROUTE,
          guide,
          task: WATCH_TASK,
          question: 'Word the watch list.',
          input,
          limits: WATCH_LIMITS,
        }),
    },
    options,
    threshold,
  );
}
