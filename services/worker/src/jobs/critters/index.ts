/**
 * Critter jobs, and (once per process) the hook that queues egg grants and landed hatches for the
 * events this process appends, the rewards fan-out and the critter pushes.
 */
import { onEventAppended, sendInTx } from '@cp/db';
import { critterJobsForEvent } from '@cp/domain';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../boss';
import { rewardFanoutJob } from '../rewards';
import { crewCountsJob } from './crew-counts';
import { grantEggsJob } from './grant-on-boarded';
import { hatchJob } from './hatch-on-landed';
import { registerCritterPushes } from './pushes';
import { retentionJob } from './retention';
import { verifyJob } from './verify';

export async function critterEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  for (const job of critterJobsForEvent(event)) {
    await sendInTx(tx, job.queue, job.data, { singletonKey: job.singletonKey });
  }
}

let hooked = false;

export function critterJobs(): AnyJobDefinition[] {
  if (!hooked) {
    hooked = true;
    onEventAppended(critterEventHook);
  }
  return [
    verifyJob(),
    grantEggsJob(),
    hatchJob(),
    crewCountsJob(),
    rewardFanoutJob(),
    retentionJob(),
  ];
}

export { registerCritterPushes };
