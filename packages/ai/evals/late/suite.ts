/**
 * The `late` eval suite (`pnpm --filter @cp/ai eval late`): running-late sheets (cases.yaml)
 * through the real grounded-copy writer on route `late.options`; grading in
 * ../disruption/copy-suite.
 */
import { fileURLToPath } from 'node:url';

import { LATE_LIMITS, writeLateCopy } from '../../src/routes/late';
import { runCopySuite, type CopySuiteOptions } from '../disruption/copy-suite';
import type { SuiteReport } from '../lib/runner';

export const LATE_SUITE = 'late';

export function runLateSuite(options: CopySuiteOptions, threshold: number): Promise<SuiteReport> {
  return runCopySuite(
    {
      name: LATE_SUITE,
      dir: fileURLToPath(new URL('.', import.meta.url)),
      limits: LATE_LIMITS,
      write: (gateway, guide, input) => writeLateCopy(gateway, guide, input),
    },
    options,
    threshold,
  );
}
