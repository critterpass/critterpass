/**
 * Disruption jobs, wired from the worker's environment: the flight disruption agent, the row
 * reactions, the vendor no-answer timer and the forecast watcher. Building them also hooks the events this process
 * appends and registers the disruption pushes, once per process. The guide's words need
 * `ANTHROPIC_API_KEY` (the DeepSeek key); without it every line is its template.
 */
import { personaIdSchema, writeReplanCopy, type AssertRouteOn, type Telemetry } from '@cp/ai';
import { onEventAppended } from '@cp/db';

import type { AnyJobDefinition } from '../../boss';
import { noAnswerJob } from './apply-vendor-reply';
import { disruptionWriter, gatewayFrom, type GatewayEnv } from './copy';
import { flightDisruptionJob } from './flight-disruption';
import { disruptionEventHook } from './hooks';
import { registerDisruptionNotifications } from './notify';
import { disruptionReactJob } from './react';
import { registerWatchNotifications, watchWriter } from './watch-notify';
import { weatherWatchJob } from './weather-watch';
import { stormCommitJob } from './storm-commit';
import { stormHandoff } from './storm-decision';
import { replanJob, type ReplanWriter } from './weather-replan';

export { disruptionEventHook } from './hooks';

export type DisruptionJobsEnv = GatewayEnv;

function replanWriter(gateway: ReturnType<typeof gatewayFrom>): ReplanWriter {
  return (guide, facts, tripId) => {
    const persona = personaIdSchema.safeParse(guide);
    return writeReplanCopy(gateway, persona.success ? persona.data : 'tokek', facts, { tripId });
  };
}

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
    registerWatchNotifications();
  }
  const gateway = gatewayFrom(env, switches.assertAiRoute, telemetry);
  return [
    flightDisruptionJob(disruptionWriter(gateway)),
    disruptionReactJob(),
    noAnswerJob(),
    weatherWatchJob(watchWriter(gateway), stormHandoff),
    stormCommitJob(),
    replanJob(replanWriter(gateway)),
  ];
}
