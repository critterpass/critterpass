/**
 * `billing.intent_expiry` (fired by the intent's timer 15 minutes after it was taken): the api
 * lapses the boost intent if it is still open, freeing the trip's lock and telling the trip.
 */
import { scheduledJobDataSchema } from '@cp/db';
import { BILLING_QUEUES } from '@cp/domain';

import { defineJob } from '../../boss';
import type { BillingDoor } from './door-client';

export function intentExpiryJob(door: BillingDoor) {
  return defineJob({
    queue: BILLING_QUEUES.intentExpiry,
    schema: scheduledJobDataSchema,
    singletonKey: (data) => data.ref_id,
    handler: async (data) => {
      const outcome = await door.call('expire_intent', { intent_id: data.ref_id });
      return outcome.ok ? { result: outcome.result } : { refused: outcome.code };
    },
  });
}
