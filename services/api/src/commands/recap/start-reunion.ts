/**
 * `start_reunion {memory_id, trip_id?}` (3m-10 PLAN A REUNION): pitches the memory's place to the
 * crew's destination vote, the same way pitching from search does: onto the open board, into a new
 * vote (a voting trip with its poll, under the app's `trip_id` so a replay finds it), or into the
 * queue while a final is on. Only a traveller still in the crew can start one.
 */
import { DomainError, startReunionPayloadSchema, type PitchToCrewResult } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { pitchToCrew, resolvePlace } from '../polls/destination';
import { requireCrewMember } from '../polls/shared';

interface ReunionSource {
  readonly crew_id: string;
  readonly destination_id: string | null;
}

async function reunionSource(tx: pg.PoolClient, memoryId: string): Promise<ReunionSource> {
  const { rows } = await tx.query<ReunionSource>(
    `SELECT t.crew_id, t.destination_id FROM memories m JOIN trips t ON t.id = m.trip_id
      WHERE m.id = $1`,
    [memoryId],
  );
  const source = rows[0];
  if (source === undefined) throw new DomainError('NOT_FOUND', { reason: 'memory' });
  await requireCrewMember(tx, source.crew_id);
  if (source.destination_id === null) {
    throw new DomainError('STATE_INVALID', { reason: 'no_destination' });
  }
  return source;
}

export const startReunionCommand = defineCommand({
  name: 'start_reunion',
  v: 1,
  schema: startReunionPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await reunionSource(tx, payload.memory_id);
  },
  handle: async (tx, payload, ctx): Promise<PitchToCrewResult> => {
    const source = await reunionSource(tx, payload.memory_id);
    const place = await resolvePlace(tx, source.destination_id as string);
    return asSystemRole(tx, () =>
      pitchToCrew(tx, {
        crewId: source.crew_id,
        place,
        newTripId: payload.trip_id,
        uid: ctx.uid,
        now: ctx.clock.serverNow,
      }),
    );
  },
});
