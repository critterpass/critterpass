/**
 * `set_trip_stops` on the real stack: Kyoto two nights then Osaka two nights is stored in order and
 * a second call replaces it; the destination alone, or nothing, makes a one-stop trip again; and
 * every refusal names its reason: the switch, a member, the first stop, a stop with no onward link
 * or that is an area, another time zone or currency, nights that do not add up, open dates and a
 * crew plan that already exists.
 *
 * A route and the plan's days: the empty plan of a trip with stops gives a later stop's days its
 * city; stops set on a draft seat every day and send the stops of a day whose city changed back to
 * Ideas; a dates change refits the stops and the draft follows.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDraftCommands } from '../../../src/commands/draft';
import { setDayAreaCommand } from '../../../src/planning/areas/set-day-area';
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
const poi = { temple: '', garden: '', deer: '', castle: '' };
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
    registerDraftCommands(registry);
    registry.register(setDayAreaCommand);
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
  await withSystem(harness.pool, async (tx) => {
    await tx.query(
      `INSERT INTO destination_links (key, from_destination_id, to_destination_id, kind, minutes,
                                      mode, day_length, sources)
       VALUES ($1, $2, $3, 'day_trip', 45, 'train', 'full', $4)`,
      [`kyoto>${place.nara}:day_trip`, place.kyoto, place.nara, SOURCES],
    );
    const add = async (destinationId: string, name: string) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng)
         VALUES ($1, $2, 'temple_shrine', 35.0, 135.7) RETURNING id`,
        [destinationId, name],
      );
      return rows[0]!.id;
    };
    poi.temple = await add(place.kyoto, 'Kiyomizu-dera');
    poi.garden = await add(place.kyoto, 'Ryoan-ji');
    poi.deer = await add(place.nara, 'Nara Park');
    poi.castle = await add(place.osaka, 'Osaka Castle');
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
    // The trip has its empty plan since the dates locked: the answer names the seated draft.
    expect(resultOf(first)).toEqual({
      trip_id: crew.tripId,
      stops: [
        { position: 1, destination_id: place.kyoto, nights: 2 },
        { position: 2, destination_id: place.osaka, nights: 2 },
      ],
      version_id: expect.any(String) as string,
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
      version_id: expect.any(String) as string,
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

/** A fresh one-person trip to Kyoto over five days (four nights), with its empty plan. */
async function routeTrip() {
  const made = await buildSetupCrew(harness, 1);
  await harness.pool.query('UPDATE trips SET destination_id = $2 WHERE id = $1', [
    made.tripId,
    place.kyoto,
  ]);
  const lock = (start: number, end: number) =>
    harness.run(made.organiser, 'lock_trip_dates', {
      trip_id: made.tripId,
      start: day(start),
      end: day(end),
    });
  const locked = await lock(40, 44);
  if (locked.status !== 200) throw new Error(JSON.stringify(locked.body));
  const draft = async (): Promise<string> => {
    const { rows } = await harness.pool.query<{ v: string }>(
      'SELECT draft_version_id AS v FROM trips WHERE id = $1',
      [made.tripId],
    );
    return rows[0]!.v;
  };
  const areas = async () => {
    const { rows } = await harness.pool.query<{ destination_id: string | null }>(
      'SELECT destination_id FROM plan_days WHERE version_id = $1 ORDER BY day_no',
      [await draft()],
    );
    return rows.map((row) => row.destination_id);
  };
  const items = async () => {
    const { rows } = await harness.pool.query<{ stable_id: string; day_no: number }>(
      `SELECT i.stable_id, d.day_no FROM plan_items i JOIN plan_days d ON d.id = i.day_id
        WHERE i.version_id = $1`,
      [await draft()],
    );
    return new Map(rows.map((row) => [row.stable_id, row.day_no]));
  };
  const add = async (stops: [string, number, Record<string, unknown>][]) => {
    const added = await harness.run(made.organiser, 'apply_draft_ops', {
      trip_id: made.tripId,
      base_version: await draft(),
      ops: stops.map(([item, dayNo, where]) => ({
        op: 'add',
        item,
        new: {
          day_no: dayNo,
          starts_at: `${day(39 + dayNo)}T01:00:00.000Z`,
          ends_at: `${day(39 + dayNo)}T02:00:00.000Z`,
          tz: 'Asia/Tokyo',
          category: 'activity',
          ...where,
        },
      })),
    });
    if (added.status !== 200) throw new Error(JSON.stringify(added.body));
  };
  const dayTrip = async (dayNo: number) => {
    const set = await harness.run(made.organiser, 'set_day_area', {
      trip_id: made.tripId,
      base_version: await draft(),
      day_no: dayNo,
      destination_id: place.nara,
    });
    if (set.status !== 200) throw new Error(JSON.stringify(set.body));
  };
  const ideas = async () => {
    const { rows } = await harness.pool.query<{ poi_id: string }>(
      'SELECT poi_id FROM trip_ideas WHERE trip_id = $1 AND poi_id IS NOT NULL ORDER BY poi_id',
      [made.tripId],
    );
    return rows.map((row) => row.poi_id);
  };
  return { ...made, lock, draft, areas, items, add, dayTrip, ideas };
}

const kyotoThenOsaka = (): [string, number][] => [
  [place.kyoto, 2],
  [place.osaka, 2],
];

describe('a route and the days of the plan', () => {
  it('gives the days of a later stop its city, in the draft and in a fresh empty plan', async () => {
    const trip = await routeTrip();
    expect(await trip.areas()).toEqual([null, null, null, null, null]);
    const before = await trip.draft();
    const set = resultOf<{ version_id: string; moved_stops?: unknown }>(
      await setStops(kyotoThenOsaka(), trip.organiser, trip.tripId),
    );
    expect(set.version_id).toBe(await trip.draft());
    expect(set.version_id).not.toBe(before);
    expect(set.moved_stops).toBeUndefined();
    expect(await trip.areas()).toEqual([null, null, place.osaka, place.osaka, place.osaka]);

    // Two nights longer: the last stop takes them, and the fresh empty plan is seated.
    const longer = resultOf<{ stops?: unknown; moved_stops?: unknown }>(await trip.lock(40, 46));
    expect(longer.stops).toEqual([
      { position: 1, destination_id: place.kyoto, nights: 2 },
      { position: 2, destination_id: place.osaka, nights: 4 },
    ]);
    expect(await stored(trip.tripId)).toEqual(longer.stops);
    expect(await trip.areas()).toEqual([null, null, ...Array<string>(5).fill(place.osaka)]);

    // The same dates again change nothing and answer no stops.
    expect(resultOf<{ stops?: unknown }>(await trip.lock(40, 46)).stops).toBeUndefined();
  });

  it('seats a draft that holds stops: what stays, what goes to Ideas, which day trip survives', async () => {
    const trip = await routeTrip();
    const id = {
      temple: randomUUID(),
      deer: randomUUID(),
      garden: randomUUID(),
      deerLater: randomUUID(),
      pin: randomUUID(),
    };
    await trip.dayTrip(2);
    await trip.dayTrip(4);
    await trip.add([
      [id.temple, 1, { poi_id: poi.temple }],
      [id.deer, 2, { poi_id: poi.deer }],
      [id.garden, 3, { poi_id: poi.garden }],
      [id.deerLater, 4, { poi_id: poi.deer }],
      [id.pin, 4, { custom_place: { name: 'Hotel bar', lat: 35.0, lng: 135.7 } }],
    ]);
    const set = resultOf<{ version_id: string; moved_stops: { stable_id: string; to: string }[] }>(
      await setStops(kyotoThenOsaka(), trip.organiser, trip.tripId),
    );
    expect(set.version_id).toBe(await trip.draft());
    // Day two's trip to Nara leaves from Kyoto and stays; day four's cannot leave from Osaka.
    expect(await trip.areas()).toEqual([null, place.nara, place.osaka, place.osaka, place.osaka]);
    expect([...set.moved_stops].sort((a, b) => a.stable_id.localeCompare(b.stable_id))).toEqual(
      [id.garden, id.deerLater].sort().map((stable_id) => ({ stable_id, to: 'ideas' })),
    );
    expect(await trip.items()).toEqual(
      new Map([
        [id.temple, 1],
        [id.deer, 2],
        [id.pin, 4],
      ]),
    );
    expect(await trip.ideas()).toEqual([poi.garden, poi.deer].sort());

    // One stop again: the later days leave Osaka, and the day trip from Kyoto is still there.
    const one = resultOf<{ stops: unknown[]; version_id: string }>(
      await setStops([], trip.organiser, trip.tripId),
    );
    expect(one.stops).toEqual([]);
    expect(await trip.areas()).toEqual([null, place.nara, null, null, null]);
  });

  it('refits the stops when the trip gets shorter, and the draft follows', async () => {
    const trip = await routeTrip();
    await setStops(kyotoThenOsaka(), trip.organiser, trip.tripId);
    const id = { temple: randomUUID(), castle: randomUUID(), pin: randomUUID() };
    await trip.add([
      [id.temple, 1, { poi_id: poi.temple }],
      [id.castle, 3, { poi_id: poi.castle }],
      [id.pin, 3, { custom_place: { name: 'Hotel bar', lat: 34.7, lng: 135.5 } }],
    ]);

    // One night shorter: the last stop gives it up.
    const shorter = resultOf<{ stops: unknown; moved_stops?: unknown }>(await trip.lock(40, 43));
    expect(shorter.stops).toEqual([
      { position: 1, destination_id: place.kyoto, nights: 2 },
      { position: 2, destination_id: place.osaka, nights: 1 },
    ]);
    expect(shorter.moved_stops).toBeUndefined();
    expect(await trip.areas()).toEqual([null, null, place.osaka, place.osaka]);
    expect((await trip.items()).get(id.castle)).toBe(3);

    // Three nights shorter than at first: Osaka has no night left and the trip is one stop again.
    const short = resultOf<{ stops: unknown; moved_stops: unknown[] }>(await trip.lock(40, 41));
    expect(short.stops).toEqual([]);
    expect(await stored(trip.tripId)).toEqual([]);
    expect(await trip.areas()).toEqual([null, null]);
    expect(short.moved_stops).toEqual(
      expect.arrayContaining([
        { stable_id: id.castle, to: 'ideas' },
        { stable_id: id.pin, to: 'day', day_no: 2 },
      ]),
    );
    expect(await trip.items()).toEqual(
      new Map([
        [id.temple, 1],
        [id.pin, 2],
      ]),
    );
  });
});
