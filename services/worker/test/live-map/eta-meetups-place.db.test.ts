/**
 * The place a sharing member is named at ("At Ubud Palace") against a migrated Postgres: the
 * closest open place within the status radius, found through the spatial index. A catalogue of
 * millions of places cannot be read row by row inside the recount's statement timeout.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NEAREST_POI_SQL, recountMeetupEtas } from '../../src/jobs/live-map/eta-meetups';
import { straightLineRouter } from '../../src/jobs/live-map/meetup-router';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';
import { addFix, addMeetup, buildCrewTrip, openShare, type CrewTrip } from './live-map-fixture';

/** Well away from the fixture's meet-up, so nobody here has arrived. */
const MEMBER = { lat: -8.5069, lng: 115.2625 };
/** Metres to degrees of latitude. */
const north = (metres: number) => MEMBER.lat + metres / 111_320;

let harness: JobsHarness;
let trip: CrewTrip;
let meetupId: string;

beforeAll(async () => {
  harness = await startJobsHarness();
  trip = await buildCrewTrip(harness.pool);
  const [maya] = trip.uids;
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz)
     VALUES ('ubud-status-places', 'Ubud', 'live', 'Asia/Makassar') RETURNING id`,
  );
  const destinationId = rows[0]!.id;
  const place = (name: string, lat: number, status = 'active') =>
    harness.pool.query(
      `INSERT INTO pois (destination_id, name, category, lat, lng, status)
       VALUES ($1, $2, 'temple_shrine', $3, $4, $5)`,
      [destinationId, name, lat, MEMBER.lng, status],
    );
  await place('Ubud Palace', north(40));
  await place('Saraswati Temple', north(70));
  await place('Shut Warung', north(5), 'closed');
  await place('Monkey Forest', north(300));
  // A catalogue large enough that the planner has a real choice between the index and a scan.
  await harness.pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     SELECT $1, 'Place ' || n, 'other', -8 + (n % 100) * 0.01, 116 + (n / 100) * 0.01
       FROM generate_series(1, 5000) AS n`,
    [destinationId],
  );
  await harness.pool.query('ANALYZE pois');
  const share = await openShare(harness.pool, trip.tripId, maya);
  await addFix(harness.pool, share, { ...MEMBER, activity: 'stationary' });
  meetupId = await addMeetup(harness.pool, trip.tripId, maya);
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('the place a sharing member is at', () => {
  it('names the closest open place within the status radius', async () => {
    const result = await recountMeetupEtas(harness.pool, meetupId, straightLineRouter);
    expect(result.etas).toHaveLength(1);
    expect(result.etas[0]?.status).toMatchObject({ key: 'at_place', poi: 'Ubud Palace' });
  });

  it('names nobody at a place further than the status radius', async () => {
    const { rows } = await harness.pool.query(NEAREST_POI_SQL, [MEMBER.lng, north(180), 80]);
    expect(rows).toEqual([]);
  });

  it('is answered by the spatial index, never a scan of the catalogue', async () => {
    const { rows } = await harness.pool.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN ${NEAREST_POI_SQL}`,
      [MEMBER.lng, MEMBER.lat, 80],
    );
    const plan = rows.map((row) => row['QUERY PLAN']).join('\n');
    expect(plan).toContain('pois_location_gist_idx');
    expect(plan).not.toContain('Seq Scan');
  });
});
