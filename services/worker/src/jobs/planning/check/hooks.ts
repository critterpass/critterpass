/**
 * Same-transaction hooks that queue the plan check when the plan or what it reads changes: a new
 * crew version, applied ops or change set, new legs, an idea saved or removed, a stance, a forecast.
 * Every trigger waits 45 seconds and one run per trip folds a burst of edits (the api registers
 * the same hook for the events it appends). An organiser's private draft is never checked.
 */
import { sendInTx } from '@cp/db';
import { PLAN_CHECK_DEBOUNCE_SECONDS, PLANNING_QUEUES, type PlanCheckJob } from '@cp/domain';
import type pg from 'pg';

const TRIGGERS: Readonly<Record<string, PlanCheckJob['trigger']>> = {
  'plan.version_created': 'plan',
  'plan.ops_applied': 'plan',
  'change_set.applied': 'plan',
  'plan.legs_updated': 'legs',
  'trip_idea.saved': 'ideas',
  'trip_idea.removed': 'ideas',
  'place.stance_set': 'stances',
  'place.stance_cleared': 'stances',
  'forecast.changed': 'forecast',
};

export async function queuePlanCheck(
  tx: pg.PoolClient,
  tripId: string,
  trigger: PlanCheckJob['trigger'],
): Promise<void> {
  const job: PlanCheckJob = { trip_id: tripId, trigger };
  await sendInTx(tx, PLANNING_QUEUES.check, job, {
    singletonKey: tripId,
    singletonSeconds: PLAN_CHECK_DEBOUNCE_SECONDS,
    startAfter: PLAN_CHECK_DEBOUNCE_SECONDS,
  });
}

/** Reads the event's visibility as the system (the hook may run inside a member's command). */
async function isPrivateDraft(tx: pg.PoolClient, eventId: string): Promise<boolean> {
  const role = (await tx.query<{ role: string }>('SELECT current_user::text AS role')).rows[0]
    ?.role;
  await tx.query('SET LOCAL ROLE app_system');
  const { rows } = await tx.query<{ visibility: string | null }>(
    "SELECT payload->>'visibility' AS visibility FROM app.domain_event_for_routing($1)",
    [eventId],
  );
  if (role !== undefined) await tx.query("SELECT set_config('role', $1, true)", [role]);
  return rows[0]?.visibility === 'organiser';
}

export async function planCheckEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  const trigger = TRIGGERS[event.type];
  if (trigger === undefined || event.tripId === null) return;
  if (event.type === 'plan.version_created' && (await isPrivateDraft(tx, event.id))) return;
  await queuePlanCheck(tx, event.tripId, trigger);
}
