/**
 * Help and SOS jobs, wired from the worker's environment: the SOS summary words on DeepSeek when
 * the model key is set (the sender's own words otherwise), responder ETAs route on Valhalla when
 * `VALHALLA_URL` is set (straight-line "about" otherwise). Building them registers the Help and
 * SOS pushes once per process.
 */
import { createGateway, writeSosSummary, type AssertRouteOn, type Telemetry } from '@cp/ai';
import { SOS_SUMMARY_TIMEOUT_MS } from '@cp/domain';

import type { AnyJobDefinition } from '../../boss';
import { createCopyRenderer } from '../../push';
import { straightLineRouter, valhallaRouter } from '../live-map/meetup-router';
import { helpShareEndingJob } from './help-share-ending';
import { helpShareExpireJob } from './help-share-expire';
import { registerSafetyNotifications } from './notify';
import { safetyRetentionJob } from './safety-retention';
import { sosEscalateJob } from './sos-escalate';
import { sosOrchestrateJob, type SosSummariser } from './sos-orchestrate';
import { sosResponderEtaJob } from './sos-responder-eta';

export { registerSafetyNotifications } from './notify';

export interface SafetyJobsEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly VALHALLA_URL?: string | undefined;
}

function summariser(
  env: SafetyJobsEnv,
  assertRouteOn: AssertRouteOn,
  telemetry: Telemetry | undefined,
): SosSummariser | undefined {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined) return undefined;
  const gateway = createGateway({
    apiKey,
    ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
    ...(telemetry === undefined ? {} : { telemetry }),
    assertRouteOn,
    maxAttempts: 1,
  });
  return async (input, context) =>
    (await writeSosSummary(gateway, input, { timeoutMs: SOS_SUMMARY_TIMEOUT_MS, context })).summary;
}

let registered = false;

export function safetyJobs(
  env: SafetyJobsEnv,
  switches: { readonly assertAiRoute: AssertRouteOn },
  telemetry?: Telemetry,
): AnyJobDefinition[] {
  if (!registered) {
    registered = true;
    registerSafetyNotifications();
  }
  const router =
    env.VALHALLA_URL === undefined
      ? straightLineRouter
      : valhallaRouter({ baseUrl: env.VALHALLA_URL });
  return [
    sosOrchestrateJob({
      renderer: createCopyRenderer(),
      summarise: summariser(env, switches.assertAiRoute, telemetry),
    }),
    sosEscalateJob(),
    sosResponderEtaJob(router),
    helpShareExpireJob(),
    helpShareEndingJob(),
    safetyRetentionJob(),
  ];
}
