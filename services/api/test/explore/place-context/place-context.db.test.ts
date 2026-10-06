/**
 * The place page's planning context on the real stack: when the place fits (the free day at
 * opening, before the approved crowd curve's rush, with the bars lit over that slot), fact tiles
 * from our own hours and approved editorial facts only (missing ones omitted), nearby and similar
 * places, and where the crew stands. An outsider gets NOT_FOUND, and nothing live from a third
 * party or a supplier reaches the payload. Every key installed builds parse stays, with the
 * earlier page's fields empty.
 */
import { withSystem, withUser } from '@cp/db';
import { placeContextSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readPlaceContext } from '../../../src/explore/place-context';

import { startExploreWorld, type ExploreWorld } from '../explore-world';

let world: ExploreWorld;
let spring: string;
let farTemple: string;

const OPEN = {
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start: '08:00', end: '17:00' }]]),
  ),
};
const rushFromTen = Array.from({ length: 24 }, (_, h) =>
  h >= 10 && h < 14 ? 90 : h >= 8 && h < 17 ? 25 : 0,
);

beforeAll(async () => {
  world = await startExploreWorld();
  const insert = (name: string, lat: number, editorial: object, hours: object = {}) =>
    withSystem(world.harness.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, curation, hours, editorial,
                           tags, source_ids)
         VALUES ($1, $2, 'temple_shrine', $3, 135.77, 'editorial', $4, $5, '{temples,water}',
                 '{"fsq": "fsq-secret-id-123"}') RETURNING id`,
        [world.kyoto, name, lat, JSON.stringify(hours), JSON.stringify(editorial)],
      );
      return rows[0]!.id;
    });
  spring = await insert(
    'Tirta Empul',
    35.01,
    {
      time_needed_min: 90,
      entry_short: 'RP 75K',
      dress_short: 'SARONG',
      tips: ['Start at the left pool and work right.'],
      know_before: [{ title: 'Sarongs are lent at the gate', detail: 'Free, leave a donation' }],
    },
    OPEN,
  );
  farTemple = await insert('Taman Saraswati', 35.4, { time_needed_min: 60 }, OPEN);
  await withSystem(world.harness.pool, async (tx) => {
    for (let dow = 0; dow < 7; dow += 1) {
      await tx.query(
        `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at, approved_at)
         VALUES ($1, $2, $3::smallint[], 'editorial', now(), now())`,
        [spring, dow, rushFromTen],
      );
    }
    await tx.query(
      `INSERT INTO place_stances (trip_id, poi_id, user_id, stance, note)
       VALUES ($1, $2, $3, 'want', 'The one photo my mum asked for.'),
              ($1, $2, $4, 'rather_not', NULL)`,
      [world.a.tripId, spring, world.a.organiser.uid, world.a.members[1]!.uid],
    );
  });
}, 240_000);

afterAll(async () => {
  await world?.harness.stop();
});

type Context = Record<string, unknown> & {
  when_it_fits: {
    best: { day_no: number; start: string; end: string; reasons: { code: string }[] } | null;
    bars: { from: number; to: number; hourly: number[] | null; lit: { from: number; to: number } };
  } | null;
  facts: Record<string, unknown>;
  know: unknown[];
  tip: string | null;
  nearby: { poi_id: string; minutes: number }[];
  similar: { poi_id: string; minutes: number }[];
  split: { want: string[]; rather_not: string[]; silent_user_ids: string[]; split: boolean } | null;
};

const context = async (poi: string, who = world.a.organiser, trip = world.a.tripId) => {
  const response = await world.get(who, `/v1/places/${poi}/context?trip_id=${trip}`);
  return { status: response.status, body: response.body as Context };
};

describe('place context for the planning page', () => {
  // Day 3 is free, but it is the day the crew leaves: the full day before it is the better answer.
  it('fits a full day at opening, before the rush, with the bars lit over the slot', async () => {
    const { status, body } = await context(spring, world.a.members[1]);
    expect(status).toBe(200);
    const fits = body.when_it_fits!;
    expect(fits.best).toMatchObject({ day_no: 2, start: '08:00', end: '09:30' });
    expect(fits.best!.reasons.map((r) => r.code)).toContain('busy_from');
    expect(fits.bars).toMatchObject({ from: 8, to: 17, lit: { from: 8, to: 10 } });
    expect(fits.bars.hourly).toEqual(rushFromTen.slice(8, 17));
  });

  it("keeps every key installed builds parse, with the earlier page's fields empty", async () => {
    const { body } = await context(spring);
    expect(placeContextSchema.parse(body)).toMatchObject({
      stay: null,
      crowd: null,
      suggested_slot: null,
      crew: { yes_by: [] },
    });
    expect(body['add_mode']).toBe('apply');
    // The plan her plan screens show is the crew's here; a draft only before there is one.
    expect(body['plan_version']).toEqual({ id: body['base_version'], kind: 'crew' });
  });

  it('gives fact tiles, the tip and what to know only from our own data', async () => {
    const { body } = await context(spring);
    expect(body.facts).toEqual({
      open_spans: [{ from: '08:00', to: '17:00' }],
      hours_known: true,
      entry: 'RP 75K',
      takes_min: 90,
      dress: 'SARONG',
    });
    expect(body.tip).toBe('Start at the left pool and work right.');
    expect(body.know).toEqual([
      { title: 'Sarongs are lent at the gate', detail: 'Free, leave a donation' },
    ]);
    const bare = await context(world.pois.mustSee);
    expect(bare.body.facts).toEqual({ open_spans: [], hours_known: false });
    expect(bare.body.know).toEqual([]);
    expect(JSON.stringify(bare.body) + JSON.stringify(body)).not.toContain('fsq-secret-id-123');
  });

  it('lists nearby places by minutes and similar ones at least twenty minutes away', async () => {
    const { body } = await context(spring);
    expect(body.nearby.length).toBeGreaterThan(0);
    expect(body.nearby.map((p) => p.minutes)).toEqual(
      [...body.nearby.map((p) => p.minutes)].sort((x, y) => x - y),
    );
    expect(body.similar.map((p) => p.poi_id)).toEqual([farTemple]);
    expect(body.similar[0]!.minutes).toBeGreaterThanOrEqual(20);
  });

  it('shows where the crew stands, and who has not said', async () => {
    const { body } = await context(spring);
    expect(body.split).toEqual({
      want: [world.a.organiser.uid],
      rather_not: [world.a.members[1]!.uid],
      silent_user_ids: [],
      split: true,
    });
    expect((await context(farTemple)).body.split).toBeNull();
  });

  it('takes the planning router minutes, keeping the straight line for what it cannot answer', async () => {
    // The router is the network boundary: it answers the stay leg only.
    const travel = () => ({
      legs: (pairs: readonly { from: { key: string }; to: { key: string } }[]) =>
        Promise.resolve(
          new Map(
            pairs
              .filter((pair) => pair.from.key === 'stay')
              .map((pair) => [
                `${pair.from.key}>${pair.to.key}`,
                { minutes: 33, mode: 'drive' as const, approx: false },
              ]),
          ),
        ),
    });
    const body = await withUser(world.harness.pool, world.a.organiser.uid, 'unknown', (tx) =>
      readPlaceContext(tx, { poiId: spring, tripId: world.a.tripId }, { travel }),
    );
    expect(body.from_stay).toMatchObject({ minutes: 33, mode: 'drive', approx: false });
    expect(body.similar.map((p) => p.poi_id)).toEqual([farTemple]);
  });

  it('is NOT_FOUND for someone outside the trip', async () => {
    expect((await context(spring, world.b.organiser)).status).toBe(404);
  });
});
