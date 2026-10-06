/**
 * The organiser's private draft as a plan she builds herself. A trip's draft can exist before the
 * guide drafts anything: an organiser-only version with one day per trip date and no stops. Her
 * edits replay on the draft exactly as group edits replay on the crew's plan, and land as a new
 * organiser-only version that replaces the one she edited. Nothing here reaches the crew: no
 * crew channel, no activity, no push.
 *
 * Versions do not pile up: a draft she edited by hand is deleted when her next edit replaces it,
 * and an empty plan nobody touched is deleted when anything replaces it, unless something else
 * still points at the version (a proposal built from it, a redraft of it). The history keeps the
 * guide's drafts, kept redrafts, restored drafts and her latest edit of each.
 */
import { dropReplacedDraft, emitEvent } from '@cp/db';
import {
  DomainError,
  refitStops,
  stopDayRanges,
  type PlanState,
  type TripStopRow,
} from '@cp/domain';
import type pg from 'pg';

import { carryPlanForward } from '../commands/checks/carry-forward';

import { writeVersionRows } from './versioning';

export type DraftOrigin = 'dates' | 'hand' | 'guide' | 'restore';

export interface DraftHead {
  readonly tripId: string;
  readonly crewId: string;
  readonly status: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly currency: string | null;
  readonly draftVersionId: string | null;
  readonly currentVersionId: string | null;
}

/** Locks the trip row (serialising edits of its draft) and reads its plan pointers. */
export async function lockTripDraft(tx: pg.PoolClient, tripId: string): Promise<DraftHead> {
  const { rows } = await tx.query<DraftHead>(
    `SELECT t.id AS "tripId", t.crew_id AS "crewId", t.status, t.start_date::text AS "startDate",
            t.end_date::text AS "endDate", coalesce(t.local_currency, d.currency) AS currency,
            t.draft_version_id AS "draftVersionId", t.current_version_id AS "currentVersionId"
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1 FOR UPDATE OF t`,
    [tripId],
  );
  const head = rows[0];
  if (head === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return head;
}

/**
 * A draft with a day for every trip date and no stops, as the trip's draft; returns its id. On a
 * trip with several stops every day of a later stop carries that stop's city.
 */
export async function createEmptyDraft(
  tx: pg.PoolClient,
  head: Pick<DraftHead, 'tripId' | 'startDate' | 'endDate' | 'currency'>,
): Promise<string> {
  if (head.startDate === null || head.endDate === null) {
    throw new DomainError('STATE_INVALID', { reason: 'dates_not_locked' });
  }
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, visibility, status, currency, origin)
     VALUES ($1, 'organiser', 'draft', $2, 'dates') RETURNING id`,
    [head.tripId, head.currency],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('empty draft insert returned no id');
  await tx.query(
    `INSERT INTO plan_days (version_id, trip_id, day_no, date)
     SELECT $1, $2, row_number() OVER (ORDER BY day)::int, day::date
       FROM generate_series($3::date, $4::date, interval '1 day') AS day`,
    [id, head.tripId, head.startDate, head.endDate],
  );
  const stops = await loadStopRows(tx, head.tripId);
  for (const [index, range] of stopDayRanges(stops, Number.MAX_SAFE_INTEGER).entries()) {
    if (index === 0 || stops[index] === undefined) continue;
    await tx.query(
      'UPDATE plan_days SET destination_id = $2 WHERE version_id = $1 AND day_no BETWEEN $3 AND $4',
      [id, stops[index].destination_id, range.first, Math.min(range.last, 366)],
    );
  }
  await tx.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [head.tripId, id]);
  return id;
}

export interface DraftCommit {
  readonly head: DraftHead;
  readonly baseVersionId: string;
  readonly next: PlanState;
  readonly origin: DraftOrigin;
}

/**
 * Writes `next` as the trip's new draft on top of `baseVersionId` (the caller holds the trip lock
 * and checked the base) and retires the base. Runs as the system.
 */
export async function writeDraftVersion(tx: pg.PoolClient, input: DraftCommit): Promise<string> {
  const { head, baseVersionId, next } = input;
  const { rows } = await tx.query<{ id: string; base_origin: string | null; items: number }>(
    `WITH base AS (
       SELECT b.*, (SELECT count(*)::int FROM plan_items i
                      WHERE i.version_id = b.id AND i.booking_id IS NULL) AS items
         FROM itinerary_versions b WHERE b.id = $1 AND b.trip_id = $2
     ), made AS (
       INSERT INTO itinerary_versions (trip_id, parent_id, visibility, status, cost_pp_minor,
         currency, metrics, coverage, origin)
       SELECT trip_id,
              -- A base that is about to be deleted hands its own parent on.
              CASE WHEN origin = 'hand' OR (origin = 'dates' AND items = 0) THEN parent_id ELSE id END,
              'organiser', 'draft', cost_pp_minor, currency, metrics, coverage, $3
         FROM base
       RETURNING id
     )
     SELECT made.id, base.origin AS base_origin, base.items FROM made, base`,
    [baseVersionId, head.tripId, input.origin],
  );
  const made = rows[0];
  if (made === undefined) throw new DomainError('NOT_FOUND', { reason: 'version' });
  await writeVersionRows(tx, {
    versionId: made.id,
    tripId: head.tripId,
    baseVersionId,
    next,
  });
  await tx.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [head.tripId, made.id]);
  await tx.query("UPDATE itinerary_versions SET status = 'superseded' WHERE id = $1", [
    baseVersionId,
  ]);
  if (made.base_origin === 'hand' || (made.base_origin === 'dates' && made.items === 0)) {
    // The draft being replaced is about to go with its legs and its check: what still holds of
    // them moves to the new draft first (the event hook would come too late for these).
    await carryPlanForward(tx, head.tripId);
    await dropReplacedDraft(tx, baseVersionId);
  }
  return made.id;
}

/** Tells the legs and plan check jobs the draft changed. */
export async function draftChanged(
  tx: pg.PoolClient,
  input: {
    readonly head: DraftHead;
    readonly versionId: string;
    readonly baseVersionId: string;
    readonly opCount: number;
    readonly actorId: string;
  },
): Promise<void> {
  const { head } = input;
  await emitEvent(tx, {
    type: 'draft.ops_applied',
    aggregateKind: 'trip',
    aggregateId: head.tripId,
    actorKind: 'user',
    actorId: input.actorId,
    crewId: head.crewId,
    tripId: head.tripId,
    payload: {
      trip_id: head.tripId,
      version_id: input.versionId,
      base_version_id: input.baseVersionId,
      op_count: input.opCount,
    },
  });
}

/** A stop row of a trip with several cities, in order. */
export interface StopRow {
  readonly destination_id: string;
  readonly nights: number;
}

const rowsOf = (stops: readonly StopRow[]): TripStopRow[] =>
  stops.map((stop, index) => ({ position: index + 1, ...stop }));

/** Replaces the trip's stop rows; one stop or none leaves no rows. */
export async function writeStopRows(
  tx: pg.PoolClient,
  trip: { readonly id: string; readonly crew_id: string },
  stops: readonly StopRow[],
): Promise<TripStopRow[]> {
  await tx.query('DELETE FROM trip_stops WHERE trip_id = $1', [trip.id]);
  if (stops.length < 2) return [];
  await tx.query(
    `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
     SELECT $1, $2, s.position, s.destination_id, s.nights
       FROM unnest($3::uuid[], $4::int[]) WITH ORDINALITY AS s(destination_id, nights, position)`,
    [
      trip.id,
      trip.crew_id,
      stops.map((stop) => stop.destination_id),
      stops.map((stop) => stop.nights),
    ],
  );
  return rowsOf(stops);
}

export async function loadStopRows(tx: pg.PoolClient, tripId: string): Promise<StopRow[]> {
  const { rows } = await tx.query<StopRow>(
    'SELECT destination_id, nights FROM trip_stops WHERE trip_id = $1 ORDER BY position',
    [tripId],
  );
  return rows;
}

/**
 * Fits the trip's stops to its new nights. Answers the stops before and after, and `changed` when
 * the rows were rewritten. A one-stop trip has no rows and nothing happens.
 */
export async function refitTripStops(
  tx: pg.PoolClient,
  trip: { readonly id: string; readonly crew_id: string },
  nights: number,
): Promise<{ before: StopRow[]; after: TripStopRow[]; changed: boolean }> {
  const before = await loadStopRows(tx, trip.id);
  if (before.length === 0) return { before, after: [], changed: false };
  const fitted = refitStops(before, nights);
  if (JSON.stringify(fitted) === JSON.stringify(before)) {
    return { before, after: rowsOf(before), changed: false };
  }
  return { before, after: await writeStopRows(tx, trip, fitted), changed: true };
}
