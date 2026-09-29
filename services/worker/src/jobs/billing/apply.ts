/**
 * `billing.apply` (5 retries, then the dead-letter queue): one stored RevenueCat event, verified
 * against RevenueCat and applied by the api. Replaying a processed event is a no-op there.
 */
import { BILLING_QUEUES } from '@cp/domain';
import { z } from 'zod';

import { defineJob } from '../../boss';
import type { BillingDoor } from './door-client';

export function billingApplyJob(door: BillingDoor) {
  return defineJob({
    queue: BILLING_QUEUES.apply,
    schema: z.object({ billing_event_id: z.uuid() }),
    singletonKey: (data) => data.billing_event_id,
    handler: async (data, ctx) => {
      const outcome = await door.call('apply_event', { billing_event_id: data.billing_event_id });
      if (!outcome.ok) {
        ctx.logger.warn(
          { code: outcome.code, event: data.billing_event_id },
          'billing event refused',
        );
        return { refused: outcome.code };
      }
      return { outcome: outcome.result as string };
    },
  });
}
