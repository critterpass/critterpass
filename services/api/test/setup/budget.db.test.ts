/**
 * Private budgets on the real stack. A crew of three sets its maxes: the band route answers
 * `K_ANON_UNAVAILABLE`, the organiser's lock consults nobody's max, and each member's fit is their
 * own. A crew of five, banded by the recompute: a lock above the band answers `over_band` with no
 * distance, the fourth lock in an hour is `RATE_LIMITED`. Across everything, no max ever reaches
 * a response body (other than its owner's own private read), a log line, a domain event, a
 * realtime hint, a command result, a job, or the guide's trip context.
 *
 * The price inputs of a trip with several stops list each stop with its own reviewed cost index;
 * a trip with no stop rows gets the same keys as ever and no `stops`.
 */
import { budgetAggregate } from '@cp/cost-engine';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildGuideContext } from '../../src/ai/context';
import { registerBudgetRoutes } from '../../src/setup/budget-band-route';
import { createLockBudgetTargetCommand } from '../../src/commands/setup/lock-budget-target';
import {
  buildSetupCrew,
  capturedOutputs,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from './setup-harness';

// Distinctive maxes (USD minor units) that could not appear by accident anywhere.
const SMALL_CREW_MAXES = [187_130, 243_370, 311_910];
const BIG_CREW_MAXES = [161_730, 203_470, 219_830, 257_190, 298_610];

let harness: SetupHarness;
let small: SetupCrew;
let big: SetupCrew;
const bodies: string[] = [];

async function get(session: SignedIn, path: string) {
  const response = await harness.request(path, { headers: { cookie: session.cookie } });
  const text = await response.text();
  bodies.push(text);
  return { status: response.status, body: JSON.parse(text) as Record<string, unknown> };
}

async function run(session: SignedIn, cmd: string, payload: unknown) {
  const response = await harness.run(session, cmd, payload);
  bodies.push(JSON.stringify(response.body));
  return response;
}

async function submitAll(crew: SetupCrew, maxes: readonly number[]): Promise<void> {
  for (const [i, amount] of maxes.entries()) {
    const response = await run(crew.members[i]!, 'submit_budget_max', {
      trip_id: crew.tripId,
      amount_minor: amount,
      currency: 'USD',
    });
    expect(resultOf(response)).toEqual({ trip_id: crew.tripId, set: true });
  }
}

beforeAll(async () => {
  harness = await startSetupHarness(undefined, (app, deps) => {
    deps.registry.register(createLockBudgetTargetCommand({ redis: deps.redis }));
    registerBudgetRoutes(app, deps);
  });
  small = await buildSetupCrew(harness, 3);
  big = await buildSetupCrew(harness, 5);
  await submitAll(small, SMALL_CREW_MAXES);
  await submitAll(big, BIG_CREW_MAXES);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('a crew of three', () => {
  it('shows the count and nothing crew-level', async () => {
    const band = await get(small.organiser, `/v1/budget/${small.tripId}/band`);
    expect(band.status).toBe(409);
    expect(band.body['error']).toMatchObject({
      code: 'K_ANON_UNAVAILABLE',
      detail: { maxes_count: 3, member_count: 3 },
    });
    const row = await withSystem(harness.pool, (tx) =>
      tx.query('SELECT * FROM trip_budget_aggregates WHERE trip_id = $1', [small.tripId]),
    );
    expect(row.rows[0]).toMatchObject({
      maxes_count: 3,
      band_low_minor: null,
      band_high_minor: null,
      bucketed_dots: null,
      under_all_ok: null,
      infeasible: null,
    });
  });

  it('locks without consulting anyone’s max, and tells each member only their own fit', async () => {
    const [organiser, rin, dev] = small.members as [SignedIn, SignedIn, SignedIn];
    expect((await get(rin, `/v1/setup/${small.tripId}/own-fit`)).body).toEqual({
      trip_id: small.tripId,
      state: 'no_target',
    });
    const locked = await run(organiser, 'lock_budget_target', {
      trip_id: small.tripId,
      target_minor: 240_000,
    });
    expect(resultOf(locked)).toMatchObject({ checked_against_band: false, target_minor: 240_000 });
    expect((await get(organiser, `/v1/setup/${small.tripId}/own-fit`)).body['state']).toBe('over');
    expect((await get(rin, `/v1/setup/${small.tripId}/own-fit`)).body['state']).toBe('fits');
    expect((await get(dev, `/v1/setup/${small.tripId}/own-fit`)).body['state']).toBe('fits');
  });

  it('reads a max back to its owner alone', async () => {
    const [organiser, rin] = small.members as [SignedIn, SignedIn];
    const mine = await harness.request(`/v1/me/private/budget_max?trip_id=${small.tripId}`, {
      headers: { cookie: rin.cookie },
    });
    expect(await mine.json()).toMatchObject({ amount_minor: SMALL_CREW_MAXES[1], currency: 'USD' });
    const stranger = await harness.signIn();
    const none = await get(stranger, `/v1/me/private/budget_max?trip_id=${small.tripId}`);
    expect(none.status).toBe(404);
    const own = await get(organiser, '/v1/me/private/budget_default');
    expect(own.status).toBe(404);
  });
});

describe('a crew of five', () => {
  it('checks a lock against the published band only, with no distance, and limits attempts', async () => {
    const aggregate = budgetAggregate({
      maxes: BIG_CREW_MAXES.map(BigInt),
      memberCount: 5,
      currency: 'USD',
      feasibleLow: null,
      stepMinor: 5_000n,
      seed: big.tripId,
    });
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `UPDATE trip_budget_aggregates
            SET band_low_minor = $2, band_high_minor = $3, step_minor = $4, track_high_minor = $5,
                bucketed_dots = $6, under_all_ok = $7, infeasible = $8, computed_at = now()
          WHERE trip_id = $1`,
        [
          big.tripId,
          aggregate.bandLowMinor?.toString(),
          aggregate.bandHighMinor?.toString(),
          aggregate.stepMinor?.toString(),
          aggregate.trackHighMinor?.toString(),
          JSON.stringify(aggregate.dots),
          aggregate.underAllOk,
          aggregate.infeasible,
        ],
      ),
    );
    const band = await get(big.organiser, `/v1/budget/${big.tripId}/band`);
    expect(band.body).toMatchObject({ high_minor: 160_000, maxes_count: 5, under_all_ok: true });
    const over = await run(big.organiser, 'lock_budget_target', {
      trip_id: big.tripId,
      target_minor: 165_000,
    });
    expect(errorOf(over)).toMatchObject({ code: 'STATE_INVALID' });
    expect(errorOf(over).detail).toEqual({ reason: 'over_band' });
    const offStep = await run(big.organiser, 'lock_budget_target', {
      trip_id: big.tripId,
      target_minor: 150_001,
    });
    expect(errorOf(offStep).code).toBe('VALIDATION');
    // The off-step target was never held against the band, so three counted tries remain two.
    for (const target of [160_000, 155_000]) {
      const ok = await run(big.organiser, 'lock_budget_target', {
        trip_id: big.tripId,
        target_minor: target,
      });
      expect(resultOf(ok)).toMatchObject({ checked_against_band: true, target_minor: target });
    }
    const fourth = await run(big.organiser, 'lock_budget_target', {
      trip_id: big.tripId,
      target_minor: 150_000,
    });
    expect(fourth.status).toBe(429);
    expect(errorOf(fourth).code).toBe('RATE_LIMITED');
  });
});

describe('where a max may appear', () => {
  it('appears in no response, log, event, hint, result, job or guide context', async () => {
    const context = await buildGuideContext(harness.pool, {
      uid: big.organiser.uid,
      tripId: big.tripId,
      surface: 'C',
    });
    const everything = [
      ...bodies,
      await capturedOutputs(harness.pool),
      harness.logs.join('\n'),
      JSON.stringify(context),
    ].join('\n');
    for (const amount of [...SMALL_CREW_MAXES, ...BIG_CREW_MAXES]) {
      expect(everything).not.toContain(String(amount));
      expect(everything).not.toContain((amount / 100).toFixed(2));
    }
  });
});

describe('the price inputs of a trip with several stops', () => {
  const inputs = async (tripId: string) => {
    const { rows } = await withSystem(harness.pool, (tx) =>
      tx.query<{ inputs: Record<string, unknown> }>(
        'SELECT app.setup_budget_inputs($1) AS inputs',
        [tripId],
      ),
    );
    return rows[0]!.inputs;
  };

  it('lists each stop with its reviewed index rows only, and nothing new for one stop', async () => {
    const crew = await buildSetupCrew(harness, 1);
    const ids = await withSystem(harness.pool, async (tx) => {
      const { rows: trip } = await tx.query<{ destination_id: string; crew_id: string }>(
        'SELECT destination_id, crew_id FROM trips WHERE id = $1',
        [crew.tripId],
      );
      const { rows: next } = await tx.query<{ id: string }>(
        `INSERT INTO destinations (slug, name, coverage, currency, tz)
         VALUES ('osaka-' || gen_random_uuid(), 'Osaka', 'guest', 'USD', 'Asia/Tokyo') RETURNING id`,
      );
      const first = trip[0]!.destination_id;
      const second = next[0]!.id;
      await tx.query(
        `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low,
           nightly_minor_high, food_pp_day_minor, fun_pp_day_minor, currency, source, sourced_on,
           reviewed_at)
         VALUES ($1, 'ryokan', 9000, 11000, 2750, 1250, 'USD', 'editorial', current_date, now()),
                ($2, 'hotel', 6000, 8000, 2000, 1000, 'USD', 'editorial', current_date, now()),
                ($2, 'hostel', 2000, 3000, 2000, 1000, 'USD', 'editorial', current_date, NULL)`,
        [first, second],
      );
      return { first, second, crewId: trip[0]!.crew_id };
    });
    const before = await inputs(crew.tripId);
    expect(Object.keys(before).sort()).toEqual([
      'currency',
      'end_date',
      'fares',
      'fx',
      'indices',
      'members',
      'start_date',
    ]);

    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
         VALUES ($1, $2, 1, $3, 2), ($1, $2, 2, $4, 3)`,
        [crew.tripId, ids.crewId, ids.first, ids.second],
      ),
    );
    const { stops, ...rest } = await inputs(crew.tripId);
    // Every other key is what it was: a reader that does not know `stops` computes the same.
    expect(rest).toEqual(before);
    const hotel = {
      stay_type: 'hotel',
      nightly_low_minor: 6000,
      nightly_high_minor: 8000,
      food_pp_day_minor: 2000,
      fun_pp_day_minor: 1000,
      currency: 'USD',
    };
    expect(stops).toEqual([
      { position: 1, destination_id: ids.first, nights: 2, indices: before['indices'] },
      { position: 2, destination_id: ids.second, nights: 3, indices: [hotel] },
    ]);
  });
});
