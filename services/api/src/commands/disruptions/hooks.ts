/**
 * The api's half of the disruption hooks: the outcomes a disruption row follows that the api
 * appends (a vote closing, an UNDO, the desk sending a message) queue `disruption.react` by event
 * id in the same transaction; the worker moves the row.
 */
import { sendInTx } from '@cp/db';
import { DISRUPTION_QUEUES, isDisruptionReactEvent, type DisruptionReactJob } from '@cp/domain';
import type pg from 'pg';

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
