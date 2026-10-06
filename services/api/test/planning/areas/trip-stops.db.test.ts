/**
 * `set_trip_stops` on the real stack: Kyoto two nights then Osaka two nights is stored in order and
 * a second call replaces it; the destination alone, or nothing, makes a one-stop trip again; and
 * every refusal names its reason: the switch, a member, the first stop, a stop with no onward link
 * or that is an area, another time zone or currency, nights that do not add up, open dates and a
 * crew plan that already exists.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setTripStopsCommand } from '../../../src/planning/areas/set-trip-stops';
import { seedCurrentPlan } from '../../plan/plan-fixture';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
const place = { kyoto: '', osaka: '', kobe: '', seoul: '', yen: '', nara: '' };
const SOURCES = JSON.stringify([
  { url: 'https://example.org/osaka', title: 'Osaka', quote: '15 min' },
]);

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const switchAreas = (on: boolean) =>
  harness.pool.query("UPDATE ops.ops_config SET value = $1::jsonb WHERE key = 'trip.areas'", [
    JSON.stringify(on),
  ]);

const setStops = (
  stops: [string, number][],
  who: SignedIn = crew.organiser,
  tripId = crew.tripId,
) =>
  harness.run(who, 'set_trip_stops', {
    trip_id: tripId,
    stops: stops.map(([destination_id, nights]) => ({ destination_id, nights })),
  });

const reason = async (stops: [string, number][]) =>
  errorOf(await setStops(stops)).detail?.['reason'];

const stored = async (tripId = crew.tripId) => {
  const { rows } = await harness.pool.query<{
    position: number;
    destination_id: string;
    nights: number;
  }>(
    'SELECT position, destination_id, nights FROM trip_stops WHERE trip_id = $1 ORDER BY position',
    [tripId],
  );
  return rows;
};

beforeAll(async () => {
  harness = await startSetupHarness((registry) => {
    registry.register(setTripStopsCommand);
  });
  crew = await buildSetupCrew(harness, 2);
  await withSystem(harness.pool, async (tx) => {
    const { rows: trip } = await tx.query<{ destination_id: string }>(
      'SELECT destination_id FROM trips WHERE id = $1',
      [crew.tripId],
    );
    place.kyoto = trip[0]!.destination_id;
    const city = async (name: string, currency: string, tz: string, coverage = 'guest') => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO destinations (slug, name, coverage, currency, tz)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [`${name.toLowerCase()}-${randomUUID().slice(0, 8)}`, name, coverage, currency, tz],
      );
      return rows[0]!.id;
    };
    place.osaka = await city('Osaka', 'USD', 'Asia/Tokyo');
    place.kobe = await city('Kobe', 'USD', 'Asia/Tokyo');
    place.seoul = await city('Seoul', 'USD', 'Asia/Seoul');
    place.yen = await city('Nagoya', 'JPY', 'Asia/Tokyo');
    place.nara = await city('Nara', 'USD', 'Asia/Tokyo', 'area');
    for (const to of [place.osaka, place.seoul, place.yen, place.nara]) {
      await tx.query(
        `INSERT INTO destination_links (key, from_destination_id, to_destination_id, kind, minutes,
                                        mode, sources)
         VALUES ($1, $2, $3, 'onward', 60, 'train', $4)`,
        [`kyoto>${to}:onward`, place.kyoto, to, SOURCES],
      );
    }
  });
  await switchAreas(true);
  const locked = await harness.run(crew.organiser, 'lock_trip_dates', {
    trip_id: crew.tripId,
    start: day(40),
    end: day(44),
  });
  if (locked.status !== 200) throw new Error(JSON.stringify(locked.body));
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('set_trip_stops', () => {
  it('stores Kyoto two nights then Osaka two nights in order, and a second call replaces it', async () => {
    const first = await setStops([
      [place.kyoto, 2],
      [place.osaka, 2],
    ]);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(resultOf(first)).toEqual({
      trip_id: crew.tripId,
      stops: [
        { position: 1, destination_id: place.kyoto, nights: 2 },
        { position: 2, destination_id: place.osaka, nights: 2 },
      ],
    });
    expect(await stored()).toEqual([
      { position: 1, destination_id: place.kyoto, nights: 2 },
      { position: 2, destination_id: place.osaka, nights: 2 },
    ]);
    const { rows } = await harness.pool.query(
      `SELECT count(*)::int AS n FROM domain_events
        WHERE aggregate_id = $1 AND type = 'trip.areas_changed'`,
      [crew.tripId],
    );
    expect(rows[0]).toEqual({ n: 1 });

    expect(
      (
        await setStops([
          [place.kyoto, 3],
          [place.osaka, 1],
        ])
      ).status,
    ).toBe(200);
    expect((await stored()).map((stop) => stop.nights)).toEqual([3, 1]);
  });

  it('makes a one-stop trip again from the destination alone or from nothing', async () => {
    expect(resultOf(await setStops([[place.kyoto, 4]]))).toEqual({
      trip_id: crew.tripId,
      stops: [],
    });
    expect(await stored()).toEqual([]);
    await setStops([
      [place.kyoto, 2],
      [place.osaka, 2],
    ]);
    expect((await setStops([])).status).toBe(200);
    expect(await stored()).toEqual([]);
  });

  it('names the reason for every route it refuses, and keeps the stored one', async () => {
    await setStops([
      [place.kyoto, 2],
      [place.osaka, 2],
    ]);
    expect(await reason([[place.osaka, 4]])).toBe('first_stop');
    expect(
      await reason([
        [place.kyoto, 2],
        [place.kobe, 2],
      ]),
    ).toBe('not_linked');
    expect(
      await reason([
        [place.kyoto, 2],
        [place.nara, 2],
      ]),
    ).toBe('not_linked');
    expect(
      await reason([
        [place.kyoto, 2],
        [place.seoul, 2],
      ]),
    ).toBe('other_time_zone');
    expect(
      await reason([
        [place.kyoto, 2],
        [place.yen, 2],
      ]),
    ).toBe('other_currency');
    expect(
      errorOf(
        await setStops([
          [place.kyoto, 2],
          [place.osaka, 1],
        ]),
      ),
    ).toMatchObject({ code: 'VALIDATION', detail: { reason: 'stay_nights', nights: 4 } });
    expect((await stored()).map((stop) => stop.destination_id)).toEqual([place.kyoto, place.osaka]);
  });

  it('is refused to a member, with the switch off, before dates lock and once the crew has a plan', async () => {
    const route: [string, number][] = [
      [place.kyoto, 2],
      [place.osaka, 2],
    ];
    expect(errorOf(await setStops(route, crew.members[1] as SignedIn)).code).toBe('FORBIDDEN');
    await switchAreas(false);
    try {
      expect(await reason(route)).toBe('trip_areas_off');
    } finally {
      await switchAreas(true);
    }

    const open = await buildSetupCrew(harness, 1);
    await harness.pool.query('UPDATE trips SET destination_id = $2 WHERE id = $1', [
      open.tripId,
      place.kyoto,
    ]);
    expect(errorOf(await setStops(route, open.organiser, open.tripId)).detail).toMatchObject({
      reason: 'dates_not_locked',
    });
    await seedCurrentPlan(harness.pool, open.tripId);
    expect(errorOf(await setStops(route, open.organiser, open.tripId)).detail).toMatchObject({
      reason: 'plan_shared',
    });
    expect(await stored(open.tripId)).toEqual([]);
  });
});
