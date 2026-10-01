/**
 * The storm decision on a real pg-boss runtime: rough seas on Friday's boat open a decision poll
 * with SWAP (Saturday is calm), KEEP and SKIP; the crew's SWAP moves the two days through the
 * executor and sets the watch row; a vote nobody answered by its deadline keeps the plan; and a
 * Viator-booked boat waits on its booker, whose new booking failing to happen (hold expired,
 * payment refused) leaves the old booking confirmed and uncancelled.
 */
import { randomUUID } from 'node:crypto';

import {
  appendDomainEvent,
  closePollInTx,
  loadPollState,
  onEventAppended,
  withSystem,
} from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { guideActionExecuteJob } from '../../src/guide-actions';
import { disruptionEventHook } from '../../src/jobs/disruptions/hooks';
import { disruptionReactJob } from '../../src/jobs/disruptions/react';
import { stormCommitJob } from '../../src/jobs/disruptions/storm-commit';
import { stormHandoff } from '../../src/jobs/disruptions/storm-decision';
import { watchWriter } from '../../src/jobs/disruptions/watch-notify';
import { watchTrip } from '../../src/jobs/disruptions/weather-watch';
import type { WatchedTrip } from '../../src/jobs/disruptions/watch-score';
import { buildGuidePlan, type GuidePlanFixture } from '../guide-actions/plan-fixture';
import { startJobsHarness, until, type JobsHarness } from '../helpers/jobs-harness';

const NOW = new Date('2026-10-14T00:00:00Z');
let harness: JobsHarness;

interface StormWorld {
  readonly fx: GuidePlanFixture;
  readonly trip: WatchedTrip;
  readonly boat: string;
  readonly temple: string;
}

function day(date: string, waveM: number) {
  const hours = [0, 1, 2, 3, 4, 5, 6].map((h) => `${date}T0${h}:00:00Z`);
  return {
    hourly: {
      day: { max_temp_c: 31, min_temp_c: 25, chance_of_rain: 10, precip_mm: 0, uv: 8, code: 1000 },
      hours: hours.map((at) => ({
        at,
        temp_c: 29,
        chance_of_rain: 10,
        precip_mm: 0,
        wind_kph: waveM > 2 ? 35 : 10,
        gust_kph: waveM > 2 ? 35 : 10,
        uv: 7,
        code: 1000,
        is_day: true,
      })),
    },
    marine: {
      hours: hours.map((at) => ({
        at,
        wave_m: waveM,
        swell_m: waveM,
        swell_period_s: 9,
        water_temp_c: 28,
      })),
      tides: null,
    },
  };
}

async function item(fx: GuidePlanFixture, at: string, category: string, notes: string) {
  const { rows } = await harness.pool.query<{ stable_id: string }>(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, category,
       is_outdoor, notes, created_by_kind)
     SELECT version_id, day_id, trip_id, gen_random_uuid(), $2::timestamptz,
            $2::timestamptz + interval '4 hours', tz, $3, true, $4, 'guide'
       FROM plan_items WHERE version_id = $1 LIMIT 1
     RETURNING stable_id`,
    [fx.versionId, at, category, notes],
  );
  return rows[0]?.stable_id as string;
}

async function buildStormWorld(): Promise<StormWorld> {
  const fx = await buildGuidePlan(harness.pool, { inTrip: true, now: NOW });
  const { rows } = await harness.pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, tz) VALUES ($1, 'Bali', 'Asia/Makassar') RETURNING id",
    [`bali-${randomUUID().slice(0, 8)}`],
  );
  const destinationId = rows[0]?.id as string;
  await harness.pool.query(
    `UPDATE trips SET destination_id = $2, tz = 'Asia/Makassar', start_date = '2026-10-13',
       end_date = '2026-10-20' WHERE id = $1`,
    [fx.tripId, destinationId],
  );
  for (const [date, wave] of [
    ['2026-10-16', 2.5],
    ['2026-10-17', 0.6],
  ] as const) {
    const { hourly, marine } = day(date, wave);
    await harness.pool.query(
      `INSERT INTO weather_snapshots (destination_id, point_key, lat, lng, elevation_m, date, hourly,
         marine, marine_fetched_at, source, fetched_at, checked_at)
       VALUES ($1, 'centroid', -8.65, 115.2, 0, $2, $3, $4, now(), 'weatherapi', now(), now())`,
      [destinationId, date, JSON.stringify(hourly), JSON.stringify(marine)],
    );
  }
  const boat = await item(fx, '2026-10-16T01:00:00Z', 'boat', 'Nusa Penida boat');
  const temple = await item(fx, '2026-10-17T02:00:00Z', 'activity', 'Tirta Empul');
  return {
    fx,
    boat,
    temple,
    trip: { id: fx.tripId, crewId: fx.crewId, destinationId, tz: 'Asia/Makassar', guide: null },
  };
}

async function openStorm(world: StormWorld) {
  await withSystem(harness.pool, (tx) =>
    watchTrip(tx, world.trip, NOW, watchWriter(undefined), stormHandoff),
  );
  const { rows } = await harness.pool.query<{
    id: string;
    decision_poll_id: string;
    options: { id: string; poll_option_id: string; supplier_move?: Record<string, unknown> }[];
  }>(
    "SELECT id, decision_poll_id, options FROM disruptions WHERE trip_id = $1 AND kind = 'storm'",
    [world.fx.tripId],
  );
  return rows[0];
}

async function vote(pollId: string, optionId: string | null, voters: string[], crewId: string) {
  await withSystem(harness.pool, async (tx) => {
    for (const voter of optionId === null ? [] : voters) {
      await tx.query(
        `INSERT INTO ballots (poll_id, option_id, crew_id, user_id, source, op_id, cast_at)
         VALUES ($1, $2, $3, $4, 'app', gen_random_uuid(), now())`,
        [pollId, optionId, crewId, voter],
      );
    }
    const state = await loadPollState(tx, pollId);
    if (state === undefined) throw new Error('poll missing');
    await closePollInTx(tx, state, {
      reason: optionId === null ? 'deadline' : 'all_voted',
      now: new Date(),
      actorId: null,
    });
  });
}

async function startOf(tripId: string, stableId: string): Promise<string | undefined> {
  const { rows } = await harness.pool.query<{ starts_at: Date }>(
    `SELECT pi.starts_at FROM plan_items pi JOIN trips t ON t.current_version_id = pi.version_id
      WHERE t.id = $1 AND pi.stable_id = $2`,
    [tripId, stableId],
  );
  return rows[0]?.starts_at.toISOString();
}

beforeAll(async () => {
  harness = await startJobsHarness();
  onEventAppended(disruptionEventHook);
  await harness.startRuntime([
    disruptionReactJob(),
    stormCommitJob(),
    guideActionExecuteJob({ now: () => NOW }),
  ]);
}, 240_000);

afterAll(async () => {
  await harness.stopAll();
  await harness.close();
});

describe('storm decision', () => {
  it("offers swap, keep and skip, and the crew's SWAP moves Friday and Saturday", async () => {
    const world = await buildStormWorld();
    const storm = await openStorm(world);
    expect(storm?.options.map((o) => o.id)).toEqual(['swap', 'keep', 'skip']);
    const swap = storm?.options.find((o) => o.id === 'swap');
    const voters = [world.fx.organiserId, world.fx.rinId, world.fx.mayaId];
    await vote(
      storm?.decision_poll_id as string,
      swap?.poll_option_id as string,
      voters,
      world.fx.crewId,
    );
    await until(
      async () => (await startOf(world.fx.tripId, world.boat)) === '2026-10-17T01:00:00.000Z',
      30_000,
    );
    expect(await startOf(world.fx.tripId, world.temple)).toBe('2026-10-16T02:00:00.000Z');
    const { rows } = await harness.pool.query<{ status: string }>(
      'SELECT status FROM watch_items WHERE trip_id = $1',
      [world.fx.tripId],
    );
    expect(rows).toEqual([{ status: 'set' }]);
  });

  it('keeps the plan when the vote closes with nobody having voted', async () => {
    const world = await buildStormWorld();
    const storm = await openStorm(world);
    await vote(storm?.decision_poll_id as string, null, [], world.fx.crewId);
    await until(async () => {
      const { rows } = await harness.pool.query<{ status: string; chosen_option_id: string }>(
        'SELECT status, chosen_option_id FROM disruptions WHERE id = $1',
        [storm?.id],
      );
      return rows[0]?.status === 'resolved' && rows[0]?.chosen_option_id === 'keep';
    }, 60_000);
    expect(await startOf(world.fx.tripId, world.boat)).toBe('2026-10-16T01:00:00.000Z');
  });

  it("leaves a Viator booking confirmed when its booker's new booking does not happen", async () => {
    const world = await buildStormWorld();
    const [booker] = [world.fx.organiserId];
    const order = randomUUID();
    await harness.pool.query(
      `INSERT INTO supplier_orders (id, trip_id, buyer_id, supplier, stable_id, partner_cart_ref,
         total_minor, currency, cancel_quote)
       VALUES ($1, $2, $3, 'viator', $4, $5, 180000, 'USD',
         '{"cancellable": true, "refund": {"amount_minor": 180000, "currency": "USD"}}')`,
      [order, world.fx.tripId, booker, world.boat, `cp${order.replaceAll('-', '').slice(-20)}c`],
    );
    for (const status of ['holding', 'booking', 'confirmed']) {
      await harness.pool.query('UPDATE supplier_orders SET status = $2 WHERE id = $1', [
        order,
        status,
      ]);
    }
    const storm = await openStorm(world);
    expect(storm?.options.find((o) => o.id === 'swap')).toMatchObject({
      supplier: 'viator_rebook',
    });
    const swap = storm?.options.find((o) => o.id === 'swap');
    const voters = [world.fx.organiserId, world.fx.rinId, world.fx.mayaId];
    await vote(
      storm?.decision_poll_id as string,
      swap?.poll_option_id as string,
      voters,
      world.fx.crewId,
    );
    const moveOf = async () => {
      const { rows } = await harness.pool.query<{
        status: string;
        options: NonNullable<typeof storm>['options'];
      }>('SELECT status, options FROM disruptions WHERE id = $1', [storm?.id]);
      return {
        status: rows[0]?.status,
        move: rows[0]?.options.find((o) => o.id === 'swap')?.supplier_move,
      };
    };
    await until(async () => (await moveOf()).move?.['state'] === 'awaiting_booker_payment', 60_000);
    // The booker held the new date (the api's hold_storm_seats); then the hold lapsed.
    const newOrder = randomUUID();
    await withSystem(harness.pool, async (tx) => {
      const { rows } = await tx.query<{ options: NonNullable<typeof storm>['options'] }>(
        'SELECT options FROM disruptions WHERE id = $1',
        [storm?.id],
      );
      const options = (rows[0]?.options ?? []).map((o) =>
        o.id === 'swap'
          ? { ...o, supplier_move: { ...o.supplier_move, new_order_id: newOrder } }
          : o,
      );
      await tx.query('UPDATE disruptions SET options = $2 WHERE id = $1', [
        storm?.id,
        JSON.stringify(options),
      ]);
      await appendDomainEvent(tx, {
        type: 'activity.hold_expired',
        aggregateKind: 'supplier_order',
        aggregateId: newOrder,
        actorKind: 'system',
        actorId: null,
        crewId: world.fx.crewId,
        tripId: world.fx.tripId,
        payload: { trip_id: world.fx.tripId, order_id: newOrder },
      });
    });
    await until(async () => (await moveOf()).move?.['state'] === 'seats_not_confirmed', 60_000);
    const { rows } = await harness.pool.query<{ status: string }>(
      'SELECT status FROM supplier_orders WHERE id = $1',
      [order],
    );
    expect(rows[0]?.status).toBe('confirmed');
    expect((await moveOf()).status).toBe('resolved');
  });
});
