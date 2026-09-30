/**
 * Same-transaction hooks for the events this process appends: a flight delay, cancellation,
 * diversion or schedule change queues the disruption agent for its segment, and the outcomes a
 * disruption row follows queue `disruption.react` by event id (the api registers the same hook for
 * the events it appends).
 */
import { sendInTx } from '@cp/db';
import { DISRUPTION_QUEUES, isDisruptionReactEvent, type DisruptionReactJob } from '@cp/domain';
import type pg from 'pg';

/** Only trips with an open disruption (or its own undo) have rows to move. */
async function concernsDisruption(
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

/** Rain newly over an outdoor item: look for a dry slot (the replan job decides if it is one). */
async function queueReplans(tx: pg.PoolClient, eventId: string, tripId: string): Promise<void> {
  const { rows } = await tx.query<{ changes: { item_stable_id: string; reason: string }[] }>(
    `SELECT payload -> 'changes' AS changes FROM app.domain_event_for_routing($1)`,
    [eventId],
  );
  const items = new Set(
    (rows[0]?.changes ?? []).filter((c) => c.reason === 'rain').map((c) => c.item_stable_id),
  );
  for (const stableId of items) {
    await sendInTx(
      tx,
      DISRUPTION_QUEUES.replan,
      { trip_id: tripId, item_stable_id: stableId },
      { singletonKey: `${tripId}:${stableId}` },
    );
  }
}

const FLIGHT_CHANGES: ReadonlySet<string> = new Set([
  'delay',
  'cancelled',
  'diverted',
  'schedule',
  'landed',
]);

export async function disruptionEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  if (isDisruptionReactEvent(event.type)) {
    if (!(await concernsDisruption(tx, event))) return;
    await sendInTx(tx, DISRUPTION_QUEUES.react, {
      event_id: event.id,
      event_type: event.type as DisruptionReactJob['event_type'],
    });
    return;
  }
  if (event.type === 'forecast.changed' && event.tripId !== null) {
    await queueReplans(tx, event.id, event.tripId);
    return;
  }
  if (event.type !== 'flight.status_changed' || event.tripId === null) return;
  const { rows } = await tx.query<{ segment_id: string; change: string | null }>(
    `SELECT payload ->> 'segment_id' AS segment_id, payload ->> 'change' AS change
       FROM app.domain_event_for_routing($1)`,
    [event.id],
  );
  const found = rows[0];
  if (found === undefined || found.change === null || !FLIGHT_CHANGES.has(found.change)) return;
  await sendInTx(
    tx,
    DISRUPTION_QUEUES.flight,
    { trip_id: event.tripId, segment_id: found.segment_id },
    { singletonKey: found.segment_id },
  );
}
