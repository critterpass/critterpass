/**
 * Queues the plan check from the api's own transactions, as the worker's hook does for the events
 * it appends: a crew plan change, applied ops or change set, an idea saved or removed, a stance.
 * Each waits 45 seconds so a burst of edits folds into one run; a private draft is never checked.
 */
import { onEventAppended, sendInTx } from '@cp/db';
import { PLAN_CHECK_DEBOUNCE_SECONDS, PLANNING_QUEUES, type PlanCheckJob } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import type { PlanningModule } from '../register';

const TRIGGERS: Readonly<Record<string, PlanCheckJob['trigger']>> = {
  'plan.version_created': 'plan',
  'plan.ops_applied': 'plan',
  'change_set.applied': 'plan',
  // A draft becomes the crew's plan without a new version: sending it and locking it in.
  'proposal.sent': 'plan',
  'proposal.locked': 'plan',
  'plan.legs_updated': 'legs',
  'trip_idea.saved': 'ideas',
  'trip_idea.removed': 'ideas',
  'place.stance_set': 'stances',
  'place.stance_cleared': 'stances',
  'forecast.changed': 'forecast',
};

export async function planCheckEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  const trigger = TRIGGERS[event.type];
  if (trigger === undefined || event.tripId === null) return;
  if (event.type === 'plan.version_created') {
    const { rows } = await asSystemRole(tx, () =>
      tx.query<{ visibility: string | null }>(
        "SELECT payload->>'visibility' AS visibility FROM app.domain_event_for_routing($1)",
        [event.id],
      ),
    );
    if (rows[0]?.visibility === 'organiser') return;
  }
  const job: PlanCheckJob = { trip_id: event.tripId, trigger };
  await sendInTx(tx, PLANNING_QUEUES.check, job, {
    singletonKey: event.tripId,
    singletonSeconds: PLAN_CHECK_DEBOUNCE_SECONDS,
    startAfter: PLAN_CHECK_DEBOUNCE_SECONDS,
  });
}

let hooked = false;

export const planCheckHooks: PlanningModule = () => {
  if (hooked) return;
  hooked = true;
  onEventAppended(planCheckEventHook);
};
