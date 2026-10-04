/**
 * `create_trip` (docs/api-contracts.md §4.3): start a trip for a place.
 *
 * - Crew trip: the trip is born `voting` with its destination poll and the place as the first
 *   candidate, in this one transaction (a voting crew trip without an open destination poll never
 *   commits). When the crew already has an open vote, the place joins it (or waits in the queue
 *   while a final is on) instead of starting a second one.
 * - Solo trip: `setup` straight away with one seat, no vote and no RSVP; the place's guide plans it.
 *   A solo trip can buy a Boost but is never a crew's free first trip.
 */
import { appendDomainEvent } from '@cp/db';
import {
  CREW_NAME_MAX,
  createTripPayloadSchema,
  DomainError,
  generateUuidV7,
  normaliseCrewName,
  type CreateTripResult,
} from '@cp/domain';
import { ftfEligible } from '@cp/entitlements';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { startCrew } from '../crews/create-crew';
import { defineCommand } from '../_framework/define-command';
import { pitchToCrew, resolvePlace, type Place } from '../polls/destination';
import { requireCrewMember } from '../polls/shared';

/** The caller's active crew (their chosen one first), if they belong to any. */
async function activeCrewOf(tx: pg.PoolClient, uid: string): Promise<string | undefined> {
  const { rows } = await tx.query<{ crew_id: string }>(
    `SELECT m.crew_id
       FROM crew_members m LEFT JOIN user_settings s ON s.user_id = m.user_id
      WHERE m.user_id = $1 AND m.status = 'active'
      ORDER BY (m.crew_id = s.active_crew_id) DESC NULLS LAST, m.created_at DESC
      LIMIT 1`,
    [uid],
  );
  return rows[0]?.crew_id;
}

/** A crew of one is named after its member; with no name yet, plainly "Solo". */
export function soloCrewName(displayName: string | null): string {
  const name = normaliseCrewName(displayName ?? '');
  return name === '' ? 'Solo' : [...name].slice(0, CREW_NAME_MAX).join('').trim();
}

/**
 * The crew a solo trip lives in: the one given, else the caller's active crew, else a crew of one
 * started for them here (a brand-new account has none), the same way `create_crew` starts one.
 */
async function soloCrew(
  tx: pg.PoolClient,
  crewId: string | undefined,
  ctx: { readonly uid: string; readonly now: Date },
): Promise<string> {
  if (crewId !== undefined) return crewId;
  const found = await activeCrewOf(tx, ctx.uid);
  if (found !== undefined) return found;
  const { rows } = await tx.query<{ display_name: string | null }>(
    'SELECT display_name FROM users WHERE id = $1',
    [ctx.uid],
  );
  const started = await startCrew(tx, {
    crewId: generateUuidV7(),
    name: soloCrewName(rows[0]?.display_name ?? null),
    art: null,
    uid: ctx.uid,
    now: ctx.now,
  });
  return started.crew_id;
}

async function earlierCrewTrips(
  tx: pg.PoolClient,
  crewId: string,
  tripId: string,
): Promise<number> {
  const { rows } = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM trips
      WHERE crew_id = $1 AND id <> $2 AND NOT is_solo AND status <> 'cancelled'`,
    [crewId, tripId],
  );
  return rows[0]?.n ?? 0;
}

async function createSoloTrip(
  tx: pg.PoolClient,
  input: { tripId: string; crewId: string; place: Place; uid: string },
): Promise<CreateTripResult> {
  const { tripId, crewId, place, uid } = input;
  await tx.query(
    `INSERT INTO trips (id, crew_id, status, destination_id, is_solo, seat_cap, guide_id,
       is_guest_guide, tz, local_currency)
     SELECT $1, $2, 'setup', d.id, true, 1, app.destination_guide_id(d.id),
            d.coverage = 'guest', d.tz, d.currency
       FROM destinations d
      WHERE d.id = $3`,
    [tripId, crewId, place.id],
  );
  await tx.query(
    `INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')`,
    [tripId, uid],
  );
  const events = [
    { type: 'trip.created', payload: { trip_id: tripId, crew_id: crewId } },
    { type: 'trip.status_changed', payload: { trip_id: tripId, from: null, to: 'setup' } },
    { type: 'trip.destination_set', payload: { trip_id: tripId, destination_id: place.id } },
  ] as const;
  for (const event of events) {
    await appendDomainEvent(tx, {
      type: event.type,
      aggregateKind: 'trip',
      aggregateId: tripId,
      actorKind: 'user',
      actorId: uid,
      payload: event.payload,
      crewId,
      tripId,
    });
  }
  return { trip_id: tripId, status: 'setup', poll_id: null, solo: true, ftf_eligible: false };
}

export const createTripCommand = defineCommand({
  name: 'create_trip',
  v: 1,
  schema: createTripPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    if (!payload.solo && payload.crew_id === undefined) {
      throw new DomainError('VALIDATION', { reason: 'crew_required' });
    }
    // A solo trip by someone in no crew yet starts their crew of one in `handle`.
    const crewId = payload.solo
      ? (payload.crew_id ?? (await activeCrewOf(tx, ctx.uid)))
      : payload.crew_id;
    if (crewId !== undefined) await requireCrewMember(tx, crewId);
  },
  handle: async (tx, payload, ctx): Promise<CreateTripResult> => {
    const place = await resolvePlace(tx, payload.place_id);
    const tripId = payload.trip_id ?? generateUuidV7();
    if (payload.solo) {
      const crewId = await soloCrew(tx, payload.crew_id, {
        uid: ctx.uid,
        now: ctx.clock.serverNow,
      });
      return asSystemRole(tx, () => createSoloTrip(tx, { tripId, crewId, place, uid: ctx.uid }));
    }
    const crewId = payload.crew_id ?? '';
    const pitched = await asSystemRole(tx, () =>
      pitchToCrew(tx, {
        crewId,
        place,
        pitchId: payload.pitch_id,
        month: payload.month,
        newTripId: tripId,
        uid: ctx.uid,
        now: ctx.clock.serverNow,
      }),
    );
    const trip = pitched.trip_id ?? tripId;
    return {
      trip_id: trip,
      status: 'voting',
      poll_id: pitched.poll_id,
      solo: false,
      ftf_eligible: ftfEligible({
        isSolo: false,
        earlierCrewTrips: await earlierCrewTrips(tx, crewId, trip),
      }),
    };
  },
});
