/**
 * Live Activity jobs, wired from the worker's environment: the orchestrator, the minute lifecycle
 * sweep and the channel clean-up, over the shared APNs/FCM providers plus a channel-management
 * client when APNs keys are set. Building them also hooks the orchestrator onto the events this
 * process appends (once per process).
 */
import { onEventAppended, sendInTx, type KillSwitchReader } from '@cp/db';
import {
  LA_BOOST_EVENTS,
  LA_EVENT_TARGETS,
  LA_QUEUES,
  laOrchestrateSingletonKey,
  type AppBundleId,
  type LaOrchestrateJob,
} from '@cp/domain';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../boss';
import type { WorkerEnv } from '../../env';
import type { CopyRenderer, PushProviders } from '../../push';
import { createApnsChannelManager, type ApnsChannelManager } from '../../push/la-channels';
import { laChannelsJob } from './channels';
import { critterLoader } from './critter';
import { registerCritterNearbyNotification } from './critter-fallback';
import { flightLoader } from './flight';
import { leaveByLoader } from './leave-by';
import { meetUpLoader } from './meet-up';
import { rideLoader } from './ride';
import { sosLoader } from './sos';
import { stormLoader } from './storm';
import { voteLoader } from './vote';
import { laLifecycleJob } from './lifecycle';
import { laOrchestrateJob, type LaDeps } from './orchestrate';
import type { LaLoaders } from './snapshot';

export { orchestrateObject } from './orchestrate';
export { runLifecycle } from './lifecycle';

export const LA_LOADERS: LaLoaders = {
  leave_by: leaveByLoader,
  meet_up: meetUpLoader,
  flight: flightLoader,
  vote: voteLoader,
  sos: sosLoader,
  storm: stormLoader,
  ride: rideLoader,
  critter_nearby: critterLoader,
};

/** Queues `la.orchestrate` for the object an event this process appended moves (same tx). */
export async function laEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  const target = LA_EVENT_TARGETS[event.type];
  const jobs: LaOrchestrateJob[] = [];
  if (target !== undefined) {
    const { rows } = await tx.query<{ payload: Record<string, unknown> }>(
      'SELECT payload FROM app.domain_event_for_routing($1)',
      [event.id],
    );
    const hit = rows[0] === undefined ? null : target(rows[0].payload);
    if (hit !== null) jobs.push({ kind: hit.kind, ref_id: hit.refId });
  } else if (LA_BOOST_EVENTS.has(event.type) && event.tripId !== null) {
    const { rows } = await tx.query<{ ref_id: string }>(
      "SELECT ref_id FROM la_object_states WHERE kind = 'meet_up' AND trip_id = $1 AND phase = 'live'",
      [event.tripId],
    );
    jobs.push(...rows.map((row) => ({ kind: 'meet_up' as const, ref_id: row.ref_id })));
  }
  for (const job of jobs) {
    await sendInTx(tx, LA_QUEUES.orchestrate, job, {
      singletonKey: laOrchestrateSingletonKey(job),
    });
  }
}

export interface LaJobsDeps {
  readonly env: WorkerEnv;
  readonly pushProviders: PushProviders;
  readonly renderer: CopyRenderer;
  readonly switches: Pick<KillSwitchReader, 'isOn'>;
  readonly defaultBundleId: AppBundleId;
}

let hooked = false;

function channelManagerFrom(env: WorkerEnv): ApnsChannelManager | undefined {
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_PRIVATE_KEY_PEM) return undefined;
  return createApnsChannelManager({
    credentials: {
      keyId: env.APNS_KEY_ID,
      teamId: env.APNS_TEAM_ID,
      privateKeyPem: env.APNS_PRIVATE_KEY_PEM.replaceAll('\\n', '\n'),
    },
  });
}

export function laJobs(deps: LaJobsDeps): AnyJobDefinition[] {
  if (!hooked) {
    hooked = true;
    onEventAppended(laEventHook);
  }
  registerCritterNearbyNotification();
  const channels = channelManagerFrom(deps.env);
  const transports = {
    ...(deps.pushProviders.apns === undefined ? {} : { apns: deps.pushProviders.apns }),
    ...(deps.pushProviders.fcm === undefined ? {} : { fcm: deps.pushProviders.fcm }),
    ...(channels === undefined ? {} : { channels }),
  };
  const orchestrate: LaDeps = {
    ...transports,
    loaders: LA_LOADERS,
    render: (locale, copy, vars) => deps.renderer.render(locale, copy, vars),
    switches: deps.switches,
    defaultBundleId: deps.defaultBundleId,
  };
  return [
    laOrchestrateJob(orchestrate),
    laLifecycleJob({ ...transports, switches: deps.switches }),
    laChannelsJob(channels),
  ];
}
