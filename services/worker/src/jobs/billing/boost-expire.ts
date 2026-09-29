/**
 * Boost lifecycle jobs, each one idempotent step in the api: `boost.expire` at a boost's (or a
 * first trip free's) window close, `ftf.grant` when a trip enters setup, and `boost.trip_changed`
 * when a trip is cancelled (its boost moves to the crew's next trip or becomes a credit).
 */
import { scheduledJobDataSchema } from '@cp/db';
import { BILLING_QUEUES } from '@cp/domain';
import { z } from 'zod';

import { defineJob } from '../../boss';
import type { BillingDoor, DoorOutcome } from './door-client';

const settle = (outcome: DoorOutcome) =>
  outcome.ok ? { result: outcome.result as Record<string, unknown> } : { refused: outcome.code };

export function boostExpireJob(door: BillingDoor) {
  return defineJob({
    queue: BILLING_QUEUES.boostExpire,
    schema: scheduledJobDataSchema,
    singletonKey: (data) => data.ref_id,
    handler: async (data) => settle(await door.call('expire_boost', { boost_id: data.ref_id })),
  });
}

const tripJob = z.object({ trip_id: z.uuid() });

export function ftfGrantJob(door: BillingDoor) {
  return defineJob({
    queue: BILLING_QUEUES.ftfGrant,
    schema: tripJob,
    singletonKey: (data) => data.trip_id,
    handler: async (data) => settle(await door.call('grant_ftf', { trip_id: data.trip_id })),
  });
}

export function tripChangedJob(door: BillingDoor) {
  return defineJob({
    queue: BILLING_QUEUES.tripChanged,
    schema: tripJob,
    singletonKey: (data) => data.trip_id,
    handler: async (data) => settle(await door.call('trip_changed', { trip_id: data.trip_id })),
  });
}
