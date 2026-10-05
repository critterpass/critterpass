/**
 * `save_idea` (docs/api-contracts-planning.md): a place goes into the trip's Ideas, from a save, a
 * link, a swipe, search, the map, a dropped pin or the guide. Saving a place already in Ideas adds
 * the caller as a backer, so two people saving one place make one idea with both faces. A POI is
 * also kept in the caller's own saved places.
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  saveIdeaPayloadSchema,
  type SaveIdeaPayload,
  type SaveIdeaResult,
} from '@cp/domain';
import type pg from 'pg';

import { requireTripMember } from '../../plan/access';
import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { backIdea, pinForTrip, poiForTrip, type IdeaPlace } from './store';

async function tripCrew(tx: pg.PoolClient, tripId: string): Promise<string | null> {
  const { rows } = await tx.query<{ crew_id: string }>('SELECT crew_id FROM trips WHERE id = $1', [
    tripId,
  ]);
  return rows[0]?.crew_id ?? null;
}

/** The caller's own saved places get the POI too (the ♡ on the place page stays in step). */
async function keepInSavedPlaces(tx: pg.PoolClient, uid: string, poiId: string): Promise<void> {
  const { rowCount } = await tx.query(
    `INSERT INTO saved_items (user_id, kind, ref_id) VALUES ($1, 'poi', $2)
     ON CONFLICT (user_id, kind, ref_id) DO NOTHING`,
    [uid, poiId],
  );
  if ((rowCount ?? 0) === 0) return;
  await appendDomainEvent(tx, {
    type: 'place.saved',
    aggregateKind: 'user',
    aggregateId: uid,
    actorKind: 'user',
    actorId: uid,
    payload: { user_id: uid, place_id: poiId },
  });
}

async function ideaPlace(tx: pg.PoolClient, payload: SaveIdeaPayload): Promise<IdeaPlace> {
  if (payload.poi_id !== undefined) return poiForTrip(tx, payload.trip_id, payload.poi_id);
  if (payload.pin !== undefined) return pinForTrip(tx, payload.trip_id, payload.pin);
  throw new DomainError('VALIDATION', { reason: 'pin_or_poi' });
}

/**
 * On a locked trip a place a member saves to Ideas waits for someone to put it in a day, and the
 * crew would never hear of it: the first save of it posts a system line in crew chat naming the
 * place and who saved it (`idea_saved`; the app words it). Swipes save in bulk and stay quiet.
 */
async function announceSavedAfterLock(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
  backers: readonly string[],
  name: string | null,
): Promise<void> {
  if (backers.length !== 1 || backers[0] !== uid) return;
  await asSystemRole(tx, () =>
    tx.query(
      `SELECT app.post_crew_system_message(t.crew_id, 'idea_saved', $2, $3)
         FROM trips t
        WHERE t.id = $1 AND t.status IN ('confirmed', 'pre_trip', 'in_trip')`,
      [tripId, uid, (name ?? '').slice(0, 200)],
    ),
  );
}

export const saveIdeaCommand = defineCommand({
  name: 'save_idea',
  v: 1,
  schema: saveIdeaPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireTripMember(tx, payload.trip_id);
  },
  handle: async (tx, payload, ctx): Promise<SaveIdeaResult> => {
    const place = await ideaPlace(tx, payload);
    const backed = await backIdea(tx, {
      tripId: payload.trip_id,
      crewId: await tripCrew(tx, payload.trip_id),
      uid: ctx.uid,
      place,
      source: payload.source,
      sourceUrl: payload.source_url,
      ideaId: payload.idea_id,
    });
    if (place.poiId !== null) await keepInSavedPlaces(tx, ctx.uid, place.poiId);
    if (backed.changed && payload.source !== 'swipe') {
      await announceSavedAfterLock(tx, payload.trip_id, ctx.uid, backed.backerIds, place.name);
    }
    return { idea_id: backed.ideaId, backer_ids: backed.backerIds };
  },
});
