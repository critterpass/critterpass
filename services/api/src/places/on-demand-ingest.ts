/**
 * On-demand place ingest (docs/product-decisions.md D25): a destination a crew pitches, or a trip
 * is set to, with fewer than `SPARSE_PLACES_THRESHOLD` active places gets one `places.ingest`
 * job for its slug, so its open-data places arrive before anyone searches there. The job resolves
 * the destination's place box first when it has none. A destination whose ingest is queued or
 * running is not queued again, and one that stays sparse after an ingest (a small town with little
 * open data) is retried at most once a week.
 *
 * A destination that has places but no curated set and no machine picks yet gets one
 * `places.pick` job instead, so there is something to suggest and draft from by the time the crew
 * plans; a sparse one gets its picks when its ingest finishes (the worker queues them).
 */
import { pickCoverage, sendInTx, type AppendedDomainEvent } from '@cp/db';
import {
  PLACES_QUEUES,
  placesDestinationBriefKey,
  placesPickKey,
  placesProfileWarmKey,
} from '@cp/domain';
import type pg from 'pg';

/** The worker's per-destination ingest queue (services/worker/src/jobs/places). */
export const PLACES_INGEST_QUEUE = PLACES_QUEUES.ingest;
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
 * The place profile and destination brief queues the api sends to
 * (services/worker/src/places/profile/jobs.ts and brief-jobs.ts).
 */
export const PLACES_PROFILE_QUEUES = [
  PLACES_QUEUES.profile,
  PLACES_QUEUES.profileTranslate,
  PLACES_QUEUES.profileWarm,
  PLACES_QUEUES.destinationBrief,
  PLACES_QUEUES.briefTranslate,
  PLACES_QUEUES.homeLink,
] as const;

/** A sparse destination's warm-up waits this long, so its places have been ingested first. */
const WARM_AFTER_INGEST_SECONDS = 20 * 60;

/**
 * Queues profiles for the destination's top places (the worker passes over any that have one).
 * One warm-up per destination at a time; runs in the caller's transaction.
 */
export async function queueProfileWarm(
  tx: pg.PoolClient,
  destinationId: string,
  sparse: boolean,
): Promise<void> {
  await sendInTx(
    tx,
    PLACES_QUEUES.profileWarm,
    { destination_id: destinationId },
    {
      singletonKey: placesProfileWarmKey(destinationId),
      ...(sparse ? { startAfter: WARM_AFTER_INGEST_SECONDS } : {}),
    },
  );
}

/**
 * Queues the destination's brief when it has no ready one (the worker passes over a curated
 * destination); a sparse destination's waits for its ingest like the warm-up. One run per
 * destination at a time; runs in the caller's transaction.
 */
export async function queueBriefWhenMissing(
  tx: pg.PoolClient,
  destinationId: string,
  sparse: boolean,
): Promise<boolean> {
  const { rows } = await tx.query<{ ready: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM destination_briefs b
                     WHERE b.destination_id = $1 AND b.status = 'ready'
                       AND (b.origin = 'editorial' OR b.expires_at > now())) AS ready`,
    [destinationId],
  );
  if (rows[0]?.ready === true) return false;
  await sendInTx(
    tx,
    PLACES_QUEUES.destinationBrief,
    { destination_id: destinationId },
    {
      singletonKey: placesDestinationBriefKey(destinationId),
      ...(sparse ? { startAfter: WARM_AFTER_INGEST_SECONDS } : {}),
    },
  );
  return true;
}

/** The worker's per-destination pick queue (services/worker/src/jobs/places/pick.ts). */
export const PLACES_PICK_QUEUE = PLACES_QUEUES.pick;

/**
 * Queues the destination's machine picks when it has neither a curated set nor picks; true when
 * it does not (queued now, or a run is already waiting). Runs in the caller's transaction.
 */
export async function queuePickWhenNeeded(
  tx: pg.PoolClient,
  destinationId: string,
): Promise<boolean> {
  const coverage = await pickCoverage(tx, destinationId);
  if (!coverage.needsPicks) return false;
  const { rows } = await tx.query<{ slug: string }>('SELECT slug FROM destinations WHERE id = $1', [
    destinationId,
  ]);
  const slug = rows[0]?.slug;
  if (slug === undefined) return false;
  await sendInTx(
    tx,
    PLACES_PICK_QUEUE,
    { destination: slug },
    { singletonKey: placesPickKey(slug) },
  );
  return true;
}

/**
 * The destinations an appended event names, read through rows the actor can see (the event log
 * itself is not readable from a request): the trip's destination, the trip's other areas when its
 * stops or a day's area changed, or the crew's pitches created in this transaction (`created_at` defaults to `now()`, the transaction's start time).
 */
async function destinationsOf(tx: pg.PoolClient, event: AppendedDomainEvent): Promise<string[]> {
  if (event.type === 'trip.destination_set' && event.tripId !== null) {
    const { rows } = await tx.query<{ destination_id: string | null }>(
      'SELECT destination_id FROM trips WHERE id = $1',
      [event.tripId],
    );
    return rows.flatMap((row) => (row.destination_id === null ? [] : [row.destination_id]));
  }
  if (event.type === 'trip.areas_changed' && event.tripId !== null) {
    // A new stop or day-trip area is covered like the trip's own destination was.
    const { rows } = await tx.query<{ id: string }>(
      `SELECT area.id FROM app.trip_area_ids($1, true) AS area(id)
        WHERE area.id IS DISTINCT FROM (SELECT destination_id FROM trips WHERE id = $1)
        ORDER BY area.id`,
      [event.tripId],
    );
    return rows.map((row) => row.id);
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

/**
 * `onEventAppended` hook: a pitch, a trip naming a destination or a trip gaining an area checks
 * that place's coverage, queues its brief when it has none and warms the profiles of its top places.
 */
export async function onDemandIngestHook(
  tx: pg.PoolClient,
  event: AppendedDomainEvent,
): Promise<void> {
  for (const destinationId of await destinationsOf(tx, event)) {
    const sparse = await queueIngestWhenSparse(tx, destinationId);
    if (!sparse) await queuePickWhenNeeded(tx, destinationId);
    await queueBriefWhenMissing(tx, destinationId, sparse);
    await queueProfileWarm(tx, destinationId, sparse);
  }
}
