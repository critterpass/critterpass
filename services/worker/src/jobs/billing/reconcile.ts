/**
 * `billing.reconcile` (daily, 05:00 Singapore): walks every customer with a live store
 * subscription through the api in batches, until the api reports none left or the run's time
 * budget is spent (the next run picks the rest up again from the start; every step is idempotent).
 */
import { BILLING_QUEUES, reconcileResultSchema, type ReconcileResult } from '@cp/domain';
import { z } from 'zod';

import { defineJob } from '../../boss';
import type { BillingDoor } from './door-client';

export const RECONCILE_BATCH = 100;
const RUN_BUDGET_MS = 25 * 60 * 1000;

export async function runReconcile(
  door: BillingDoor,
  now: () => number = () => Date.now(),
): Promise<Omit<ReconcileResult, 'next_after_user_id'> & { complete: boolean }> {
  const started = now();
  const totals = { checked: 0, drifted: 0, failed: 0 };
  let after: string | null = null;
  do {
    const outcome = await door.call('reconcile', { after_user_id: after, limit: RECONCILE_BATCH });
    if (!outcome.ok) throw new Error(`reconcile refused: ${outcome.code}`);
    const batch = reconcileResultSchema.parse(outcome.result);
    totals.checked += batch.checked;
    totals.drifted += batch.drifted;
    totals.failed += batch.failed;
    after = batch.next_after_user_id;
  } while (after !== null && now() - started < RUN_BUDGET_MS);
  return { ...totals, complete: after === null };
}

export function billingReconcileJob(door: BillingDoor) {
  return defineJob({
    queue: BILLING_QUEUES.reconcile,
    schema: z.unknown(),
    handler: async (_data, ctx) => {
      const totals = await runReconcile(door);
      ctx.logger.info(totals, 'billing reconcile finished');
      return totals;
    },
  });
}
