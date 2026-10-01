/**
 * `setup.budget_recompute` against a migrated Postgres: four maxes band at once; a single later
 * change waits for its ten minutes (a timer is armed, the published band does not move), two
 * changes recompute at once; a member leaving takes the crew below four and the band disappears
 * straight away; with the stay, food and fun priced but no fare, the band's low end is that ground
 * part; a lowest max under the cheapest workable trip flags the crew infeasible with no band. Neither the job's output nor its realtime hints carry a max.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { recomputeBudget } from '../../src/jobs/setup/budget-recompute';
import { startSetupWorld, type SetupWorld } from './setup-fixture';

const MAXES = [161_730, 203_470, 219_830, 257_190];
let world: SetupWorld;
let fifth: string;

/** Upserts one max now (the touch trigger stamps `updated_at`, which the debounce reads). */
async function setMax(uid: string, amount: number): Promise<void> {
  await world.q(
    `INSERT INTO budget_max_private (trip_id, user_id, amount_minor, currency, amount_trip_minor,
       trip_currency)
     VALUES ($1, $2, $3, 'USD', $3, 'USD')
     ON CONFLICT (trip_id, user_id) DO UPDATE
       SET amount_minor = EXCLUDED.amount_minor, amount_trip_minor = EXCLUDED.amount_trip_minor`,
    [world.tripId, uid, amount],
  );
}

async function row() {
  const [aggregate] = await world.q<{
    maxes_count: number;
    band_low_minor: string | null;
    band_high_minor: string | null;
    infeasible: boolean | null;
    computed_at: Date | null;
  }>(
    'SELECT maxes_count, band_low_minor, band_high_minor, infeasible, computed_at FROM trip_budget_aggregates WHERE trip_id = $1',
    [world.tripId],
  );
  return aggregate;
}

/** A clock `minutes` from the real now (the stamps the debounce reads are real). */
const at = (minutes: number) => new Date(Date.now() + minutes * 60_000);

beforeAll(async () => {
  world = await startSetupWorld(5);
  fifth = world.members[4] as string;
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('setup.budget_recompute', () => {
  it('bands four maxes at once, below the lowest', async () => {
    for (const [i, amount] of MAXES.entries()) await setMax(world.members[i] as string, amount);
    const outcome = await recomputeBudget(world.harness.pool, world.tripId, false, at(0.05));
    expect(outcome).toEqual({ outcome: 'recomputed', maxes: 4, banded: true });
    expect(await row()).toMatchObject({
      maxes_count: 4,
      band_high_minor: '160000',
      infeasible: false,
    });
  });

  it('holds a single change for ten minutes, then applies it', async () => {
    await setMax(world.members[1] as string, 150_710);
    expect(await recomputeBudget(world.harness.pool, world.tripId, false, at(0.05))).toEqual({
      outcome: 'waiting',
    });
    expect((await row())?.band_high_minor).toBe('160000');
    const timers = await world.q<{ kind: string }>(
      "SELECT kind FROM scheduled_events WHERE ref_id = $1 AND status = 'pending'",
      [world.tripId],
    );
    expect(timers.map((t) => t.kind)).toContain('setup.budget_recompute');
    expect(await recomputeBudget(world.harness.pool, world.tripId, false, at(11))).toMatchObject({
      outcome: 'recomputed',
    });
    expect((await row())?.band_high_minor).toBe('150000');
  });

  it('recomputes at once on the second pending change', async () => {
    await setMax(world.members[2] as string, 230_010);
    await setMax(fifth, 190_350);
    expect(await recomputeBudget(world.harness.pool, world.tripId, false, at(11.5))).toMatchObject({
      outcome: 'recomputed',
      maxes: 5,
    });
  });

  it('drops the band the moment a leaver takes the crew below four', async () => {
    for (const uid of [fifth, world.members[3] as string]) {
      await world.q("UPDATE crew_members SET status = 'left' WHERE crew_id = $1 AND user_id = $2", [
        world.crewId,
        uid,
      ]);
    }
    expect(await recomputeBudget(world.harness.pool, world.tripId, true, at(12))).toMatchObject({
      outcome: 'recomputed',
      maxes: 3,
      banded: false,
    });
    expect(await row()).toMatchObject({ maxes_count: 3, band_high_minor: null, infeasible: null });
    for (const uid of [fifth, world.members[3] as string]) {
      await world.q(
        "UPDATE crew_members SET status = 'active' WHERE crew_id = $1 AND user_id = $2",
        [world.crewId, uid],
      );
    }
  });

  const start = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 47 * 86_400_000).toISOString().slice(0, 10);
  const destination = async () =>
    (
      await world.q<{ destination_id: string }>('SELECT destination_id FROM trips WHERE id = $1', [
        world.tripId,
      ])
    )[0]?.destination_id;

  it('with no fare for the dates, sets the low end at the stay, food and fun', async () => {
    await world.q('UPDATE trips SET start_date = $2, end_date = $3 WHERE id = $1', [
      world.tripId,
      start,
      end,
    ]);
    await world.q(
      `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low,
         nightly_minor_high, food_pp_day_minor, fun_pp_day_minor, currency, source, sourced_on,
         reviewed_at)
       VALUES ($1, 'ryokan', 9000, 11000, 2750, 1250, 'USD', 'editorial', current_date, now())`,
      [await destination()],
    );
    const outcome = await recomputeBudget(world.harness.pool, world.tripId, true, at(12.5));
    expect(outcome).toMatchObject({ outcome: 'recomputed', maxes: 5, banded: true });
    // Seven nights at $90 and eight days at $27.50 + $12.50: $950 each before any flight.
    expect(await row()).toMatchObject({
      band_low_minor: '95000',
      band_high_minor: '150000',
      infeasible: false,
    });
  });

  it('flags a crew whose lowest max is under the cheapest workable trip, anonymously', async () => {
    await world.q(
      `INSERT INTO fare_cells (origin_iata, dest_iata, destination_id, month, price_minor, currency,
         days, found_at, fetched_at, checked_at)
       VALUES ('SIN', 'KIX', $1, date_trunc('month', $2::date)::date, 90000, 'USD', '[]', now(),
         now(), now())`,
      [await destination(), start],
    );
    await setMax(world.members[0] as string, 120_000);
    const outcome = await recomputeBudget(world.harness.pool, world.tripId, true, at(13));
    expect(outcome).toMatchObject({ outcome: 'recomputed', banded: true });
    expect(await row()).toMatchObject({ band_high_minor: null, infeasible: true });
    const hints = await world.q<{ payload: unknown }>(
      "SELECT payload FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'budget.band'",
      [`trip_setup:${world.tripId}`],
    );
    const text = JSON.stringify([hints, outcome]);
    for (const amount of [...MAXES, 150_710, 230_010, 190_350, 120_000]) {
      expect(text).not.toContain(String(amount));
    }
  });
});
