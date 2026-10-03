/**
 * Who may say where they stand on a place: a participant of the trip (an outsider gets
 * `NOT_FOUND`, a member who is out of the trip `FORBIDDEN`), about an active place.
 */
import { DomainError } from '@cp/domain';
import type pg from 'pg';

import { requireTripMember } from '../../plan/access';

export async function requireStanceTaker(
  tx: pg.PoolClient,
  input: { readonly tripId: string; readonly poiId: string },
): Promise<void> {
  await requireTripMember(tx, input.tripId);
  const { rows } = await tx.query<{ out: boolean; place: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM trip_participants
                     WHERE trip_id = $1 AND user_id = app.uid() AND rsvp = 'out') AS out,
            EXISTS (SELECT 1 FROM pois WHERE id = $2 AND status = 'active') AS place`,
    [input.tripId, input.poiId],
  );
  if (rows[0]?.out === true) throw new DomainError('FORBIDDEN', { reason: 'not_participant' });
  if (rows[0]?.place !== true) throw new DomainError('NOT_FOUND', { reason: 'place' });
}

export function stanceEvent(
  type: 'place.stance_set' | 'place.stance_cleared',
  uid: string,
  input: { readonly trip_id: string; readonly poi_id: string },
  extra: { readonly stance?: 'want' | 'rather_not' } = {},
) {
  return {
    type,
    aggregateKind: 'trip',
    aggregateId: input.trip_id,
    actorKind: 'user' as const,
    actorId: uid,
    tripId: input.trip_id,
    payload: { trip_id: input.trip_id, poi_id: input.poi_id, user_id: uid, ...extra },
  };
}
