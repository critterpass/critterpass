/**
 * Ideas on the api (docs/api-contracts-planning.md, `trip_ideas`): where a saved place counts as
 * inside a trip's destination, and how a person backs or leaves an idea. Every write runs as the
 * system role after the command's own checks; app_user only ever reads `trip_ideas`.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import {
  channelName,
  DomainError,
  PLANNING_RT,
  type CustomPlace,
  type IdeaSource,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

/** The display copy an idea carries, from the POI or the dropped pin. */
export interface IdeaPlace {
  readonly poiId: string | null;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
}

/**
 * A POI belongs to a trip when its destination owns it or it lies inside the destination's place
 * box (a place stored once is owned by the first destination ingested). `p` is the POI, `d` the
 * trip's destination.
 */
export const POI_INSIDE_DESTINATION = `(p.destination_id = d.id
  OR (d.place_bounds IS NOT NULL AND ST_Intersects(p.location, d.place_bounds)))`;

/** Trips whose Ideas a save by this person feeds: their crew's trips with a destination, not over. */
export const ACTIVE_TRIPS_OF_USER = `SELECT t.id AS trip_id, t.crew_id, t.destination_id
    FROM trips t
    JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = $1 AND m.status = 'active'
   WHERE t.destination_id IS NOT NULL AND t.phase IN ('planning', 'pre', 'in')`;

/** An active POI as an idea's place for this trip; outside the destination is a validation error. */
export async function poiForTrip(
  tx: pg.PoolClient,
  tripId: string,
  poiId: string,
): Promise<IdeaPlace> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<IdeaPlace & { inside: boolean }>(
      `SELECT p.id AS "poiId", p.name, p.name_local AS "nameLocal", p.category, p.lat, p.lng,
              coalesce(${POI_INSIDE_DESTINATION}, false) AS inside
         FROM pois p
         JOIN trips t ON t.id = $1
         LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE p.id = $2 AND p.status = 'active'`,
      [tripId, poiId],
    ),
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'place' });
  if (!row.inside) throw new DomainError('VALIDATION', { reason: 'outside_destination' });
  const { inside: _inside, ...place } = row;
  return place;
}

/**
 * A dropped pin as an idea's place: inside the destination's place box, or (a destination with no
 * box yet) within 30 km of one of its places.
 */
export async function pinForTrip(
  tx: pg.PoolClient,
  tripId: string,
  pin: CustomPlace,
): Promise<IdeaPlace> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ inside: boolean }>(
      `WITH spot AS (SELECT ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography AS g)
       SELECT CASE
                WHEN d.id IS NULL THEN false
                WHEN d.place_bounds IS NOT NULL THEN ST_Intersects(spot.g, d.place_bounds)
                ELSE EXISTS (SELECT 1 FROM pois p
                              WHERE p.destination_id = d.id AND p.status = 'active'
                                AND ST_DWithin(p.location, spot.g, 30000))
              END AS inside
         FROM trips t CROSS JOIN spot
         LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE t.id = $1`,
      [tripId, pin.lat, pin.lng],
    ),
  );
  if (rows[0]?.inside !== true) {
    throw new DomainError('VALIDATION', { reason: 'outside_destination' });
  }
  return { poiId: null, nameLocal: null, category: 'other', ...pin };
}

export interface BackIdeaInput {
  readonly tripId: string;
  readonly crewId: string | null;
  /** Who acts; backs the idea unless `backerIds` names the backers (a swipe match's yes voters). */
  readonly uid: string;
  readonly backerIds?: readonly string[];
  readonly place: IdeaPlace;
  readonly source: IdeaSource;
  readonly sourceUrl?: string | undefined;
  /** The client's id for a new idea, so its optimistic row and the synced row are one. */
  readonly ideaId?: string | undefined;
}

export interface BackedIdea {
  readonly ideaId: string;
  readonly backerIds: string[];
  /** False when every backer already backed it from this source (nothing changed). */
  readonly changed: boolean;
}

type IdeaRow = { id: string; backer_ids: string[]; changed: boolean };

const backersOf = (input: BackIdeaInput): readonly string[] => input.backerIds ?? [input.uid];

/** Adds the backers (and the source) to an existing idea: the client's id, or the place's live idea. */
async function joinIdea(tx: pg.PoolClient, input: BackIdeaInput): Promise<IdeaRow | undefined> {
  const { rows } = await tx.query<IdeaRow>(
    `WITH target AS (
       SELECT id, backer_ids, sources FROM trip_ideas
        WHERE trip_id = $1 AND deleted_at IS NULL
          AND (id = $2 OR ($3::uuid IS NOT NULL AND poi_id = $3))
        ORDER BY (id = $2) DESC LIMIT 1 FOR UPDATE)
     UPDATE trip_ideas i
        SET backer_ids = t.backer_ids || ARRAY(
              SELECT b FROM unnest($4::uuid[]) WITH ORDINALITY AS n(b, k)
               WHERE b <> ALL(t.backer_ids) ORDER BY k),
            sources = CASE WHEN $5 = ANY(t.sources) THEN t.sources ELSE t.sources || $5::text END,
            source_url = coalesce(i.source_url, $6)
       FROM target t
      WHERE i.id = t.id
      RETURNING i.id, i.backer_ids,
                NOT ($4::uuid[] <@ t.backer_ids AND $5 = ANY(t.sources)) AS changed`,
    [
      input.tripId,
      input.ideaId ?? null,
      input.place.poiId,
      backersOf(input),
      input.source,
      input.sourceUrl ?? null,
    ],
  );
  return rows[0];
}

async function insertIdea(tx: pg.PoolClient, input: BackIdeaInput): Promise<IdeaRow | undefined> {
  const { place } = input;
  const { rows } = await tx.query<IdeaRow>(
    `INSERT INTO trip_ideas (id, trip_id, poi_id, name, name_local, category, lat, lng,
                             backer_ids, sources, source_url, created_by)
     SELECT coalesce($1::uuid, uuidv7()), $2, $3, $4, $5, $6, $7, $8, $9::uuid[],
            ARRAY[$10::text], $11, $12
      WHERE $1::uuid IS NULL OR NOT EXISTS (SELECT 1 FROM trip_ideas WHERE id = $1)
     ON CONFLICT (trip_id, poi_id) WHERE poi_id IS NOT NULL AND deleted_at IS NULL DO NOTHING
     RETURNING id, backer_ids, true AS changed`,
    [
      input.ideaId ?? null,
      input.tripId,
      place.poiId,
      place.name.slice(0, 120),
      place.nameLocal?.slice(0, 120) ?? null,
      place.category,
      place.lat,
      place.lng,
      backersOf(input),
      input.source,
      input.sourceUrl ?? null,
      input.uid,
    ],
  );
  return rows[0];
}

/**
 * The person (or the named backers) back the idea for this place: a new idea, or more backers (and
 * the source) on the live one. Two people saving one place at once make one idea with both backers: the insert that
 * loses the race on the live-idea key joins the winner's row instead.
 */
export async function backIdea(tx: pg.PoolClient, input: BackIdeaInput): Promise<BackedIdea> {
  const row = await asSystemRole(tx, async () => {
    const joined = await joinIdea(tx, input);
    if (joined !== undefined) return joined;
    const inserted = await insertIdea(tx, input);
    if (inserted !== undefined) return inserted;
    // A concurrent save took the live-idea key, or the client's id belongs to a removed idea.
    const again = await joinIdea(tx, { ...input, ideaId: undefined });
    if (again !== undefined) return again;
    return insertIdea(tx, { ...input, ideaId: undefined });
  });
  if (row === undefined) throw new Error('trip idea upsert returned no row');
  if (row.changed) {
    await ideaChanged(tx, 'trip_idea.saved', input, row.id, { poi_id: input.place.poiId });
  }
  return { ideaId: row.id, backerIds: row.backer_ids, changed: row.changed };
}

export interface LeftIdea {
  readonly ideaId: string;
  readonly removed: boolean;
  readonly backerIds: string[];
}

/**
 * The person leaves the idea's backers; with nobody left, or `removeAll` (an organiser removing it
 * for everyone), the idea is removed (`deleted_at`), which takes it off every phone.
 */
export async function leaveIdea(
  tx: pg.PoolClient,
  input: {
    readonly tripId: string;
    readonly crewId: string | null;
    readonly uid: string;
    readonly ideaId: string;
    readonly removeAll: boolean;
  },
): Promise<LeftIdea> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ backer_ids: string[]; removed: boolean }>(
      `UPDATE trip_ideas
          SET backer_ids = CASE WHEN $3 THEN backer_ids ELSE array_remove(backer_ids, $2::uuid) END,
              deleted_at = CASE WHEN $3 OR array_remove(backer_ids, $2::uuid) = '{}'::uuid[]
                                THEN now() END
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING backer_ids, deleted_at IS NOT NULL AS removed`,
      [input.ideaId, input.uid, input.removeAll],
    ),
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'idea' });
  await ideaChanged(tx, 'trip_idea.removed', input, input.ideaId, { deleted: row.removed });
  return { ideaId: input.ideaId, removed: row.removed, backerIds: row.backer_ids };
}

async function ideaChanged(
  tx: pg.PoolClient,
  type: 'trip_idea.saved' | 'trip_idea.removed',
  input: { readonly tripId: string; readonly crewId: string | null; readonly uid: string },
  ideaId: string,
  extra: { poi_id: string | null } | { deleted: boolean },
): Promise<void> {
  await appendDomainEvent(tx, {
    type,
    aggregateKind: 'trip',
    aggregateId: input.tripId,
    actorKind: 'user',
    actorId: input.uid,
    payload: { trip_id: input.tripId, idea_id: ideaId, user_id: input.uid, ...extra },
    tripId: input.tripId,
    crewId: input.crewId,
  });
  await outbox(tx, channelName('trip_plan', input.tripId), PLANNING_RT.ideasChanged, {
    idea_ids: [ideaId],
  });
}
