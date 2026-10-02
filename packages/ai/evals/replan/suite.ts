/**
 * The `replan` eval suite (`pnpm --filter @cp/ai eval replan`): weather move suggestions
 * (cases.yaml) through the real grounded-copy writer on route `replan.weather`; grading in
 * ../disruption/copy-suite.ts.
 */
import { fileURLToPath } from 'node:url';

import { writeGroundedCopy } from '../../src/routes/disruption';
import { REPLAN_LIMITS, REPLAN_ROUTE, REPLAN_TASK } from '../../src/routes/replan';
import { runCopySuite, type CopySuiteOptions } from '../disruption/copy-suite';
import type { SuiteReport } from '../lib/runner';

export const REPLAN_SUITE = 'replan';

export function runReplanSuite(options: CopySuiteOptions, threshold: number): Promise<SuiteReport> {
  return runCopySuite(
    {
      name: REPLAN_SUITE,
      dir: fileURLToPath(new URL('.', import.meta.url)),
      limits: REPLAN_LIMITS,
      write: (gateway, guide, input) =>
        writeGroundedCopy(gateway, {
          route: REPLAN_ROUTE,
          guide,
          task: REPLAN_TASK,
          question: 'Word the suggestion.',
          input,
          limits: REPLAN_LIMITS,
        }),
    },
    options,
    threshold,
  );
}
