/**
 * Stored legs on the api: plan edits, change sets and stay bookings are written in api
 * transactions, so the api queues `plan.legs` for the trip in the same transaction (the worker
 * runs it and registers the same hook for its own writes). One debounced run per trip. In the same
 * transaction the legs of unchanged pairs and the check's findings on untouched days are carried
 * to the new version, so only what the edit changed waits for the jobs.
 */
import { onEventAppended, sendInTx } from '@cp/db';
import { legsJobFor } from '@cp/domain';
import type pg from 'pg';

import { carryPlanForward } from '../commands/checks/carry-forward';
import type { PlanningModule } from './register';

/**
 * A draft the guide delivers, a redraft she keeps and an earlier draft she brings back are opened
 * the moment they land, and none of them comes in a burst: their legs are routed at once instead
 * of after the debounce that folds a run of hand edits.
 */
const LEGS_AT_ONCE: ReadonlySet<string> = new Set([
  'draft.ready',
  'redraft.kept',
  'draft.version_restored',
]);

/** Queues `plan.legs` for the trip's newest plan version after an event that can move a leg. */
export async function legsEventHook(
  tx: pg.PoolClient,
  event: { readonly type: string; readonly tripId: string | null },
): Promise<void> {
  const request = legsJobFor(event);
  if (request === null || event.tripId === null) return;
  // Before the job is queued: what the plan already knew moves to the version it has now.
  await carryPlanForward(tx, event.tripId);
  const { rows } = await tx.query<{ version_id: string | null }>(
    `SELECT coalesce(t.current_version_id,
                     (SELECT v.id FROM itinerary_versions v
                       WHERE v.trip_id = t.id AND v.status IN ('draft', 'proposed')
                       ORDER BY v.created_at DESC LIMIT 1)) AS version_id
       FROM trips t WHERE t.id = $1`,
    [event.tripId],
  );
  const versionId = rows[0]?.version_id;
  if (versionId == null) return;
  await sendInTx(
    tx,
    request.queue,
    { trip_id: event.tripId, version_id: versionId },
    LEGS_AT_ONCE.has(event.type) ? { ...request.options, startAfter: 0 } : request.options,
  );
}

let hooked = false;

export const registerPlanLegs: PlanningModule = () => {
  if (hooked) return;
  hooked = true;
  onEventAppended(legsEventHook);
};
