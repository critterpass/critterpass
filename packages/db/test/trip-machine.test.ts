/**
 * Exhaustive proof that `app.trips_status_guard` (packages/db/migrations/*_trips_and_participants.
 * sql) accepts and rejects exactly the same (from, to) pairs as
 * packages/domain/src/state/trip.ts#canTransitionTrip, built from the same transitions table.
 */
import { canTransitionTrip, TRIP_STATUSES, type TripStatus } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../src/tx';
import { firstRow } from './helpers/actors';
import { buildCrewFixture, type CrewFixture } from './helpers/crew-fixture';
import { startDbTestContainer, type DbTestContainer, type DbTestDatabase } from './helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let crew: CrewFixture;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  crew = await buildCrewFixture(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

/** Shortest legal walk (INSERT status, then a chain of legal UPDATEs) reaching each state. */
const PATH_TO: Record<TripStatus, readonly TripStatus[]> = {
  voting: ['voting'],
  won: ['voting', 'won'],
  setup: ['setup'],
  drafting: ['setup', 'drafting'],
  draft_review: ['setup', 'drafting', 'draft_review'],
  redrafting: ['setup', 'drafting', 'draft_review', 'redrafting'],
  proposed: ['setup', 'drafting', 'draft_review', 'proposed'],
  confirmed: ['setup', 'drafting', 'draft_review', 'proposed', 'confirmed'],
  pre_trip: ['setup', 'drafting', 'draft_review', 'proposed', 'confirmed', 'pre_trip'],
  in_trip: ['setup', 'drafting', 'draft_review', 'proposed', 'confirmed', 'pre_trip', 'in_trip'],
  post_trip: [
    'setup',
    'drafting',
    'draft_review',
    'proposed',
    'confirmed',
    'pre_trip',
    'in_trip',
    'post_trip',
  ],
  archived: [
    'setup',
    'drafting',
    'draft_review',
    'proposed',
    'confirmed',
    'pre_trip',
    'in_trip',
    'post_trip',
    'archived',
  ],
  cancelled: ['setup', 'cancelled'],
};

/** Walks a brand new trip row through the shortest legal path to `status`, all as app_system. */
async function createTripAt(status: TripStatus): Promise<string> {
  const [initial, ...rest] = PATH_TO[status];
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'INSERT INTO trips (crew_id, status) VALUES ($1, $2) RETURNING id',
      [crew.crewId, initial],
    );
    const tripId = firstRow(rows).id;
    for (const next of rest) {
      await tx.query('UPDATE trips SET status = $1 WHERE id = $2', [next, tripId]);
    }
    return tripId;
  });
}

describe('trips_status_guard matches canTransitionTrip', () => {
  it('agrees on every initial (INSERT) status', async () => {
    for (const to of TRIP_STATUSES) {
      const allowed = canTransitionTrip(null, to);
      const attempt = withSystem(db.pool, (tx) =>
        tx.query('INSERT INTO trips (crew_id, status) VALUES ($1, $2)', [crew.crewId, to]),
      );
      if (allowed) {
        await expect(attempt).resolves.toBeDefined();
      } else {
        await expect(attempt).rejects.toThrow(/illegal initial trip status/i);
      }
    }
  }, 60_000);

  it('agrees on every (from, to) UPDATE pair', async () => {
    // A fresh row per pair: many legal forward transitions have no legal reverse, so the row
    // cannot be walked back to `from` and reused for the next `to` in this loop.
    for (const from of TRIP_STATUSES) {
      for (const to of TRIP_STATUSES) {
        const tripId = await createTripAt(from);
        const allowed = canTransitionTrip(from, to);
        const attempt = withSystem(db.pool, (tx) =>
          tx.query('UPDATE trips SET status = $1 WHERE id = $2', [to, tripId]),
        );
        if (allowed) {
          await expect(attempt).resolves.toBeDefined();
        } else {
          await expect(attempt).rejects.toThrow(/illegal trip status transition/i);
        }
      }
    }
  }, 120_000);
});
