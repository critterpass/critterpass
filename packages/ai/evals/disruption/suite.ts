/**
 * The `disruption` eval suite (`pnpm --filter @cp/ai eval disruption`): flight disruption screens
 * (cases.yaml) through the real `writeDisruptionCopy`; see ./copy-suite.ts for the grading.
 */
import { fileURLToPath } from 'node:url';

import { DISRUPTION_LIMITS, writeDisruptionCopy } from '../../src/routes/disruption';
import type { SuiteReport } from '../lib/runner';
import { runCopySuite, type CopySuiteOptions } from './copy-suite';

export const DISRUPTION_SUITE = 'disruption';

export function runDisruptionSuite(
  options: CopySuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  return runCopySuite(
    {
      name: DISRUPTION_SUITE,
      dir: fileURLToPath(new URL('.', import.meta.url)),
      limits: DISRUPTION_LIMITS,
      write: (gateway, guide, input) => writeDisruptionCopy(gateway, guide, input),
    },
    options,
    threshold,
  );
}
