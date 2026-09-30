/**
 * A migrated database with a Bali crew on its trip: four members (Maya organises), a current plan
 * with a dinner, the Batur sunrise trek (a transfer booking picks the crew up at the villa gate) and
 * a flight home, plus a send-only pg-boss producer whose queues nobody consumes. The trip-day suites
 * call handlers directly and read what they wrote and queued.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { registerJobProducer, resetJobProducerForTests } from '@cp/db';
import { TRIP_DAY_QUEUES } from '@cp/domain';
import type { PgBoss } from 'pg-boss';

import { createBoss } from '../../src/boss';
import { mapboxLeaveByRouter } from '../../src/jobs/trip-day/route-eta';
import { silent, startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

export const TRIP_TZ = 'Asia/Makassar';
/** 16:00 in Bali on 14 October, the afternoon before the trek. */
export const NOW = new Date('2026-10-14T08:00:00Z');

export interface TripDayWorld {
  readonly harness: JobsHarness;
  readonly boss: PgBoss;
  readonly crewId: string;
  readonly tripId: string;
  readonly destinationId: string;
  /** Maya, Rin, Dev, Alex. */
  readonly members: readonly string[];
  readonly items: { readonly dinner: string; readonly trek: string; readonly flight: string };
  readonly transferBookingId: string;
  q<T>(sql: string, params?: unknown[]): Promise<T[]>;
  stop(): Promise<void>;
}

/** Mapbox Directions replayed from a recorded response (17 minutes with traffic). */
export function recordedMapboxRouter() {
  const recorded = JSON.parse(
    readFileSync(new URL('./fixtures/mapbox-kyoto-drive.json', import.meta.url), 'utf8'),
  ) as { status: number; body: unknown };
  const requests: string[] = [];
  const router = mapboxLeaveByRouter({
    accessToken: 'replay',
    now: () => NOW,
    fetch: (input) => {
      requests.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      return Promise.resolve(
        new Response(JSON.stringify(recorded.body), { status: recorded.status }),
      );
    },
  });
  return { router, requests };
}

export async function startTripDayWorld(): Promise<TripDayWorld> {
  const harness = await startJobsHarness();
  const boss = createBoss({
    connectionString: harness.postgres.getConnectionUri(),
    logger: silent,
  });
  await boss.start();
  for (const queue of [...Object.values(TRIP_DAY_QUEUES), 'notify.route']) {
    if ((await boss.getQueue(queue)) === null)
      await boss.createQueue(queue, { policy: 'standard' });
  }
  registerJobProducer(boss);
  const q = async <T>(sql: string, params: unknown[] = []) =>
    (await harness.pool.query(sql, params)).rows as T[];
  const one = async (sql: string, params: unknown[]) =>
    (await q<{ id: string }>(sql, params))[0]!.id;

  const names = ['Maya Tan', 'Rin Sato', 'Dev Rao', 'Alex Kim'];
  const members = names.map(() => randomUUID());
  for (const [i, id] of members.entries()) {
    await q(
      `INSERT INTO users (id, status, home_airport, display_name, tz)
       VALUES ($1, 'registered', 'SIN', $2, 'Asia/Singapore')`,
      [id, names[i]],
    );
  }
  const crewId = await one(
    "INSERT INTO crews (name, created_by) VALUES ('Bali Six', $1) RETURNING id",
    [members[0]],
  );
  for (const [i, id] of members.entries()) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      id,
      i === 0 ? 'organiser' : 'member',
    ]);
  }
  const destinationId = await one(
    `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
     VALUES ($1, 'Bali', 'ID', 'live', 'IDR', $2) RETURNING id`,
    [`bali-${randomUUID().slice(0, 8)}`, TRIP_TZ],
  );
  const tripId = await one(
    `INSERT INTO trips (crew_id, status, destination_id, trip_length_days)
     VALUES ($1, 'voting', $2, 8) RETURNING id`,
    [crewId, destinationId],
  );
  await q(
    "UPDATE trips SET status = 'won', tz = $2, start_date = '2026-10-12', end_date = '2026-10-19' WHERE id = $1",
    [tripId, TRIP_TZ],
  );
  for (const [i, id] of members.entries()) {
    await q(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [tripId, id, i === 0 ? 'organiser' : 'member'],
    );
  }
  const versionId = await one(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [tripId],
  );
  await q('UPDATE trips SET current_version_id = $2 WHERE id = $1', [tripId, versionId]);
  const dayId = await one(
    "INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 4, '2026-10-15') RETURNING id",
    [versionId, tripId],
  );
  const poi = (name: string, category: string, lat: number, lng: number) =>
    one(
      `INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [destinationId, name, category, lat, lng],
    );
  const warung = await poi('Warung Biah Biah', 'food', -8.5069, 115.2625);
  const batur = await poi('Mount Batur', 'nature', -8.2421, 115.3751);
  const airport = await poi('Ngurah Rai Airport', 'transit', -8.7482, 115.1675);
  const item = (poiId: string, startsAt: string, category: string) =>
    one(
      `INSERT INTO plan_items (version_id, day_id, trip_id, poi_id, starts_at, tz, category, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed') RETURNING id`,
      [versionId, dayId, tripId, poiId, startsAt, TRIP_TZ, category],
    );
  const dinner = await item(warung, '2026-10-14T11:00:00Z', 'meal'); // 19:00
  const trek = await item(batur, '2026-10-14T20:30:00Z', 'activity'); // 04:30
  await item(warung, '2026-10-18T11:00:00Z', 'meal'); // the last dinner, 19:00
  const flight = await item(airport, '2026-10-19T01:40:00Z', 'flight'); // 09:40
  const transferBookingId = await one(
    `INSERT INTO bookings (trip_id, owner_id, type, title, starts_at, tz, location, source, visibility)
     VALUES ($1, $2, 'transfer', 'Batur sunrise pickup', '2026-10-14T19:30:00Z', $3,
       'Villa gate', 'manual', 'crew') RETURNING id`,
    [tripId, members[0], TRIP_TZ],
  );
  await q('UPDATE plan_items SET booking_id = $2 WHERE id = $1', [trek, transferBookingId]);
  return {
    harness,
    boss,
    crewId,
    tripId,
    destinationId,
    members,
    items: { dinner, trek, flight },
    transferBookingId,
    q,
    async stop() {
      await boss.stop({ graceful: false });
      resetJobProducerForTests();
      await harness.close();
    },
  };
}
