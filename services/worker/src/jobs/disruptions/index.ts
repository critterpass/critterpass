/**
 * Disruption jobs, wired from the worker's environment: the flight disruption agent, the row
 * reactions and the vendor no-answer timer. Building them also hooks the events this process
 * appends and registers the disruption pushes, once per process. The guide's words need
 * `ANTHROPIC_API_KEY` (the DeepSeek key); without it every line is its template.
 */
import type { AssertRouteOn, Telemetry } from '@cp/ai';
import { onEventAppended } from '@cp/db';

import type { AnyJobDefinition } from '../../boss';
import { noAnswerJob } from './apply-vendor-reply';
import { disruptionWriter, gatewayFrom, type GatewayEnv } from './copy';
import { flightDisruptionJob } from './flight-disruption';
import { disruptionEventHook } from './hooks';
import { registerDisruptionNotifications } from './notify';
import { disruptionReactJob } from './react';

export { disruptionEventHook } from './hooks';

export type DisruptionJobsEnv = GatewayEnv;

let hooked = false;

export function disruptionJobs(
  env: DisruptionJobsEnv,
  switches: { readonly assertAiRoute: AssertRouteOn },
  telemetry?: Telemetry,
): AnyJobDefinition[] {
  if (!hooked) {
    hooked = true;
    onEventAppended(disruptionEventHook);
    registerDisruptionNotifications();
  }
  const gateway = gatewayFrom(env, switches.assertAiRoute, telemetry);
  return [flightDisruptionJob(disruptionWriter(gateway)), disruptionReactJob(), noAnswerJob()];
}
