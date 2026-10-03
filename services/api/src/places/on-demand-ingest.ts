/**
 * On-demand place ingest (docs/product-decisions.md D25): a destination a crew pitches, or a trip
 * is set to, with fewer than `SPARSE_PLACES_THRESHOLD` active places gets one `places.ingest`
 * job for its slug, so its open-data places arrive before anyone searches there. The job resolves
 * the destination's place box first when it has none. A destination whose ingest is queued or
 * running is not queued again, and one that stays sparse after an ingest (a small town with little
 * open data) is retried at most once a week.
 */
import { sendInTx, type AppendedDomainEvent } from '@cp/db';
import type pg from 'pg';

/** The worker's per-destination ingest queue (services/worker/src/jobs/places). */
export const PLACES_INGEST_QUEUE = 'places.ingest';
export const SPARSE_PLACES_THRESHOLD = 50;
const RETRY_SECONDS = 7 * 24 * 3_600;

/**
 * Queues the ingest when the destination is sparse; true when it is (queued now or earlier).
 * Runs in the caller's transaction, so the job exists only if that commits.
 */
export async function queueIngestWhenSparse(
  tx: pg.PoolClient,
  destinationId: string,
): Promise<boolean> {
  const { rows } = await tx.query<{ slug: string; sparse: boolean }>(
    `SELECT d.slug,
            (SELECT count(*) FROM (
               SELECT 1 FROM pois p
               WHERE p.destination_id = d.id AND p.status = 'active' LIMIT $2
             ) AS found) < $2 AS sparse
     FROM destinations d WHERE d.id = $1`,
    [destinationId, SPARSE_PLACES_THRESHOLD],
  );
  const row = rows[0];
  if (row === undefined || !row.sparse) return false;
  await sendInTx(
    tx,
    PLACES_INGEST_QUEUE,
    { slug: row.slug },
    { singletonKey: `on-demand-ingest:${row.slug}`, singletonSeconds: RETRY_SECONDS },
  );
  return true;
}

/**
 * The destinations an appended event names, read through rows the actor can see (the event log
 * itself is not readable from a request): the trip's destination, or the crew's pitches created in
 * this transaction (`created_at` defaults to `now()`, the transaction's start time).
 */
async function destinationsOf(tx: pg.PoolClient, event: AppendedDomainEvent): Promise<string[]> {
  if (event.type === 'trip.destination_set' && event.tripId !== null) {
    const { rows } = await tx.query<{ destination_id: string | null }>(
      'SELECT destination_id FROM trips WHERE id = $1',
      [event.tripId],
    );
    return rows.flatMap((row) => (row.destination_id === null ? [] : [row.destination_id]));
  }
  if (event.type === 'pitch.created' && event.crewId !== null) {
    const { rows } = await tx.query<{ destination_id: string }>(
      'SELECT DISTINCT destination_id FROM pitches WHERE crew_id = $1 AND created_at = now()',
      [event.crewId],
    );
    return rows.map((row) => row.destination_id);
  }
  return [];
}

/** `onEventAppended` hook: a pitch or a trip naming a destination checks that place's coverage. */
export async function onDemandIngestHook(
  tx: pg.PoolClient,
  event: AppendedDomainEvent,
): Promise<void> {
  for (const destinationId of await destinationsOf(tx, event)) {
    await queueIngestWhenSparse(tx, destinationId);
  }
}
