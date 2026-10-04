/**
 * The ♡ on a place page and a trip's Ideas stay in step: saving a POI inside the destination of
 * one of the caller's active trips backs that trip's idea for it, and unsaving leaves it (the
 * last backer leaving removes the idea).
 */
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import {
  ACTIVE_TRIPS_OF_USER,
  backIdea,
  leaveIdea,
  POI_INSIDE_DESTINATION,
  type IdeaPlace,
} from './store';

interface TripPlace extends IdeaPlace {
  readonly tripId: string;
  readonly crewId: string;
}

async function tripsHoldingPoi(
  tx: pg.PoolClient,
  uid: string,
  poiId: string,
): Promise<TripPlace[]> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<TripPlace>(
      `WITH mine AS (${ACTIVE_TRIPS_OF_USER})
       SELECT mine.trip_id AS "tripId", mine.crew_id AS "crewId", p.id AS "poiId", p.name,
              p.name_local AS "nameLocal", p.category, p.lat, p.lng
         FROM mine
         JOIN destinations d ON d.id = mine.destination_id
         JOIN pois p ON p.id = $2 AND p.status = 'active'
        WHERE ${POI_INSIDE_DESTINATION}
        ORDER BY mine.trip_id`,
      [uid, poiId],
    ),
  );
  return rows;
}

export async function backSavedPoiOnTrips(
  tx: pg.PoolClient,
  uid: string,
  poiId: string,
): Promise<void> {
  for (const { tripId, crewId, ...place } of await tripsHoldingPoi(tx, uid, poiId)) {
    await backIdea(tx, { tripId, crewId, uid, place, source: 'save' });
  }
}

export async function leaveSavedPoiOnTrips(
  tx: pg.PoolClient,
  uid: string,
  poiId: string,
): Promise<void> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ id: string; trip_id: string; crew_id: string }>(
      `WITH mine AS (${ACTIVE_TRIPS_OF_USER})
       SELECT i.id, i.trip_id, mine.crew_id
         FROM trip_ideas i JOIN mine ON mine.trip_id = i.trip_id
        WHERE i.poi_id = $2 AND i.deleted_at IS NULL AND $1 = ANY(i.backer_ids)
        ORDER BY i.id`,
      [uid, poiId],
    ),
  );
  for (const idea of rows) {
    await leaveIdea(tx, {
      tripId: idea.trip_id,
      crewId: idea.crew_id,
      uid,
      ideaId: idea.id,
      removeAll: false,
    });
  }
}
