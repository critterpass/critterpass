/** Pitch prewarm and the deck's Home tip candidates. */
import { createGateway, type AssertRouteOn, type Telemetry } from '@cp/ai';

import type { AnyJobDefinition } from '../../boss';
import { pitchPrewarmJob } from './prewarm';

export {
  deckPlaces,
  pitchPrewarmJob,
  prewarmPitches,
  registerPitchTipCandidates,
  PITCH_PREWARM_QUEUE,
  type GatewayFactory,
} from './prewarm';

export function pitchJobs(
  env: {
    readonly ANTHROPIC_API_KEY?: string | undefined;
    readonly ANTHROPIC_BASE_URL?: string | undefined;
  },
  assertRouteOn: AssertRouteOn,
  telemetry?: Telemetry,
): AnyJobDefinition[] {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined) return [pitchPrewarmJob(undefined)];
  return [
    pitchPrewarmJob((onUsage) =>
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
