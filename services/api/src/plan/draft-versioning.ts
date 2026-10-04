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
import { DomainError, type PlanState } from '@cp/domain';
import type pg from 'pg';

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

/** A draft with a day for every trip date and no stops, as the trip's draft; returns its id. */
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
