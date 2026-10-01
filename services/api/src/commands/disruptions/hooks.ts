/**
 * The api's half of the disruption hooks: the outcomes a disruption row follows that the api
 * appends (a vote closing, an UNDO, the desk sending a message) queue `disruption.react` by event
 * id in the same transaction; the worker moves the row. A member's own running-late report opens
 * the item's disruption here, in the report's transaction.
 */
import { sendInTx } from '@cp/db';
import { DISRUPTION_QUEUES, isDisruptionReactEvent, type DisruptionReactJob } from '@cp/domain';
import type pg from 'pg';

import { beThereAt, lateItem, recordLate } from './late-detect';

/** Only trips with an open disruption (or its own undo) have rows to move. */
export async function concernsDisruption(
  tx: pg.PoolClient,
  event: { readonly type: string; readonly tripId: string | null },
): Promise<boolean> {
  if (event.type === 'disruption.action_undone') return true;
  if (event.tripId === null) return false;
  const { rows } = await tx.query<{ open: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM disruptions WHERE trip_id = $1 AND status = 'open') AS open",
    [event.tripId],
  );
  return rows[0]?.open === true;
}

export async function disruptionReactHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  if (!isDisruptionReactEvent(event.type)) return;
  if (!(await concernsDisruption(tx, event))) return;
  await sendInTx(tx, DISRUPTION_QUEUES.react, {
    event_id: event.id,
    event_type: event.type as DisruptionReactJob['event_type'],
  });
}

/**
 * A member's own "running late" for a plan item (the lock-screen button, the leave-by push) opens
 * that item's running-late disruption, or joins the open one, with the minutes they gave.
 */
export async function lateReportHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  if (event.type !== 'member.running_late' || event.tripId === null) return;
  const { rows } = await tx.query<{ user_id: string; item_id: string | null; minutes: number }>(
    `SELECT payload ->> 'user_id' AS user_id, payload ->> 'item_id' AS item_id,
            (payload ->> 'minutes')::int AS minutes
       FROM app.domain_event_for_routing($1)`,
    [event.id],
  );
  const report = rows[0];
  if (report === undefined || report.item_id === null) return;
  const item = await lateItem(tx, event.tripId, report.item_id);
  if (item === undefined || !item.attendee_ids.includes(report.user_id)) return;
  await recordLate(tx, item, {
    uid: report.user_id,
    lateMin: report.minutes,
    etaAt: new Date(beThereAt(item).getTime() + report.minutes * 60_000),
    mode: null,
    walkMin: null,
    cause: 'manual',
  });
}
