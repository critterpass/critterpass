/**
 * Home tips: the detectors, the generator job and its fare-drop hook. Without a model key the
 * generator stores the deterministic template line.
 */
import { createGateway, type AssertRouteOn, type Telemetry } from '@cp/ai';

import type { AnyJobDefinition } from '../../boss';
import { tipsGenerateJob } from './generate';

export { registerTipCandidateSource, type TipCandidate, type TipCandidateSource } from './detect';
export { generateTips, tipsEventHook, tipsGenerateJob, type TipPhraser } from './generate';

export interface TipsJobsEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
}

export function tipsJobs(
  env: TipsJobsEnv,
  assertRouteOn: AssertRouteOn,
  telemetry?: Telemetry,
): AnyJobDefinition[] {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined) return [tipsGenerateJob()];
  return [
    tipsGenerateJob((onUsage) =>
      createGateway({
        apiKey,
        ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
        ...(telemetry === undefined ? {} : { telemetry }),
        onUsage,
        assertRouteOn,
      }),
    ),
  ];
}
