/**
 * A crew fixture (see ./crew-fixture.ts) with one trip on top: the crew's organiser and member are
 * seated as trip_participants (organiser/member), the outsider is neither. Shared by every
 * trip/plan-scoped permission test so they do not each hand-roll the same setup.
 */
import type pg from 'pg';

import { withSystem } from '../../src/tx';
import { insertTrip, insertTripParticipant } from './actors';
import { buildCrewFixture, type CrewFixture } from './crew-fixture';

export interface TripFixture extends CrewFixture {
  readonly tripId: string;
}

export interface BuildTripFixtureOptions {
  /** Defaults to 'voting', a legal initial trip status. */
  readonly status?: string;
}

export async function buildTripFixture(
  pool: pg.Pool,
  options: BuildTripFixtureOptions = {},
): Promise<TripFixture> {
  const crew = await buildCrewFixture(pool);
  const status = options.status ?? 'voting';
  const tripId = await withSystem(pool, (tx) => insertTrip(tx, { crewId: crew.crewId, status }));
  await withSystem(pool, async (tx) => {
    await insertTripParticipant(tx, { tripId, userId: crew.organiserId, role: 'organiser' });
    await insertTripParticipant(tx, { tripId, userId: crew.memberId, role: 'member' });
  });
  return { ...crew, tripId };
}
